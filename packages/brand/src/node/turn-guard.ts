import type { PlatformError } from 'effect/PlatformError';

import { Effect, FileSystem, Option, Result, Schema, Semaphore } from 'effect';
import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { holdCode, type CodeHold } from '#node/code-gate.ts';
import { hashRegular, ioError } from '#node/content-io.ts';
import {
  isContentDirectory,
  isContentFile,
  STAGING_LIMITS,
  type StagingLimits,
} from '#node/content-policy.ts';
import {
  cloneIntoStore,
  compare,
  copyExclusive,
  GuardEntry,
  isWithin,
  linkHash,
  removeEntry,
  restoreEntry,
  walkRoots,
  type WalkFailure,
} from '#node/guard-snapshot.ts';
import { turnGuardError, type TurnGuardError } from '#node/turn-guard-error.ts';
import {
  createStaging,
  discardStaging,
  mirrorIntoStaging,
  retireStaging,
  syncStaging,
  type AppliedChange,
  type Staging,
} from '#node/turn-staging.ts';

/**
 * The name of the in-flight record in a deck's agent folder.
 */
export const TURN_RECORD_FILE = 'turn-guard.json';

/**
 * Spaces of indentation in the record.
 */
const JSON_INDENT_SPACES = 2;

/**
 * Copies of reverted files larger than this are not kept.
 */
const REVERTED_COPY_LIMIT_BYTES = 20 * 1024 * 1024;

/**
 * How many times a restore walks and puts back again before it gives up.
 */
const RESTORE_ROUNDS = 3;

/**
 * The most entries a walk of the deck and brand folders reads before it gives up.
 */
const MAX_GUARDED_ENTRIES = 50_000;

/**
 * How long one sync may take before it is given up, in milliseconds.
 */
const SYNC_DEADLINE_MS = 120_000;

/**
 * Transient files the comment store writes and removes in `.feedback/` while it holds its lock.
 */
const FEEDBACK_TRANSIENT = /\/\.feedback\/(?:[^/]+\/)?[^/]+\.(?:lock|tmp)$/;

/**
 * The deck an agent turn works on, and the brand its dev server renders.
 */
export type GuardTarget = {
  /**
   * The absolute workspace root.
   */
  readonly workspaceRoot: string;

  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * The brand folder name the deck renders with, from the deck config or the server's `--brand`
   * (never from the page); its folder is verified too.
   */
  readonly brand?: string | undefined;

  /**
   * The bounds of the working copy. Default: {@link STAGING_LIMITS}.
   */
  readonly limits?: StagingLimits;
};

/**
 * One content file a turn created, changed or deleted in the real deck (through the sync, or the
 * deck tools), or the deck config's slide list the deck tools changed.
 */
export type GuardChange = {
  /**
   * The path relative to the workspace root.
   */
  readonly path: string;

  /**
   * How it changed.
   */
  readonly kind: 'add' | 'update' | 'delete';

  /**
   * Its content and mode before the turn, or null when the turn created it.
   */
  readonly before: { readonly hash: string; readonly mode: number } | null;

  /**
   * Its content and mode after the turn, or null when the turn deleted it.
   */
  readonly after: { readonly hash: string; readonly mode: number } | null;
};

/**
 * A path the framework did not take from a turn, or put back: something in the working copy that is
 * not content, or a file outside the content that changed during the turn.
 */
export type RevertedPath = {
  /**
   * The path relative to the workspace root (a working copy's path as the deck path it stands for).
   */
  readonly path: string;

  /**
   * What was there, as a few words (`not content`, `a link`, `changed, put back`…).
   */
  readonly what: string;
};

/**
 * What the guard did at the end of a turn.
 */
export type GuardOutcome = {
  /**
   * The content changes the turn made in the real deck (and the slide-list edits the deck tools
   * made), in path order.
   */
  readonly kept: readonly GuardChange[];

  /**
   * What was left in the working copy or put back in the deck, in path order.
   */
  readonly reverted: readonly RevertedPath[];

  /**
   * Content files the agent changed but the person edited in the deck during the turn: their
   * version was kept, the agent's not applied. Paths relative to the workspace root.
   */
  readonly conflicts: readonly string[];

  /**
   * What went wrong, when something did (a working copy that could not be read, files outside the
   * content that could not be compared).
   */
  readonly failure: string | undefined;

  /**
   * The folder holding copies of the reverted files, relative to the workspace root, when any were
   * kept.
   */
  readonly copies: string | undefined;
};

/**
 * One agent turn the guard watches.
 */
export type TurnGuard = {
  /**
   * The turn's working copy: the only folder the provider may write.
   */
  readonly staging: {
    /**
     * The absolute folder.
     */
    readonly absolute: string;

    /**
     * The folder relative to the workspace root.
     */
    readonly relative: string;
  };

  /**
   * Brings the working copy's content into the real deck now (the deck tools do before they read
   * the deck, and the host on a short interval).
   */
  readonly sync: Effect.Effect<void, never, FileSystem.FileSystem>;

  /**
   * Ends the turn whatever way it ended: syncs one last time, retires the working copy, compares
   * the deck's and brand's other files with the record and puts back any that changed, and ends the
   * hold on the deck's code. When the verification cannot finish, the hold and the record stay, so
   * nothing that changed is ever loaded.
   */
  readonly settle: Effect.Effect<GuardOutcome, TurnGuardError, FileSystem.FileSystem>;
};

/**
 * A content change the sync or the deck tools made, as the in-flight record keeps it.
 */
const SyncedPath = Schema.Struct({
  /**
   * The path relative to the workspace root.
   */
  path: Schema.String,

  /**
   * The file before the turn's first change to it, or null when it did not exist.
   */
  before: Schema.NullOr(Schema.Struct({ hash: Schema.String, mode: Schema.Number })),

  /**
   * The file after the turn's last change to it, or null when the turn deleted it.
   */
  after: Schema.NullOr(Schema.Struct({ hash: Schema.String, mode: Schema.Number })),
});

/**
 * A content change the record keeps.
 */
type SyncedPath = typeof SyncedPath.Type;

/**
 * The in-flight record of a turn, written before the provider starts, before every change the
 * framework makes to the deck's content during the turn, and removed once the turn is settled. It
 * lives where no provider can write. Finding one when nothing in this process runs that turn means
 * the turn never finished: the working copy is discarded, every content change is undone, and the
 * other files are put back as the record says.
 */
const TurnRecord = Schema.Struct({
  /**
   * The format version.
   */
  version: Schema.Literal(2),

  /**
   * The process that runs the turn.
   */
  pid: Schema.Number,

  /**
   * When the turn began, in epoch milliseconds.
   */
  startedAt: Schema.Number,

  /**
   * The turn number.
   */
  turn: Schema.Number,

  /**
   * The verified folders, relative to the workspace root: the deck, then the brand.
   */
  roots: Schema.Array(Schema.String),

  /**
   * The working copy, relative to the workspace root.
   */
  staging: Schema.String,

  /**
   * What the folders' files other than content must look like: the snapshot, with the framework's
   * own writes since.
   */
  entries: Schema.Array(GuardEntry),

  /**
   * The content changes made in the real deck so far.
   */
  synced: Schema.Array(SyncedPath),
});

/**
 * The in-flight record of a turn.
 */
type TurnRecord = typeof TurnRecord.Type;

