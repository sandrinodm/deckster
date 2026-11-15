import { Schema } from 'effect';

/**
 * An export step that failed: the browser could not capture a slide, a file could not be read or
 * written, a renderer or validator did not run. The message says what failed and what to do.
 */
export class ExportError extends Schema.TaggedError<ExportError>()('ExportError', {
  /**
   * What failed and what to run or change next.
   */
  message: Schema.String,
}) {}

/**
 * Builds an {@link ExportError} for something that failed, with the first line of its cause.
 *
 * @param action - What the export tried, such as `capture slide 3`.
 * @param cause - What was thrown, if anything.
 * @param fix - What to do about it, as a sentence.
 */
export function exportError(action: string, cause: unknown, fix: string): ExportError {
  const detail = causeLine(cause);
  return new ExportError({
    message: `Could not ${action}${detail === '' ? '' : `: ${detail}`}.\n${fix}`,
  });
}

/**
 * The first line of what was thrown, or an empty string for nothing.
 *
 * @param cause - What was thrown.
 */
function causeLine(cause: unknown): string {
  if (cause === undefined || cause === null) {
    return '';
  }

  const text = describe(cause);
  return text.split('\n')[0] ?? '';
}

/**
 * A thrown value as text.
 *
 * @param cause - What was thrown.
 */
function describe(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }

  return typeof cause === 'string' ? cause : (JSON.stringify(cause) ?? '');
}
