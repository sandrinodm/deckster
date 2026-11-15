import type { BigIntStats } from 'node:fs';

import { Effect } from 'effect';
import { type PlatformError } from 'effect/PlatformError';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';

import {
  copyToTemporary,
  hashRegular,
  ioError,
  notRegular,
  renameChecked,
  sameSignature,
  signatureOf,
  type NotRegular,
  type StatSignature,
} from '#node/content-io.ts';
import {
  CONTENT_FOLDER_NAMES,
  foldPath,
  isContentFile,
  STAGING_LIMITS,
  type StagingLimits,
} from '#node/content-policy.ts';

/**
 * The mode of a working copy's folders: the owner only.
 */
const FOLDER_MODE = 0o700;

/**
 * The mode a new content file gets.
 */
const NEW_FILE_MODE = 0o644;

/**
 * What the framework knows about one file of a working copy: its signature when last read and the
 * hash of its bytes then.
 */
type CachedFile = {
  /**
   * The signature.
   */
  readonly signature: StatSignature;

  /**
   * The SHA-256 of its bytes.
   */
  readonly hash: string;
};

/**
 * One turn's working copy: where it is, which folder it must still be, and what the sync knows.
 */
export type Staging = {
  /**
   * The absolute workspace root.
   */
  readonly workspaceRoot: string;

  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * The working copy's folder, absolute.
   */
  readonly absolute: string;

  /**
   * The working copy's folder relative to the workspace root, with forward slashes.
   */
  readonly relative: string;

  /**
   * The device and inode of the working copy's folder: a folder found there later with another one
   * (a link, a replacement) is never read.
   */
  readonly identity: Pick<StatSignature, 'dev' | 'ino'>;

  /**
   * The device and inode of each content folder of the working copy, by name.
   */
  readonly folders: Map<string, Pick<StatSignature, 'dev' | 'ino'>>;

  /**
   * The real path of the deck folder.
   */
  readonly deckReal: string;

  /**
   * The bounds.
   */
  readonly limits: StagingLimits;

  /**
   * The working copy's files as the framework last read them, by path relative to the deck folder.
   */
  readonly cache: Map<string, CachedFile>;

  /**
   * The content of each real content file the framework knows, by path relative to the deck: its
   * hash when the turn began or after the framework's last write, or null when absent. A real file
   * found with another content was changed by someone else meanwhile (a conflict).
   */
  readonly current: Map<string, string | null>;
};

/**
 * One content change a sync made in the real deck.
 */
export type AppliedChange = {
  /**
   * The path relative to the deck folder.
   */
  readonly path: string;

  /**
   * The real file before, or null when it did not exist.
   */
  readonly before: { readonly hash: string; readonly mode: number } | null;

  /**
   * The real file after, or null when the sync deleted it.
   */
  readonly after: { readonly hash: string; readonly mode: number } | null;
};

/**
 * Something in a working copy a sync did not take, with the reason.
 */
export type IgnoredEntry = {
  /**
   * The path relative to the deck folder.
   */
  readonly path: string;

  /**
   * Why, as a few words (`not content`, `a link`, `a FIFO`…).
   */
  readonly what: string;
};

/**
 * What one sync did.
 */
export type SyncReport = {
  /**
   * The changes made in the real deck, in order.
   */
  readonly applied: readonly AppliedChange[];

  /**
   * What was left in the working copy, in path order.
   */
  readonly ignored: readonly IgnoredEntry[];

  /**
   * Content files whose real version changed since the framework last wrote or read them (an edit
   * by hand during the turn): the working copy's version was not applied, in path order.
   */
  readonly conflicts: readonly string[];

  /**
   * Why nothing was applied, when the working copy could not be read as a whole.
   */
  readonly failure: string | undefined;
};

/**
 * What the framework does around each change a sync makes: keep a file's bytes under their hash,
 * and record the change before it happens, so a crash can always put the deck back.
 */
