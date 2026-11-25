import { Effect, FileSystem, PlatformError, Result } from 'effect';
import path from 'node:path';

import type { ShotFile } from '#shot/take-shots.ts';

import { fileSystemError, type FileSystemError } from '#cli-error.ts';
import { SHOT_FILE_PATTERN } from '#shot/shot-names.ts';

/**
 * The prefix of the folder a run writes to until it succeeds, a sibling of the output folder so the
 * files can be moved into place without copying.
 */
const STAGING_PREFIX = '.shots-staging-';

/**
 * The directory inside staging that holds the original screenshots.
 */
const BACKUP_DIR = 'previous';

/**
 * Permission and special bits from stat, excluding the file type bits.
 */
const FILE_MODE_BITS = 0o7777;

/**
 * A destination touched by publication and the path of its previous entry, if any.
 */
type ShotChange = {
  /**
   * The destination in the output folder.
   */
  target: string;

  /**
   * The original entry, kept in staging until publication succeeds.
   */
  backup: string | null;
};

/**
 * Runs a screenshot capture in a staging folder next to the output folder and publishes the files
 * only when capture succeeds. Publication failures restore the previous screenshots and remove
 * newly published files. If restoration fails, the staging folder stays available for recovery.
 *
 * On success with `replaceStale`, the screenshots already in the output folder that follow the
 * tool's naming are removed after every new screenshot is in place. Replaced files keep their mode
 * bits. Files of other names are never touched.
 *
 * @param outDir - The absolute output folder; created before publication when it does not exist.
 * @param replaceStale - Whether the run covers the whole deck and replaces older screenshots.
 * @param run - Takes the screenshots into the staging folder it is given and checks them.
 * @returns What `run` returned, with every file's path pointing into the output folder.
 * @throws FileSystemError in the error channel when the staging folder cannot be made, publication
 *   fails or recovery is needed. A capture failure is returned unchanged.
 */
export const stageShots = Effect.fn('stageShots')(function* <
  A extends { readonly files: readonly ShotFile[] },
  E,
  R,
>(
  outDir: string,
  replaceStale: boolean,
  run: (staging: string) => Effect.Effect<A, E, R>,
): Effect.fn.Return<A, E | FileSystemError, R | FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const parent = path.dirname(outDir);
  yield* makeOutputDirectory(fs, parent);
  const staging = yield* fs
    .makeTempDirectory({ directory: parent, prefix: STAGING_PREFIX })
    .pipe(
      Effect.mapError((error) =>
        fileSystemError(
          'create the screenshot staging folder in',
          parent,
          error,
          'Export to a folder with a writable parent.',
        ),
      ),
    );
  const changes: ShotChange[] = [];
  let keepStaging = false;
  return yield* Effect.gen(function* () {
    const result = yield* run(staging);
    const files = yield* moveIntoPlace(staging, outDir, replaceStale, result.files, changes).pipe(
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          keepStaging = true;
          const failed = yield* restoreShots(changes);
          if (failed !== undefined) {
            return yield* fileSystemError(
              'restore the previous screenshot',
              failed.target,
              failed.error,
              `The remaining backups are in ${path.join(staging, BACKUP_DIR)}.`,
            );
          }

          keepStaging = false;
          return yield* Effect.failCause(cause);
        }),
      ),
      Effect.uninterruptible,
    );
    return { ...result, files };
  }).pipe(
    Effect.ensuring(
      Effect.suspend(() =>
        keepStaging
          ? Effect.void
          : fs.remove(staging, { recursive: true, force: true }).pipe(Effect.ignore),
      ),
    ),
  );
});

/**
 * Moves replacement screenshots first, then retires stale files on full-deck exports. Each change
 * is recorded before writing the new file so even a failed copy can be rolled back.
 *
 * @param staging - The folder the files were written to.
 * @param outDir - The output folder.
 * @param replaceStale - Whether to remove the older screenshots once the new ones are in place.
 * @param files - The staged files.
 * @param changes - Receives the backup path for each changed destination.
 * @returns The files, at their place in the output folder.
 */
const moveIntoPlace = Effect.fn('moveIntoPlace')(function* (
  staging: string,
  outDir: string,
  replaceStale: boolean,
  files: readonly ShotFile[],
  changes: ShotChange[],
): Effect.fn.Return<ShotFile[], FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* makeOutputDirectory(fs, outDir);
  const previous = path.join(staging, BACKUP_DIR);
  yield* fs
    .makeDirectory(previous)
    .pipe(
      Effect.mapError((error) =>
        fileSystemError(
          'create the screenshot backup folder',
          previous,
          error,
          'Run the export again with a writable output folder.',
        ),
      ),
    );
  const placed: ShotFile[] = [];
  for (const file of files) {
    const name = path.basename(file.path);
    const target = path.join(outDir, name);
    const saved = path.join(previous, `${changes.length}-${name}`);
    yield* stashShot(fs, target, saved, file.path).pipe(
      Effect.tap((backup) => Effect.sync(() => changes.push({ target, backup }))),
      Effect.andThen(moveShot(fs, file.path, target)),
      Effect.mapError((error) =>
        fileSystemError(
          'move the screenshot into the output folder',
          target,
          error,
          'Run the export again; if it keeps failing, pick another `--out` folder.',
        ),
      ),
    );
    placed.push({ ...file, path: target });
  }

  if (replaceStale) {
    const current = new Set(placed.map((file) => path.basename(file.path)));
    yield* retireStaleShots(fs, outDir, previous, current, changes);
  }

  return placed;
});

