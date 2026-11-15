import type { ChromeTokens } from '@deckster/brand';
import type { BleedSide } from '@deckster/engine';

import { describe, expect, it } from 'vite-plus/test';

import { formatPageNumber, planChrome, type ChromeInput } from '#chrome/chrome-plan.ts';

const CHROME: ChromeTokens = {
  pageNumber: { show: true, format: '{n} / {total}', corner: 'bottom-right' },
  footer: { show: true, text: 'Confidential', corner: 'bottom-right' },
  progress: { show: true, edge: 'top', thickness: 3 },
  logo: { show: true },
  skipFirst: true,
};

/**
 * A chrome input for slide `index` of a 16-slide deck.
 */
function input(
  index: number,
  frontmatter: Record<string, unknown> = {},
  bleed: BleedSide[] = [],
): ChromeInput {
  return {
    chrome: CHROME,
    logoCorner: 'top-right',
    index,
    total: 16,
    frontmatter: { layout: 'content', ...frontmatter },
    bleed,
  };
}

describe('planChrome', () => {
  it('places each item in its corner, logo outermost, and formats the page number', () => {
    const plan = planChrome(input(2));
    expect(plan.visible).toBe(true);
    expect(plan.corners).toEqual({
      'top-left': [],
      'top-right': ['logo'],
      'bottom-left': [],
      'bottom-right': ['footer', 'page'],
    });
    expect(plan.pageText).toBe('3 / 16');
    expect(plan.progress).toBe(3 / 16);
  });

  it('hides on the first slide when the brand skips it, and on slides that turn it off', () => {
    expect(planChrome(input(0)).visible).toBe(false);
    expect(planChrome({ ...input(0), chrome: { ...CHROME, skipFirst: false } }).visible).toBe(true);
    expect(planChrome(input(5, { chrome: false })).visible).toBe(false);
  });

  it('leaves out items the brand does not show, and an empty footer', () => {
    const chrome = { ...CHROME, logo: { show: false }, footer: { ...CHROME.footer, text: '' } };
    expect(planChrome({ ...input(3), chrome }).corners['bottom-right']).toEqual(['page']);
    expect(planChrome({ ...input(3), chrome }).corners['top-right']).toEqual([]);
  });

  it('moves the items of a corner bleeding media covers to the corner across the slide', () => {
    const right = planChrome(input(4, {}, ['right']));
    expect(right.corners).toEqual({
      'top-left': ['logo'],
      'top-right': [],
      'bottom-left': ['footer', 'page'],
      'bottom-right': [],
    });
    const left = planChrome({
      ...input(4, {}, ['left']),
      chrome: { ...CHROME, pageNumber: { ...CHROME.pageNumber, corner: 'bottom-left' } },
    });
    expect(left.corners['bottom-left']).toEqual([]);
    expect(left.corners['bottom-right']).toEqual(['footer', 'page']);
    expect(left.corners['top-right']).toEqual(['logo']);
  });

  it('drops the items of a corner when the corner across is covered too', () => {
    const plan = planChrome(input(4, {}, ['left', 'right']));
    expect(Object.values(plan.corners).flat()).toEqual([]);
  });

  it('keeps every corner when nothing bleeds', () => {
    expect(planChrome(input(4)).corners['bottom-right']).toEqual(['footer', 'page']);
  });
});

describe('formatPageNumber', () => {
  it('fills in the slide number and the count wherever they appear', () => {
    expect(formatPageNumber('No. {n}', 7, 16)).toBe('No. 7');
    expect(formatPageNumber('{n} of {total}', 7, 16)).toBe('7 of 16');
  });
});
