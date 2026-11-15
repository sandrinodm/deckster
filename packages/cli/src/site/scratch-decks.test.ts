import type { DeckLocation } from '@deckster/vite-plugin';

import { describe, expect, it } from 'vite-plus/test';

import { galleryDecks, isScratchDeck } from '#site/scratch-decks.ts';

/**
 * A deck location for a folder name.
 *
 * @param id - The deck folder name.
 */
function deck(id: string): DeckLocation {
  return {
    id,
    dir: `/w/decks/${id}`,
    configFile: `/w/decks/${id}/deck.config.ts`,
    slidesDir: `/w/decks/${id}/slides`,
  };
}

describe('galleryDecks', () => {
  const decks = ['hello', 'zz-eval-exec', 'exemplars', 'zz-trial', 'fizz-buzz'].map(deck);

  it('leaves the zz- decks out of the gallery by default and says which', () => {
    const { built, skipped } = galleryDecks(decks, false);
    expect(built.map((location) => location.id)).toEqual(['hello', 'exemplars', 'fizz-buzz']);
    expect(skipped.map((location) => location.id)).toEqual(['zz-eval-exec', 'zz-trial']);
  });

  it('keeps every deck with --include-scratch', () => {
    expect(galleryDecks(decks, true)).toEqual({ built: decks, skipped: [] });
  });

  it('only treats the zz- prefix as scratch', () => {
    expect(isScratchDeck('zz-eval-web')).toBe(true);
    expect(isScratchDeck('fizz')).toBe(false);
    expect(isScratchDeck('zzz')).toBe(false);
  });
});
