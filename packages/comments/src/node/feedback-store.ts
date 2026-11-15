import { fileExists, guardedWrite } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { KEBAB_CASE_PATTERN } from '@deckster/engine/names';
import { Effect, FileSystem, Result, Schema } from 'effect';
import path from 'node:path';

import { FEEDBACK_VERSION, FeedbackFile, type Comment } from '#model/comment-schema.ts';
import { sortComments } from '#node/comment-changes.ts';
import { feedbackError, type FeedbackError } from '#node/feedback-error.ts';
import { assertNoFeedbackLinks } from '#node/feedback-guard.ts';
import { withFeedbackLock } from '#node/feedback-lock.ts';
import {
  FEEDBACK_EXTENSION,
  feedbackDir,
  feedbackFile,
  screenshotDir,
  screenshotFile,
} from '#node/feedback-paths.ts';

/**
 * Spaces of indentation in a feedback file.
 */
const JSON_INDENT_SPACES = 2;

/**
 * Checks a parsed feedback file strictly: unknown keys are errors, so a typo never drops data.
 */
const decodeFeedbackFile = Schema.decodeUnknownResult(FeedbackFile, {
  errors: 'all',
  onExcessProperty: 'error',
});

/**
 * Writes a feedback file's fields in schema order.
 */
const encodeFeedbackFile = Schema.encodeSync(FeedbackFile);

/**
 * Every comment of a deck, by slide id, in the order of the file names.
 */
export type DeckFeedback = ReadonlyMap<string, readonly Comment[]>;

/**
 * What an update of one slide's comments produces: the comments to write and a result to return.
 */
export type FeedbackUpdate<A> = {
  /**
   * Every comment of the slide after the update; an empty list removes the file.
   */
  comments: readonly Comment[];

  /**
   * What the caller gets back.
   */
  result: A;
};

/**
 * Writes one slide's comments as a feedback file: two-space JSON, fields in schema order, comments
 * oldest first and a final newline, so the same comments always give the same bytes and a change
 * shows up in a diff as the lines it touched.
 *
 * @param slide - The slide id.
 * @param comments - Its comments, in any order.
 */
export function serializeFeedback(slide: string, comments: readonly Comment[]): string {
  const file = encodeFeedbackFile({
    version: FEEDBACK_VERSION,
    slide,
    comments: sortComments(comments),
  });
  return `${JSON.stringify(file, null, JSON_INDENT_SPACES)}\n`;
}

/**
 * Reads one slide's comments.
 *
 * @param deckDir - The absolute deck folder.
 * @param slide - The slide id.
 * @returns Its comments, oldest first; none when it has no feedback file.
 * @throws FeedbackError (`invalid`) in the error channel for an id that is not kebab-case or a file
 *   that is not valid feedback JSON.
 */
export const readSlideFeedback = Effect.fn('readSlideFeedback')(function* (
  deckDir: string,
  slide: string,
): Effect.fn.Return<readonly Comment[], FeedbackError, FileSystem.FileSystem> {
  const file = yield* slideFile(deckDir, slide);
  yield* assertNoFeedbackLinks(deckDir, file);
  return yield* readFeedbackAt(file, slide);
});

/**
 * Reads every comment of a deck.
 *
 * @param deckDir - The absolute deck folder.
 * @returns The comments by slide id; empty when the deck has no `.feedback` folder.
 * @throws FeedbackError (`invalid`) in the error channel for a feedback file that is not valid.
 */
export const readDeckFeedback = Effect.fn('readDeckFeedback')(function* (
  deckDir: string,
): Effect.fn.Return<DeckFeedback, FeedbackError, FileSystem.FileSystem> {
  const slides = yield* listFeedbackSlides(deckDir);
  const read = yield* Effect.forEach(
    slides,
    (slide) =>
      readSlideFeedback(deckDir, slide).pipe(Effect.map((comments) => [slide, comments] as const)),
    { concurrency: 'unbounded' },
  );
  return new Map(read);
});

/**
 * The slide ids that have a feedback file, sorted.
 *
 * @param deckDir - The absolute deck folder.
 * @throws FeedbackError (`invalid`) in the error channel when the feedback folder is a symbolic
 *   link.
 */
