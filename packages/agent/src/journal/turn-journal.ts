import type { PlatformError } from 'effect/PlatformError';

import {
  assertDeckFolder,
  DECK_CONFIG_CALLEE,
  guardBlobsDir,
  isContentFile,
  readStaticModule,
  type GuardChange,
} from '@deckster/brand/node';
import { Effect, FileSystem, Option, Ref, Schema, type Scope } from 'effect';
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';

import type { ChangedFile, TurnDiffFile } from '#protocol/agent-events.ts';

import { agentError, type AgentError } from '#errors.ts';
import { lineDiff, looksBinary } from '#journal/line-diff.ts';

/**
 * Random bytes separating simultaneous temporary file names.
 */
const TEMPORARY_RANDOM_BYTES = 4;

/**
 * Recovery advice when a later edit conflicts with a recorded turn.
 */
const CONFLICT_FIX = 'Undo that edit by hand first, or ask the agent to make the change you want.';

/**
 * Recovery advice when a target's folders cannot safely receive recorded bytes.
 */
const FOLDER_FIX =
  'Put the folders back the way they were during the turn, or restore the files by hand.';

/**
 * How many turns the journal keeps by default.
 */
export const JOURNAL_RETENTION = 50;

/**
 * The largest file the journal keeps a copy of (5 MB). A larger change is still reported, but undo
 * and redo leave that file as it is.
 */
export const UNDO_SIZE_LIMIT_BYTES = 5 * 1024 * 1024;

/**
 * How much of a file is read at a time while hashing.
 */
const READ_CHUNK_BYTES = 256 * 1024;

/**
 * The ending of the files the journal stages next to their targets.
 */
const TEMPORARY_SUFFIX = '.deck-tmp';

/**
 * The progress record of a restore, in the folder of the turn being restored.
 */
const INTENT_FILE = 'restore.json';

/**
 * The mode a recorded file gets when the record has none.
 */
const DEFAULT_MODE = 0o644;

/**
 * Spaces of indentation in the index file.
 */
const JSON_INDENT_SPACES = 2;

/**
 * One side of a recorded change: the state before the turn or after it.
 */
type JournalSide = 'before' | 'after';

/**
 * Both sides, in order.
 */
const SIDES: readonly JournalSide[] = ['before', 'after'];

/**
 * One file of a recorded turn.
 */
const JournalFile = Schema.Struct({
  /**
   * The path relative to the workspace root.
   */
  path: Schema.String,

  /**
   * How the turn changed it.
   */
  kind: Schema.Literals(['add', 'update', 'delete']),

  /**
   * The hash before the turn, or null when the turn created it.
   */
  before: Schema.NullOr(Schema.String),

  /**
   * The hash after the turn, or null when the turn deleted it.
   */
  after: Schema.NullOr(Schema.String),

  /**
   * The permission bits before the turn.
   */
  beforeMode: Schema.optionalKey(Schema.Number),

  /**
   * The permission bits after the turn.
   */
  afterMode: Schema.optionalKey(Schema.Number),

  /**
   * The sides the journal kept no copy of (larger than {@link UNDO_SIZE_LIMIT_BYTES}).
   */
  missing: Schema.optionalKey(Schema.Array(Schema.Literals(['before', 'after']))),
});

/**
 * One file of a recorded turn.
 */
type JournalFile = typeof JournalFile.Type;

/**
 * One recorded turn.
 */
const JournalEntry = Schema.Struct({
  /**
   * The turn number.
   */
  turn: Schema.Number,

  /**
   * When it ended, as an ISO timestamp.
   */
  at: Schema.String,

  /**
   * The files it changed.
   */
  files: Schema.Array(JournalFile),

  /**
   * Whether it is undone.
   */
  undone: Schema.Boolean,
});

/**
 * One recorded turn.
 */
type JournalEntry = typeof JournalEntry.Type;

/**
 * The journal's index file. Version 2 records content files only, with their modes.
 */
const JournalIndex = Schema.Struct({
  /**
   * The format version.
   */
  version: Schema.Literal(2),

  /**
   * The recorded turns, oldest first.
   */
  entries: Schema.Array(JournalEntry),
});

/**
 * Decodes the index file.
 */
const decodeIndex = Schema.decodeUnknownResult(Schema.fromJsonString(JournalIndex));

/**
 * A file staged next to its target, waiting to be renamed into place.
 */
