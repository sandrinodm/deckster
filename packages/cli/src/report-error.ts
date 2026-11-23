import type { DeckBuildError } from '@deckster/vite-plugin/errors';

import { Console, Effect, Predicate } from 'effect';

import { ViteError } from '#cli-error.ts';

/**
 * The tags of errors whose message already says what to do, so they print without a stack trace.
 */
const READABLE_TAGS = new Set([
  'CliError',
  'FileSystemError',
  'BrowserError',
  'SlideNotReadyError',
  'ShellError',
  'DeckProblemsError',
  'BrandError',
]);

/**
 * A failure as the CLI shows it: its kind, its message, and whether it is a bug to print with its
 * stack.
 */
export type DescribedError = {
  /**
   * The error's tag, such as `CliError`, or `Error` for anything untagged.
   */
  type: string;

  /**
   * What went wrong and what to do; the stack trace for a bug.
   */
  message: string;

  /**
   * `true` for errors the author can act on; `false` for bugs, which keep their stack.
   */
  readable: boolean;
};

/**
 * Prints a failure and sets a failing exit code. CLI, brand and deck errors already say what to do,
 * so they print without a stack trace, including when a Vite build wraps several deck errors.
 *
 * @param error - Whatever the command failed or died with.
 */
export const reportError = Effect.fn('reportError')(function* (error: unknown) {
  yield* Effect.sync(() => {
    process.exitCode = 1;
  });
  yield* Console.error(describeError(error).message);
});

/**
 * Describes a failure for the terminal or for `--json` output.
 *
 * @param error - Whatever the command failed or died with.
 */
export function describeError(error: unknown): DescribedError {
  if (isReadable(error)) {
    return { type: error._tag, message: error.message, readable: true };
  }

  const deckErrors = collectDeckErrors(error);
  if (deckErrors.length > 0) {
    return {
      type: 'DeckBuildError',
      message: deckErrors.map((deckError) => deckError.message).join('\n\n'),
      readable: true,
    };
  }

  const thrown = error instanceof ViteError ? error.cause : error;
  const message = thrown instanceof Error ? (thrown.stack ?? thrown.message) : String(thrown);
  return { type: thrown instanceof Error ? thrown.name : 'Error', message, readable: false };
}

/**
 * Finds every deck build error in a failure, looking through a {@link ViteError}'s cause and the
 * `errors` arrays that Vite and Rollup wrap around them.
 *
 * @param error - Whatever the command failed or died with.
 */
export function collectDeckErrors(error: unknown): DeckBuildError[] {
  if (isDeckBuildError(error)) {
    return [error];
  }

  if (error instanceof ViteError) {
    return collectDeckErrors(error.cause);
  }

  const wrapped = error instanceof Error && 'errors' in error ? error.errors : undefined;
  return Array.isArray(wrapped) ? wrapped.flatMap(collectDeckErrors) : [];
}

/**
 * Whether an error is one of the CLI's own readable errors, a brand error or a deck problems error,
 * told by its tag so this module loads neither the brand package nor the plugin.
 *
 * @param error - Any value.
 */
function isReadable(error: unknown): error is { _tag: string; message: string } {
  return (
    Predicate.hasProperty(error, '_tag') &&
    typeof error._tag === 'string' &&
    READABLE_TAGS.has(error._tag) &&
    Predicate.hasProperty(error, 'message') &&
    typeof error.message === 'string'
  );
}

/**
 * Whether an error is a deck build error, told by its tag: `deckster diff` against a git ref loads
 * that checkout's own plugin, whose error class is not this one, so `instanceof` would miss it.
 *
 * @param error - Any value.
 */
function isDeckBuildError(error: unknown): error is DeckBuildError {
  return (
    Predicate.hasProperty(error, '_tag') &&
    error._tag === 'DeckBuildError' &&
    Predicate.hasProperty(error, 'message') &&
    typeof error.message === 'string'
  );
}