/**
 * Creates an output directory or its parent, including missing ancestors.
 */
function makeOutputDirectory(
  fs: FileSystem.FileSystem,
  directory: string,
): Effect.Effect<void, FileSystemError> {
  return fs
    .makeDirectory(directory, { recursive: true })
    .pipe(
      Effect.mapError((error) =>
        fileSystemError(
          'create the output folder',
          directory,
          error,
          'Pass `--out` a folder that can be created, or leave it out to use the default.',
        ),
      ),
    );
}

/**
 * Moves stale screenshots into staging so each can be recovered if another removal fails.
 */
const retireStaleShots = Effect.fn('retireStaleShots')(function* (
  fs: FileSystem.FileSystem,
  outDir: string,
  previous: string,
  current: ReadonlySet<string>,
  changes: ShotChange[],
): Effect.fn.Return<void, FileSystemError> {
  const entries = yield* fs
    .readDirectoryEntries(outDir)
    .pipe(
      Effect.mapError((error) =>
        fileSystemError(
          'list the screenshots in',
          outDir,
          error,
          'Pass `--out` a folder that can be read.',
        ),
      ),
    );
  for (const { name, type } of entries) {
    if (!SHOT_FILE_PATTERN.test(name) || current.has(name) || type === 'Directory') {
      continue;
    }

    const target = path.join(outDir, name);
    const saved = path.join(previous, `${changes.length}-${name}`);
    const backup = yield* stashShot(fs, target, saved).pipe(
      Effect.mapError((error) =>
        fileSystemError(
          'remove the old screenshot',
          target,
          error,
          'Delete it by hand or pick another `--out` folder.',
        ),
      ),
    );
    if (backup !== null) {
      changes.push({ target, backup });
    }
  }
});

/**
 * Saves an existing file or symbolic link by moving it into staging. A replacement regular file
 * inherits the previous file's mode before publication. Other entry types cannot be replaced.
 */
const stashShot = Effect.fn('stashShot')(function* (
  fs: FileSystem.FileSystem,
  target: string,
  backup: string,
  replacement?: string,
): Effect.fn.Return<string | null, PlatformError.PlatformError> {
  const info = yield* fs
    .lstat(target)
    .pipe(
      Effect.catch((error) =>
        error.reason._tag === 'NotFound' ? Effect.succeed(null) : Effect.fail(error),
      ),
    );
  if (info === null) {
    return null;
  }

  if (info.type !== 'File' && info.type !== 'SymbolicLink') {
    return yield* PlatformError.badArgument({
      module: 'FileSystem',
      method: 'lstat',
      description: 'the path is not a file or a symbolic link',
    });
  }

  if (replacement !== undefined && info.type === 'File') {
    yield* fs.chmod(replacement, info.mode & FILE_MODE_BITS);
  }

  yield* moveShot(fs, target, backup);
  return backup;
});

/**
 * Renames a screenshot, or copies it and unlinks the source across filesystems. Links are moved
 * without following them. The destination must be vacant.
 */
const moveShot = Effect.fn('moveShot')(function* (
  fs: FileSystem.FileSystem,
  source: string,
  target: string,
): Effect.fn.Return<void, PlatformError.PlatformError> {
  const renamed = yield* fs.rename(source, target).pipe(Effect.result);
  if (Result.isSuccess(renamed)) {
    return;
  }

  const cause = renamed.failure.reason.cause;
  if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'EXDEV') {
    return yield* renamed.failure;
  }

  const info = yield* fs.lstat(source);
  if (info.type === 'SymbolicLink') {
    const link = yield* fs.readLink(source);
    yield* fs.symlink(link, target);
  } else {
    yield* fs.copyFile(source, target);
    yield* fs.chmod(target, info.mode & FILE_MODE_BITS);
  }

  yield* fs.remove(source);
});

/**
 * Undoes published changes in reverse order. Attempts every restoration and returns the first
 * failure so the caller can retain the remaining backups.
 */
const restoreShots = Effect.fn('restoreShots')(function* (
  changes: readonly ShotChange[],
): Effect.fn.Return<
  { target: string; error: PlatformError.PlatformError } | undefined,
  never,
  FileSystem.FileSystem
> {
  const fs = yield* FileSystem.FileSystem;
  const results = yield* Effect.forEach(changes.toReversed(), ({ target, backup }) =>
    fs.remove(target, { force: true }).pipe(
      Effect.andThen(backup === null ? Effect.void : moveShot(fs, backup, target)),
      Effect.mapError((error) => ({ target, error })),
      Effect.result,
    ),
  );
  return results.find(Result.isFailure)?.failure;
});
