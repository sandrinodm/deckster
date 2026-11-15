import { fileExists } from '@deckster/brand/node';
import { Effect, FileSystem, Option } from 'effect';

/**
 * Matches a line break, Windows or Unix.
 */
const LINE_BREAK_PATTERN = /\r?\n/;

/**
 * What the comment store needs to know about a deck: where it is and its slides in order.
 */
export type FeedbackDeck = {
  /**
   * The deck folder name.
   */
  id: string;

  /**
   * The absolute deck folder.
   */
  dir: string;

  /**
   * The slides the deck config lists, in order.
   */
  slides: readonly FeedbackSlide[];
};

/**
 * One slide of a {@link FeedbackDeck}.
 */
export type FeedbackSlide = {
  /**
   * The slide id.
   */
  id: string;

  /**
   * The absolute slide file.
   */
  file: string;
};

/**
 * Reads a source file as lines.
 *
 * @param file - An absolute path.
 * @returns The lines, or `undefined` when the file does not exist or cannot be read.
 */
export const readSourceLines = Effect.fn('readSourceLines')(function* (
  file: string,
): Effect.fn.Return<readonly string[] | undefined, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fileExists(file))) {
    return undefined;
  }

  const text = yield* fs.readFileString(file, 'utf8').pipe(Effect.option);
  return Option.getOrUndefined(text)?.split(LINE_BREAK_PATTERN);
});