/**
 * Decodes a record.
 */
const decodeRecord = Schema.decodeUnknownResult(Schema.fromJsonString(TurnRecord));

/**
 * A guard of this process, while its turn is in flight (or failed to settle).
 */
type ActiveGuard = {
  /**
   * The deck and brand.
   */
  readonly target: GuardTarget;

  /**
   * The absolute verified folders.
   */
  readonly rootsAbsolute: readonly string[];

  /**
   * The record as it is on disk.
   */
  record: TurnRecord;

  /**
   * The snapshot's entry for the deck config, before the framework's writes.
   */
  readonly original: ReadonlyMap<string, GuardEntry>;

  /**
   * The hold on the deck's and brand's code.
   */
  readonly hold: CodeHold;

  /**
   * Serialises syncs, the framework's writes and the settle.
   */
  readonly lock: Semaphore.Semaphore;

  /**
   * The working copy.
   */
  readonly staging: Staging;

  /**
   * What the last sync left in the working copy, by workspace path.
   */
  ignored: readonly RevertedPath[];

  /**
   * Files the framework's own writes replaced although the person had changed them during the turn
   * (copies were kept), by workspace path.
   */
  replaced: readonly RevertedPath[];

  /**
   * Content files whose real version the person changed during the turn, by workspace path.
   */
  readonly conflicts: Set<string>;

  /**
   * Why a sync failed, the latest.
   */
  syncFailure: string | undefined;

  /**
   * Whether the turn is settled.
   */
  settled: boolean;
};

/**
 * The guards of this process, by absolute deck folder.
 */
const ACTIVE = new Map<string, ActiveGuard>();

/**
 * Serialises recoveries in this process.
 */
const RECOVERY_LOCK = Semaphore.makeUnsafe(1);

/**
 * The agent folder of a deck, where the record and blobs live.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
export function guardDir(workspaceRoot: string, deck: string): string {
  return path.join(workspaceRoot, '.deck', 'agent', deck);
}

/**
 * The in-flight record of a deck.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
export function turnRecordFile(workspaceRoot: string, deck: string): string {
  return path.join(guardDir(workspaceRoot, deck), TURN_RECORD_FILE);
}

/**
 * The blob store the guard and the undo journal share: files by the SHA-256 of their bytes, every
 * one checked against its name before it is installed anywhere.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
export function guardBlobsDir(workspaceRoot: string, deck: string): string {
  return path.join(guardDir(workspaceRoot, deck), 'blobs');
}

/**
 * The absolute deck folder.
 *
 * @param target - The deck.
 */
function deckFolder(target: Pick<GuardTarget, 'workspaceRoot' | 'deck'>): string {
  return path.join(target.workspaceRoot, 'decks', target.deck);
}

/**
 * Checks that a deck folder is a real folder inside the workspace (not a link, not resolving
 * elsewhere) and that its content folders, where they exist, are real folders inside it. The deck
 * tools and the guard both call it before they write.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 * @returns The deck folder's real path.
 */
export const assertDeckFolder = Effect.fn('assertDeckFolder')(function* (
  workspaceRoot: string,
  deck: string,
): Effect.fn.Return<string, TurnGuardError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const folder = deckFolder({ workspaceRoot, deck });
  const fix = `Make decks/${deck} and its slides/, assets/ and public/ plain folders inside the workspace (no symbolic links).`;
  if (deck === '' || deck.includes('/') || deck.includes('\\') || deck.startsWith('.')) {
    return yield* turnGuardError(`"${deck}" is not a deck folder name.`, fix);
  }

  const info = yield* fs.lstat(folder).pipe(Effect.option);
  if (Option.isNone(info) || info.value.type !== 'Directory') {
    return yield* turnGuardError(`decks/${deck} is not a folder.`, fix);
  }

  const real = yield* fs.realPath(folder).pipe(Effect.option);
  const workspace = yield* fs.realPath(workspaceRoot).pipe(Effect.option);
  if (
    Option.isNone(real) ||
    Option.isNone(workspace) ||
    real.value !== path.join(workspace.value, 'decks', deck)
  ) {
    return yield* turnGuardError(`decks/${deck} resolves outside the workspace's decks/.`, fix);
  }

  for (const name of ['slides', 'assets', 'public']) {
    const sub = yield* fs.lstat(path.join(folder, name)).pipe(Effect.option);
    if (Option.isSome(sub) && sub.value.type !== 'Directory') {
      return yield* turnGuardError(`decks/${deck}/${name} is not a plain folder.`, fix);
    }
  }

  return real.value;
});

/**
 * The verified folders of a target, relative to the workspace root: the deck, and the brand's
 * folder when it is a real folder under `brands/`.
 *
 * @param target - The deck and brand.
 */
const guardedRoots = Effect.fn('guardedRoots')(function* (
  target: GuardTarget,
): Effect.fn.Return<string[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const roots = [`decks/${target.deck}`];
  const { brand } = target;
  if (brand !== undefined && /^[a-z0-9][a-z0-9-]*$/.test(brand)) {
    const info = yield* fs
      .lstat(path.join(target.workspaceRoot, 'brands', brand))
      .pipe(Effect.option);
    if (Option.isSome(info) && info.value.type === 'Directory') {
      roots.push(`brands/${brand}`);
    }
  }

  return roots;
});

/**
 * Whether a process runs.
 *
 * @param pid - The process id.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { readonly code?: string }).code === 'EPERM';
  }
}

/**
 * Writes the record through a temporary file that is flushed and renamed into place.
 *
 * @param file - The record file.
 * @param record - The record.
 */
const writeRecord = Effect.fn('writeRecord')(function* (
  file: string,
  record: TurnRecord,
): Effect.fn.Return<void, TurnGuardError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const temporary = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  yield* Effect.scoped(
    Effect.gen(function* () {
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      const handle = yield* fs.open(temporary, { flag: 'wx', mode: 0o600 });
      yield* handle.writeAll(
        new TextEncoder().encode(`${JSON.stringify(record, null, JSON_INDENT_SPACES)}\n`),
      );
      yield* handle.sync;
    }),
  ).pipe(
    Effect.andThen(fs.rename(temporary, file)),
    Effect.mapError((error) =>
      turnGuardError(
        `The agent turn's record could not be written: ${error.message}`,
        'Check that .deck/ is writable.',
      ),
    ),
  );
});

/**
 * The entries of a snapshot by path.
 *
 * @param entries - The entries.
 */
function byPath(entries: readonly GuardEntry[]): Map<string, GuardEntry> {
  return new Map(entries.map((entry) => [entry.path, entry]));
}

/**
 * Whether two entries describe the same thing.
 *
 * @param left - One entry.
 * @param right - The other.
 */
function sameEntry(left: GuardEntry | undefined, right: GuardEntry | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  return (
    left.kind === right.kind &&
    left.mode === right.mode &&
    left.hash === right.hash &&
    left.link === right.link &&
    (left.kind !== 'file' || (left.links ?? 1) === (right.links ?? 1))
  );
}

/**
 * The path of an entry relative to the deck folder, or undefined when it is not in the deck.
 *
 * @param relative - The path relative to the workspace root.
 * @param deck - The deck folder name.
 */
function deckRelative(relative: string, deck: string): string | undefined {
  const prefix = `decks/${deck}/`;
  return relative.startsWith(prefix) ? relative.slice(prefix.length) : undefined;
}