export type SyncHooks = {
  /**
   * Keeps a copy of a file's bytes, which must have this hash.
   *
   * @param file - The absolute path.
   * @param hash - The bytes' hash.
   */
  readonly keepImage: (file: string, hash: string) => Effect.Effect<void, PlatformError>;

  /**
   * Records a change about to be made.
   *
   * @param change - The change.
   */
  readonly writeAhead: (change: AppliedChange) => Effect.Effect<void, PlatformError>;
};

/**
 * What one path of a working copy is, never following a link.
 */
type EntryKind = 'file' | 'folder' | NotRegular;

/**
 * One path a walk of a working copy found.
 */
type WalkEntry = {
  /**
   * The path relative to the deck folder.
   */
  readonly path: string;

  /**
   * What it is.
   */
  readonly kind: EntryKind;

  /**
   * Its `lstat`.
   */
  readonly info: BigIntStats;
};

/**
 * What a walk of a working copy found.
 */
type WalkResult = {
  /**
   * Every path in the content folders, in path order.
   */
  readonly entries: readonly WalkEntry[];

  /**
   * What sits in the working copy's top folder besides the content folders.
   */
  readonly strays: readonly string[];

  /**
   * Why the walk stopped early (too many files), if it did.
   */
  readonly overflow: string | undefined;
};

/**
 * Runs a promise for a file operation and maps its failure to a platform error.
 *
 * @param file - The path.
 * @param method - The operation.
 * @param run - The operation.
 */
const attempt = <A>(
  file: string,
  method: string,
  run: () => Promise<A>,
): Effect.Effect<A, PlatformError> =>
  Effect.tryPromise({ try: run, catch: (cause) => ioError(file, method, cause) });

/**
 * The `lstat` of a path with big integers, or undefined when it does not exist.
 *
 * @param file - The path.
 */
const lstatOptional = (file: string): Effect.Effect<BigIntStats | undefined, PlatformError> =>
  attempt(file, 'lstat', async () => {
    try {
      return await lstat(file, { bigint: true });
    } catch (error) {
      if ((error as { readonly code?: string }).code === 'ENOENT') {
        return undefined;
      }

      throw error;
    }
  });

/**
 * What an `lstat` result is.
 *
 * @param info - The result.
 * @param maxBytes - The largest file accepted.
 */
function kindOf(info: BigIntStats, maxBytes: number): EntryKind {
  if (info.isDirectory()) {
    return 'folder';
  }

  return notRegular(info, maxBytes) ?? 'file';
}

/**
 * Words for a path a sync leaves alone.
 *
 * @param kind - What it is.
 * @param limits - The bounds, for sizes.
 */
function describeKind(kind: EntryKind, limits: StagingLimits): string {
  switch (kind) {
    case 'link':
      return 'a link';
    case 'fifo':
      return 'a FIFO';
    case 'socket':
      return 'a socket';
    case 'device':
      return 'a device';
    case 'hard-linked':
      return 'hard-linked';
    case 'too-large':
      return `larger than ${formatBytes(limits.maxFileBytes)}`;
    case 'swapped':
      return 'replaced while it was read';
    case 'missing':
      return 'gone while it was read';
    case 'folder':
    case 'file':
      return 'not content';
  }
}

/**
 * A byte count in words: bytes, KB or MB.
 *
 * @param bytes - The count.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }

  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * The working copies' folder of a deck.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
export function workFolder(workspaceRoot: string, deck: string): string {
  return path.join(workspaceRoot, '.deck', 'agent', deck, 'work');
}

/**
 * Where retired working copies wait to be deleted.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
function retiredFolder(workspaceRoot: string, deck: string): string {
  return path.join(workspaceRoot, '.deck', 'agent', deck, 'retired');
}

/**
 * Whether a name is one the framework gives a working copy: `<turn>-<12 hex digits>`.
 *
 * @param name - The folder name.
 */
export function isStagingName(name: string): boolean {
  return /^[0-9]{1,9}-[0-9a-f]{12}$/.test(name);
}

