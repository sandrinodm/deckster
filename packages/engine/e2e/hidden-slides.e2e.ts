import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import { activeSlide, openDeck } from './support/deck.ts';
import { HIDDEN_DECK_SLIDES, HIDDEN_URL, useHiddenDeckServer } from './support/hidden-deck.ts';
import { test } from './support/page-problems.ts';

/**
 * The page number the brand's chrome draws, such as `2 / 3`.
 */
const PAGE_NUMBER = '.kit-chrome-text.kit-numeric';

useHiddenDeckServer();

describe('hidden slides', () => {
  test('starts on the first slide and lists every slide with its hidden flag', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${HIDDEN_URL}/`);
    await expect(browser).toHaveURL(/#\/1\/0$/);

    const slides = await browser.evaluate(() =>
      window.__deck!.slides.map(({ id, hidden }) => ({ id, hidden })),
    );
    expect(slides.map((slide) => slide.id)).toEqual(HIDDEN_DECK_SLIDES);
    expect(slides.map((slide) => slide.hidden)).toEqual([false, true, false, true, true, false]);
  });

  test('skips hidden slides forward and backward, landing on the last step going back', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${HIDDEN_URL}/`);

    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/3\/0$/);
    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/3\/1$/);
    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/3\/2$/);

    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/6\/0$/);
    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/6\/0$/);

    await browser.keyboard.press('ArrowLeft');
    await expect(browser).toHaveURL(/#\/3\/2$/);
    await browser.keyboard.press('PageUp');
    await browser.keyboard.press('PageUp');
    await expect(browser).toHaveURL(/#\/3\/0$/);
    await browser.keyboard.press('ArrowLeft');
    await expect(browser).toHaveURL(/#\/1\/0$/);
  });

  test('jumps to the first and last shown slide with Home and End', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${HIDDEN_URL}/#/3/0`);
    await browser.keyboard.press('End');
    await expect(browser).toHaveURL(/#\/6\/0$/);
    await browser.keyboard.press('Home');
    await expect(browser).toHaveURL(/#\/1\/0$/);
  });

  test('opens a hidden slide by hash, number or id, and leaves it for the shown slides', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${HIDDEN_URL}/#/4/0`);
    await expect(activeSlide(browser)).toHaveAttribute('data-slide-id', 'backup-two');

    await openDeck(fixtures, `${HIDDEN_URL}/#/backup-three`);
    await expect(browser).toHaveURL(/#\/5\/0$/);
    await expect(activeSlide(browser)).toHaveAttribute('data-slide-id', 'backup-three');

    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/6\/0$/);
    await browser.keyboard.press('ArrowLeft');
    await expect(browser).toHaveURL(/#\/3\/2$/);
  });

  test('goto lands on a hidden slide', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${HIDDEN_URL}/`);
    await browser.evaluate(() => {
      window.__deck!.goto('backup-one');
      return null;
    });
    await expect(browser).toHaveURL(/#\/2\/0$/);
    await expect(activeSlide(browser)).toHaveAttribute('data-slide-id', 'backup-one');
  });

  test('numbers pages over shown slides only and gives a hidden slide no page number', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${HIDDEN_URL}/#/3/0`);
    await expect(browser.locator(PAGE_NUMBER)).toHaveText('2 / 3');

    await openDeck(fixtures, `${HIDDEN_URL}/#/6/0`);
    await expect(browser.locator(PAGE_NUMBER)).toHaveText('3 / 3');

    await openDeck(fixtures, `${HIDDEN_URL}/#/4/0`);
    await expect(activeSlide(browser)).toHaveAttribute('data-slide-id', 'backup-two');
    await expect(browser.locator(PAGE_NUMBER)).toHaveCount(0);
  });
});
