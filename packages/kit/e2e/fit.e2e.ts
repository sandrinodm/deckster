import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import { openDeck, readFits, SETTLE_MS, slideCount, type FitReading } from './support/deck.ts';
import { test } from './support/page-problems.ts';

/**
 * The most key presses it takes to leave any exemplar slide: its steps, then the next slide.
 */
const MAX_PRESSES_PER_SLIDE = 8;

/**
 * How long to wait between key presses while stepping through a slide, in milliseconds.
 */
const PRESS_MS = 120;

/**
 * Waits for a while in the page, for transitions and entrances to finish.
 *
 * @param browser - The browser fixture.
 * @param ms - How long, in milliseconds.
 */
function wait(
  browser: { evaluate: (code: string) => Promise<unknown> },
  ms: number,
): Promise<unknown> {
  return browser.evaluate(`new Promise((resolve) => setTimeout(() => resolve(null), ${ms}))`);
}

describe('fitted text, live and static', () => {
  test('ends up the same size on every slide, moving forward and back live as in static mode', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/?static#/1/0');
    const total = await slideCount(browser);
    const statics: FitReading[][] = [];
    for (let slide = 1; slide <= total; slide += 1) {
      await openDeck(fixtures, `/?static#/${slide}/0`);
      statics.push(await readFits(browser));
    }

    await openDeck(fixtures, '/#/1/0');
    for (let slide = 2; slide <= total; slide += 1) {
      for (let press = 0; press < MAX_PRESSES_PER_SLIDE; press += 1) {
        await browser.keyboard.press('ArrowRight');
        await wait(browser, PRESS_MS);
        const hash = await browser.evaluate(() => window.location.hash);
        if (hash.startsWith(`#/${slide}/`)) {
          break;
        }
      }

      await wait(browser, SETTLE_MS);
      expect(await readFits(browser), `slide ${slide}, entered forward`).toEqual(
        statics[slide - 1],
      );
    }

    // Back through the deck, one slide at a time, as the presenter's back key does at step 0.
    for (let slide = total - 1; slide >= 1; slide -= 1) {
      await browser.evaluate((target: number) => {
        window.__deck!.goto(target - 1);
        return null;
      }, slide);
      await wait(browser, SETTLE_MS);
      expect(await readFits(browser), `slide ${slide}, entered back`).toEqual(statics[slide - 1]);
    }
  });
});
