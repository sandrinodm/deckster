import type { FileSystem as FileSystemService } from 'effect';

import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { ShotFile } from '#shot/take-shots.ts';

import { fileSystemError, type FileSystemError } from '#cli-error.ts';
import { removeStaleShots } from '#shot/take-shots.ts';

/**
 * The prefix of the folder a run writes to until it succeeds, a sibling of the output folder so the
 * files can be moved into place without copying.
 */
const STAGING_PREFIX = '.shots-staging-';

/**
 * Runs a screenshot run in a staging folder next to the output folder and moves the files into the
 * output folder only when it succeeds. A run that fails, or whose result the caller rejects, leaves
 * the output folder as it was: no new files, and the earlier screenshots in it kept.
 *
 * On success with `replaceStale`, the screenshots already in the output folder that follow the
 * tool's naming are removed first, as a run over the whole deck does, so slides that were removed
 * leave nothing behind. Files of other names are never touched.
 *
 * @param outDir - The absolute output folder; created on success when it does not exist.
 * @param replaceStale - Whether the run covers the whole deck and replaces older screenshots.
 * @param run - Takes the screenshots into the staging folder it is given and checks them.
 * @returns What `run` returned, with every file's path pointing into the output folder.
 * @throws FileSystemError in the error channel when the staging folder cannot be made or the files
 *   cannot be moved; whatever `run` fails with, after the staging folder is removed.
 */
export const stageShots = Effect.fn('stageShots')(function* <
  A extends { readonly files: readonly ShotFile[] },
  E,
  R,
>(
  outDir: string,
  replaceStale: boolean,
  run: (staging: string) => Effect.Effect<A, E, R>,
): Effect.fn.Return<A, E | FileSystemError, R | FileSystemService.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const parent = path.dirname(outDir);
  const staging = yield* fs.makeDirectory(parent, { recursive: true }).pipe(
    Effect.andThen(fs.makeTempDirectory({ directory: parent, prefix: STAGING_PREFIX })),
    Effect.mapError((error) =>
      fileSystemError(
        'create the output folder',
        parent,
        error,
        'Pass `--out` a folder that can be created, or leave it out to use the default.',
      ),
    ),
  );
  const discard = fs.remove(staging, { recursive: true, force: true }).pipe(Effect.ignore);
  return yield* Effect.gen(function* () {
    const result = yield* run(staging);
    const files = yield* moveIntoPlace(staging, outDir, replaceStale, result.files);
    return { ...result, files };
  }).pipe(Effect.ensuring(discard));
});

/**
 * Moves the staged files into the output folder, after removing the stale screenshots there when
 * asked.
 *
 * @param staging - The folder the files were written to.
 * @param outDir - The output folder.
 * @param replaceStale - Whether to remove the older screenshots in the output folder first.
 * @param files - The staged files.
 * @returns The files, at their place in the output folder.
 */
const moveIntoPlace = Effect.fn('moveIntoPlace')(function* (
  staging: string,
  outDir: string,
  replaceStale: boolean,
  files: readonly ShotFile[],
): Effect.fn.Return<ShotFile[], FileSystemError, FileSystemService.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .makeDirectory(outDir, { recursive: true })
    .pipe(
      Effect.mapError((error) =>
        fileSystemError(
          'create the output folder',
          outDir,
          error,
          'Pass `--out` a folder that can be created, or leave it out to use the default.',
        ),
      ),
    );
  if (replaceStale) {
    yield* removeStaleShots(outDir);
  }

  const placed: ShotFile[] = [];
  for (const file of files) {
    const target = path.join(outDir, path.relative(staging, file.path));
    yield* fs
      .rename(file.path, target)
      .pipe(
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

  return placed;
});
