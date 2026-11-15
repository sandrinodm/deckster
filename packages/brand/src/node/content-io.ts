import type { BigIntStats } from 'node:fs';

import { Effect, Option, type Scope } from 'effect';
import { systemError, type PlatformError } from 'effect/PlatformError';
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath, rename, unlink, type FileHandle } from 'node:fs/promises';
import path from 'node:path';

/**
 * How much of a file is read at a time.
 */
const CHUNK_BYTES = 256 * 1024;

/**
 * The flags every read of a file a provider could have touched opens with: never through a symbolic
 * link at the last component, and never blocking (a FIFO opens at once and is then refused by its
 * `fstat`).
 */
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

/**
 * The flags of a temporary file the framework writes: created new (never an existing file or link).
 */
const CREATE_FLAGS =
  constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;

/**
 * The ending of the temporary files the sync writes next to their targets.
 */
export const SYNC_TEMPORARY_SUFFIX = '.deck-sync';

/**
 * The permission bits a content file the framework writes may keep: read and write, never execute.
 */
const CONTENT_MODE_BITS = 0o666;

/**
 * Who a file is, and the state of its content: equal signatures mean equal bytes, because no write,
 * `utimes` or `chmod` leaves the change time as it was.
 */
export type StatSignature = {
  /**
   * The device.
   */
  readonly dev: bigint;

  /**
   * The inode.
   */
  readonly ino: bigint;

  /**
   * The size in bytes.
   */
  readonly size: bigint;

  /**
   * The modification time in nanoseconds.
   */
  readonly mtimeNs: bigint;

  /**
   * The change time in nanoseconds, which only the kernel sets.
   */
  readonly ctimeNs: bigint;
};

/**
 * What a read through a descriptor found.
 */
export type RegularRead = {
  /**
   * The SHA-256 of the bytes, hex.
   */
  readonly hash: string;

  /**
   * The size in bytes.
   */
  readonly size: number;

  /**
   * The permission bits.
   */
  readonly mode: number;

  /**
   * The signature of the descriptor's file.
   */
  readonly signature: StatSignature;
};

/**
 * Why a path could not be read as one plain file.
 */
export type NotRegular =
  | 'missing'
  | 'link'
  | 'folder'
  | 'fifo'
  | 'socket'
  | 'device'
  | 'hard-linked'
  | 'too-large'
  | 'swapped';

/**
 * A platform error for a descriptor operation.
 *
 * @param file - The path.
 * @param method - The operation.
 * @param cause - What was thrown.
 */
export function ioError(file: string, method: string, cause: unknown): PlatformError {
  const code = (cause as { readonly code?: string } | undefined)?.code;
  const tags: Readonly<Record<string, 'NotFound' | 'PermissionDenied'>> = {
    ENOENT: 'NotFound',
    EACCES: 'PermissionDenied',
  };
  return systemError({
    _tag: (code === undefined ? undefined : tags[code]) ?? 'Unknown',
    module: 'FileSystem',
    method,
    description: cause instanceof Error ? cause.message : String(cause),
    pathOrDescriptor: file,
  });
}

/**
 * The signature of a stat result.
 *
 * @param info - The stat result, with big integers.
 */
export function signatureOf(info: BigIntStats): StatSignature {
  return {
    dev: info.dev,
    ino: info.ino,
    size: info.size,
    mtimeNs: info.mtimeNs,
    ctimeNs: info.ctimeNs,
  };
}

/**
 * Whether two signatures name the same file in the same state.
 *
 * @param left - One signature.
 * @param right - The other.
 */
export function sameSignature(left: StatSignature, right: StatSignature): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

/**
 * Why a stat result is not one plain file, or undefined when it is.
 *
 * @param info - The stat result (of a descriptor or an `lstat`).
 * @param maxBytes - The largest size accepted.
 */
export function notRegular(info: BigIntStats, maxBytes: number): NotRegular | undefined {
  if (info.isSymbolicLink()) {
    return 'link';
  }

  if (info.isDirectory()) {
    return 'folder';
  }

  if (info.isFIFO()) {
    return 'fifo';
  }

  if (info.isSocket()) {
    return 'socket';
  }

  if (info.isBlockDevice() || info.isCharacterDevice()) {
    return 'device';
  }

  if (!info.isFile()) {
    return 'device';
  }

  if (info.nlink !== 1n) {
    return 'hard-linked';
  }

  return info.size > BigInt(maxBytes) ? 'too-large' : undefined;
}