/**
 * Makes sure each folder from the workspace root down to a deck's agent folder and its `work/` and
 * `retired/` folders is a real folder (never a link), creating the missing ones; a link or a file
 * found there is removed first (the link itself, never what it points to).
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
const ensureAgentFolders = Effect.fn('ensureAgentFolders')(function* (
  workspaceRoot: string,
  deck: string,
): Effect.fn.Return<void, PlatformError> {
  let current = workspaceRoot;
  for (const segment of ['.deck', 'agent', deck]) {
    current = path.join(current, segment);
    yield* ensureRealFolder(current);
  }

  yield* ensureRealFolder(workFolder(workspaceRoot, deck));
  yield* ensureRealFolder(retiredFolder(workspaceRoot, deck));
});

/**
 * Makes a path a real folder: creates it, or replaces a link or file found there.
 *
 * @param folder - The path.
 */
const ensureRealFolder = Effect.fn('ensureRealFolder')(function* (
  folder: string,
): Effect.fn.Return<void, PlatformError> {
  const info = yield* lstatOptional(folder);
  if (info?.isDirectory() === true) {
    return;
  }

  if (info !== undefined) {
    yield* attempt(folder, 'unlink', () => unlink(folder));
  }

  yield* attempt(folder, 'mkdir', () => mkdir(folder, { mode: FOLDER_MODE }));
});

/**
 * Deletes a folder tree without ever following a link inside it, even one swapped in while it runs:
 * `/bin/rm -rf`, whose traversal (fts) checks every folder it enters. Falls back to Node's
 * recursive removal where there is no `/bin/rm`.
 *
 * @param folder - The absolute path.
 */
