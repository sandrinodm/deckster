import { Schema } from 'effect';

/**
 * A failure of a docs script that the person running it can fix: the message says what went wrong
 * and what to change, so the script prints it without a stack trace.
 */
export class DocsError extends Schema.TaggedError<DocsError>()('DocsError', {
  /**
   * What went wrong and what to change.
   */
  message: Schema.String,
}) {}

/**
 * Builds a {@link DocsError}.
 *
 * @param message - What went wrong and what to change.
 * @returns The error, to fail an effect with.
 */
export function docsError(message: string): DocsError {
  return new DocsError({ message });
}