/**
 * Whether a regular file of a verified folder is content (the sync's business, never part of the
 * record): a content file of the deck by its path.
 *
 * @param relative - The path relative to the workspace root.
 * @param deck - The deck folder name.
 */
function isDeckContent(relative: string, deck: string): boolean {
  const inDeck = deckRelative(relative, deck);
  return inDeck !== undefined && isContentFile(inDeck);
}

/**
 * Whether a change of a folder at one path is one the deck may keep: a content folder or a folder
 * inside one created (the sync makes them), or a folder inside a content folder removed.
 *
 * @param deck - The deck folder name.
 * @param before - The entry before the turn.
 * @param after - The entry after it.
 */
function isAllowedChange(
  deck: string,
  before: GuardEntry | undefined,
  after: GuardEntry | undefined,
): boolean {
  const relative = deckRelative((after ?? before)?.path ?? '', deck);
  if (relative === undefined || !isContentDirectory(relative)) {
    return false;
  }

  return (
    (before === undefined && after?.kind === 'directory') ||
    (after === undefined && before?.kind === 'directory' && relative.includes('/'))
  );
}

/**
 * Words for what happened at a path outside the content.
 *
 * @param before - The entry before.
 * @param after - The entry after.
 */
function describeChange(before: GuardEntry | undefined, after: GuardEntry | undefined): string {
  if (after === undefined) {
    return 'deleted, put back';
  }

  if (before === undefined) {
    return after.kind === 'symlink' ? 'created as a link, removed' : 'created, removed';
  }

  if (after.kind === 'symlink' && before.kind !== 'symlink') {
    return 'replaced by a link, put back';
  }

  if (after.kind === 'file' && (after.links ?? 1) > 1) {
    return 'hard-linked, put back';
  }

  if (before.hash === after.hash && before.mode !== after.mode) {
    return 'mode changed, put back';
  }

  return 'changed, put back';
}

/**
 * Walks the verified folders, every file but the deck's content files (the sync's business).
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 * @param roots - The folders, relative to the workspace root.
 * @param keep - Whether file contents go into the blob store.
 */
const walkGuarded = (
  workspaceRoot: string,
  deck: string,
  roots: readonly string[],
  keep: boolean,
) =>
  walkRoots({
    workspaceRoot,
    roots,
    blobsDir: guardBlobsDir(workspaceRoot, deck),
    keep: () => keep,
    maxEntries: MAX_GUARDED_ENTRIES,
    skipFile: (relative) =>
      FEEDBACK_TRANSIENT.test(`/${relative}`) || isDeckContent(relative, deck),
  });

/**
 * Starts guarding an agent turn: finishes any turn a crash left behind, holds the deck's and
 * brand's code (nothing there is imported until the turn is settled), reads every file of the deck
 * and the brand other than the deck's content in full into the blob store, creates the turn's
 * working copy, and writes the in-flight record before the provider starts.
 *
 * @param target - The deck and brand.
 * @param turn - The turn number.
 */
export const beginTurnGuard = Effect.fn('beginTurnGuard')(function* (
  target: GuardTarget,
  turn: number,
): Effect.fn.Return<TurnGuard, TurnGuardError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const deckReal = yield* assertDeckFolder(target.workspaceRoot, target.deck);
  const deckAbsolute = deckFolder(target);
  const running = ACTIVE.get(deckAbsolute);
  if (running !== undefined && !running.settled) {
    return yield* turnGuardError(
      `An agent turn on decks/${target.deck} is still being settled.`,
      'Wait for it to end.',
    );
  }

  yield* recoverTurnGuard(target.workspaceRoot, target.deck);
  const roots = yield* guardedRoots(target);
  const rootsAbsolute = roots.map((root) => path.join(target.workspaceRoot, root));
  const hold = holdCode(rootsAbsolute);
  const blobsDir = guardBlobsDir(target.workspaceRoot, target.deck);
  const walked = yield* walkGuarded(target.workspaceRoot, target.deck, roots, true);
  if (walked.failures.length > 0) {
    hold.release();
    return yield* turnGuardError(
      `The deck's files could not be read before the turn: ${describeFailures(walked.failures)}.`,
      'Fix the permissions of those files, then send the prompt again.',
    );
  }

  yield* collectBlobs(blobsDir, walked.entries);
  const staging = yield* createStaging(
    target.workspaceRoot,
    target.deck,
    deckReal,
    turn,
    target.limits ?? STAGING_LIMITS,
  ).pipe(
    Effect.mapError((error) =>
      turnGuardError(
        `The turn's working copy could not be made: ${typeof error === 'string' ? error : error.message}.`,
        'Make the deck smaller or fix the permissions of .deck/, then send the prompt again.',
      ),
    ),
    Effect.tapError(() => Effect.sync(hold.release)),
  );
  const record: TurnRecord = {
    version: 2,
    pid: process.pid,
    startedAt: Date.now(),
    turn,
    roots,
    staging: staging.relative,
    entries: walked.entries,
    synced: [],
  };
  const recordFile = turnRecordFile(target.workspaceRoot, target.deck);
  yield* writeRecord(recordFile, record).pipe(
    Effect.tapError(() =>
      retireStaging(staging).pipe(Effect.ignore, Effect.andThen(Effect.sync(hold.release))),
    ),
  );
  for (const entry of walked.entries) {
    if (isGatedCodeFile(entry.path, target) && entry.hash !== null) {
      const text = yield* fs
        .readFileString(path.join(blobsDir, entry.hash))
        .pipe(Effect.orElseSucceed(() => undefined));
      if (text !== undefined) {
        hold.accept(path.join(target.workspaceRoot, entry.path), text);
      }
    }
  }

  const configPath = `decks/${target.deck}/deck.config.ts`;
  const original = new Map(
    walked.entries
      .filter((entry) => entry.path === configPath)
      .map((entry) => [entry.path, entry] as const),
  );
  const active: ActiveGuard = {
    target,
    rootsAbsolute,
    record,
    original,
    hold,
    lock: Semaphore.makeUnsafe(1),
    staging,
    ignored: [],
    replaced: [],
    conflicts: new Set(),
    syncFailure: undefined,
    settled: false,
  };
  ACTIVE.set(deckAbsolute, active);
  return {
    staging: { absolute: staging.absolute, relative: staging.relative },
    sync: active.lock.withPermits(1)(runSync(active)),
    settle: active.lock.withPermits(1)(settleGuard(active)).pipe(Effect.uninterruptible),
  };
});

/**
 * Whether a path is a file the dev server imports as Node code: the deck's config or the brand's
 * file.
 *
 * @param relative - The path relative to the workspace root.
 * @param target - The deck and brand.
 */
function isGatedCodeFile(relative: string, target: GuardTarget): boolean {
  return (
    relative === `decks/${target.deck}/deck.config.ts` ||
    (target.brand !== undefined && relative === `brands/${target.brand}/brand.ts`)
  );
}

/**
 * Removes the blobs no entry of a snapshot names. The undo journal keeps its own copies, so only
 * the turn that begins needs the store.
 *
 * @param blobsDir - The blob store.
 * @param entries - The snapshot.
 */