/**
 * Opens a path for reading without following a link at it and without blocking, in the caller's
 * scope. A missing path is `Option.none()`; a link fails the open (`ELOOP`) and comes back as
 * `link`.
 *
 * @param file - The absolute path.
 */
const openForRead = (
  file: string,
): Effect.Effect<Option.Option<FileHandle> | 'link', PlatformError, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: async (): Promise<Option.Option<FileHandle> | 'link'> => {
        try {
          return Option.some(await open(file, READ_FLAGS));
        } catch (error) {
          const code = (error as { readonly code?: string }).code;
          if (code === 'ENOENT') {
            return Option.none();
          }

          if (code === 'ELOOP' || code === 'EMLINK' || code === 'EFTYPE') {
            return 'link';
          }

          throw error;
        }
      },
      catch: (cause) => ioError(file, 'open', cause),
    }),
    (opened) =>
      opened !== 'link' && Option.isSome(opened)
        ? Effect.promise(() => opened.value.close().catch(() => undefined))
        : Effect.void,
  );

/**
 * Streams a descriptor's bytes, hashing them and handing each chunk on, and fails when the file
 * holds more bytes than its size said (it grew while it was read).
 *
 * @param handle - The open file.
 * @param file - Its path, for errors.
 * @param size - The size its `fstat` gave.
 * @param onChunk - Receives each chunk.
 */
const streamHandle = (
  handle: FileHandle,
  file: string,
  size: number,
  onChunk: (chunk: Uint8Array) => Promise<void>,
): Effect.Effect<string, PlatformError> =>
  Effect.tryPromise({
    try: async () => {
      const hash = createHash('sha256');
      const buffer = Buffer.alloc(CHUNK_BYTES);
      let total = 0;
      for (;;) {
        const { bytesRead } = await handle.read(buffer, 0, CHUNK_BYTES, null);
        if (bytesRead === 0) {
          break;
        }

        total += bytesRead;
        if (total > size) {
          throw new Error('it grew while it was read');
        }

        const chunk = buffer.subarray(0, bytesRead);
        hash.update(chunk);
        await onChunk(chunk);
      }

      return hash.digest('hex');
    },
    catch: (cause) => ioError(file, 'read', cause),
  });

/**
 * Reads one plain file through a descriptor opened without following a link and without blocking,
 * checking on that descriptor that it is a regular file with one link, at most `maxBytes` long, and
 * (when `expected` is given) the same file a walk saw, so a swap between the walk and the open is
 * refused instead of read. Hands every chunk to `onChunk` when given.
 *
 * @param file - The absolute path.
 * @param maxBytes - The largest size accepted.
 * @param expected - The device and inode the file must have.
 * @param onChunk - Receives each chunk, in order.
 * @returns What was read, or why the path is not one plain file.
 */
export const readRegular = Effect.fn('readRegular')(function* (
  file: string,
  maxBytes: number,
  expected?: Pick<StatSignature, 'dev' | 'ino'>,
  onChunk?: (chunk: Uint8Array) => Promise<void>,
): Effect.fn.Return<RegularRead | NotRegular, PlatformError, Scope.Scope> {
  const opened = yield* openForRead(file);
  if (opened === 'link') {
    return 'link';
  }

  if (Option.isNone(opened)) {
    return 'missing';
  }

  const handle = opened.value;
  const info = yield* Effect.tryPromise({
    try: () => handle.stat({ bigint: true }),
    catch: (cause) => ioError(file, 'fstat', cause),
  });
  const problem = notRegular(info, maxBytes);
  if (problem !== undefined) {
    return problem;
  }

  if (expected !== undefined && (info.dev !== expected.dev || info.ino !== expected.ino)) {
    return 'swapped';
  }

  const hash = yield* streamHandle(
    handle,
    file,
    Number(info.size),
    onChunk ?? (() => Promise.resolve()),
  );
  return {
    hash,
    size: Number(info.size),
    mode: Number(info.mode) & 0o7777,
    signature: signatureOf(info),
  };
});