const StagedFile = Schema.Struct({
  /**
   * The staged file relative to the workspace root.
   */
  temporary: Schema.String,

  /**
   * Where it goes, relative to the workspace root.
   */
  target: Schema.String,

  /**
   * The hash the target has once it is in place.
   */
  hash: Schema.String,

  /**
   * The hash the target must still have when the staged file is renamed over it, or null when the
   * target must not exist; anything else is a change made since, which a restore never overwrites.
   */
  from: Schema.NullOr(Schema.String),
});

/**
 * A file a restore removes.
 */
const PendingDeletion = Schema.Struct({
  /**
   * The file relative to the workspace root.
   */
  target: Schema.String,

  /**
   * The hash it has before it is removed; a file with another hash is left alone.
   */
  hash: Schema.String,
});

/**
 * The progress record of a restore, written once every new content is staged and before the first
 * rename, removed once the index records the restore.
 */
const RestoreIntent = Schema.Struct({
  /**
   * Which side of the turn is being restored.
   */
  side: Schema.Literals(['before', 'after']),

  /**
   * The staged contents.
   */
  staged: Schema.Array(StagedFile),

  /**
   * The files to remove.
   */
  deletions: Schema.Array(PendingDeletion),
});

/**
 * The progress record of a restore.
 */
type RestoreIntent = typeof RestoreIntent.Type;

/**
 * Decodes a progress record.
 */
const decodeIntent = Schema.decodeUnknownResult(Schema.fromJsonString(RestoreIntent));

/**
 * What an undo or redo moved.
 */
export type HistoryResult = {
  /**
   * The turn whose changes moved.
   */
  readonly target: number;

  /**
   * The files restored.
   */
  readonly files: readonly ChangedFile[];

  /**
   * The files of the turn left as they are because the journal kept no copy of them, each with
   * `undoable: false`; absent when there are none.
   */
  readonly skipped?: readonly ChangedFile[];
};

/**
 * Where the journal keeps its files and which deck it records.
 */
export type JournalOptions = {
  /**
   * The absolute workspace root.
   */
  readonly root: string;

  /**
   * The deck's agent folder (`.deck/agent/<deck>`).
   */
  readonly agentDir: string;

  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * How many turns to keep. Default: {@link JOURNAL_RETENTION}.
   */
  readonly retention?: number;

  /**
   * For tests: fails a restore after this many renames, leaving its progress record behind as a
   * crash would.
   */
  readonly failAfterRenames?: number;
};

/**
 * The framework's own undo for agent turns, the same for every provider. A turn changes the deck
 * only through the framework (its working copy is brought in by the sync, the deck tools write the
 * slide list), so the journal records content files of one deck, and the deck config when the deck
 * tools edited its slide list, with their modes: after the guard settles a turn, `record` copies
 * the pre- and post-images of what it changed from the guard's blob store under `turns/<n>/`,
 * checking each against its hash. No provider can write the deck or `.deck/`, so nothing writes
 * where undo and redo do while they run.
 *
 * - Undo and redo write only a content file of the deck (or its config, and only a data-only config),
 *   through real folders inside the deck, and only an image whose bytes have the recorded hash;
 *   they refuse, naming the files, when a file changed since the turn (`changed after turn <n>`) or
 *   when a path now leads outside the deck (`is outside the deck's content`).
 * - A restore is transactional: every new content is staged next to its target, a progress record
 *   lists the staged files with the hash each target must still have, then files are renamed into
 *   place (each target's folder checked to still be the deck's right before). A record left by a
 *   crash is finished when the journal opens and before every undo and redo: forward only when
 *   every target still has the hash the record expects (an edit made after the crash is never
 *   overwritten), else back, removing only staged files of the journal's own naming inside the
 *   deck.
 */
export type TurnJournal = {
  /**
   * Records what a settled turn changed and returns it as the panel shows it.
   *
   * @param turn - The turn number.
   * @param changes - The guard's kept changes.
   */
  readonly record: (
    turn: number,
    changes: readonly GuardChange[],
  ) => Effect.Effect<ChangedFile[], AgentError>;

  /**
   * Restores the files of the last turn that is not undone.
   */
  readonly undo: Effect.Effect<HistoryResult, AgentError>;

  /**
   * Applies the last undone turn again.
   */
  readonly redo: Effect.Effect<HistoryResult, AgentError>;

  /**
   * Whether there is something to undo and to redo.
   */
  readonly history: Effect.Effect<{ readonly canUndo: boolean; readonly canRedo: boolean }>;

  /**
   * The turn the next undo and the next redo would move, or null.
   */
  readonly targets: Effect.Effect<{ readonly undo: number | null; readonly redo: number | null }>;

  /**
   * The highest turn number recorded, or 0.
   */
  readonly lastTurn: Effect.Effect<number>;

  /**
   * The line diff of a recorded turn, from its pre- and post-images.
   *
   * @param turn - The turn number.
   */
  readonly diff: (turn: number) => Effect.Effect<readonly TurnDiffFile[], AgentError>;
};

