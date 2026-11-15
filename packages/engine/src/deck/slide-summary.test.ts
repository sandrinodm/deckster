import { describe, expect, it } from 'vite-plus/test';

import { resolveSlideIndex } from '#deck/slide-summary.ts';

const SLIDE_IDS = ['title', 'steps', 'closing'];

describe('resolveSlideIndex', () => {
  it('accepts zero-based indexes and slide ids', () => {
    expect(resolveSlideIndex(SLIDE_IDS, 0)).toBe(0);
    expect(resolveSlideIndex(SLIDE_IDS, 'closing')).toBe(2);
  });

  it('names the valid range for an index outside the deck', () => {
    expect(() => resolveSlideIndex(SLIDE_IDS, 3)).toThrow('from 0 to 2');
    expect(() => resolveSlideIndex(SLIDE_IDS, 1.5)).toThrow(RangeError);
  });

  it('lists the slide ids for an unknown id', () => {
    expect(() => resolveSlideIndex(SLIDE_IDS, 'intro')).toThrow(
      'Slide ids: title, steps, closing.',
    );
  });
});