/**
 * The SHA-256 of a plain file read through a descriptor (no link followed, no blocking), or why the
 * path is not one plain file.
 *
 * @param file - The absolute path.
 * @param maxBytes - The largest size accepted.
 */
export const hashRegular = (
  file: string,
  maxBytes: number,
): Effect.Effect<RegularRead | NotRegular, PlatformError> =>
  readRegular(file, maxBytes).pipe(Effect.scoped);

/**
 * Copies one plain file of a working copy into a new temporary file next to its target in the real
 * deck, through descriptors only: the source is opened without following a link or blocking and
 * checked on its descriptor (regular, one link, at most `maxBytes`, the inode the walk saw); the
 * temporary file is created new (`O_EXCL | O_NOFOLLOW`), never executable, and flushed.
 *
 * @param source - The working copy's file.
 * @param expected - The device and inode the walk saw, or undefined to take the file the path
 *   names.
 * @param folder - The folder the target is in.
 * @param name - The target's name.
 * @param mode - The temporary file's mode (execute bits are dropped).
 * @param maxBytes - The largest size accepted.
 * @returns The temporary file and the copied bytes' hash, or why the source was refused.
 */
export const copyToTemporary = Effect.fn('copyToTemporary')(function* (
  source: string,
  expected: Pick<StatSignature, 'dev' | 'ino'> | undefined,
  folder: string,
  name: string,
  mode: number,
  maxBytes: number,
): Effect.fn.Return<
  { readonly temporary: string; readonly read: RegularRead } | NotRegular,
  PlatformError,
  Scope.Scope
> {
  const temporary = path.join(
    folder,
    `.${name}.${randomBytes(6).toString('hex')}${SYNC_TEMPORARY_SUFFIX}`,
  );
  const target = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => open(temporary, CREATE_FLAGS, mode & CONTENT_MODE_BITS),
      catch: (cause) => ioError(temporary, 'open', cause),
    }),
    (handle) => Effect.promise(() => handle.close().catch(() => undefined)),
  );
  const read = yield* readRegular(source, maxBytes, expected, async (chunk) => {
    await target.write(chunk);
  }).pipe(Effect.tapError(() => removeQuietly(temporary)));
  if (typeof read === 'string') {
    yield* removeQuietly(temporary);
    return read;
  }

  yield* Effect.tryPromise({
    try: async () => {
      await target.chmod(mode & CONTENT_MODE_BITS);
      await target.sync();
    },
    catch: (cause) => ioError(temporary, 'fsync', cause),
  }).pipe(Effect.tapError(() => removeQuietly(temporary)));
  return { temporary, read };
});

/**
 * Removes a file the framework created, ignoring every failure.
 *
 * @param file - The absolute path.
 */
export const removeQuietly = (file: string): Effect.Effect<void> =>
  Effect.promise(() => unlink(file).catch(() => undefined));

/**
 * Renames a temporary file over its target after checking, right before, that the target's folder
 * still resolves to where it must be (`expectedFolder`, a real path): a folder swapped for a link
 * since is refused. Node has no `renameat`, so a by-path window remains between the check and the
 * rename; the framework only renames inside folders no provider can write.
 *
 * @param temporary - The temporary file.
 * @param target - The target path.
 * @param expectedFolder - The real path the target's folder must resolve to.
 */
export const renameChecked = Effect.fn('renameChecked')(function* (
  temporary: string,
  target: string,
  expectedFolder: string,
): Effect.fn.Return<void, PlatformError> {
  const folder = yield* Effect.tryPromise({
    try: () => realpath(path.dirname(target)),
    catch: (cause) => ioError(target, 'realpath', cause),
  });
  if (folder !== expectedFolder) {
    yield* removeQuietly(temporary);
    return yield* Effect.fail(
      ioError(
        target,
        'rename',
        new Error(`its folder resolves to ${folder}, not ${expectedFolder}`),
      ),
    );
  }

  yield* Effect.tryPromise({
    try: () => rename(temporary, target),
    catch: (cause) => ioError(target, 'rename', cause),
  }).pipe(Effect.tapError(() => removeQuietly(temporary)));
});
