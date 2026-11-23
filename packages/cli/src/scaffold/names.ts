import { isSafeName, MAX_NAME_LENGTH } from '@deckster/brand';
import { Effect } from 'effect';

import { cliError, type CliError } from '#cli-error.ts';

/**
 * Names that would collide with a `deckster new` subcommand.
 */
const RESERVED_DECK_NAMES = new Set(['slide', 'app']);

/**
 * Checks a deck, slide or layout name.
 *
 * @param kind - What the name identifies, for the message ("deck", "slide id").
 * @param name - The name to check.
 * @returns The same name.
 * @throws CliError in the error channel when the name is not kebab-case (`isSafeName` from
 *   `@deckster/brand`), or is reserved.
 */
export const assertKebabName = Effect.fn('assertKebabName')(function* (
  kind: string,
  name: string,
): Effect.fn.Return<string, CliError> {
  const reserved = RESERVED_DECK_NAMES.has(name);
  if (reserved || !isSafeName(name)) {
    const hint = reserved ? 'is reserved' : 'must be kebab-case';
    return yield* cliError(
      `The ${kind} "${name}" ${hint}. ` +
        `Use lowercase words joined by hyphens, at most ${MAX_NAME_LENGTH} characters, ` +
        `such as "request-flow".`,
    );
  }

  return name;
});

/**
 * Turns a kebab-case name into a title: `request-flow` becomes `Request flow`.
 *
 * @param name - A kebab-case name.
 */
export function titleFromName(name: string): string {
  const words = name.split('-').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