const collectBlobs = Effect.fn('collectBlobs')(function* (
  blobsDir: string,
  entries: readonly GuardEntry[],
): Effect.fn.Return<void, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const live = new Set(entries.flatMap((entry) => (entry.hash === null ? [] : [entry.hash])));
  const names = yield* fs.readDirectory(blobsDir).pipe(Effect.orElseSucceed((): string[] => []));
  for (const name of names) {
    if (!live.has(name)) {
      yield* fs.remove(path.join(blobsDir, name), { force: true }).pipe(Effect.ignore);
    }
  }
});

/**
 * A short list of what a walk could not read.
 *
 * @param failures - The failures.
 */
function describeFailures(failures: readonly WalkFailure[]): string {
  const shown = failures.slice(0, 3).map((failure) => `${failure.path} (${failure.message})`);
  return failures.length > 3
    ? `${shown.join('; ')} and ${failures.length - 3} more`
    : shown.join('; ');
}

/**
 * Keeps a file's bytes in the blob store under their hash, unless they are there already; the copy
 * is kept only when it has that hash.
 *
 * @param blobsDir - The blob store.
 * @param file - The file.
 * @param hash - The hash its bytes must have.
 */
const keepBlob = Effect.fn('keepBlob')(function* (
  blobsDir: string,
  file: string,
  hash: string,
): Effect.fn.Return<void, PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(blobsDir, { recursive: true });
  if (!(yield* fs.exists(path.join(blobsDir, hash)))) {
    yield* cloneIntoStore(file, blobsDir, hash);
  }
});

/**
 * Adds a content change to the record: the first `before` of a path stays, the latest `after`
 * replaces the earlier one.
 *
 * @param record - The record.
 * @param change - The change, with the path relative to the workspace root.
 */
function withSynced(record: TurnRecord, change: SyncedPath): TurnRecord {
  const existing = record.synced.find((item) => item.path === change.path);
  const merged: SyncedPath =
    existing === undefined ? change : { ...change, before: existing.before };
  return {
    ...record,
    synced: [...record.synced.filter((item) => item.path !== change.path), merged].toSorted(
      (left, right) => compare(left.path, right.path),
    ),
  };
}

/**
 * Brings the working copy's content into the deck, keeping every image in the blob store and
 * writing each change into the record before it is made. What the sync left alone and its conflicts
 * are kept for the settle; a failure is kept too.
 *
 * @param active - The guard.
 */
const runSync = Effect.fn('runSync')(function* (
  active: ActiveGuard,
): Effect.fn.Return<void, never, FileSystem.FileSystem> {
  if (active.settled) {
    return;
  }

  const fs = yield* FileSystem.FileSystem;
  const { target } = active;
  const blobsDir = guardBlobsDir(target.workspaceRoot, target.deck);
  const recordFile = turnRecordFile(target.workspaceRoot, target.deck);
  const prefix = `decks/${target.deck}/`;
  const synced = yield* syncStaging(active.staging, {
    keepImage: (file, hash) =>
      keepBlob(blobsDir, file, hash).pipe(Effect.provideService(FileSystem.FileSystem, fs)),
    writeAhead: (change: AppliedChange) =>
      Effect.suspend(() => {
        active.record = withSynced(active.record, { ...change, path: `${prefix}${change.path}` });
        return writeRecord(recordFile, active.record).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.mapError((error) => ioError(recordFile, 'write', new Error(error.message))),
        );
      }),
  }).pipe(Effect.timeoutOption(SYNC_DEADLINE_MS), Effect.result);
  if (Result.isFailure(synced)) {
    active.syncFailure = `The working copy could not be brought into the deck: ${synced.failure.message}`;
    return;
  }

  if (Option.isNone(synced.success)) {
    active.syncFailure = `Bringing the working copy into the deck took longer than ${SYNC_DEADLINE_MS / 1000} s and was stopped.`;
    return;
  }

  const report = synced.success.value;
  active.ignored = report.ignored.map((item) => ({
    path: `${prefix}${item.path}`,
    what: item.what,
  }));
  for (const file of report.conflicts) {
    active.conflicts.add(`${prefix}${file}`);
  }

  active.syncFailure =
    report.failure === undefined
      ? undefined
      : `The working copy was not applied: ${report.failure}.`;
});

/**
 * Brings the working copy of the turn in flight on a deck into the deck now, when there is one in
 * this process: the deck tools call it before they read the deck (lint, screenshots, outline,
 * comments), so the agent's edits are what they see.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
export const syncActiveTurn = Effect.fn('syncActiveTurn')(function* (
  workspaceRoot: string,
  deck: string,
): Effect.fn.Return<void, never, FileSystem.FileSystem> {
  const active = ACTIVE.get(deckFolder({ workspaceRoot, deck }));
  if (active === undefined || active.settled) {
    return;
  }

  yield* active.lock.withPermits(1)(runSync(active));
});

/**
 * The paths a restore must put back, from the record and a walk after the turn.
 *
 * @param deck - The deck folder name.
 * @param expected - The record's entries by path.
 * @param found - The entries found by path.
 */
function plan(
  deck: string,
  expected: ReadonlyMap<string, GuardEntry>,
  found: ReadonlyMap<string, GuardEntry>,
): Set<string> {
  const paths = [...new Set([...expected.keys(), ...found.keys()])].toSorted(compare);
  const revert = new Set<string>();
  for (const file of paths) {
    const before = expected.get(file);
    const after = found.get(file);
    if (!sameEntry(before, after) && !isAllowedChange(deck, before, after)) {
      revert.add(file);
    }
  }

  return revert;
}

/**
 * Puts back the planned paths: folders the record has first (shallow first), then removes what the
 * record does not have (deepest first), then files and links the record has. Every restored file is
 * checked against its recorded hash before it is renamed into place.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param rootsAbsolute - The absolute verified folders.
 * @param blobsDir - The blob store.
 * @param expected - The record's entries by path.
 * @param found - The entries found by path.
 * @param paths - The paths to put back.
 */
const putBack = Effect.fn('putBack')(function* (
  workspaceRoot: string,
  rootsAbsolute: readonly string[],
  blobsDir: string,
  expected: ReadonlyMap<string, GuardEntry>,
  found: ReadonlyMap<string, GuardEntry>,
  paths: ReadonlySet<string>,
): Effect.fn.Return<void, string, FileSystem.FileSystem> {
  /**
   * The verified folder a path lies in.
   *
   * @param absolute - The path.
   */
  const rootOf = (absolute: string) =>
    rootsAbsolute.find((root) => isWithin(absolute, root)) ?? workspaceRoot;
  const ordered = [...paths].toSorted(compare);
  for (const file of ordered) {
    const entry = expected.get(file);
    if (entry?.kind === 'directory') {
      const absolute = path.join(workspaceRoot, entry.path);
      yield* restoreEntry(rootOf(absolute), absolute, entry, blobsDir).pipe(
        Effect.mapError((error) => (typeof error === 'string' ? error : error.message)),
      );
    }
  }

  for (const file of ordered.toReversed()) {
    if (found.has(file) && !expected.has(file)) {
      yield* removeEntry(path.join(workspaceRoot, file)).pipe(
        Effect.mapError((error) => error.message),
      );
    }
  }

  for (const file of ordered) {
    const entry = expected.get(file);
    if (entry !== undefined && entry.kind !== 'directory') {
      const absolute = path.join(workspaceRoot, entry.path);
      yield* restoreEntry(rootOf(absolute), absolute, entry, blobsDir).pipe(
        Effect.mapError((error) => (typeof error === 'string' ? error : error.message)),
      );
    }
  }
});

