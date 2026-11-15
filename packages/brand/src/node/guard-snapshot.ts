import { Effect, FileSystem, Option, Schema, type Scope } from 'effect';
import { systemError, type PlatformError } from 'effect/PlatformError';
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Folders at the top of a guarded root that are never read: dependencies, build output and the
 * framework's own state.
 */
const SKIPPED_TOP_FOLDERS = new Set(['node_modules', 'dist', '.deck']);

/**
 * Regular files never read anywhere: macOS folder metadata, which Finder writes at any time.
 */
const SKIPPED_FILES = new Set(['.DS_Store']);

/**
 * How much of a file is read at a time while hashing.
 */
const READ_CHUNK_BYTES = 256 * 1024;

/**
 * Files up to this size are kept in memory while hashed, so their copy in the blob store is the
 * bytes that were hashed; larger ones are cloned and the clone is hashed.
 */
const IN_MEMORY_LIMIT_BYTES = 8 * 1024 * 1024;

/**
 * The permission bits of a mode: what the guard compares and restores.
 */
const PERMISSION_BITS = 0o7777;

/**
 * The ending of a file the guard stages next to its target before renaming it into place.
 */
export const RESTORE_SUFFIX = '.deck-restore';

/**
 * The prefix of a symbolic link's hash, so a link never has the hash of a file.
 */
const LINK_HASH_PREFIX = 'link:';

/**
 * What a path is, never following a symbolic link at it.
 */
export type GuardKind = 'file' | 'directory' | 'symlink' | 'other';

/**
 * One file, folder or link of a guarded root, as a snapshot records it.
 */
export const GuardEntry = Schema.Struct({
  /**
   * The path relative to the workspace root, with forward slashes, as the file system names it.
   */
  path: Schema.String,

  /**
   * What it is.
   */
  kind: Schema.Literals(['file', 'directory', 'symlink', 'other']),

  /**
   * The permission bits.
   */
  mode: Schema.Number,

  /**
   * A file's SHA-256 (hex), a link's `link:` hash of its target, or null for anything else.
   */
  hash: Schema.NullOr(Schema.String),

  /**
   * A symbolic link's target as written in it.
   */
  link: Schema.optionalKey(Schema.String),

  /**
   * A file's number of hard links.
   */
  links: Schema.optionalKey(Schema.Number),

  /**
   * A file's size in bytes.
   */
  size: Schema.optionalKey(Schema.Number),

  /**
   * A file's modification time in epoch milliseconds.
   */
  mtimeMs: Schema.optionalKey(Schema.Number),
});

/**
 * One file, folder or link of a guarded root.
 */
export type GuardEntry = typeof GuardEntry.Type;

/**
 * Something a walk could not read, which makes a comparison unreliable.
 */
export type WalkFailure = {
  /**
   * The path relative to the workspace root.
   */
  readonly path: string;

  /**
   * What went wrong.
   */
  readonly message: string;
};

/**
 * What a walk of the guarded roots found.
 */
export type WalkResult = {
  /**
   * Every entry, in path order.
   */
  readonly entries: readonly GuardEntry[];

  /**
   * What could not be read.
   */
  readonly failures: readonly WalkFailure[];
};

/**
 * How a walk reads the roots.
 */
export type WalkOptions = {
  /**
   * The absolute workspace root.
   */
  readonly workspaceRoot: string;

  /**
   * The roots, relative to the workspace root.
   */
  readonly roots: readonly string[];

  /**
   * The absolute blob store folder.
   */
  readonly blobsDir: string;

  /**
   * Whether a file's content goes into the blob store (the whole snapshot before a turn; only the
   * content files after it).
   *
   * @param relative - The path relative to the workspace root.
   */
  readonly keep: (relative: string) => boolean;

  /**
   * Whether a regular file is left out of the walk.
   *
   * @param relative - The path relative to the workspace root.
   */
  readonly skipFile?: (relative: string) => boolean;

  /**
   * The most entries the walk records; past it, the walk stops with a failure.
   */
  readonly maxEntries?: number;
};

/**
 * The SHA-256 of a symbolic link's target, marked as a link.
 *
 * @param target - The link's target.
 */
export function linkHash(target: string): string {
  return `${LINK_HASH_PREFIX}${createHash('sha256').update(target).digest('hex')}`;
}

/**
 * Whether two absolute paths are the same or the first is inside the second.
 *
 * @param child - The path.
 * @param parent - The folder.
 */
