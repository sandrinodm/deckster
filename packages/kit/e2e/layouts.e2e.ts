import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import { openDeck, readFits, topOf } from './support/deck.ts';
import { test } from './support/page-problems.ts';

/**
 * The exemplar slides the tests read, by their 1-based number in the deck.
 */
const SLIDES = {
  /**
   * The plain statement.
   */
  statement: 2,

  /**
   * The three section dividers.
   */
  dividers: [3, 8, 12],

  /**
   * The three stats slides: two, four and three stats.
   */
  stats: [4, 9, 15],

  /**
   * The sparse content slide.
   */
  sparse: 14,

  /**
   * The quote.
   */
  quote: 7,

  /**
   * The split whose photo bleeds to the left edge.
   */
  bleedLeft: 10,
} as const;

describe('the exemplar layouts in the browser', () => {
  test('stand every stats row on one line, whatever the header and footnote above and below it', async (fixtures) => {
    const tops: (number | null)[] = [];
    for (const slide of SLIDES.stats) {
      await openDeck(fixtures, `/?static#/${slide}/0`);
      tops.push(await topOf(fixtures.browser, '.kit-stat'));
    }

    expect(new Set(tops).size, `stats rules at ${tops.join(', ')}`).toBe(1);
  });

  test('line up the labels and deltas of a stats row when labels differ in length', async (fixtures) => {
    await openDeck(fixtures, `/?static#/${SLIDES.stats[1]}/0`);
    const deltas = await fixtures.browser.evaluate(() =>
      Array.from(
        document.querySelectorAll('[data-slide-active="true"] .kit-stat-delta'),
        (element) => Math.round(element.getBoundingClientRect().top),
      ),
    );
    expect(deltas).toHaveLength(4);
    expect(new Set(deltas).size).toBe(1);
  });

  test('set every divider title on the same bottom line, with or without a summary', async (fixtures) => {
    const bottoms: number[] = [];
    for (const slide of SLIDES.dividers) {
      await openDeck(fixtures, `/?static#/${slide}/0`);
      bottoms.push(
        await fixtures.browser.evaluate(() =>
          Math.round(
            document
              .querySelector('[data-slide-active="true"] .kit-section-title')!
              .getBoundingClientRect().bottom,
          ),
        ),
      );
    }

    expect(new Set(bottoms).size, `divider titles end at ${bottoms.join(', ')}`).toBe(1);
  });

  test('keep a divider title without a summary at its natural size', async (fixtures) => {
    await openDeck(fixtures, `/?static#/${SLIDES.dividers[1]}/0`);
    const fits = await readFits(fixtures.browser);
    expect(fits.map((reading) => reading.fit)).toContain('natural');
  });

  test('set statements and quotes in four lines at most', async (fixtures) => {
    for (const slide of [SLIDES.statement, SLIDES.quote]) {
      await openDeck(fixtures, `/?static#/${slide}/0`);
      const lines = await fixtures.browser.evaluate(() => {
        const text = document.querySelector<HTMLElement>(
          '[data-slide-active="true"] .kit-statement-text',
        )!;
        return Math.round(text.offsetHeight / Number.parseFloat(getComputedStyle(text).lineHeight));
      });
      expect(lines, `slide ${slide}`).toBeLessThanOrEqual(4);
    }
  });

  test('set sparse running text a step larger', async (fixtures) => {
    await openDeck(fixtures, `/?static#/${SLIDES.sparse}/0`);
    const prose = (await readFits(fixtures.browser)).find((reading) => reading.text !== null);
    expect(prose?.text).not.toBe('body');
  });

  test('move chrome off the corners a bleeding photo covers, to the other side', async (fixtures) => {
    await openDeck(fixtures, `/?static#/${SLIDES.bleedLeft}/0`);
    const corners = await fixtures.browser.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>('.kit-chrome-layer .kit-chrome-corner'),
        (corner) => corner.dataset['corner'] ?? '',
      ),
    );
    expect(corners).not.toContain('bottom-left');
    expect(corners).not.toContain('top-left');
    const pageShown = await fixtures.browser.evaluate(() =>
      Array.from(document.querySelectorAll('.kit-chrome-layer .kit-chrome-text')).some((text) =>
        /\d/u.test(text.textContent ?? ''),
      ),
    );
    expect(pageShown).toBe(true);
  });
});
