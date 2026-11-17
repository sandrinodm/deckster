import { isSafeName, SAFE_NAME_RULE } from '@deckster/brand';
import { Config, Effect, FileSystem, Option } from 'effect';
import path from 'node:path';

import type { CliError } from '#cli-error.ts';

import { cliError } from '#cli-error.ts';
import { DEFAULT_DECK } from '#workspace.ts';

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
  return deck === undefined ? undefined : yield* checkDeckName(deck);
});

/**
 * Checks that a deck named on the command line is a folder name under `decks/`, so every command
 * reports a path such as `../x` the same way, before looking for the deck.
 *
 * @param deck - The deck as given.
 * @returns The same name.
 * @throws CliError in the error channel when the deck is not a kebab-case folder name, such as a
 *   path.
 */
export const checkDeckName = Effect.fn('checkDeckName')(function* (
  deck: string,
): Effect.fn.Return<string, CliError> {
  if (!isSafeName(deck)) {
    return yield* cliError(
      `"${deck}" is not a deck name: a deck is named by its folder under decks/, ` +
        `in ${SAFE_NAME_RULE}.\n` +
        'Pass the folder name, not a path, such as `hello`.',
    );
  }

  return deck;
});

/**
 * The deck a command uses when none is named: `hello` when the workspace has it, else the only deck
 * the workspace has (a user's folder usually holds one talk), else `hello` again so the error names
 * a deck the reader knows. A deck is a folder of `decks/` with a `deck.config.ts`.
 *
 * @param workspaceRoot - The absolute workspace root.
 */
export const defaultDeck = Effect.fn('defaultDeck')(function* (
  workspaceRoot: string,
): Effect.fn.Return<string, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const folders = yield* fs
    .readDirectory(path.join(workspaceRoot, 'decks'))
    .pipe(Effect.orElseSucceed((): string[] => []));
  const decks: string[] = [];
  for (const name of folders.sort()) {
    const config = path.join(workspaceRoot, 'decks', name, 'deck.config.ts');
    if (yield* Effect.orElseSucceed(fs.exists(config), () => false)) {
      decks.push(name);
    }
  }

  const [only, ...others] = decks;
  if (decks.includes(DEFAULT_DECK)) {
    return DEFAULT_DECK;
  }

  return only !== undefined && others.length === 0 ? only : DEFAULT_DECK;
});