/**
 * Opens the journal of a deck: reads its index, if any, and finishes a restore that a crash
 * interrupted.
 *
 * @param options - Where it lives and which deck it records.
 */
export const makeTurnJournal = Effect.fn('makeTurnJournal')(function* (
  options: JournalOptions,
): Effect.fn.Return<TurnJournal, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const retention = options.retention ?? JOURNAL_RETENTION;
  const turnsDir = path.join(options.agentDir, 'turns');
  const blobsDir = guardBlobsDir(options.root, options.deck);
  const indexFile = path.join(turnsDir, 'index.json');
  const deckPrefix = `decks/${options.deck}/`;
  const indexText = yield* fs.readFileString(indexFile).pipe(Effect.orElseSucceed(() => ''));
  const decoded = decodeIndex(indexText);
  const entries = yield* Ref.make<readonly JournalEntry[]>(
    decoded._tag === 'Success' ? decoded.success.entries : [],
  );

  /**
   * Turns a file system failure into an agent error that names the operation.
   *
   * @param what - What was being done.
   */
  const asAgentError =
    (what: string) =>
    (error: AgentError | PlatformError): AgentError =>
      error._tag === 'AgentError'
        ? error
        : agentError(
            `The agent journal could not ${what}: ${error.message}`,
            'Check that .deck/ is writable.',
          );

  /**
   * The absolute path of a path relative to the root.
   *
   * @param relative - The relative path.
   */
  const absolute = (relative: string) => path.join(options.root, relative);

  /**
   * The folder of one recorded turn.
   *
   * @param turn - The turn number.
   */
  const turnDir = (turn: number) => path.join(turnsDir, String(turn));

  /**
   * The state of a path now, never following a link at it: a file's hash, the kind of anything
   * else, or null when it does not exist.
   *
   * @param relative - The path relative to the root.
   */
  const currentState = Effect.fn('TurnJournal.currentState')(function* (
    relative: string,
  ): Effect.fn.Return<string | null> {
    const info = yield* fs.lstat(absolute(relative)).pipe(Effect.option);
    if (Option.isNone(info)) {
      return null;
    }

    if (info.value.type !== 'File') {
      return info.value.type;
    }

    return yield* hashFile(absolute(relative)).pipe(Effect.orElseSucceed(() => 'unreadable'));
  });

  /**
   * Hashes a file in chunks without following a link at its path.
   *
   * @param file - The absolute path.
   */
  const hashFile = Effect.fn('TurnJournal.hashFile')(function* (
    file: string,
  ): Effect.fn.Return<string, PlatformError, Scope.Scope> {
    const handle = yield* fs.open(file, { noFollow: true });
    const hash = createHash('sha256');
    let chunk = yield* handle.readAlloc(READ_CHUNK_BYTES);
    while (Option.isSome(chunk)) {
      hash.update(chunk.value);
      chunk = yield* handle.readAlloc(READ_CHUNK_BYTES);
    }

    return hash.digest('hex');
  }, Effect.scoped);

  /**
   * Writes a file of the journal next to its target and renames it into place.
   *
   * @param file - The absolute target.
   * @param bytes - The content.
   */
  const writeAtomically = Effect.fn('TurnJournal.writeAtomically')(function* (
    file: string,
    bytes: Uint8Array,
  ): Effect.fn.Return<void, PlatformError> {
    const temporary = `${file}.${randomBytes(TEMPORARY_RANDOM_BYTES).toString('hex')}.tmp`;
    yield* fs.writeFile(temporary, bytes, { flag: 'wx' });
    yield* fs.rename(temporary, file);
  });

  /**
   * Copies a file to a path that must not exist, as a clone where the file system supports it.
   *
   * @param from - The absolute source.
   * @param to - The absolute destination.
   */
  const cloneFile = Effect.fn('TurnJournal.cloneFile')(function* (
    from: string,
    to: string,
  ): Effect.fn.Return<void, AgentError> {
    yield* Effect.tryPromise({
      try: () => copyFile(from, to, constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL),
      catch: (cause) =>
        agentError(
          `The agent journal could not copy ${path.basename(from)}: ` +
            `${cause instanceof Error ? cause.message : String(cause)}`,
          'Check that .deck/ and the deck folder are writable.',
        ),
    });
  });

  /**
   * Writes the index file.
   *
   * @param next - The entries.
   */
  const saveIndex = Effect.fn('TurnJournal.saveIndex')(function* (
    next: readonly JournalEntry[],
  ): Effect.fn.Return<void, PlatformError> {
    yield* fs.makeDirectory(turnsDir, { recursive: true });
    yield* writeAtomically(
      indexFile,
      new TextEncoder().encode(
        `${JSON.stringify({ version: 2, entries: next }, null, JSON_INDENT_SPACES)}\n`,
      ),
    );
    yield* Ref.set(entries, next);
  });

  /**
   * Why writing a path would leave the deck's content, or undefined when it may be written: a plain
   * relative path naming a content file of the deck (or its config), the deck folder a real folder
   * of the workspace, and every folder between it and the path a real folder (missing ones are
   * fine; the restore creates them).
   *
   * @param relative - The path relative to the root.
   */
  const checkTarget = Effect.fn('TurnJournal.checkTarget')(function* (
    relative: string,
  ): Effect.fn.Return<string | undefined> {
    if (!isPlainRelative(relative) || !relative.startsWith(deckPrefix)) {
      return 'not in the deck';
    }

    const inDeck = relative.slice(deckPrefix.length);
    if (inDeck !== 'deck.config.ts' && !isContentFile(inDeck)) {
      return 'not a content file';
    }

    const deck = yield* assertDeckFolder(options.root, options.deck).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.option,
    );
    if (Option.isNone(deck)) {
      return 'the deck folder is a link or resolves elsewhere';
    }

    let current = absolute(`decks/${options.deck}`);
    for (const segment of inDeck.split('/').slice(0, -1)) {
      current = path.join(current, segment);
      const info = yield* fs.lstat(current).pipe(Effect.option);
      if (Option.isNone(info)) {
        break;
      }

      if (info.value.type !== 'Directory') {
        return `${path.relative(options.root, current)} is not a folder`;
      }
    }

    const target = yield* fs.lstat(absolute(relative)).pipe(Effect.option);
    if (Option.isSome(target) && target.value.type !== 'File') {
      return 'it is not a plain file';
    }

    return undefined;
  });

  /**
   * Why a target's folder differs from the deck's own folder, checked right before a rename: its
   * real path must be the deck's real path plus the target's folders. Node has no `renameat`, so a
   * by-path window remains between this check and the rename; no provider can write the deck.
   *
   * @param relative - The target relative to the root.
   */
  const checkFolder = Effect.fn('TurnJournal.checkFolder')(function* (
    relative: string,
  ): Effect.fn.Return<string | undefined> {
    const deckReal = yield* assertDeckFolder(options.root, options.deck).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.option,
    );
    const folder = yield* fs.realPath(path.dirname(absolute(relative))).pipe(Effect.option);
    if (Option.isNone(deckReal) || Option.isNone(folder)) {
      return 'its folder cannot be resolved';
    }

    const expected = path.join(deckReal.value, path.dirname(relative.slice(deckPrefix.length)));
    return folder.value === path.normalize(expected) ? undefined : 'its folder resolves elsewhere';
  });

  /**
   * Whether an image of a recorded file is one the journal may install: its bytes have the recorded
   * hash, and an image of the deck config is a data-only config (a `defineDeck({...})` literal and
   * nothing else), never code.
   *
   * @param file - The recorded file.
   * @param image - The image's absolute path.
   * @param hash - The hash it must have.
   */
  const checkImage = Effect.fn('TurnJournal.checkImage')(function* (
    file: JournalFile,
    image: string,
    hash: string,
  ): Effect.fn.Return<string | undefined> {
    const actual = yield* hashFile(image).pipe(Effect.orElseSucceed(() => 'unreadable'));
    if (actual !== hash) {
      return 'its kept copy does not have the recorded hash';
    }

    if (file.path === `${deckPrefix}deck.config.ts`) {
      const text = yield* fs.readFileString(image).pipe(Effect.orElseSucceed(() => ''));
      if (!readStaticModule(text, DECK_CONFIG_CALLEE).ok) {
        return 'its kept copy is not a data-only deck config';
      }
    }

    return undefined;
  });

  /**
   * Removes a file the journal staged or restores, never a folder and never through a link.
   *
   * @param relative - The path relative to the root.
   */
  const removeFile = Effect.fn('TurnJournal.removeFile')(function* (
    relative: string,
  ): Effect.fn.Return<void, PlatformError> {
    const info = yield* fs.lstat(absolute(relative)).pipe(Effect.option);
    if (Option.isSome(info) && (info.value.type === 'File' || info.value.type === 'SymbolicLink')) {
      yield* fs.remove(absolute(relative), { force: true });
    }
  });

  /**
   * Whether a staged path is one the journal could have staged for its target.
   *
   * @param file - The staged file.
   */
  const isStagedName = (file: typeof StagedFile.Type) =>
    isPlainRelative(file.temporary) &&
    file.temporary.startsWith(`${file.target}.`) &&
    file.temporary.endsWith(TEMPORARY_SUFFIX) &&
    !file.temporary.slice(file.target.length).includes('/');

  /**
   * Removes the staged files of a progress record that are still there (only names the journal
   * stages, for targets inside the deck's content), and the record.
   *
   * @param turn - The turn.
   * @param intent - The progress record.
   */
  const rollBack = Effect.fn('TurnJournal.rollBack')(function* (
    turn: number,
    intent: RestoreIntent,
  ): Effect.fn.Return<void, PlatformError> {
    for (const file of intent.staged) {
      if (isStagedName(file) && (yield* checkTarget(file.target)) === undefined) {
        yield* removeFile(file.temporary);
      }
    }

    yield* fs.remove(path.join(turnDir(turn), INTENT_FILE), { force: true });
  });

  /**
   * Carries out a progress record: renames every staged file still there into place when its target
   * still has the hash the record expects, removes the files to remove that still have their old
   * hash, records the turn as moved and removes the record. A target changed since is a conflict:
   * the rest is rolled back.
   *
   * @param turn - The turn.
   * @param intent - The progress record.
   * @param failAfter - For tests: fail after this many renames.
   */
  const rollForward = Effect.fn('TurnJournal.rollForward')(function* (
    turn: number,
    intent: RestoreIntent,
    failAfter: number | undefined,
  ): Effect.fn.Return<void, AgentError | PlatformError> {
    let renames = 0;
    for (const file of intent.staged) {
      if (Option.isNone(yield* fs.lstat(absolute(file.temporary)).pipe(Effect.option))) {
        continue;
      }

      const state = yield* currentState(file.target);
      if (state !== file.from && state !== file.hash) {
        yield* rollBack(turn, intent);
        return yield* agentError(
          `${file.target} changed after turn ${turn}, ` +
            'so the restore stopped before overwriting it.',
          CONFLICT_FIX,
        );
      }

      if (renames === failAfter) {
        return yield* agentError(`The restore of turn ${turn} failed after ${renames} renames.`);
      }

      const folder = yield* checkFolder(file.target);
      if (folder !== undefined) {
        yield* rollBack(turn, intent);
        return yield* agentError(
          `${file.target} is outside the deck's content (${folder}), so the restore stopped.`,
          FOLDER_FIX,
        );
      }

      yield* fs.rename(absolute(file.temporary), absolute(file.target));
      renames += 1;
    }

    for (const deletion of intent.deletions) {
      if ((yield* currentState(deletion.target)) === deletion.hash) {
        yield* removeFile(deletion.target);
      }
    }

    const undone = intent.side === 'before';
    yield* saveIndex(
      (yield* Ref.get(entries)).map((entry) =>
        entry.turn === turn ? { ...entry, undone } : entry,
      ),
    );
    yield* fs.remove(path.join(turnDir(turn), INTENT_FILE), { force: true });
  });

  /**
   * Finishes a restore that stopped half way: forward when every path is still inside the deck's
   * content and every target either has the hash the record expects (with its staged file still
   * there) or is already in place, else back.
   *
   * @param turn - The turn.
   * @param intent - The progress record.
   */
  const resume = Effect.fn('TurnJournal.resume')(function* (
    turn: number,
    intent: RestoreIntent,
  ): Effect.fn.Return<void, AgentError | PlatformError> {
    let forward = intent.staged.every(isStagedName);
    for (const file of intent.staged) {
      if (!forward) {
        break;
      }

      const staged = Option.isSome(yield* fs.lstat(absolute(file.temporary)).pipe(Effect.option));
      const state = yield* currentState(file.target);
      forward =
        ((staged && state === file.from) || state === file.hash) &&
        (yield* checkTarget(file.target)) === undefined;
    }

    for (const deletion of intent.deletions) {
      if (forward) {
        forward = (yield* checkTarget(deletion.target)) === undefined;
      }
    }

    if (!forward) {
      return yield* rollBack(turn, intent);
    }

    yield* rollForward(turn, intent, undefined).pipe(
      Effect.tapError(() => rollBack(turn, intent).pipe(Effect.ignore)),
    );
  });

  /**
   * Finishes every restore a crash interrupted.
   */
  const recover = Effect.fn('TurnJournal.recover')(function* (): Effect.fn.Return<
    void,
    AgentError | PlatformError
  > {
    const names = yield* fs.readDirectory(turnsDir).pipe(Effect.orElseSucceed((): string[] => []));
    for (const name of names) {
      const turn = Number(name);
      if (!Number.isInteger(turn)) {
        continue;
      }

      const file = path.join(turnsDir, name, INTENT_FILE);
      const text = yield* fs.readFileString(file).pipe(Effect.option);
      if (Option.isNone(text)) {
        continue;
      }

      const intent = decodeIntent(text.value);
      if (intent._tag === 'Failure') {
        yield* fs.remove(file, { force: true });
        continue;
      }

      yield* resume(turn, intent.success);
    }
  });

  /**
   * The mode of one side of a recorded file.
   *
   * @param file - The recorded file.
   * @param side - The side.
   */
  const modeOf = (file: JournalFile, side: JournalSide) =>
    (side === 'before' ? file.beforeMode : file.afterMode) ?? DEFAULT_MODE;

  /**
   * Moves the files of one entry to one side of it, after checking that each stays inside the
   * deck's content and still has the hash of the other side; a file that already has the hash of
   * the side being restored is left in place. New contents are staged next to their targets with
   * their recorded modes, the progress record is written, then files are renamed into place.
   *
   * @param entry - The turn.
   * @param side - Which images to restore.
   */
  const restore = Effect.fn('TurnJournal.restore')(function* (
    entry: JournalEntry,
    side: JournalSide,
  ): Effect.fn.Return<HistoryResult, AgentError | PlatformError> {
    const other: JournalSide = side === 'before' ? 'after' : 'before';
    const verb = side === 'before' ? 'undoing' : 'redoing';
    const movable = entry.files.filter(isUndoable);
    const skipped = entry.files.filter((file) => !isUndoable(file));
    const outside: string[] = [];
    for (const file of movable) {
      const reason = yield* checkTarget(file.path);
      if (reason !== undefined) {
        outside.push(`${file.path} (${reason})`);
      }
    }

    if (outside.length > 0) {
      return yield* agentError(
        `${outside.join(', ')} ${outside.length === 1 ? 'is' : 'are'} outside the deck's content, ` +
          `so ${verb} turn ${entry.turn} could write elsewhere.`,
        FOLDER_FIX,
      );
    }

    const refused: string[] = [];
    for (const file of movable) {
      const hash = file[side];
      if (hash !== null) {
        const reason = yield* checkImage(
          file,
          path.join(turnDir(entry.turn), side, file.path),
          hash,
        );
        if (reason !== undefined) {
          refused.push(`${file.path} (${reason})`);
        }
      }
    }

    if (refused.length > 0) {
      return yield* agentError(
        `${refused.join(', ')}: ${verb} turn ${entry.turn} ` +
          'would install bytes the journal did not record.',
        'Restore the files by hand; the journal of that turn cannot be trusted.',
      );
    }

    const conflicts: string[] = [];
    const pending: JournalFile[] = [];
    for (const file of movable) {
      const state = yield* currentState(file.path);
      if (state === file[other]) {
        pending.push(file);
      } else if (state !== file[side]) {
        conflicts.push(file.path);
      }
    }

    if (conflicts.length > 0) {
      return yield* agentError(
        `${conflicts.join(', ')} changed after turn ${entry.turn}, ` +
          `so ${verb} it would overwrite that change.`,
        CONFLICT_FIX,
      );
    }

    const staged: (typeof StagedFile.Type)[] = [];
    const deletions: (typeof PendingDeletion.Type)[] = [];
    const stage = Effect.gen(function* () {
      for (const file of pending) {
        const hash = file[side];
        if (hash === null) {
          deletions.push({ target: file.path, hash: file[other] ?? '' });
          continue;
        }

        yield* fs.makeDirectory(path.dirname(absolute(file.path)), { recursive: true });
        const temporary = `${file.path}.${randomBytes(TEMPORARY_RANDOM_BYTES).toString('hex')}${TEMPORARY_SUFFIX}`;
        yield* cloneFile(path.join(turnDir(entry.turn), side, file.path), absolute(temporary));
        yield* fs.chmod(absolute(temporary), modeOf(file, side));
        staged.push({ temporary, target: file.path, hash, from: file[other] });
      }

      yield* fs.makeDirectory(turnDir(entry.turn), { recursive: true });
      yield* writeAtomically(
        path.join(turnDir(entry.turn), INTENT_FILE),
        new TextEncoder().encode(JSON.stringify({ side, staged, deletions })),
      );
    });
    yield* stage.pipe(
      Effect.tapError(() =>
        Effect.forEach(staged, (file) => removeFile(file.temporary).pipe(Effect.ignore)),
      ),
    );
    yield* rollForward(entry.turn, { side, staged, deletions }, options.failAfterRenames);
    for (const file of movable) {
      if (file[side] !== null && !pending.includes(file)) {
        // Already in place by content; make the mode match the side too.
        yield* fs.chmod(absolute(file.path), modeOf(file, side)).pipe(Effect.ignore);
      }
    }

    return {
      target: entry.turn,
      files: movable.map((file) => changedFile(file)),
      ...(skipped.length === 0 ? {} : { skipped: skipped.map((file) => changedFile(file)) }),
    };
  });

  /**
   * Undoes the last turn not undone, or redoes the oldest undone one, after finishing any restore a
   * crash interrupted.
   *
   * @param action - Which way to move.
   */
  const move = Effect.fn('TurnJournal.move')(function* (
    action: 'undo' | 'redo',
  ): Effect.fn.Return<HistoryResult, AgentError | PlatformError> {
    yield* recover();
    const current = yield* Ref.get(entries);
    const entry =
      action === 'undo'
        ? current.findLast((candidate) => !candidate.undone)
        : current.find((candidate) => candidate.undone);
    if (entry === undefined) {
      return yield* agentError(
        action === 'undo'
          ? 'There is no agent turn to undo.'
          : 'There is no undone agent turn to redo.',
      );
    }

    return yield* restore(entry, action === 'undo' ? 'before' : 'after');
  });

  /**
   * Records a settled turn's changes: copies each side's blob under `turns/<n>/` (when small enough
   * to keep), drops the turns that were undone, keeps the last ones.
   *
   * @param turn - The turn number.
   * @param changes - The guard's kept changes.
   */
  const record = Effect.fn('TurnJournal.record')(function* (
    turn: number,
    changes: readonly GuardChange[],
  ): Effect.fn.Return<ChangedFile[], AgentError | PlatformError> {
    yield* recover();
    const recorded = changes.filter((change) => isPlainRelative(change.path));
    if (recorded.length === 0) {
      return [];
    }

    const current = yield* Ref.get(entries);
    const dropped = current.filter((entry) => entry.undone);
    const kept = current.filter((entry) => !entry.undone);
    const dir = turnDir(turn);
    yield* fs.remove(dir, { recursive: true, force: true });
    const files: JournalFile[] = [];
    for (const change of recorded) {
      const missing: JournalSide[] = [];
      for (const side of SIDES) {
        const hash = change[side]?.hash;
        if (hash === undefined) {
          continue;
        }

        const blob = path.join(blobsDir, hash);
        const info = yield* fs.stat(blob).pipe(Effect.option);
        if (Option.isNone(info) || Number(info.value.size) > UNDO_SIZE_LIMIT_BYTES) {
          missing.push(side);
          continue;
        }

        const target = path.join(dir, side, change.path);
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* cloneFile(blob, target);
        if ((yield* hashFile(target).pipe(Effect.orElseSucceed(() => ''))) !== hash) {
          yield* fs.remove(target, { force: true });
          missing.push(side);
        }
      }

      files.push(recordedFile(change, missing));
    }

    const next = [...kept, { turn, at: new Date().toISOString(), files, undone: false }];
    const expired = [...dropped, ...next.slice(0, Math.max(0, next.length - retention))];
    yield* saveIndex(next.slice(-retention));
    for (const entry of expired) {
      yield* fs.remove(turnDir(entry.turn), { recursive: true, force: true });
    }

    return files.map((file) => changedFile(file));
  });

  /**
   * One side of a file as bytes, or nothing when that side does not exist.
   *
   * @param turn - The turn number.
   * @param file - The file of the entry.
   * @param side - Which image.
   */
  const image = (turn: number, file: JournalFile, side: JournalSide) =>
    file[side] === null
      ? Effect.succeed(new Uint8Array())
      : fs.readFile(path.join(turnDir(turn), side, file.path));

  /**
   * The line diff of a recorded turn.
   *
   * @param turn - The turn number.
   */
  const diff = Effect.fn('TurnJournal.diff')(function* (
    turn: number,
  ): Effect.fn.Return<readonly TurnDiffFile[], AgentError | PlatformError> {
    const entry = (yield* Ref.get(entries)).find((candidate) => candidate.turn === turn);
    if (entry === undefined) {
      return yield* agentError(
        `Turn ${turn} is not in the journal: it changed no files, or a later turn replaced it.`,
      );
    }

    const files: TurnDiffFile[] = [];
    for (const file of entry.files) {
      if (!isPlainRelative(file.path)) {
        continue;
      }

      const undoable = isUndoable(file);
      const before = undoable ? yield* image(turn, file, 'before') : new Uint8Array();
      const after = undoable ? yield* image(turn, file, 'after') : new Uint8Array();
      const binary = !undoable || looksBinary(before) || looksBinary(after);
      const decoder = new TextDecoder();
      const lines = binary
        ? { hunks: [], added: 0, removed: 0, truncated: false }
        : lineDiff(decoder.decode(before), decoder.decode(after));
      files.push({
        path: file.path,
        kind: file.kind,
        binary,
        ...lines,
        ...(undoable ? {} : { undoable: false }),
      });
    }

    return files;
  });

  yield* recover().pipe(Effect.ignore);
  return {
    record: (turn, changes) =>
      record(turn, changes).pipe(Effect.mapError(asAgentError('record the turn'))),
    undo: move('undo').pipe(Effect.mapError(asAgentError('undo the turn'))),
    redo: move('redo').pipe(Effect.mapError(asAgentError('redo the turn'))),
    history: Ref.get(entries).pipe(
      Effect.map((current) => ({
        canUndo: current.some((entry) => !entry.undone),
        canRedo: current.some((entry) => entry.undone),
      })),
    ),
    targets: Ref.get(entries).pipe(
      Effect.map((current) => ({
        undo: current.findLast((entry) => !entry.undone)?.turn ?? null,
        redo: current.find((entry) => entry.undone)?.turn ?? null,
      })),
    ),
    lastTurn: Ref.get(entries).pipe(
      Effect.map((current) => Math.max(0, ...current.map((entry) => entry.turn))),
    ),
    diff: (turn) => diff(turn).pipe(Effect.mapError(asAgentError('read the turn'))),
  };
});