export const listFeedbackSlides = Effect.fn('listFeedbackSlides')(function* (
  deckDir: string,
): Effect.fn.Return<string[], FeedbackError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* assertNoFeedbackLinks(deckDir, feedbackDir(deckDir));
  const names = yield* fs.readDirectory(feedbackDir(deckDir)).pipe(Effect.orElseSucceed(() => []));
  return names
    .filter((name) => name.endsWith(FEEDBACK_EXTENSION))
    .map((name) => name.slice(0, -FEEDBACK_EXTENSION.length))
    .filter((slide) => KEBAB_CASE_PATTERN.test(slide))
    .sort();
});

/**
 * Changes one slide's comments: takes the file's lock, reads the comments as they are now, applies
 * the update and writes the result, so concurrent writers merge rather than overwrite. The write
 * goes to a temporary file that is then renamed over the old one, so a reader never sees half a
 * file. An update that leaves no comments removes the file and the slide's screenshot folder.
 *
 * @param deckDir - The absolute deck folder.
 * @param slide - The slide id.
 * @param update - Computes the new comments from the current ones.
 * @returns The update's result.
 * @throws FeedbackError in the error channel from the update, for an invalid file or id, a lock
 *   held too long, or a file that cannot be written.
 */
export const updateSlideFeedback = Effect.fn('updateSlideFeedback')(function* <A>(
  deckDir: string,
  slide: string,
  update: (comments: readonly Comment[]) => Effect.Effect<FeedbackUpdate<A>, FeedbackError>,
): Effect.fn.Return<A, FeedbackError, FileSystem.FileSystem> {
  const file = yield* slideFile(deckDir, slide);
  yield* assertNoFeedbackLinks(deckDir, file);
  yield* makeFeedbackDir(deckDir);
  const write = Effect.gen(function* () {
    const current = yield* readFeedbackAt(file, slide);
    const next = yield* update(current);
    if (next.comments !== current) {
      yield* writeFeedbackAt(deckDir, file, slide, next.comments);
    }

    return next.result;
  });
  return yield* withFeedbackLock(file, write);
});

/**
 * Finds a comment by id anywhere in a deck.
 *
 * @param deckDir - The absolute deck folder.
 * @param id - The comment id.
 * @returns The slide it is on, and the comment.
 * @throws FeedbackError (`missing`) in the error channel when no slide has it, naming the deck's
 *   comment ids when there are few.
 */
export const findComment = Effect.fn('findComment')(function* (
  deckDir: string,
  id: string,
): Effect.fn.Return<{ slide: string; comment: Comment }, FeedbackError, FileSystem.FileSystem> {
  const feedback = yield* readDeckFeedback(deckDir);
  for (const [slide, comments] of feedback) {
    const comment = comments.find((candidate) => candidate.id === id);
    if (comment !== undefined) {
      return { slide, comment };
    }
  }

  return yield* feedbackError(
    'missing',
    `No comment has the id "${id}". Run \`${deckCommand()} comments <deck> --all\` to list the ids.`,
  );
});

/**
 * Removes a slide's feedback file and its screenshots.
 *
 * @param deckDir - The absolute deck folder.
 * @param slide - The slide id.
 * @throws FeedbackError (`io`) in the error channel when they cannot be removed.
 */
export const removeSlideFeedback = Effect.fn('removeSlideFeedback')(function* (
  deckDir: string,
  slide: string,
): Effect.fn.Return<void, FeedbackError, FileSystem.FileSystem> {
  yield* updateSlideFeedback(deckDir, slide, () =>
    Effect.succeed({ comments: [], result: undefined }),
  );
});

/**
 * Removes the screenshot of one comment, if it has one.
 *
 * @param deckDir - The absolute deck folder.
 * @param slide - The slide id.
 * @param id - The comment id.
 */
export const removeScreenshot = Effect.fn('removeScreenshot')(function* (
  deckDir: string,
  slide: string,
  id: string,
): Effect.fn.Return<void, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const file = screenshotFile(deckDir, slide, id);
  if (file !== undefined) {
    // A screenshot path that runs through a link is left alone.
    yield* guardedWrite(
      file,
      assertNoFeedbackLinks(deckDir, file).pipe(
        Effect.flatMap(() => fs.remove(file)),
        Effect.ignore,
      ),
    );
  }
});

