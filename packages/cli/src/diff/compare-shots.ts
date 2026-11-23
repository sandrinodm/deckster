import type { PlatformError } from 'effect';

import { Effect, FileSystem, Option } from 'effect';
import path from 'node:path';

import type { DiffStatus, SlideDiff, StepDiff } from '#diff/diff-types.ts';

import {
  cliError,
  fileSystemError,
  type BrowserError,
  type CliError,
  type FileSystemError,
} from '#cli-error.ts';
import { matchSlides, parseShotName, type OrderedSlide } from '#diff/match-slides.ts';
import { SlideComparer } from '#diff/slide-comparer.ts';

/**
 * The folders of pictures the comparison writes into the output folder.
 */
export const PICTURE_FOLDERS = ['before', 'after', 'compare'] as const;

/**
 * The names of the pictures a run writes.
 */
const PICTURE_FILE_PATTERN = /\.png$/;

/**
 * The least share of changed pixels that counts as a change in a slide whose position changed. The
 * page number and progress bar in the brand's chrome change with the position, and they alone
 * change about 0.007% of a slide's pixels (a two-digit number about twice that), so a slide that
 * merely moved or shifted must change more than this to be reported as changed.
 */
export const POSITION_TOLERANCE = 0.0003;

/**
 * What to do when the report folder cannot be written.
 */
const WRITE_FIX = 'Pass `--out` a folder that can be written, or leave it out to use the default.';

/**
 * The two versions of a step that differs, read and measured, ready to be written to the report.
 */
type ChangedPictures = {
  /**
   * The base picture's absolute path.
   */
  oldFile: string;

  /**
   * The current picture's absolute path.
   */
  newFile: string;

  /**
   * The base picture's bytes.
   */
  oldBytes: Uint8Array;

  /**
   * The current picture's bytes.
   */
  newBytes: Uint8Array;

  /**
   * The share of changed pixels, from 0 to 1.
   */
  differenceRatio: number;
};

/**
 * Which pictures to compare and where to write what differs.
 */
export type CompareOptions = {
  /**
   * The folder of base pictures, named as `deckster shot` names them; `null` when the base has no
   * such deck, so every slide counts as added.
   */
  beforeDir: string | null;

  /**
   * The folder of current pictures.
   */
  afterDir: string;

  /**
   * The report folder; the pictures of slides that differ go to its `before`, `after` and `compare`
   * folders.
   */
  outDir: string;

  /**
   * Compare every step instead of each slide's finished state.
   */
  steps: boolean;

  /**
   * A step counts as changed when its share of changed pixels is above this, from 0 to 1.
   */
  threshold: number;
};

/**
 * The pictures of one slide in one version.
 */
type SlideShots = {
  /**
   * The slide's 1-based position.
   */
  number: number;

  /**
   * The absolute path of each picture by step; `null` is the finished state.
   */
  files: Map<number | null, string>;
};

/**
 * Every way the comparison can fail.
 */
export type CompareError = CliError | FileSystemError | BrowserError;

/**
 * Compares two folders of screenshots slide by slide. Slides are matched by id, so a reordered deck
 * reports `moved` slides, not a change in every slide. Identical files are unchanged without
 * decoding; others are measured by the {@link SlideComparer}. A slide whose position changed needs
 * a change of at least {@link POSITION_TOLERANCE} to count as changed, because its page number
 * changes. For every step that changed, was added or removed, the pictures are copied or drawn into
 * the output folder. Pictures from an earlier run in that folder are removed first.
 *
 * @param options - The folders and the threshold.
 * @returns One entry per slide in either version: the current slides in order, then removed ones.
 * @throws CliError in the error channel when a folder has no screenshots for the mode (`--steps` or
 *   not); FileSystemError when a file cannot be read or written; BrowserError when the comparison
 *   browser fails.
 */
