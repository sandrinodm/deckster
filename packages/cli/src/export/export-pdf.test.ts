import { describe, expect, it } from 'vite-plus/test';

import type { PageSlide } from '#browser/deck-page.ts';

import { documentLanguage, pageLabel } from '#export/export-pdf.ts';

/**
 * A slide at an index, with only what a label reads.
 *
 * @param index - The zero-based index.
 */
function slideAt(index: number): PageSlide {
  return { index } as PageSlide;
}

describe('pageLabel', () => {
  it('is the slide number, with the step after a dot when every step is exported', () => {
    expect(pageLabel({ slide: slideAt(2), stepLabel: null })).toBe('3');
    expect(pageLabel({ slide: slideAt(2), stepLabel: 0 })).toBe('3.1');
    expect(pageLabel({ slide: slideAt(2), stepLabel: 1 })).toBe('3.2');
  });
});

describe('documentLanguage', () => {
  it("is the brand's number locale, en-US without one", () => {
    expect(documentLanguage('de-DE')).toBe('de-DE');
    expect(documentLanguage('')).toBe('en-US');
    expect(documentLanguage(undefined)).toBe('en-US');
  });
});
