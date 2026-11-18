import { describe, expect, it } from 'vite-plus/test';

import type { DeckManifest } from '#contract/manifest.ts';

import {
  areShownNeighbours,
  hiddenSlides,
  neighbourShownSlide,
  shownPageNumber,
  shownSlideIndexes,
} from '#navigation/shown-slides.ts';

const HIDDEN = [true, false, true, true, false, true];

describe('hiddenSlides', () => {
  it('reads the hidden flag of each slide', () => {
    const slide = (hidden?: boolean) => ({
      module: { slideMeta: { frontmatter: { layout: 'default', hidden } } },
    });
    const manifest = { slides: [slide(), slide(true), slide(false)] } as unknown as DeckManifest;
    expect(hiddenSlides(manifest)).toEqual([false, true, false]);
  });
});

describe('shownSlideIndexes', () => {
  it('lists the slides that are not hidden', () => {
    expect(shownSlideIndexes(HIDDEN)).toEqual([1, 4]);
  });

  it('lists every slide when all are hidden', () => {
    expect(shownSlideIndexes([true, true])).toEqual([0, 1]);
  });
});

describe('neighbourShownSlide', () => {
  it('finds the nearest shown slide on each side', () => {
    expect(neighbourShownSlide(HIDDEN, 1, 'forward')).toBe(4);
    expect(neighbourShownSlide(HIDDEN, 4, 'backward')).toBe(1);
  });

  it('starts from a hidden slide', () => {
    expect(neighbourShownSlide(HIDDEN, 2, 'forward')).toBe(4);
    expect(neighbourShownSlide(HIDDEN, 2, 'backward')).toBe(1);
  });

  it('returns undefined past the shown slides', () => {
    expect(neighbourShownSlide(HIDDEN, 4, 'forward')).toBeUndefined();
    expect(neighbourShownSlide(HIDDEN, 0, 'backward')).toBeUndefined();
  });
});

describe('shownPageNumber', () => {
  it('counts shown slides from 1 and gives a hidden slide none', () => {
    expect(shownPageNumber(HIDDEN, 1)).toBe(1);
    expect(shownPageNumber(HIDDEN, 4)).toBe(2);
    expect(shownPageNumber(HIDDEN, 2)).toBeUndefined();
  });
});

describe('areShownNeighbours', () => {
  it('is true for slides with no shown slide between them', () => {
    expect(areShownNeighbours(HIDDEN, 1, 4)).toBe(true);
    expect(areShownNeighbours(HIDDEN, 4, 1)).toBe(true);
    expect(areShownNeighbours(HIDDEN, 1, 2)).toBe(true);
  });

  it('is false for a slide and itself or with a shown slide between', () => {
    expect(areShownNeighbours(HIDDEN, 1, 1)).toBe(false);
    expect(areShownNeighbours(HIDDEN, 0, 5)).toBe(false);
    expect(areShownNeighbours([false, false, false], 0, 2)).toBe(false);
  });
});