/**
 * Keeps a copy of each reverted file as it was found, readable only by the owner and never
 * executable, so an edit made by hand during the turn is not lost.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param folder - The copies' folder.
 * @param entries - The reverted entries as they were found.
 * @returns Whether any copy was made.
 */
const keepCopies = Effect.fn('keepCopies')(function* (
  workspaceRoot: string,
  folder: string,
  entries: readonly GuardEntry[],
): Effect.fn.Return<boolean, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  let kept = false;
  for (const entry of entries) {
    if (entry.kind !== 'file' || (entry.size ?? 0) > REVERTED_COPY_LIMIT_BYTES) {
      continue;
    }

    const copy = path.join(folder, entry.path);
    const done = yield* fs.makeDirectory(path.dirname(copy), { recursive: true }).pipe(
      Effect.andThen(fs.remove(copy, { force: true })),
      Effect.andThen(copyExclusive(path.join(workspaceRoot, entry.path), copy)),
      Effect.andThen(fs.chmod(copy, 0o600)),
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
    kept ||= done;
  }

  return kept;
});

/**
 * Restores the verified folders' files other than content to a record until a walk finds them as
 * the record says, or gives up after a few rounds.
 *
 * @param input - What to restore.
 * @returns What was put back, whether copies were kept, and why it gave up or could not compare.
 */
const restoreToRecord = Effect.fn('restoreToRecord')(function* (input: {
  readonly workspaceRoot: string;
  readonly deck: string;
  readonly record: TurnRecord;
  readonly copies: string;
}): Effect.fn.Return<
  {
    readonly failure: string | undefined;
    readonly unreadable: string | undefined;
    readonly reverted: readonly RevertedPath[];
    readonly copied: boolean;
  },
  never,
  FileSystem.FileSystem
> {
  const { workspaceRoot, deck, record } = input;
  const blobsDir = guardBlobsDir(workspaceRoot, deck);
  const rootsAbsolute = record.roots.map((root) => path.join(workspaceRoot, root));
  const expected = byPath(record.entries);
  let walked = yield* walkGuarded(workspaceRoot, deck, record.roots, false);
  let unreadable = walked.failures.length > 0 ? describeFailures(walked.failures) : undefined;
  let found = byPath(walked.entries);
  let pending = plan(deck, expected, found);
  const reverted: RevertedPath[] = [...pending]
    .toSorted(compare)
    .map((file) => ({ path: file, what: describeChange(expected.get(file), found.get(file)) }))
    .filter(
      (item, _index, list) =>
        !list.some(
          (other) =>
            other !== item &&
            other.what.startsWith('created') &&
            item.path.startsWith(`${other.path}/`),
        ),
    );
  const copied = yield* keepCopies(
    workspaceRoot,
    input.copies,
    [...pending].flatMap((file) => {
      const entry = found.get(file);
      return entry?.kind === 'file' ? [entry] : [];
    }),
  );
  for (let round = 0; round < RESTORE_ROUNDS; round += 1) {
    if (pending.size === 0 && walked.failures.length === 0) {
      return { failure: undefined, unreadable, reverted, copied };
    }

    yield* putBack(workspaceRoot, rootsAbsolute, blobsDir, expected, found, pending).pipe(
      Effect.ignore,
    );
    walked = yield* walkGuarded(workspaceRoot, deck, record.roots, false);
    if (walked.failures.length > 0) {
      unreadable ??= describeFailures(walked.failures);
    }

    found = byPath(walked.entries);
    pending = plan(deck, expected, found);
  }

  if (pending.size === 0 && walked.failures.length === 0) {
    return { failure: undefined, unreadable, reverted, copied };
  }

  return {
    failure: `${[...pending].slice(0, 3).join(', ') || describeFailures(walked.failures)} could not be put back`,
    unreadable,
    reverted,
    copied,
  };
});

/**
 * The changes a record says the turn made to the deck's content: each path from its first `before`
 * to its last `after`, unless they are the same.
 *
 * @param record - The record.
 */
function contentChanges(record: TurnRecord): GuardChange[] {
  return record.synced.flatMap((item): GuardChange[] => {
    if ((item.before?.hash ?? null) === (item.after?.hash ?? null)) {
      return [];
    }

    let kind: GuardChange['kind'] = 'update';
    if (item.before === null) {
      kind = 'add';
    } else if (item.after === null) {
      kind = 'delete';
    }

    return [{ path: item.path, kind, before: item.before, after: item.after }];
  });
}

/**
 * Settles a guard: one last sync, the working copy retired, the files outside the content verified
 * and restored, the record removed and the hold ended. When the verification cannot finish the hold
 * and the record stay.
 *
 * @param active - The guard.
 */
const settleGuard = Effect.fn('settleGuard')(function* (
  active: ActiveGuard,
): Effect.fn.Return<GuardOutcome, TurnGuardError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const { target } = active;
  yield* runSync(active);
  const retired = yield* retireStaging(active.staging).pipe(Effect.result);
  const copiesRelative = `.deck/agent/${target.deck}/reverted/${active.record.turn}`;
  const restored = yield* restoreToRecord({
    workspaceRoot: target.workspaceRoot,
    deck: target.deck,
    record: active.record,
    copies: path.join(target.workspaceRoot, copiesRelative),
  });
  if (restored.failure !== undefined) {
    return yield* turnGuardError(
      `Files outside the slides changed during the turn and could not all be put back: ${restored.failure}. The dev server keeps the deck's config as it was and will not load it again until they are.`,
      `Restart the dev server (it finishes the restore before it loads anything), or put the files back by hand and delete .deck/agent/${target.deck}/${TURN_RECORD_FILE}.`,
    );
  }

  const record = active.record;
  const kept = contentChanges(record);
  for (const [file, original] of active.original) {
    const final = record.entries.find((entry) => entry.path === file);
    if (!sameEntry(original, final)) {
      kept.push(fileChange(original, final));
    }
  }

  yield* fs
    .remove(turnRecordFile(target.workspaceRoot, target.deck), { force: true })
    .pipe(Effect.ignore);
  active.settled = true;
  ACTIVE.delete(deckFolder(target));
  active.hold.release();
  const failures = [
    active.syncFailure,
    Result.isFailure(retired)
      ? `The working copy could not be removed: ${retired.failure.message}`
      : undefined,
    restored.unreadable === undefined
      ? undefined
      : `Some files outside the slides could not be read after the turn (${restored.unreadable}).`,
  ].filter((item) => item !== undefined);
  return {
    kept: kept.toSorted((left, right) => compare(left.path, right.path)),
    reverted: [...active.ignored, ...active.replaced, ...restored.reverted].toSorted(
      (left, right) => compare(left.path, right.path),
    ),
    conflicts: [...active.conflicts].toSorted(compare),
    failure: failures.length === 0 ? undefined : failures.join(' '),
    copies: restored.copied || active.replaced.length > 0 ? copiesRelative : undefined,
  };
});

/**
 * A change between two file entries of the record (the deck config's slide list).
 *
 * @param before - The entry before, if any.
 * @param after - The entry after, if any.
 */
