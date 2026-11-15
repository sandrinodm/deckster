import { Schema } from 'effect';

/**
 * Why a feedback operation failed: the request or a file is `invalid`, a comment or slide is
 * `missing`, the feedback folder stayed `busy` (another writer held its lock too long), or the file
 * system failed (`io`).
 */
export const FeedbackFailure = Schema.Literals(['invalid', 'missing', 'busy', 'io']);

/**
 * Why a feedback operation failed.
 */
export type FeedbackFailure = typeof FeedbackFailure.Type;

/**
 * A comment that cannot be read, written or found. The message says what went wrong and what to do.
 * The dev server sends it back and `deck comments` prints it. Build it with {@link feedbackError}.
 */
export class FeedbackError extends Schema.TaggedError<FeedbackError>()('FeedbackError', {
  /**
   * Why it failed, which picks the dev server's HTTP status.
   */
  failure: FeedbackFailure,

  /**
   * What went wrong and what to do next.
   */
  message: Schema.String,
}) {}

/**
 * Builds a {@link FeedbackError}.
 *
 * @param failure - Why it failed.
 * @param message - What went wrong and what to do next.
 */
export function feedbackError(failure: FeedbackFailure, message: string): FeedbackError {
  return new FeedbackError({ failure, message });
}