export const compareShots = Effect.fn('compareShots')(function* (
  options: CompareOptions,
): Effect.fn.Return<SlideDiff[], CompareError, FileSystem.FileSystem | SlideComparer> {
  const before =
    options.beforeDir === null
      ? new Map<string, SlideShots>()
      : yield* readShots(options.beforeDir, options.steps);
  const after = yield* readShots(options.afterDir, options.steps);
  yield* resetPictureFolders(options.outDir);
  const matches = matchSlides(orderOf(before), orderOf(after));
  const diffs: SlideDiff[] = [];
  for (const match of matches) {
    const oldShots = before.get(match.id)?.files ?? new Map<number | null, string>();
    const newShots = after.get(match.id)?.files ?? new Map<number | null, string>();
    const shifted = match.beforeNumber !== null && match.beforeNumber !== match.afterNumber;
    const threshold = shifted ? Math.max(options.threshold, POSITION_TOLERANCE) : options.threshold;
    const steps = yield* compareSteps(oldShots, newShots, { ...options, threshold });
    diffs.push(slideDiff(match, steps, options.steps));
  }

  return diffs;
});

/**
 * The slides of a version in order, for matching.
 *
 * @param shots - The pictures by slide id.
 */
function orderOf(shots: ReadonlyMap<string, SlideShots>): OrderedSlide[] {
  return [...shots.entries()]
    .map(([id, slide]) => ({ id, number: slide.number }))
    .sort((a, b) => a.number - b.number);
}

/**
 * The status of a slide: added or removed when only one version has it, else changed when any step
 * differs, else moved or unchanged.
 *
 * @param match - The slide matched by id.
 * @param anyChange - Whether any step differs.
 */
function slideStatus(
  match: { beforeNumber: number | null; afterNumber: number | null; moved: boolean },
  anyChange: boolean,
): DiffStatus {
  if (match.beforeNumber === null) {
    return 'added';
  }

  if (match.afterNumber === null) {
    return 'removed';
  }

  if (anyChange) {
    return 'changed';
  }

  return match.moved ? 'moved' : 'unchanged';
}

/**
 * Folds a slide's step results into its diff.
 *
 * @param match - The slide matched by id.
 * @param steps - Its step results, in step order.
 * @param withSteps - Whether to list the steps in the result.
 */
function slideDiff(
  match: { id: string; beforeNumber: number | null; afterNumber: number | null; moved: boolean },
  steps: readonly StepDiff[],
  withSteps: boolean,
): SlideDiff {
  const anyChange = steps.some((step) => step.status !== 'unchanged');
  const status = slideStatus(match, anyChange);
  const shown = [...steps].reverse().find((step) => step.status !== 'unchanged') ?? steps.at(-1);
  return {
    id: match.id,
    status,
    beforeNumber: match.beforeNumber,
    afterNumber: match.afterNumber,
    moved: match.moved,
    differenceRatio: Math.max(0, ...steps.map((step) => step.differenceRatio)),
    before: shown?.before ?? null,
    after: shown?.after ?? null,
    compare: shown?.compare ?? null,
    ...(withSteps ? { steps: [...steps] } : {}),
  };
}

/**
 * Compares the pictures of one slide step by step.
 *
 * @param oldShots - The base pictures by step.
 * @param newShots - The current pictures by step.
 * @param options - The folders and the threshold.
 */
const compareSteps = Effect.fn('compareSteps')(function* (
  oldShots: ReadonlyMap<number | null, string>,
  newShots: ReadonlyMap<number | null, string>,
  options: CompareOptions,
): Effect.fn.Return<StepDiff[], CompareError, FileSystem.FileSystem | SlideComparer> {
  const keys = [...new Set([...oldShots.keys(), ...newShots.keys()])].sort(
    (a, b) => (a ?? 0) - (b ?? 0),
  );
  const results: StepDiff[] = [];
  for (const step of keys) {
    results.push(yield* compareStep(step, oldShots.get(step), newShots.get(step), options));
  }

  return results;
});

/**
 * Compares one picture pair, and writes the pictures when they differ.
 *
 * @param step - The step, or `null` for the finished state.
 * @param oldFile - The base picture, if the step existed.
 * @param newFile - The current picture, if the step exists.
 * @param options - The folders and the threshold.
 */