export const removeTree = (folder: string): Effect.Effect<void, PlatformError> =>
  attempt(folder, 'rm', async () => {
    if (process.platform === 'win32') {
      await rm(folder, { recursive: true, force: true });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      execFile('/bin/rm', ['-rf', '--', folder], (error) => {
        if (error === null) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
  });

/**
 * Retires every working copy of a deck left from earlier turns and deletes the retired ones: a new
 * turn always starts from the real deck.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
export const clearWorkingCopies = Effect.fn('clearWorkingCopies')(function* (
  workspaceRoot: string,
  deck: string,
): Effect.fn.Return<void, PlatformError> {
  yield* ensureAgentFolders(workspaceRoot, deck);
  const work = workFolder(workspaceRoot, deck);
  for (const name of yield* attempt(work, 'readdir', () => readdir(work))) {
    yield* retireFolder(workspaceRoot, deck, path.join(work, name));
  }

  const retired = retiredFolder(workspaceRoot, deck);
  for (const name of yield* attempt(retired, 'readdir', () => readdir(retired))) {
    yield* removeTree(path.join(retired, name));
  }
});

/**
 * Moves a working copy out of `work/` (the folder itself, or a link found in its place, never what
 * a link points to) and deletes it. A process a provider left behind keeps its folder open, but its
 * writes now land in a folder no one reads and that is about to go; its sandbox, which names the
 * old path, refuses them.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 * @param folder - The working copy's absolute path.
 */
const retireFolder = Effect.fn('retireFolder')(function* (
  workspaceRoot: string,
  deck: string,
  folder: string,
): Effect.fn.Return<void, PlatformError> {
  const retired = path.join(
    retiredFolder(workspaceRoot, deck),
    `${path.basename(folder)}.${randomBytes(4).toString('hex')}`,
  );
  const moved = yield* attempt(folder, 'rename', () => rename(folder, retired)).pipe(
    Effect.as(true),
    Effect.catch((error) =>
      error.reason._tag === 'NotFound' ? Effect.succeed(false) : Effect.fail(error),
    ),
  );
  if (moved) {
    yield* removeTree(retired);
  }
});

/**
 * Retires a turn's working copy: renamed out of `work/` first, then deleted. Never read again.
 *
 * @param staging - The working copy.
 */
export const retireStaging = (staging: Staging): Effect.Effect<void, PlatformError> =>
  retireFolder(staging.workspaceRoot, staging.deck, staging.absolute);

/**
 * Discards the working copy an in-flight record names, after a crash: only a folder directly in the
 * deck's `work/` with a name the framework gives, never synced.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 * @param relative - The working copy as the record names it, relative to the workspace root.
 */
export const discardStaging = Effect.fn('discardStaging')(function* (
  workspaceRoot: string,
  deck: string,
  relative: string,
): Effect.fn.Return<void, PlatformError> {
  const name = path.posix.basename(relative);
  const expected = `.deck/agent/${deck}/work/${name}`;
  if (relative !== expected || !isStagingName(name)) {
    return;
  }

  yield* ensureAgentFolders(workspaceRoot, deck);
  yield* retireFolder(workspaceRoot, deck, path.join(workFolder(workspaceRoot, deck), name));
});

/**
 * Creates a turn's working copy: a new folder `.deck/agent/<deck>/work/<turn>-<random>/` (never
 * reused) holding a copy of the deck's content files only (plain files with an allowed extension in
 * `slides/`, `assets/` and `public/`; clones where the file system can, so large media costs
 * nothing), and the three content folders even when the deck has none. Fails when the content is
 * over the bounds.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 * @param deckReal - The deck folder's real path (checked by the caller).
 * @param turn - The turn number.
 * @param limits - The bounds.
 */
export const createStaging = Effect.fn('createStaging')(function* (
  workspaceRoot: string,
  deck: string,
  deckReal: string,
  turn: number,
  limits: StagingLimits = STAGING_LIMITS,
): Effect.fn.Return<Staging, PlatformError | string> {
  yield* clearWorkingCopies(workspaceRoot, deck);
  const name = `${turn}-${randomBytes(6).toString('hex')}`;
  const absolute = path.join(workFolder(workspaceRoot, deck), name);
  yield* attempt(absolute, 'mkdir', () => mkdir(absolute, { mode: FOLDER_MODE }));
  const info = yield* lstatOptional(absolute);
  if (info === undefined || !info.isDirectory()) {
    return yield* Effect.fail(`${absolute} could not be created as a folder`);
  }

  const staging: Staging = {
    workspaceRoot,
    deck,
    absolute,
    relative: path.relative(workspaceRoot, absolute).split(path.sep).join('/'),
    identity: { dev: info.dev, ino: info.ino },
    folders: new Map(),
    deckReal,
    limits,
    cache: new Map(),
    current: new Map(),
  };
  let files = 0;
  let bytes = 0;
  /**
   * Copies one real content folder (or a folder inside it) into the working copy.
   *
   * @param relative - The folder relative to the deck folder.
   * @param depth - How deep below its content folder it is.
   */
  const copyFolder = (
    relative: string,
    depth: number,
  ): Effect.Effect<void, PlatformError | string> =>
    Effect.gen(function* () {
      const target = path.join(absolute, relative);
      yield* attempt(target, 'mkdir', () => mkdir(target, { mode: FOLDER_MODE }));
      const source = path.join(deckReal, relative);
      const found = yield* lstatOptional(source);
      if (found === undefined || !found.isDirectory() || depth > limits.maxDepth) {
        return;
      }

      const names = yield* attempt(source, 'readdir', () => readdir(source));
      for (const entry of names.toSorted()) {
        const child = `${relative}/${entry}`;
        const childInfo = yield* lstatOptional(path.join(deckReal, child));
        if (childInfo === undefined) {
          continue;
        }

        if (childInfo.isDirectory()) {
          if (!entry.startsWith('.')) {
            yield* copyFolder(child, depth + 1);
          }

          continue;
        }

        if (!isContentFile(child) || notRegular(childInfo, limits.maxFileBytes) !== undefined) {
          continue;
        }

        files += 1;
        bytes += Number(childInfo.size);
        if (files > limits.maxFiles || bytes > limits.maxTotalBytes) {
          return yield* Effect.fail(
            `the deck's content is over the bounds of a turn (${limits.maxFiles} files, ${formatBytes(limits.maxTotalBytes)})`,
          );
        }

        const copy = path.join(absolute, child);
        yield* attempt(copy, 'copyFile', () =>
          copyFile(
            path.join(deckReal, child),
            copy,
            constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL,
          ),
        );
        yield* attempt(copy, 'chmod', () => chmod(copy, NEW_FILE_MODE));
        const read = yield* hashRegular(copy, limits.maxFileBytes);
        if (typeof read === 'string') {
          return yield* Effect.fail(`${child} could not be copied (${read})`);
        }

        staging.cache.set(child, { signature: read.signature, hash: read.hash });
        staging.current.set(child, read.hash);
      }
    });
  for (const folder of CONTENT_FOLDER_NAMES) {
    yield* copyFolder(folder, 0);
    const made = yield* lstatOptional(path.join(absolute, folder));
    if (made !== undefined) {
      staging.folders.set(folder, { dev: made.dev, ino: made.ino });
    }
  }

  return staging;
});

/**
 * Walks a working copy without following any link, bounded by the file count and depth: every path
 * in the content folders with what it is, and the names beside them.
 *
 * @param staging - The working copy.
 */
const walkStaging = Effect.fn('walkStaging')(function* (
  staging: Staging,
): Effect.fn.Return<WalkResult, PlatformError> {
  const { limits } = staging;
  const entries: WalkEntry[] = [];
  let overflow: string | undefined;
  const top = yield* attempt(staging.absolute, 'readdir', () => readdir(staging.absolute));
  const strays = top.filter((name) => !CONTENT_FOLDER_NAMES.includes(name)).toSorted();
  /**
   * Records a path and, for a folder, everything in it.
   *
   * @param relative - The path relative to the deck folder.
   * @param depth - How deep below its content folder it is.
   */
  const visit = (relative: string, depth: number): Effect.Effect<void, PlatformError> =>
    Effect.gen(function* () {
      if (overflow !== undefined) {
        return;
      }

      const info = yield* lstatOptional(path.join(staging.absolute, relative));
      if (info === undefined) {
        return;
      }

      if (entries.length >= limits.maxFiles) {
        overflow = `the working copy holds more than ${limits.maxFiles} files`;
        return;
      }

      const kind = kindOf(info, limits.maxFileBytes);
      entries.push({ path: relative, kind, info });
      if (kind !== 'folder' || depth >= limits.maxDepth) {
        return;
      }

      const names = yield* attempt(relative, 'readdir', () =>
        readdir(path.join(staging.absolute, relative)),
      ).pipe(Effect.orElseSucceed((): string[] => []));
      for (const name of names.toSorted()) {
        yield* visit(`${relative}/${name}`, depth + 1);
      }
    });
  for (const folder of CONTENT_FOLDER_NAMES) {
    yield* visit(folder, 0);
  }

  return { entries, strays, overflow };
});

/**
 * One file a sync would write, and the files it would delete.
 */
export type SyncPlan = {
  /**
   * Content files of the working copy to compare with the real deck, by path.
   */
  readonly candidates: readonly string[];

  /**
   * Real content files absent from the working copy, to delete.
   */
  readonly deletions: readonly string[];

  /**
   * What is left alone, in path order.
   */
  readonly ignored: readonly IgnoredEntry[];
};

/**
 * What a walk found at one path, for {@link planSync}.
 */
export type PlanEntry = {
  /**
   * The path relative to the deck folder.
   */
  readonly path: string;

  /**
   * What it is: a plain file, a folder, or why it is neither.
   */
  readonly kind: EntryKind;
};

/**
 * Decides what a sync does from what a walk found, without touching a file. A content file (plain,
 * one link, within the size bound, an allowed extension, a safe name) is a candidate, unless its
 * name differs only in letter case or Unicode form from another content file the deck knows or the
 * working copy holds (a case-insensitive file system would make the two one file). A real content
 * file is deleted only when its name is gone from a folder the walk read as a real folder (or that
 * folder is gone too) and nothing with the same folded name is there: a folder replaced by a link
 * or anything else protects everything under it. Everything else is ignored, with the reason.
 *
 * @param entries - What the walk found.
 * @param known - The real content files the framework knows (present ones), by path.
 * @param limits - The bounds.
 */
export function planSync(
  entries: readonly PlanEntry[],
  known: ReadonlySet<string>,
  limits: StagingLimits,
): SyncPlan {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const ignored: IgnoredEntry[] = [];
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.kind === 'folder') {
      continue;
    }

    if (entry.kind !== 'file') {
      ignored.push({ path: entry.path, what: describeKind(entry.kind, limits) });
    } else if (isContentFile(entry.path)) {
      files.push(entry.path);
    } else {
      ignored.push({ path: entry.path, what: 'not content' });
    }
  }

  const folds = new Map<string, string[]>();
  for (const file of [...files, ...known]) {
    const key = foldPath(file);
    const list = folds.get(key) ?? [];
    if (!list.includes(file)) {
      list.push(file);
    }

    folds.set(key, list);
  }

  const candidates: string[] = [];
  for (const file of files) {
    const others = (folds.get(foldPath(file)) ?? []).filter((other) => other !== file);
    if (others.length > 0 && !known.has(file)) {
      ignored.push({ path: file, what: `differs only in letter case from ${others[0] ?? ''}` });
    } else {
      candidates.push(file);
    }
  }

  const present = new Set(entries.map((entry) => foldPath(entry.path)));
  const deletions = [...known].filter(
    (file) => !present.has(foldPath(file)) && folderGone(file, byPath),
  );
  return {
    candidates,
    deletions: deletions.toSorted(),
    ignored: ignored.toSorted((left, right) => (left.path < right.path ? -1 : 1)),
  };
}

/**
 * Whether a file is gone from a working copy for sure: walking down its folders, each is a real
 * folder the walk read until one is missing (or the file's own name is), never a link or anything
 * else in a folder's place.
 *
 * @param file - The path relative to the deck folder.
 * @param byPath - What the walk found by path.
 */
function folderGone(file: string, byPath: ReadonlyMap<string, PlanEntry>): boolean {
  const segments = file.split('/');
  for (let index = 1; index < segments.length; index += 1) {
    const folder = segments.slice(0, index).join('/');
    const entry = byPath.get(folder);
    if (entry === undefined) {
      return index > 1;
    }

    if (entry.kind !== 'folder') {
      return false;
    }
  }

  return true;
}

/**
 * The state of a real content file now: its hash, null when absent, or `other` when it is not one
 * plain file.
 *
 * @param file - The absolute path.
 * @param limits - The bounds.
 */
const realState = Effect.fn('realState')(function* (
  file: string,
  limits: StagingLimits,
): Effect.fn.Return<
  { readonly hash: string; readonly mode: number } | null | 'other',
  PlatformError
> {
  const read = yield* hashRegular(file, limits.maxFileBytes);
  if (read === 'missing') {
    return null;
  }

  return typeof read === 'string' ? 'other' : { hash: read.hash, mode: read.mode };
});

/**
 * Makes sure every folder between a content folder of the real deck and a file is a real folder
 * inside the deck (creating the missing ones) and returns the real path of the file's folder.
 *
 * @param staging - The working copy (for the deck's real path).
 * @param file - The path relative to the deck folder.
 */
const realFolderOf = Effect.fn('realFolderOf')(function* (
  staging: Staging,
  file: string,
): Effect.fn.Return<string, PlatformError | string> {
  const segments = file.split('/').slice(0, -1);
  let current = staging.deckReal;
  for (const segment of segments) {
    current = path.join(current, segment);
    const info = yield* lstatOptional(current);
    if (info === undefined) {
      yield* attempt(current, 'mkdir', () => mkdir(current));
    } else if (!info.isDirectory()) {
      return yield* Effect.fail(`decks/${staging.deck}/${segments.join('/')} is not a folder`);
    }
  }

  const real = yield* attempt(current, 'realpath', () => realpath(current));
  if (real !== current) {
    return yield* Effect.fail(`decks/${staging.deck}/${segments.join('/')} resolves elsewhere`);
  }

  return real;
});

/**
 * Brings the working copy's content into the real deck: the single place staged content enters it.
 * The working copy's folder must still be the one created for the turn. Every path is read with
 * `lstat`; only plain content files are taken (see {@link planSync}), each opened without following
 * a link or blocking and checked on its descriptor to be the file the walk saw; its bytes go to a
 * new temporary file next to the target in the real deck, then renamed into place. A real file
 * whose content is not what the framework last saw (edited by hand during the turn) is left as it
 * is and reported as a conflict. Files gone from the working copy are deleted from the deck.
 * Nothing outside the deck's content folders is ever written or deleted.
 *
 * @param staging - The working copy.
 * @param hooks - Keeps images and records each change before it is made.
 */
export const syncStaging = Effect.fn('syncStaging')(function* (
  staging: Staging,
  hooks: SyncHooks,
): Effect.fn.Return<SyncReport, PlatformError> {
  const { limits } = staging;
  /**
   * A report: what was applied, ignored and in conflict, and why nothing was applied, if so.
   *
   * @param failure - Why nothing was applied.
   * @param rest - The rest of the report.
   */
  const report = (failure: string | undefined, rest: Partial<SyncReport> = {}): SyncReport => ({
    applied: rest.applied ?? [],
    ignored: rest.ignored ?? [],
    conflicts: rest.conflicts ?? [],
    failure,
  });
  const top = yield* lstatOptional(staging.absolute);
  if (
    top === undefined ||
    !top.isDirectory() ||
    top.dev !== staging.identity.dev ||
    top.ino !== staging.identity.ino
  ) {
    return report(
      `the working copy ${staging.relative} was replaced, so nothing in it was applied`,
    );
  }

  const walk = yield* walkStaging(staging);
  if (walk.overflow !== undefined) {
    return report(`${walk.overflow}, so nothing in it was applied`);
  }

  const known = new Set(
    [...staging.current].flatMap(([file, hash]) => (hash === null ? [] : [file])),
  );
  const plan = planSync(walk.entries, known, limits);
  const total = walk.entries.reduce(
    (sum, entry) => sum + (entry.kind === 'file' ? Number(entry.info.size) : 0),
    0,
  );
  if (total > limits.maxTotalBytes) {
    return report(
      `the working copy holds more than ${formatBytes(limits.maxTotalBytes)}, so nothing in it was applied`,
    );
  }

  const ignored: IgnoredEntry[] = [
    ...walk.strays.map((name) => ({ path: name, what: 'not content' })),
    ...plan.ignored,
  ];
  const applied: AppliedChange[] = [];
  const conflicts: string[] = [];
  const byPath = new Map(walk.entries.map((entry) => [entry.path, entry]));
  for (const file of plan.deletions) {
    const target = path.join(staging.deckReal, file);
    const expected = staging.current.get(file) ?? null;
    const now = yield* realState(target, limits);
    if (now === null) {
      staging.current.set(file, null);
      continue;
    }

    if (now === 'other' || now.hash !== expected) {
      conflicts.push(file);
      continue;
    }

    yield* hooks.keepImage(target, now.hash);
    const change: AppliedChange = { path: file, before: now, after: null };
    yield* hooks.writeAhead(change);
    yield* attempt(target, 'unlink', () => unlink(target));
    staging.current.set(file, null);
    staging.cache.delete(file);
    applied.push(change);
  }

  for (const file of plan.candidates) {
    const entry = byPath.get(file);
    if (entry === undefined) {
      continue;
    }

    const source = path.join(staging.absolute, file);
    const signature = signatureOf(entry.info);
    const cached = staging.cache.get(file);
    let hash =
      cached !== undefined && sameSignature(cached.signature, signature) ? cached.hash : undefined;
    if (hash === undefined) {
      const read = yield* hashRegular(source, limits.maxFileBytes);
      if (typeof read === 'string') {
        ignored.push({ path: file, what: describeKind(read, limits) });
        continue;
      }

      hash = read.hash;
      staging.cache.set(file, { signature: read.signature, hash });
    }

    const expected = staging.current.get(file) ?? null;
    if (hash === expected) {
      continue;
    }

    const target = path.join(staging.deckReal, file);
    const now = yield* realState(target, limits);
    if (now === 'other' || (now?.hash ?? null) !== expected) {
      conflicts.push(file);
      continue;
    }

    const folder = yield* realFolderOf(staging, file).pipe(
      Effect.catch((problem) =>
        typeof problem === 'string' ? Effect.succeed(undefined) : Effect.fail(problem),
      ),
    );
    if (folder === undefined) {
      ignored.push({ path: file, what: 'its folder in the deck is not a plain folder' });
      continue;
    }

    if (now !== null) {
      yield* hooks.keepImage(target, now.hash);
    }

    const written = yield* Effect.scoped(
      copyToTemporary(
        source,
        entry.info,
        folder,
        path.posix.basename(file),
        now?.mode ?? NEW_FILE_MODE,
        limits.maxFileBytes,
      ),
    );
    if (typeof written === 'string') {
      ignored.push({ path: file, what: describeKind(written, limits) });
      continue;
    }

    const mode = (now?.mode ?? NEW_FILE_MODE) & 0o666;
    yield* hooks.keepImage(written.temporary, written.read.hash);
    const change: AppliedChange = {
      path: file,
      before: now,
      after: { hash: written.read.hash, mode },
    };
    yield* hooks.writeAhead(change);
    yield* renameChecked(written.temporary, target, folder);
    staging.current.set(file, written.read.hash);
    staging.cache.set(file, { signature: written.read.signature, hash: written.read.hash });
    applied.push(change);
  }

  return report(undefined, {
    applied,
    ignored: ignored.toSorted((left, right) => (left.path < right.path ? -1 : 1)),
    conflicts: [...new Set(conflicts)].toSorted(),
  });
});

/**
 * Mirrors a change the framework itself made to a real content file during a turn (a slide the deck
 * tools added or removed) into the working copy, so the agent sees it and the next sync starts from
 * it. Only a file directly in a content folder is mirrored, and only while the working copy and
 * that content folder are still the folders created for the turn; the copy is written to a new file
 * (`O_EXCL | O_NOFOLLOW`) and renamed into place.
 *
 * @param staging - The working copy.
 * @param file - The path relative to the deck folder.
 * @returns The real file's state now: its hash and mode, or null when it is gone.
 */
export const mirrorIntoStaging = Effect.fn('mirrorIntoStaging')(function* (
  staging: Staging,
  file: string,
): Effect.fn.Return<{ readonly hash: string; readonly mode: number } | null, PlatformError> {
  const { limits } = staging;
  const target = path.join(staging.deckReal, file);
  const now = yield* realState(target, limits);
  const state = now === 'other' ? null : now;
  staging.current.set(file, state?.hash ?? null);
  staging.cache.delete(file);
  const [folder, name, ...rest] = file.split('/');
  const identity = staging.folders.get(folder ?? '');
  const container = path.join(staging.absolute, folder ?? '');
  const found = yield* lstatOptional(container);
  if (
    name === undefined ||
    rest.length > 0 ||
    identity === undefined ||
    found === undefined ||
    !found.isDirectory() ||
    found.dev !== identity.dev ||
    found.ino !== identity.ino ||
    !(yield* stagingIntact(staging))
  ) {
    return state;
  }

  const copy = path.join(container, name);
  const existing = yield* lstatOptional(copy);
  if (existing !== undefined && !existing.isDirectory()) {
    yield* attempt(copy, 'unlink', () => unlink(copy)).pipe(Effect.ignore);
  }

  if (state === null) {
    return state;
  }

  const written = yield* Effect.scoped(
    copyToTemporary(target, undefined, container, name, NEW_FILE_MODE, limits.maxFileBytes),
  ).pipe(Effect.orElseSucceed(() => 'missing' as const));
  if (typeof written !== 'string') {
    yield* renameChecked(
      written.temporary,
      copy,
      yield* attempt(container, 'realpath', () => realpath(container)),
    );
    const after = yield* lstatOptional(copy);
    if (after !== undefined) {
      staging.cache.set(file, { signature: signatureOf(after), hash: written.read.hash });
    }
  }

  return state;
});

/**
 * Whether a working copy's folder is still the one created for the turn.
 *
 * @param staging - The working copy.
 */
const stagingIntact = (staging: Staging): Effect.Effect<boolean> =>
  lstatOptional(staging.absolute).pipe(
    Effect.map(
      (info) =>
        info !== undefined &&
        info.isDirectory() &&
        info.dev === staging.identity.dev &&
        info.ino === staging.identity.ino,
    ),
    Effect.orElseSucceed(() => false),
  );