/**
 * The feedback file of a slide, failing for an id that would leave the feedback folder.
 *
 * @param deckDir - The absolute deck folder.
 * @param slide - The slide id.
 */
function slideFile(deckDir: string, slide: string): Effect.Effect<string, FeedbackError> {
  const file = feedbackFile(deckDir, slide);
  return file === undefined
    ? Effect.fail(feedbackError('invalid', `"${slide}" is not a slide id: use kebab-case.`))
    : Effect.succeed(file);
}

/**
 * Reads and checks a feedback file; a missing file has no comments.
 *
 * @param file - The absolute feedback file.
 * @param slide - The slide id the file must name.
 */
const readFeedbackAt = Effect.fn('readFeedbackAt')(function* (
  file: string,
  slide: string,
): Effect.fn.Return<readonly Comment[], FeedbackError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fileExists(file))) {
    return [];
  }

  const text = yield* fs
    .readFileString(file, 'utf8')
    .pipe(
      Effect.mapError((error) => feedbackError('io', `Could not read ${file}: ${error.message}`)),
    );
  const parsed = parseJson(text);
  const decoded = Result.isSuccess(parsed) ? decodeFeedbackFile(parsed.success) : parsed;
  if (Result.isFailure(decoded)) {
    return yield* invalidFeedbackFile(file, decoded.failure.message);
  }

  if (decoded.success.slide !== slide) {
    return yield* invalidFeedbackFile(file, `it names the slide "${decoded.success.slide}"`);
  }

  return decoded.success.comments;
});

/**
 * Writes a slide's comments atomically, or removes the file and screenshots when there are none.
 *
 * @param deckDir - The absolute deck folder.
 * @param file - The absolute feedback file.
 * @param slide - The slide id.
 * @param comments - The comments to write.
 */
const writeFeedbackAt = Effect.fn('writeFeedbackAt')(function* (
  deckDir: string,
  file: string,
  slide: string,
  comments: readonly Comment[],
): Effect.fn.Return<void, FeedbackError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  /**
   * The error for a write that failed.
   */
  const failed = (error: { message: string }) =>
    feedbackError('io', `Could not write ${file}: ${error.message}. Check the folder is writable.`);
  // While an agent turn runs, the turn guard keeps these writes (they are the framework's own).
  if (comments.length === 0) {
    const screenshots = screenshotDir(deckDir, slide);
    yield* assertNoFeedbackLinks(deckDir, screenshots);
    yield* guardedWrite(file, fs.remove(file).pipe(Effect.ignore));
    yield* guardedWrite(
      screenshots,
      fs.remove(screenshots, { recursive: true }).pipe(Effect.ignore),
    );
    return;
  }

  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  yield* guardedWrite(
    file,
    fs
      .writeFileString(temporary, serializeFeedback(slide, comments))
      .pipe(Effect.andThen(fs.rename(temporary, file)), Effect.mapError(failed)),
  );
});

/**
 * Creates the deck's `.feedback` folder.
 *
 * @param deckDir - The absolute deck folder.
 */
const makeFeedbackDir = Effect.fn('makeFeedbackDir')(function* (
  deckDir: string,
): Effect.fn.Return<void, FeedbackError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const dir = feedbackDir(deckDir);
  yield* fs
    .makeDirectory(dir, { recursive: true })
    .pipe(
      Effect.mapError((error) => feedbackError('io', `Could not create ${dir}: ${error.message}`)),
    );
});

/**
 * Parses JSON without throwing.
 *
 * @param text - The file's text.
 */
function parseJson(text: string): Result.Result<unknown, { message: string }> {
  try {
    const parsed: unknown = JSON.parse(text);
    return Result.succeed(parsed);
  } catch (error) {
    return Result.fail({ message: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * The error for a feedback file that cannot be used.
 *
 * @param file - The absolute file.
 * @param problem - What is wrong with it.
 */
function invalidFeedbackFile(file: string, problem: string): Effect.Effect<never, FeedbackError> {
  return Effect.fail(
    feedbackError(
      'invalid',
      `${path.basename(path.dirname(file))}/${path.basename(file)} is not a valid feedback file: ` +
        `${problem}\nFix it by hand (it is JSON), or delete it to drop its comments.`,
    ),
  );
}