const compareStep = Effect.fn('compareStep')(function* (
  step: number | null,
  oldFile: string | undefined,
  newFile: string | undefined,
  options: CompareOptions,
): Effect.fn.Return<StepDiff, CompareError, FileSystem.FileSystem | SlideComparer> {
  if (oldFile === undefined && newFile !== undefined) {
    const after = yield* copyPicture(newFile, 'after', options.outDir);
    return { step, status: 'added', differenceRatio: 1, before: null, after, compare: null };
  }

  if (oldFile !== undefined && newFile === undefined) {
    const before = yield* copyPicture(oldFile, 'before', options.outDir);
    return { step, status: 'removed', differenceRatio: 1, before, after: null, compare: null };
  }

  if (oldFile === undefined || newFile === undefined) {
    return yield* cliError(
      'A step has no picture in either version; this is a bug in deckster diff.',
    );
  }

  const oldBytes = yield* readPicture(oldFile);
  const newBytes = yield* readPicture(newFile);
  const differenceRatio = yield* differenceOf(oldBytes, newBytes);
  if (differenceRatio <= options.threshold) {
    return { step, status: 'unchanged', differenceRatio, before: null, after: null, compare: null };
  }

  const changed = yield* writeChangedStep(
    { oldFile, newFile, oldBytes, newBytes, differenceRatio },
    options.outDir,
  );
  return { step, status: 'changed', ...changed };
});

/**
 * The share of changed pixels between two pictures. Identical bytes are unchanged without asking
 * the comparer.
 *
 * @param oldBytes - The base picture.
 * @param newBytes - The current picture.
 */
const differenceOf = Effect.fn('differenceOf')(function* (
  oldBytes: Uint8Array,
  newBytes: Uint8Array,
): Effect.fn.Return<number, CliError | BrowserError, SlideComparer> {
  if (Buffer.from(oldBytes).equals(Buffer.from(newBytes))) {
    return 0;
  }

  const comparer = yield* SlideComparer;
  const { differenceRatio } = yield* comparer.compare(oldBytes, newBytes);
  return differenceRatio;
});

/**
 * Writes the side-by-side picture of a changed step and copies both versions beside it.
 *
 * @param pictures - The changed pictures.
 * @param outDir - The report folder.
 * @returns The step's result without its step number and status.
 */
const writeChangedStep = Effect.fn('writeChangedStep')(function* (
  pictures: ChangedPictures,
  outDir: string,
): Effect.fn.Return<
  Pick<StepDiff, 'differenceRatio' | 'before' | 'after' | 'compare'>,
  CompareError,
  FileSystem.FileSystem | SlideComparer
> {
  const fs = yield* FileSystem.FileSystem;
  const comparer = yield* SlideComparer;
  const picture = yield* comparer.draw(pictures.oldBytes, pictures.newBytes);
  const compare = path.join(outDir, 'compare', path.basename(pictures.newFile));
  yield* fs
    .writeFile(compare, picture)
    .pipe(
      Effect.mapError((error) =>
        fileSystemError('write the comparison picture', compare, error, WRITE_FIX),
      ),
    );
  const before = yield* copyPicture(pictures.oldFile, 'before', outDir);
  const after = yield* copyPicture(pictures.newFile, 'after', outDir);
  return { differenceRatio: pictures.differenceRatio, before, after, compare };
});

/**
 * Reads a picture.
 *
 * @param file - The absolute path.
 */
const readPicture = Effect.fn('readPicture')(function* (
  file: string,
): Effect.fn.Return<Uint8Array, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs
    .readFile(file)
    .pipe(
      Effect.mapError((error) =>
        fileSystemError(
          'read the picture',
          file,
          error,
          'Run `deckster shot` again to recreate it.',
        ),
      ),
    );
});

/**
 * Copies a picture into one of the report's picture folders.
 *
 * @param file - The picture.
 * @param folder - `before` or `after`.
 * @param outDir - The report folder.
 * @returns The absolute path of the copy.
 */
const copyPicture = Effect.fn('copyPicture')(function* (
  file: string,
  folder: 'before' | 'after',
  outDir: string,
): Effect.fn.Return<string, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const target = path.join(outDir, folder, path.basename(file));
  yield* fs
    .copyFile(file, target)
    .pipe(
      Effect.mapError((error) => fileSystemError('copy the picture to', target, error, WRITE_FIX)),
    );
  return target;
});

