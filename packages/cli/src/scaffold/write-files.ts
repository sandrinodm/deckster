import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { fileSystemError, type FileSystemError } from '#cli-error.ts';

/**
 * The fix for a scaffold file that cannot be written.
 */
const WRITE_FIX =
  'Check that the folder is writable and is not a file, then run the command again.';

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
    const dir = path.dirname(file);
    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(
        Effect.mapError((error) => fileSystemError('create the folder', dir, error, WRITE_FIX)),
      );
    yield* fs
      .writeFileString(file, content)
      .pipe(Effect.mapError((error) => fileSystemError('write', file, error, WRITE_FIX)));
    written.push(file);
  }

  return written;
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
