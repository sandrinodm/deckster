import type { DeckLocation } from '@deckster/vite-plugin';

/**
 * The prefix of a scratch deck's folder name (`decks/zz-eval-exec`): a throwaway deck, such as one
 * an agent made for a trial run, that the deploy gallery leaves out unless asked.
 */
export const SCRATCH_DECK_PREFIX = 'zz-';

/**
 * Whether a deck is a scratch deck, by its folder name.
 *
 * @param id - The deck folder name.
 */
export function isScratchDeck(id: string): boolean {
  return id.startsWith(SCRATCH_DECK_PREFIX);
}

/**
 * The decks a gallery build takes: every deck but the scratch ones, unless they are included.
 *
 * @param decks - The decks found in the workspace.
 * @param includeScratch - Whether to keep scratch decks.
 * @returns The decks to build and the scratch decks left out.
 */
export function galleryDecks(
  decks: readonly DeckLocation[],
  includeScratch: boolean,
): { built: DeckLocation[]; skipped: DeckLocation[] } {
  if (includeScratch) {
    return { built: [...decks], skipped: [] };
  }

  return {
    built: decks.filter((deck) => !isScratchDeck(deck.id)),
    skipped: decks.filter((deck) => isScratchDeck(deck.id)),
  };
}