export function isWithin(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

/**
 * Walks the guarded roots without following any link, reading every regular file in full (never
 * trusting a size or a time) and putting the content of the files `keep` names into the blob store.
 * A failure to read is recorded, never skipped silently.
 *
 * @param options - The roots, the blob store and which files to keep.
 */
export const walkRoots = Effect.fn('walkRoots')(function* (
  options: WalkOptions,
): Effect.fn.Return<WalkResult, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const entries: GuardEntry[] = [];
  const failures: WalkFailure[] = [];
  yield* fs.makeDirectory(options.blobsDir, { recursive: true }).pipe(
    Effect.catch((error) => {
      failures.push({ path: options.blobsDir, message: error.message });
      return Effect.void;
    }),
  );

  /**
   * Records one path and, for a folder, everything under it.
   *
   * @param relative - The path relative to the workspace root.
   * @param top - Whether it is a root.
   * @param depth - How far below its root it is.
   */
  const visit = (
    relative: string,
    top: boolean,
    depth: number,
  ): Effect.Effect<void, never, FileSystem.FileSystem> =>
    Effect.gen(function* () {
      if (options.maxEntries !== undefined && entries.length >= options.maxEntries) {
        if (!failures.some((failure) => failure.path === '')) {
          failures.push({ path: '', message: `more than ${options.maxEntries} files` });
        }

        return;
      }

      const absolute = path.join(options.workspaceRoot, relative);
      const info = yield* fs.lstat(absolute).pipe(Effect.result);
      if (info._tag === 'Failure') {
        if (!top || info.failure.reason._tag !== 'NotFound') {
          failures.push({ path: relative, message: info.failure.message });
        }

        return;
      }

      const mode = info.success.mode & PERMISSION_BITS;
      switch (info.success.type) {
        case 'Directory': {
          entries.push({ path: relative, kind: 'directory', mode, hash: null });
          const names = yield* fs.readDirectory(absolute).pipe(Effect.result);
          if (names._tag === 'Failure') {
            failures.push({ path: relative, message: names.failure.message });
            return;
          }

          for (const name of names.success.toSorted()) {
            if (depth === 0 && SKIPPED_TOP_FOLDERS.has(name)) {
              continue;
            }

            yield* visit(`${relative}/${name}`, false, depth + 1);
          }

          return;
        }

        case 'SymbolicLink': {
          const target = yield* fs.readLink(absolute).pipe(Effect.result);
          if (target._tag === 'Failure') {
            failures.push({ path: relative, message: target.failure.message });
            return;
          }

          entries.push({
            path: relative,
            kind: 'symlink',
            mode,
            hash: linkHash(target.success),
            link: target.success,
          });
          return;
        }

        case 'File': {
          const name = path.posix.basename(relative);
          if (SKIPPED_FILES.has(name) || options.skipFile?.(relative) === true) {
            return;
          }

          const read = yield* readFileEntry(
            absolute,
            relative,
            options.keep(relative) ? options.blobsDir : undefined,
          ).pipe(Effect.result);
          if (read._tag === 'Failure') {
            failures.push({ path: relative, message: read.failure.message });
            return;
          }

          entries.push(read.success);
          return;
        }

        case 'BlockDevice':
        case 'CharacterDevice':
        case 'FIFO':
        case 'Socket':
        case 'Unknown': {
          entries.push({ path: relative, kind: 'other', mode, hash: null });
        }
      }
    });

  for (const root of options.roots) {
    yield* visit(root, true, 0);
  }

  return { entries: entries.toSorted((left, right) => compare(left.path, right.path)), failures };
});

/**
 * Reads one regular file through a handle opened without following a link, hashes all of it and,
 * when asked, puts the hashed bytes into the blob store. The mode, link count and size come from
 * the same handle, so they describe the bytes that were read.
 *
 * @param absolute - The file.
 * @param relative - Its path relative to the workspace root.
 * @param blobsDir - The blob store, or undefined to keep nothing.
 */
