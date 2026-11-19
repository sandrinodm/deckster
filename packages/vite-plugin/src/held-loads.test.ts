import { holdCode, resetCodeGate } from '@deckster/brand/node';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { trackHeldLoads } from '#held-loads.ts';

/**
 * A deck folder an agent turn may hold.
 */
const DECK = path.join('/workspace', 'decks', 'hello');

/**
 * That deck's config.
 */
const CONFIG = path.join(DECK, 'deck.config.ts');

/**
 * A brand folder an agent turn may hold.
 */
const BRAND = path.join('/workspace', 'brands', 'nocturne');

afterEach(() => {
  resetCodeGate();
});

describe('trackHeldLoads', () => {
  it('needs no reload when nothing was loaded during the hold', () => {
    const loads = trackHeldLoads();
    loads.note([CONFIG]);
    const hold = holdCode([DECK]);
    hold.release();
    expect(loads.released(DECK)).toBe(false);
  });

  it('needs a reload once for a file loaded while its folder was held', () => {
    const loads = trackHeldLoads();
    const hold = holdCode([DECK]);
    loads.note([CONFIG]);
    hold.release();
    expect(loads.released(DECK)).toBe(true);
    expect(loads.released(DECK)).toBe(false);
  });

  it('answers only for the folder whose hold ended', () => {
    const loads = trackHeldLoads();
    const hold = holdCode([DECK, BRAND]);
    loads.note([CONFIG, path.join(BRAND, 'brand.ts')]);
    hold.release();
    expect(loads.released(path.join('/workspace', 'decks', 'other'))).toBe(false);
    expect(loads.released(BRAND)).toBe(true);
    expect(loads.released(DECK)).toBe(true);
  });

  it('does not count a folder whose name only starts with the held one', () => {
    const loads = trackHeldLoads();
    const sibling = `${DECK}-b`;
    const hold = holdCode([sibling]);
    loads.note([path.join(sibling, 'deck.config.ts')]);
    hold.release();
    expect(loads.released(DECK)).toBe(false);
    expect(loads.released(sibling)).toBe(true);
  });
});
