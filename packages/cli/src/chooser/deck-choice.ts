import { isSafeName } from '@deckster/brand';
import { deckCommand } from '@deckster/engine/command';
import { discoverDecks } from '@deckster/vite-plugin';
import { Effect, type FileSystem } from 'effect';

import { chooseDeck } from '#choose-deck.ts';
import { usageError, type CliError } from '#cli-error.ts';

/**
 * The resolved deck, or undefined when the command should serve the chooser.
 */
type DeckChoice = { readonly deck: string } | { readonly deck: undefined };

/**
 * Resolves the operator's deck: the argument, `DECK`, or the only discovered deck. With multiple
 * decks and no selection it returns undefined so the caller can launch the chooser. Fails for an
 * invalid explicit name or an empty workspace.
 */
export const chooseInteractiveDeck = Effect.fn('chooseInteractiveDeck')(function* (
  workspaceRoot: string,
  positional: string | undefined,
  command: 'dev' | 'present',
): Effect.fn.Return<DeckChoice, CliError, FileSystem.FileSystem> {
  const specified = yield* chooseDeck(positional, undefined);
  if (specified !== undefined) {
    return { deck: specified };
  }

  const discovered = yield* discoverDecks(workspaceRoot);
  const decks = discovered.filter((deck) => isSafeName(deck.id));
  const [only, ...others] = decks;
  if (only === undefined) {
    return yield* usageError(
      `No decks found under decks/. Run \`${deckCommand()} new <name>\` to create one.`,
      command,
    );
  }

  return { deck: others.length === 0 ? only.id : undefined };
});
