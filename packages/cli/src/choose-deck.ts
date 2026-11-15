import { isSafeName, SAFE_NAME_RULE } from '@deckster/brand';
import { Config, Effect, Option } from 'effect';

import type { CliError } from '#cli-error.ts';

import { cliError } from '#cli-error.ts';

/**
 * The `DECK` environment variable, read through Effect's configuration. An empty value counts as
 * unset.
 */
const DECK_FROM_ENV = Config.option(Config.String('DECK'));

/**
 * The deck a command works on: the first positional argument, else the `DECK` environment variable,
 * else the fallback.
 *
 * @param positional - The first positional argument, if any.
 * @param fallback - The deck to use when neither is set; `undefined` means "no deck".
 * @throws CliError in the error channel when the deck is not a kebab-case folder name, such as a
 *   path.
 */
export const chooseDeck = Effect.fn('chooseDeck')(function* (
  positional: string | undefined,
  fallback: string | undefined,
): Effect.fn.Return<string | undefined, CliError> {
  const fromEnv =
    positional === undefined
      ? yield* Effect.orElseSucceed(DECK_FROM_ENV, () => Option.none<string>())
      : Option.none<string>();
  const deck =
    positional ??
    Option.match(fromEnv, {
      onNone: () => fallback,
      onSome: (value) => (value === '' ? fallback : value),
    });
  if (deck !== undefined && !isSafeName(deck)) {
    return yield* cliError(
      `"${deck}" is not a deck name: a deck is named by its folder under decks/, ` +
        `in ${SAFE_NAME_RULE}.\n` +
        'Pass the folder name, not a path, such as `hello`.',
    );
  }

  return deck;
});