/**
 * Empties and recreates the report's picture folders. A folder is emptied only when it is empty or
 * holds nothing but PNG pictures, which is all this command ever puts in one; anything else, or a
 * symbolic link, is refused, so `--out` pointed at a folder with other files never loses them.
 *
 * @param outDir - The report folder.
 * @throws CliError in the error channel when a picture folder holds files that are not pictures.
 */
const resetPictureFolders = Effect.fn('resetPictureFolders')(function* (
  outDir: string,
): Effect.fn.Return<void, CompareError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  for (const folder of PICTURE_FOLDERS) {
    yield* assertOurs(path.join(outDir, folder));
  }

  for (const folder of PICTURE_FOLDERS) {
    const dir = path.join(outDir, folder);
    yield* fs.remove(dir, { recursive: true, force: true }).pipe(
      Effect.flatMap(() => fs.makeDirectory(dir, { recursive: true })),
      Effect.mapError((error: PlatformError.PlatformError) =>
        fileSystemError('prepare the report folder', dir, error, WRITE_FIX),
      ),
    );
  }
});

/**
 * Fails unless a picture folder is absent, empty, or only PNG pictures.
 *
 * @param dir - The picture folder.
 * @throws CliError in the error channel when it is a link or holds anything else.
 */
const assertOurs = Effect.fn('assertOurs')(function* (
  dir: string,
): Effect.fn.Return<void, CliError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const info = yield* fs.lstat(dir).pipe(Effect.option);
  if (Option.isNone(info)) {
    return;
  }

  /**
   * The error for a folder that may not be emptied.
   */
  const refuse = (why: string) =>
    cliError(
      `${dir} ${why}, so \`deckster diff\` will not empty it.\n` +
        'Pass `--out` an empty or new folder, or leave it out to use the default.',
    );
  if (info.value.type !== 'Directory') {
    return yield* refuse('is a link or a file');
  }

  const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed((): string[] => []));
  if (!names.every((name) => PICTURE_FILE_PATTERN.test(name))) {
    return yield* refuse('holds files that are not pictures from a diff');
  }
});

/**
 * Reads a folder of screenshots into pictures by slide id. Without `steps` only finished-state
 * pictures count; with it only step pictures do.
 *
 * @param dir - The folder.
 * @param steps - Whether the run compares steps.
 * @throws CliError in the error channel when the folder is missing or holds only pictures of the
 *   other kind.
 */
const readShots = Effect.fn('readShots')(function* (
  dir: string,
  steps: boolean,
): Effect.fn.Return<Map<string, SlideShots>, CliError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs
    .readDirectory(dir)
    .pipe(
      Effect.mapError(() =>
        cliError(`There are no screenshots in ${dir}: the folder cannot be read.`),
      ),
    );
  const slides = new Map<string, SlideShots>();
  let skipped = 0;
  for (const name of names) {
    const parsed = parseShotName(name);
    if (parsed === undefined) {
      continue;
    }

    if ((parsed.step !== null) !== steps) {
      skipped += 1;
      continue;
    }

    const entry = slides.get(parsed.id) ?? { number: parsed.number, files: new Map() };
    entry.files.set(parsed.step, path.join(dir, name));
    slides.set(parsed.id, entry);
  }

  if (slides.size === 0 && skipped === 0) {
    return yield* cliError(
      `${dir} has no screenshots named like 03-request-flow.png. ` +
        `Make them with \`deckster shot <deck> --out ${dir}\`.`,
    );
  }

  if (slides.size === 0) {
    return yield* cliError(`${dir} has no pictures to compare in this mode. ${modeHint(steps)}`);
  }

  return slides;
});

/**
 * What to change when a folder holds pictures only of the other kind.
 *
 * @param steps - Whether the run compares steps.
 */
function modeHint(steps: boolean): string {
  if (steps) {
    return (
      'It holds only whole-slide pictures: leave out `--steps`, or make the pictures with ' +
      '`deckster shot <deck> --steps`.'
    );
  }

  return 'It holds only step pictures (`NN-id.stepK.png`): pass `--steps`.';
}