function fileChange(before: GuardEntry | undefined, after: GuardEntry | undefined): GuardChange {
  let kind: GuardChange['kind'] = 'update';
  if (before === undefined) {
    kind = 'add';
  } else if (after === undefined) {
    kind = 'delete';
  }

  return {
    path: (after ?? before)?.path ?? '',
    kind,
    before: before?.hash == null ? null : { hash: before.hash, mode: before.mode },
    after: after?.hash == null ? null : { hash: after.hash, mode: after.mode },
  };
}

/**
 * A SHA-256 in hex, as the guard names a blob.
 */
const BLOB_HASH = /^[0-9a-f]{64}$/;

/**
 * A brand folder the guard may verify.
 */
const BRAND_ROOT = /^brands\/[a-z0-9][a-z0-9-]*$/;

/**
 * Whether a path is plain: relative, forward slashes, no empty, `.` or `..` segment, no backslash.
 *
 * @param file - The path.
 */
function isPlainPath(file: string): boolean {
  return file
    .split('/')
    .every(
      (segment) => segment !== '' && segment !== '.' && segment !== '..' && !segment.includes('\\'),
    );
}

/**
 * Whether a record read from disk is one the guard could have written for this deck: its first root
 * is the deck, any other one brand folder; its working copy is in the deck's `work/`; every entry
 * is a plain path at or under a root that is not deck content; every file names its blob by hash
 * and every link by its `link:` hash; every content change is a content file of the deck with
 * hashes for blobs. A record that says anything else is never followed.
 *
 * @param record - The decoded record.
 * @param deck - The deck folder name the record is for.
 */
function isRecordOf(record: TurnRecord, deck: string): boolean {
  const [first, ...others] = record.roots;
  if (
    first !== `decks/${deck}` ||
    others.length > 1 ||
    !others.every((root) => BRAND_ROOT.test(root)) ||
    !record.staging.startsWith(`.deck/agent/${deck}/work/`)
  ) {
    return false;
  }

  const entriesOk = record.entries.every((entry) => {
    const underRoot = record.roots.some(
      (root) => entry.path === root || entry.path.startsWith(`${root}/`),
    );
    const plain = isPlainPath(entry.path) && underRoot;
    switch (entry.kind) {
      case 'file':
        return (
          plain &&
          !isDeckContent(entry.path, deck) &&
          entry.hash !== null &&
          BLOB_HASH.test(entry.hash)
        );
      case 'symlink':
        return plain && entry.link !== undefined && entry.hash === linkHash(entry.link);
      case 'directory':
      case 'other':
        return plain && entry.hash === null;
    }
  });
  return (
    entriesOk &&
    record.synced.every(
      (item) =>
        isPlainPath(item.path) &&
        isDeckContent(item.path, deck) &&
        [item.before, item.after].every((side) => side === null || BLOB_HASH.test(side.hash)),
    )
  );
}

/**
 * Undoes the content changes a crashed turn made: each path whose real file still has the content
 * the turn last wrote goes back to its content before the turn (from the blob store, checked
 * against its hash) or is deleted when the turn created it. A file changed since is left alone.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 * @param record - The record.
 * @returns The paths left alone.
 */
const undoSynced = Effect.fn('undoSynced')(function* (
  workspaceRoot: string,
  deck: string,
  record: TurnRecord,
): Effect.fn.Return<string[], string, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const blobsDir = guardBlobsDir(workspaceRoot, deck);
  const deckAbsolute = path.join(workspaceRoot, 'decks', deck);
  const left: string[] = [];
  for (const item of record.synced) {
    const absolute = path.join(workspaceRoot, item.path);
    const now = yield* hashRegular(absolute, STAGING_LIMITS.maxFileBytes).pipe(
      Effect.mapError((error) => error.message),
    );
    let hash: string | null = typeof now === 'string' ? 'other' : now.hash;
    if (now === 'missing') {
      hash = null;
    }

    if (hash === (item.before?.hash ?? null)) {
      continue;
    }

    if (hash !== (item.after?.hash ?? null)) {
      left.push(item.path);
      continue;
    }

    if (item.before === null) {
      yield* fs.remove(absolute, { force: true }).pipe(Effect.mapError((error) => error.message));
      continue;
    }

    yield* restoreEntry(
      deckAbsolute,
      absolute,
      { path: item.path, kind: 'file', mode: item.before.mode, hash: item.before.hash },
      blobsDir,
    ).pipe(Effect.mapError((error) => (typeof error === 'string' ? error : error.message)));
  }

  return left;
});

/**
 * Finishes a turn a crash or a kill left behind: when the deck has an in-flight record and the
 * process that wrote it is not running, discards the working copy (never syncing it), undoes the
 * content changes the record lists, puts every other file of the verified folders back exactly as
 * the record says and removes the record. Fails while that process still runs, or when the restore
 * does not finish, so nothing the turn changed is loaded. Does nothing for a turn this process
 * runs, or when there is no record. Every command that imports a deck's or a brand's code calls it
 * first.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 * @returns The paths put back, or undefined when there was nothing to finish.
 */
export const recoverTurnGuard = Effect.fn('recoverTurnGuard')(function* (
  workspaceRoot: string,
  deck: string,
): Effect.fn.Return<readonly RevertedPath[] | undefined, TurnGuardError, FileSystem.FileSystem> {
  return yield* RECOVERY_LOCK.withPermits(1)(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const file = turnRecordFile(workspaceRoot, deck);
      const text = yield* fs.readFileString(file).pipe(Effect.option);
      if (Option.isNone(text)) {
        return undefined;
      }

      const active = ACTIVE.get(deckFolder({ workspaceRoot, deck }));
      if (active !== undefined && !active.settled && active.record.pid === process.pid) {
        return undefined;
      }

      const decoded = decodeRecord(text.value);
      if (Result.isFailure(decoded) || !isRecordOf(decoded.success, deck)) {
        return yield* turnGuardError(
          `An agent turn on decks/${deck} did not finish, and its record (.deck/agent/${deck}/${TURN_RECORD_FILE}) cannot be read, so its changes cannot be put back.`,
          `Check decks/${deck} (deck.config.ts, stylesheets, the slides) by hand, then delete that record.`,
        );
      }

      const record = decoded.success;
      if (record.pid !== process.pid && isAlive(record.pid)) {
        return yield* turnGuardError(
          `An agent turn on decks/${deck} is running in another process (pid ${record.pid}), so the deck's files may be mid-edit.`,
          'Wait for the turn to end in that dev server, or stop it (it puts the files back when it ends).',
        );
      }

      yield* discardStaging(workspaceRoot, deck, record.staging).pipe(Effect.ignore);
      /**
       * Fails the recovery with what could not be put back.
       *
       * @param failure - What went wrong.
       */
      const unfinished = (failure: string) =>
        turnGuardError(
          `An agent turn on decks/${deck} did not finish and its changes could not all be put back: ${failure}.`,
          `Fix the permissions of those files and start again, or restore them by hand and delete .deck/agent/${deck}/${TURN_RECORD_FILE}.`,
        );
      const undone = yield* undoSynced(workspaceRoot, deck, record).pipe(
        Effect.mapError(unfinished),
      );
      const restored = yield* restoreToRecord({
        workspaceRoot,
        deck,
        record,
        copies: path.join(workspaceRoot, '.deck', 'agent', deck, 'reverted', String(record.turn)),
      });
      if (restored.failure !== undefined) {
        return yield* unfinished(restored.failure);
      }

      yield* fs.remove(file, { force: true }).pipe(Effect.ignore);
      if (active !== undefined) {
        ACTIVE.delete(deckFolder({ workspaceRoot, deck }));
        active.hold.release();
      }

      const left = undone;
      return [
        ...record.synced
          .filter((item) => !left.includes(item.path))
          .map((item) => ({ path: item.path, what: 'changed by the unfinished turn, put back' })),
        ...left.map((item) => ({
          path: item,
          what: 'changed since the unfinished turn, left as it is',
        })),
        ...restored.reverted,
      ];
    }),
  );
});