const readFileEntry = Effect.fn('readFileEntry')(function* (
  absolute: string,
  relative: string,
  blobsDir: string | undefined,
): Effect.fn.Return<GuardEntry, PlatformError, FileSystem.FileSystem | Scope.Scope> {
  const fs = yield* FileSystem.FileSystem;
  const handle = yield* fs.open(absolute, { noFollow: true });
  const info = yield* handle.stat;
  const size = Number(info.size);
  const hash = createHash('sha256');
  const keepInMemory = blobsDir !== undefined && size <= IN_MEMORY_LIMIT_BYTES;
  const chunks: Uint8Array[] = [];
  let chunk = yield* handle.readAlloc(Math.min(READ_CHUNK_BYTES, size + 1));
  while (Option.isSome(chunk)) {
    hash.update(chunk.value);
    if (keepInMemory) {
      chunks.push(chunk.value);
    }

    chunk = yield* handle.readAlloc(READ_CHUNK_BYTES);
  }

  const digest = hash.digest('hex');
  if (blobsDir !== undefined) {
    const blob = path.join(blobsDir, digest);
    const stored = yield* fs.exists(blob);
    if (!stored && keepInMemory) {
      yield* writeBlob(blob, Buffer.concat(chunks));
    } else if (!stored) {
      yield* cloneIntoStore(absolute, blobsDir, digest);
    }
  }

  return {
    path: relative,
    kind: 'file',
    mode: info.mode & PERMISSION_BITS,
    hash: digest,
    links: Number(Option.getOrElse(info.nlink, () => 1n)),
    size,
    mtimeMs: Option.match(info.mtime, { onNone: () => 0, onSome: (date) => date.getTime() }),
  };
}, Effect.scoped);

/**
 * Writes a blob through a temporary file renamed into place, so a blob is never half written.
 *
 * @param blob - The absolute blob path.
 * @param bytes - Its content.
 */
const writeBlob = Effect.fn('writeBlob')(function* (
  blob: string,
  bytes: Uint8Array,
): Effect.fn.Return<void, PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const temporary = `${blob}.${randomBytes(4).toString('hex')}.tmp`;
  yield* fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
  yield* fs.rename(temporary, blob);
});

/**
 * Copies a large file into the blob store (as a copy-on-write clone where the file system can), and
 * keeps the copy only when it has the hash the file was read with.
 *
 * @param absolute - The file.
 * @param blobsDir - The blob store.
 * @param digest - The hash the file was read with.
 */
export const cloneIntoStore = Effect.fn('cloneIntoStore')(function* (
  absolute: string,
  blobsDir: string,
  digest: string,
): Effect.fn.Return<void, PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const temporary = path.join(blobsDir, `${digest}.${randomBytes(4).toString('hex')}.tmp`);
  yield* copyExclusive(absolute, temporary);
  const copied = yield* hashFile(temporary);
  if (copied !== digest) {
    yield* fs.remove(temporary, { force: true });
    return yield* Effect.fail(changedWhileRead(absolute, 'it changed while it was being copied'));
  }

  yield* fs.rename(temporary, path.join(blobsDir, digest));
});

/**
 * Hashes a file in chunks, never following a link at its path.
 *
 * @param absolute - The file.
 */
export const hashFile = Effect.fn('hashFile')(function* (
  absolute: string,
): Effect.fn.Return<string, PlatformError, FileSystem.FileSystem | Scope.Scope> {
  const fs = yield* FileSystem.FileSystem;
  const handle = yield* fs.open(absolute, { noFollow: true });
  const hash = createHash('sha256');
  let chunk = yield* handle.readAlloc(READ_CHUNK_BYTES);
  while (Option.isSome(chunk)) {
    hash.update(chunk.value);
    chunk = yield* handle.readAlloc(READ_CHUNK_BYTES);
  }

  return hash.digest('hex');
}, Effect.scoped);

/**
 * Copies a file to a path that must not exist yet, as a clone where the file system supports it.
 *
 * @param from - The source.
 * @param to - The destination.
 */
export const copyExclusive = Effect.fn('copyExclusive')(function* (
  from: string,
  to: string,
): Effect.fn.Return<void, PlatformError> {
  yield* Effect.tryPromise({
    try: () => copyFile(from, to, constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL),
    catch: (cause) =>
      changedWhileRead(from, cause instanceof Error ? cause.message : String(cause)),
  });
});

/**
 * A platform error for a file that could not be copied or changed while it was read.
 *
 * @param file - The file.
 * @param description - What happened.
 */
function changedWhileRead(file: string, description: string): PlatformError {
  return systemError({
    _tag: 'Unknown',
    module: 'FileSystem',
    method: 'copyFile',
    description,
    pathOrDescriptor: file,
  });
}

/**
 * Makes sure every folder between a root and a path is a real folder (never a symbolic link),
 * creating the missing ones, so a restore can only write inside the root.
 *
 * @param rootAbsolute - The absolute root folder (already checked).
 * @param absolute - The path about to be written.
 */
