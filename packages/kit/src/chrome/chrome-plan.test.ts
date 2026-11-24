import type { ChromeTokens } from '@deckster/brand';
import type { BleedSide } from '@deckster/engine';

import { describe, expect, it } from 'vite-plus/test';

import {
  cornersCoveredByPlaced,
  formatPageNumber,
  planChrome,
  type ChromeBox,
  type ChromeInput,
} from '#chrome/chrome-plan.ts';

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
    hidden: Array.from({ length: 16 }, () => false),
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

  it('counts shown slides only for the page number, its total and the progress', () => {
    const hidden = Array.from({ length: 16 }, (_, slide) => slide === 1 || slide === 2);
    const plan = planChrome({ ...input(5), hidden });
    expect(plan.pageText).toBe('4 / 14');
    expect(plan.progress).toBe(4 / 14);
  });

  it('leaves the page number out of a hidden slide and keeps the last progress', () => {
    const hidden = Array.from({ length: 16 }, (_, slide) => slide === 4);
    const plan = planChrome({ ...input(4), hidden });
    expect(plan.corners['bottom-right']).toEqual(['footer']);
    expect(plan.corners['top-right']).toEqual(['logo']);
    expect(plan.pageText).toBe('');
    expect(plan.progress).toBe(4 / 15);
  });

  it('has no progress on a hidden slide before any shown slide', () => {
    const hidden = Array.from({ length: 16 }, (_, slide) => slide === 0);
    expect(
      planChrome({ ...input(0), hidden, chrome: { ...CHROME, skipFirst: false } }).progress,
    ).toBe(0);
  });

  it('skips the brand first-slide rule on the first shown slide', () => {
    const hidden = Array.from({ length: 16 }, (_, slide) => slide === 0);
    expect(planChrome({ ...input(1), hidden }).visible).toBe(false);
    expect(planChrome({ ...input(2), hidden }).visible).toBe(true);
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

  it('yields chrome off corners covered by placed elements in the header or footer band', () => {
    const margin = { x: 96, y: 72 };
    const headerRight: ChromeBox = [1400, 0, 424, 72];
    const footerRight: ChromeBox = [1400, 1008, 424, 72];
    const plan = planChrome({
      ...input(4),
      margin,
      placedBoxes: [headerRight, footerRight],
    });
    expect(plan.corners).toEqual({
      'top-left': ['logo'],
      'top-right': [],
      'bottom-left': ['footer', 'page'],
      'bottom-right': [],
    });
  });

  it('does not move chrome for placed boxes that stay strictly inside the safe area', () => {
    const margin = { x: 96, y: 72 };
    const safeTopRight: ChromeBox = [1400, 72, 424, 160];
    const safeBottomRight: ChromeBox = [1400, 848, 424, 160];
    const plan = planChrome({
      ...input(4),
      margin,
      placedBoxes: [safeTopRight, safeBottomRight],
    });
    expect(plan.corners).toEqual({
      'top-left': [],
      'top-right': ['logo'],
      'bottom-left': [],
      'bottom-right': ['footer', 'page'],
    });
  });

  it('drops chrome items when placed boxes cover both corners on the same edge', () => {
    const margin = { x: 96, y: 72 };
    const footerLeft: ChromeBox = [96, 1008, 400, 72];
    const footerRight: ChromeBox = [1424, 1008, 400, 72];
    const plan = planChrome({
      ...input(4),
      margin,
      placedBoxes: [footerLeft, footerRight],
    });
    expect(plan.corners['bottom-left']).toEqual([]);
    expect(plan.corners['bottom-right']).toEqual([]);
    expect(plan.corners['top-right']).toEqual(['logo']);
  });

  it('yields chrome for full-bleed canvas placed boxes that enter a corner band', () => {
    const margin = { x: 96, y: 72 };
    const fullRightPanel: ChromeBox = [1440, 0, 480, 1080];
    const plan = planChrome({
      ...input(4),
      margin,
      placedBoxes: [fullRightPanel],
    });
    expect(plan.corners['top-right']).toEqual([]);
    expect(plan.corners['top-left']).toEqual(['logo']);
    expect(plan.corners['bottom-right']).toEqual([]);
    expect(plan.corners['bottom-left']).toEqual(['footer', 'page']);
  });

  it('leaves chrome alone when a centered footer placed box sits between the left and right corners', () => {
    const margin = { x: 96, y: 72 };
    const footerCenter: ChromeBox = [760, 1008, 400, 72];
    expect(cornersCoveredByPlaced(footerCenter, margin)).toEqual([]);
    expect(planChrome({ ...input(4), margin, placedBoxes: [footerCenter] }).corners).toEqual({
      'top-left': [],
      'top-right': ['logo'],
      'bottom-left': [],
      'bottom-right': ['footer', 'page'],
    });
  });
});

describe('formatPageNumber', () => {
  it('fills in the slide number and the count wherever they appear', () => {
    expect(formatPageNumber('No. {n}', 7, 16)).toBe('No. 7');
    expect(formatPageNumber('{n} of {total}', 7, 16)).toBe('7 of 16');
  });
});