/**
 * Finishes every unfinished turn whose record names a brand, before that brand's code is imported
 * (`deck brand check`, a build): the same recovery as {@link recoverTurnGuard}, for each deck whose
 * in-flight record verifies `brands/<brand>`.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param brand - The brand folder name.
 */
export const recoverTurnsForBrand = Effect.fn('recoverTurnsForBrand')(function* (
  workspaceRoot: string,
  brand: string,
): Effect.fn.Return<void, TurnGuardError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const agentRoot = path.join(workspaceRoot, '.deck', 'agent');
  const decks = yield* Effect.tryPromise(() => readdir(agentRoot)).pipe(
    Effect.orElseSucceed((): string[] => []),
  );
  for (const deck of decks.toSorted()) {
    const text = yield* fs.readFileString(turnRecordFile(workspaceRoot, deck)).pipe(Effect.option);
    if (Option.isSome(text) && text.value.includes(`"brands/${brand}"`)) {
      yield* recoverTurnGuard(workspaceRoot, deck);
    }
  }
});

/**
 * Runs a write the framework itself makes during a turn so that the turn keeps it. While a turn on
 * the file's deck is in flight in this process, the write runs under the guard's lock: a content
 * file (a slide the deck tools add or remove) is synced first, recorded before and after, and
 * mirrored into the working copy so the agent sees it; any other file (the deck config's slide
 * list, a review comment) becomes part of what the guard verifies against. Without a turn it simply
 * runs.
 *
 * @param file - The absolute path the write changes (a file, or a folder it removes).
 * @param write - The write.
 */
export const guardedWrite = <A, E, R>(
  file: string,
  write: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | FileSystem.FileSystem> =>
  Effect.suspend(() => {
    const active = activeFor(file);
    if (active === undefined) {
      return write;
    }

    return active.lock.withPermits(1)(
      Effect.gen(function* () {
        if (active.settled) {
          return yield* write;
        }

        const relative = toRelative(active.target.workspaceRoot, file);
        const inDeck = deckRelative(relative, active.target.deck);
        if (inDeck !== undefined && isContentFile(inDeck)) {
          yield* runSync(active);
          const before = active.staging.current.get(inDeck) ?? null;
          const beforeMode = yield* contentState(path.join(active.staging.deckReal, inDeck));
          if (before !== null && beforeMode !== null) {
            yield* keepBlob(
              guardBlobsDir(active.target.workspaceRoot, active.target.deck),
              path.join(active.staging.deckReal, inDeck),
              before,
            ).pipe(Effect.ignore);
          }

          const result = yield* write;
          yield* recordFrameworkContent(
            active,
            inDeck,
            before === null || beforeMode === null ? null : { hash: before, mode: beforeMode.mode },
          );
          return result;
        }

        const result = yield* write;
        yield* rebaseline(active, file);
        return result;
      }),
    );
  });

/**
 * The mode of a real content file now, or null when it is not one plain file.
 *
 * @param file - The absolute path.
 */
const contentState = (file: string): Effect.Effect<{ readonly mode: number } | null> =>
  hashRegular(file, STAGING_LIMITS.maxFileBytes).pipe(
    Effect.map((read) => (typeof read === 'string' ? null : { mode: read.mode })),
    Effect.orElseSucceed(() => null),
  );

/**
 * Records a content change the framework made during a turn (a slide added or removed by the deck
 * tools): mirrors it into the working copy and adds it to the record, with its image.
 *
 * @param active - The guard.
 * @param inDeck - The path relative to the deck folder.
 * @param before - The file before the write.
 */
const recordFrameworkContent = Effect.fn('recordFrameworkContent')(function* (
  active: ActiveGuard,
  inDeck: string,
  before: { readonly hash: string; readonly mode: number } | null,
): Effect.fn.Return<void, never, FileSystem.FileSystem> {
  const { target } = active;
  const after = yield* mirrorIntoStaging(active.staging, inDeck).pipe(
    Effect.orElseSucceed(() => null),
  );
  if (after !== null) {
    yield* keepBlob(
      guardBlobsDir(target.workspaceRoot, target.deck),
      path.join(active.staging.deckReal, inDeck),
      after.hash,
    ).pipe(Effect.ignore);
  }

  active.record = withSynced(active.record, {
    path: `decks/${target.deck}/${inDeck}`,
    before,
    after: after === null ? null : { hash: after.hash, mode: after.mode & 0o666 },
  });
  yield* writeRecord(turnRecordFile(target.workspaceRoot, target.deck), active.record).pipe(
    Effect.ignore,
  );
});

/**
 * The guard of this process whose folders hold a path.
 *
 * @param file - An absolute path.
 */
function activeFor(file: string): ActiveGuard | undefined {
  const resolved = path.resolve(file);
  return [...ACTIVE.values()].find(
    (active) => !active.settled && active.rootsAbsolute.some((root) => isWithin(resolved, root)),
  );
}

/**
 * The content a file had when the turn in flight began (or after the framework's last write to it),
 * when a turn on its deck is in flight in this process.
 *
 * @param file - The absolute path.
 */
export const guardedBaseline = Effect.fn('guardedBaseline')(function* (
  file: string,
): Effect.fn.Return<Option.Option<string>, never, FileSystem.FileSystem> {
  const active = activeFor(file);
  if (active === undefined) {
    return Option.none();
  }

  const fs = yield* FileSystem.FileSystem;
  const relative = toRelative(active.target.workspaceRoot, file);
  const entry = active.record.entries.find((candidate) => candidate.path === relative);
  if (entry?.kind !== 'file' || entry.hash === null) {
    return Option.none();
  }

  return yield* fs
    .readFileString(
      path.join(guardBlobsDir(active.target.workspaceRoot, active.target.deck), entry.hash),
    )
    .pipe(Effect.option);
});

/**
 * A path relative to the workspace root, with forward slashes.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param file - The absolute path.
 */
function toRelative(workspaceRoot: string, file: string): string {
  return path.relative(workspaceRoot, path.resolve(file)).split(path.sep).join('/');
}

/**
 * Makes the record say what a path looks like now, after a write the framework made: the path's
 * topmost folder below its root (or the path itself, at the top) is read again in full and replaces
 * what the record had under it. The record is saved.
 *
 * @param active - The guard.
 * @param file - The absolute path written.
 */
const rebaseline = Effect.fn('rebaseline')(function* (
  active: ActiveGuard,
  file: string,
): Effect.fn.Return<void, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const { target, record } = active;
  const relative = toRelative(target.workspaceRoot, file);
  const root = record.roots.find((candidate) => relative.startsWith(`${candidate}/`));
  const inDeck = deckRelative(relative, target.deck);
  if (root === undefined || (inDeck !== undefined && isContentDirectory(inDeck))) {
    return;
  }

  const top = `${root}/${relative.slice(root.length + 1).split('/')[0] ?? ''}`;
  const blobsDir = guardBlobsDir(target.workspaceRoot, target.deck);
  const walked = yield* walkGuarded(target.workspaceRoot, target.deck, [top], true);
  /**
   * Whether an entry is the top path or under it.
   *
   * @param entry - The entry.
   */
  const underTop = (entry: GuardEntry) => entry.path === top || entry.path.startsWith(`${top}/`);
  active.record = {
    ...record,
    entries: record.entries
      .filter((entry) => !underTop(entry))
      .concat(walked.entries)
      .toSorted((left, right) => compare(left.path, right.path)),
  };
  for (const entry of walked.entries) {
    if (isGatedCodeFile(entry.path, target) && entry.hash !== null) {
      const text = yield* fs
        .readFileString(path.join(blobsDir, entry.hash))
        .pipe(Effect.orElseSucceed(() => undefined));
      if (text !== undefined) {
        active.hold.accept(path.join(target.workspaceRoot, entry.path), text);
      }
    }
  }

  yield* writeRecord(turnRecordFile(target.workspaceRoot, target.deck), active.record).pipe(
    Effect.ignore,
  );
});

