import { Console, Effect, Predicate } from 'effect';

import type { DeckProblemsError } from '#lint/deck-problems.ts';
import type { LintFinding } from '#lint/types.ts';

import { EXIT_FAILED } from '#command.ts';
import { describeError } from '#report-error.ts';

/**
 * The flag that makes a command print JSON.
 */
const JSON_FLAG = '--json';

/**
 * Spaces of indentation in printed JSON.
 */
const JSON_INDENT_SPACES = 2;

/**
 * What a `--json` command prints when it fails instead of producing its result.
 */
export type JsonFailure = {
  /**
   * Always `false`.
   */
  ok: false;

  /**
   * The failure: its kind (`CliError` for a bad command line, `DeckBuildError` for a deck that does
   * not exist or does not load, and so on), its message with the fix, and the findings of a deck
   * that cannot render.
   */
  error: { type: string; message: string; findings?: readonly LintFinding[] };
};

/**
 * Prints a value as indented JSON on standard output.
 *
 * @param value - Anything JSON can represent.
 */
export function printJson(value: unknown): Effect.Effect<void> {
  return Console.log(JSON.stringify(value, null, JSON_INDENT_SPACES));
}

/**
 * Whether a command line asks for JSON output. It is read from the raw arguments, so usage errors
 * found while parsing them are printed as JSON too.
 *
 * @param argv - The arguments after the command name.
 */
export function wantsJson(argv: readonly string[]): boolean {
  return argv.includes(JSON_FLAG);
}

/**
 * Runs a command; when its arguments ask for JSON, a failure is printed as a {@link JsonFailure} on
 * standard output and the command exits with 1 instead of failing. Defects still fail.
 *
 * @param argv - The arguments after the command name.
 * @param run - The command.
 */
export function withJsonErrors<E, R>(
  argv: readonly string[],
  run: Effect.Effect<number, E, R>,
): Effect.Effect<number, E, R> {
  if (!wantsJson(argv)) {
    return run;
  }

  return run.pipe(
    Effect.catch((error) => printJson(jsonFailure(error)).pipe(Effect.as(EXIT_FAILED))),
  );
}

/**
 * The JSON form of a failure.
 *
 * @param error - What the command failed with.
 */
function jsonFailure(error: unknown): JsonFailure {
  const { type, message } = describeError(error);
  if (Predicate.isTagged(error, 'DeckProblemsError')) {
    // Matched by tag, not `instanceof`, so this module need not import the plugin.
    return { ok: false, error: { type, message, findings: (error as DeckProblemsError).findings } };
  }

  return { ok: false, error: { type, message } };
}
