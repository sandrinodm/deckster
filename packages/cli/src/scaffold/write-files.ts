import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { fileSystemError, type FileSystemError } from '#cli-error.ts';

/**
 * The fix for a scaffold file that cannot be written.
 */
const WRITE_FIX =
  'Check that the folder is writable and is not a file, then run the command again.';

/**
 * What the CLI tried when a folder could not be made, for the message.
 */
const CREATE_FOLDER = 'create the folder';

/**
 * The fix for a file or folder that must be new and could not be created.
 */
const NEW_FILE_FIX =
  'Nothing there was changed. If something was created at that path meanwhile, look at it, move ' +
  'it away if it is not yours, and run the command again.';

/**
 * Writes text files, creating their folders, and fails with the path and the reason instead of a
 * stack trace.
 *
 * @param files - The content of each file, by absolute path.
 * @throws FileSystemError in the error channel for the first file or folder that cannot be written.
 */
export const writeFiles = Effect.fn('writeFiles')(function* (
  files: Readonly<Record<string, string>>,
): Effect.fn.Return<string[], FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const written: string[] = [];
  for (const [file, content] of Object.entries(files)) {
    yield* makeFolders(path.dirname(file));
    yield* fs
      .writeFileString(file, content)
      .pipe(Effect.mapError((error) => fileSystemError('write', file, error, WRITE_FIX)));
    written.push(file);
  }

  return written;
});

/**
 * Writes text files that must not exist yet, creating their folders. Each file is created
 * exclusively, so nothing already at its path is replaced or written through: not a file another
 * command wrote meanwhile, and not a link, dangling or not.
 *
 * @param files - The content of each file, by absolute path.
 * @returns The absolute paths written, in the order given.
 * @throws FileSystemError in the error channel for the first file that exists already or cannot be
 *   written, and for a folder that cannot be created.
 */
export const writeNewFiles = Effect.fn('writeNewFiles')(function* (
  files: Readonly<Record<string, string>>,
): Effect.fn.Return<string[], FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const written: string[] = [];
  for (const [file, content] of Object.entries(files)) {
    yield* makeFolders(path.dirname(file));
    yield* fs
      .writeFileString(file, content, { flag: 'wx' })
      .pipe(Effect.mapError((error) => fileSystemError('create', file, error, NEW_FILE_FIX)));
    written.push(file);
  }

  return written;
});

/**
 * Creates a folder that must not exist yet, and the folders above it. The folder itself is created
 * without `recursive`, so the call fails when anything, of any letter case on a case-insensitive
 * file system, is already at its path: two commands cannot both think they made it.
 *
 * @param dir - The absolute path of the folder.
 * @throws FileSystemError in the error channel when something is at the path, or a folder cannot be
 *   created.
 */
export const createNewDirectory = Effect.fn('createNewDirectory')(function* (
  dir: string,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* makeFolders(path.dirname(dir));
  yield* fs
    .makeDirectory(dir)
    .pipe(Effect.mapError((error) => fileSystemError(CREATE_FOLDER, dir, error, NEW_FILE_FIX)));
});

/**
 * Reads a text file, failing with the path and the reason instead of a stack trace.
 *
 * @param file - The absolute path.
 * @throws FileSystemError in the error channel when the file cannot be read.
 */
export const readText = Effect.fn('readText')(function* (
  file: string,
): Effect.fn.Return<string, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs
    .readFileString(file, 'utf8')
    .pipe(
      Effect.mapError((error) =>
        fileSystemError('read', file, error, 'Check that the file exists and is readable.'),
      ),
    );
});

/**
 * Creates a folder and the folders above it; one that exists already is fine.
 */
const makeFolders = Effect.fn('makeFolders')(function* (
  dir: string,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .makeDirectory(dir, { recursive: true })
    .pipe(Effect.mapError((error) => fileSystemError(CREATE_FOLDER, dir, error, WRITE_FIX)));
});