export const ensureRealParents = Effect.fn('ensureRealParents')(function* (
  rootAbsolute: string,
  absolute: string,
): Effect.fn.Return<void, PlatformError | string, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const relative = path.relative(rootAbsolute, path.dirname(absolute));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return yield* Effect.fail(`${absolute} is outside ${rootAbsolute}`);
  }

  let current = rootAbsolute;
  for (const segment of relative === '' ? [] : relative.split(path.sep)) {
    current = path.join(current, segment);
    const info = yield* fs.lstat(current).pipe(Effect.option);
    if (Option.isNone(info)) {
      yield* fs.makeDirectory(current);
      continue;
    }

    if (info.value.type !== 'Directory') {
      return yield* Effect.fail(`${current} is not a folder`);
    }
  }
});

/**
 * Removes whatever is at a path, a whole folder included, never following a link at it.
 *
 * @param absolute - The path.
 */
export const removeEntry = Effect.fn('removeEntry')(function* (
  absolute: string,
): Effect.fn.Return<void, PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const info = yield* fs.lstat(absolute).pipe(Effect.option);
  if (Option.isNone(info)) {
    return;
  }

  if (info.value.type === 'Directory') {
    yield* makeTraversable(absolute);
    yield* fs.remove(absolute, { recursive: true, force: true });
  } else {
    yield* fs.remove(absolute, { force: true });
  }
});

/**
 * Gives the owner read, write and search permission on a folder and every folder under it, so a
 * folder a turn locked (`chmod 000`) can be removed or restored.
 *
 * @param absolute - The folder.
 */
const makeTraversable = (absolute: string): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const info = yield* fs.lstat(absolute).pipe(Effect.option);
    if (Option.isNone(info) || info.value.type !== 'Directory') {
      return;
    }

    yield* fs.chmod(absolute, (info.value.mode & PERMISSION_BITS) | 0o700).pipe(Effect.ignore);
    const names = yield* fs.readDirectory(absolute).pipe(Effect.orElseSucceed(() => []));
    for (const name of names) {
      yield* makeTraversable(path.join(absolute, name));
    }
  });

/**
 * Puts one recorded entry back at its path: a folder (created, or its mode set), a file (its blob
 * staged next to it, checked against the recorded hash, and renamed into place) or a symbolic link.
 * Whatever else is at the path is removed first.
 *
 * @param rootAbsolute - The absolute root the path is in.
 * @param absolute - The path.
 * @param entry - What it must be.
 * @param blobsDir - The blob store.
 */
export const restoreEntry = Effect.fn('restoreEntry')(function* (
  rootAbsolute: string,
  absolute: string,
  entry: GuardEntry,
  blobsDir: string,
): Effect.fn.Return<void, PlatformError | string, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  if (absolute !== rootAbsolute) {
    yield* ensureRealParents(rootAbsolute, absolute);
  }

  const current = yield* fs.lstat(absolute).pipe(Effect.option);
  switch (entry.kind) {
    case 'directory': {
      if (Option.isSome(current) && current.value.type !== 'Directory') {
        yield* fs.remove(absolute, { force: true });
      }

      if (Option.isNone(current) || current.value.type !== 'Directory') {
        yield* fs.makeDirectory(absolute);
      }

      yield* fs.chmod(absolute, entry.mode);
      return;
    }

    case 'file': {
      if (entry.hash === null) {
        return yield* Effect.fail(`${absolute} has no recorded content`);
      }

      if (Option.isSome(current) && current.value.type === 'Directory') {
        yield* removeEntry(absolute);
      }

      const staged = `${absolute}.${randomBytes(4).toString('hex')}${RESTORE_SUFFIX}`;
      yield* copyExclusive(path.join(blobsDir, entry.hash), staged);
      const copied = yield* hashFile(staged).pipe(
        Effect.tapError(() => fs.remove(staged, { force: true }).pipe(Effect.ignore)),
      );
      if (copied !== entry.hash) {
        yield* fs.remove(staged, { force: true });
        return yield* Effect.fail(`${absolute}: the kept copy does not have its recorded hash`);
      }

      yield* fs.chmod(staged, entry.mode);
      yield* fs
        .rename(staged, absolute)
        .pipe(Effect.tapError(() => fs.remove(staged, { force: true }).pipe(Effect.ignore)));
      return;
    }

    case 'symlink': {
      if (Option.isSome(current)) {
        yield* removeEntry(absolute);
      }

      yield* fs.symlink(entry.link ?? '', absolute);
      return;
    }

    case 'other': {
      // A socket or device the snapshot saw cannot be recreated; it is left alone.
      return;
    }
  }
});

/**
 * Orders two strings by code unit.
 *
 * @param left - One string.
 * @param right - The other.
 */
export function compare(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