/**
 * Includes recorded mode and missing-side metadata only when the turn supplies it.
 */
function recordedFile(change: GuardChange, missing: readonly JournalSide[]): JournalFile {
  const metadata: {
    beforeMode?: number;
    afterMode?: number;
    missing?: readonly JournalSide[];
  } = {};
  if (change.before !== null) {
    metadata.beforeMode = change.before.mode;
  }

  if (change.after !== null) {
    metadata.afterMode = change.after.mode;
  }

  if (missing.length > 0) {
    metadata.missing = missing;
  }

  return {
    path: change.path,
    kind: change.kind,
    before: change.before?.hash ?? null,
    after: change.after?.hash ?? null,
    ...metadata,
  };
}

/**
 * A recorded file as the panel sees it.
 *
 * @param file - The recorded file.
 */
function changedFile(file: JournalFile): ChangedFile {
  return {
    path: file.path,
    kind: file.kind,
    ...(isUndoable(file) ? {} : { undoable: false }),
  };
}

/**
 * Whether the journal has both sides of a recorded file.
 *
 * @param file - The recorded file.
 */
function isUndoable(file: JournalFile): boolean {
  return file.missing === undefined || file.missing.length === 0;
}

/**
 * Whether a path is relative, with forward slashes and no empty, `.` or `..` segment.
 *
 * @param file - The path.
 */
function isPlainRelative(file: string): boolean {
  return (
    !path.isAbsolute(file) &&
    file.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}