/**
 * Keeps a copy of the config on disk when it is not the baseline the slide-list edit starts from (a
 * hand edit made during the turn), before the write replaces it: the copy goes under the turn's
 * `reverted/` folder like the guard's own, and the turn reports the path as put back.
 *
 * @param file - The absolute config path.
 * @param baseline - The config as the turn found it.
 */
const keepReplacedConfig = Effect.fn('keepReplacedConfig')(function* (
  file: string,
  baseline: string,
): Effect.fn.Return<void, never, FileSystem.FileSystem> {
  const active = activeFor(file);
  if (active === undefined) {
    return;
  }

  const fs = yield* FileSystem.FileSystem;
  const onDisk = yield* fs.readFileString(file).pipe(Effect.option);
  if (Option.isNone(onDisk) || onDisk.value === baseline) {
    return;
  }

  const { target } = active;
  const relative = toRelative(target.workspaceRoot, file);
  const copy = path.join(
    target.workspaceRoot,
    '.deck',
    'agent',
    target.deck,
    'reverted',
    String(active.record.turn),
    relative,
  );
  const kept = yield* fs.makeDirectory(path.dirname(copy), { recursive: true }).pipe(
    Effect.andThen(fs.remove(copy, { force: true })),
    Effect.andThen(copyExclusive(file, copy)),
    Effect.andThen(fs.chmod(copy, 0o600)),
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );
  if (kept) {
    active.replaced = [
      ...active.replaced.filter((item) => item.path !== relative),
      { path: relative, what: 'changed, replaced' },
    ];
  }
});

/**
 * Rewrites a deck's `deck.config.ts` with a data-only edit made by the framework (the slide list),
 * the way the deck tools and the slide sidebar do: the deck folder and the config must be plain (no
 * links, inside the workspace), the edit starts from the config as the turn in flight found it
 * (never from what may have been written since), and the new file is written next to the old one
 * and renamed into place. While a turn is in flight the guard keeps the result.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 * @param edit - Makes the new config from the old one.
 */
export const writeDeckManifest = <E, R>(
  workspaceRoot: string,
  deck: string,
  edit: (config: string) => Effect.Effect<string, E, R>,
): Effect.Effect<void, E | TurnGuardError, R | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const deckReal = yield* assertDeckFolder(workspaceRoot, deck);
    const file = path.join(deckFolder({ workspaceRoot, deck }), 'deck.config.ts');
    const fix = `Make decks/${deck}/deck.config.ts a plain file (no symbolic or hard links).`;
    yield* guardedWrite(
      file,
      Effect.gen(function* () {
        const info = yield* fs.lstat(file).pipe(Effect.option);
        if (
          Option.isNone(info) ||
          info.value.type !== 'File' ||
          Number(Option.getOrElse(info.value.nlink, () => 1n)) !== 1
        ) {
          return yield* turnGuardError(`decks/${deck}/deck.config.ts is not a plain file.`, fix);
        }

        const real = yield* fs.realPath(file).pipe(Effect.option);
        if (Option.isNone(real) || path.dirname(real.value) !== deckReal) {
          return yield* turnGuardError(
            `decks/${deck}/deck.config.ts resolves outside the deck.`,
            fix,
          );
        }

        const baseline = yield* guardedBaseline(file);
        if (Option.isSome(baseline)) {
          yield* keepReplacedConfig(file, baseline.value);
        }

        const current = Option.isSome(baseline)
          ? baseline.value
          : yield* fs
              .readFileString(file)
              .pipe(
                Effect.mapError((error) =>
                  turnGuardError(
                    `decks/${deck}/deck.config.ts could not be read: ${error.message}`,
                    fix,
                  ),
                ),
              );
        const updated = yield* edit(current);
        const temporary = path.join(
          path.dirname(file),
          `.deck.config.ts.${randomBytes(4).toString('hex')}.tmp`,
        );
        yield* fs.writeFileString(temporary, updated, { flag: 'wx' }).pipe(
          Effect.andThen(fs.chmod(temporary, info.value.mode & 0o666)),
          Effect.andThen(fs.rename(temporary, file)),
          Effect.tapError(() => fs.remove(temporary, { force: true }).pipe(Effect.ignore)),
          Effect.mapError((error) =>
            turnGuardError(
              `decks/${deck}/deck.config.ts could not be written: ${error.message}`,
              'Check that the deck folder is writable.',
            ),
          ),
        );
      }),
    );
  });

/**
 * Checks that a path the deck tools are about to create or remove is a plain entry of the deck's
 * `slides/` folder: inside the deck's real folder, its folder no link, and itself no folder.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 * @param file - The absolute path.
 */
export const assertSlidePath = Effect.fn('assertSlidePath')(function* (
  workspaceRoot: string,
  deck: string,
  file: string,
): Effect.fn.Return<void, TurnGuardError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const deckReal = yield* assertDeckFolder(workspaceRoot, deck);
  const slides = path.join(deckFolder({ workspaceRoot, deck }), 'slides');
  const fix = `Keep decks/${deck}/slides a plain folder of slide files.`;
  if (path.dirname(path.resolve(file)) !== slides) {
    return yield* turnGuardError(
      `${toRelative(workspaceRoot, file)} is not in decks/${deck}/slides.`,
      fix,
    );
  }

  const folder = yield* fs.realPath(slides).pipe(Effect.option);
  if (Option.isNone(folder) || folder.value !== path.join(deckReal, 'slides')) {
    return yield* turnGuardError(`decks/${deck}/slides resolves outside the deck.`, fix);
  }

  const info = yield* fs.lstat(file).pipe(Effect.option);
  if (Option.isSome(info) && info.value.type !== 'File' && info.value.type !== 'SymbolicLink') {
    return yield* turnGuardError(`${toRelative(workspaceRoot, file)} is not a slide file.`, fix);
  }
});

/**
 * Forgets this process's guards and releases their holds, for tests.
 */
export function resetTurnGuards(): void {
  for (const active of ACTIVE.values()) {
    active.hold.release();
  }

  ACTIVE.clear();
}
