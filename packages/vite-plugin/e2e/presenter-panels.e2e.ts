import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import { useBrandServers } from './support/brand-servers.ts';
import { BRANDS, brandUrl } from './support/brands.ts';
import { test } from './support/page-problems.ts';
import { HELLO_SLIDES, openDeck } from './support/presenter-deck.ts';

useBrandServers();

describe('the slide sidebar', () => {
  for (const brand of BRANDS) {
    test(`opens with s, resizes the stage beside it and jumps on click in the ${brand} brand`, async (fixtures) => {
      const { browser } = fixtures;
      await openDeck(fixtures, `${brandUrl(brand)}#/1/0`);
      await expect(browser.locator('.dp-sidebar')).toBeHidden();

      await browser.keyboard.press('s');
      await expect(browser.locator('.dp-sidebar')).toBeVisible();
      await expect(browser.locator('.dp-sidebar .dp-row')).toHaveCount(HELLO_SLIDES.length);
      const stage = await browser.evaluate(() => {
        const box = document.querySelector('.dp-stage')?.getBoundingClientRect();
        return { left: box?.left ?? -1, width: box?.width ?? -1, viewport: window.innerWidth };
      });
      expect(stage.left).toBe(264);
      expect(stage.left + stage.width).toBe(stage.viewport);

      await browser.locator('.dp-sidebar .dp-row[data-slide-index="2"]').click();
      await expect(browser).toHaveURL(/#\/3\/0$/);
      await expect(browser.locator('.dp-row[data-slide-index="2"]')).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(browser.locator('.dp-row[data-slide-index="1"] .dp-chip').first()).toContainText(
        '3 steps',
      );

      await browser.keyboard.press('s');
      await expect(browser.locator('.dp-sidebar')).toBeHidden();
    });
  }

  test('remembers that it is open across a reload', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/1/0`);
    await browser.evaluate(() => {
      window.localStorage.removeItem('deck-presenter:sidebar');
      return null;
    });
    await browser.keyboard.press('s');
    await expect(browser.locator('.dp-sidebar')).toBeVisible();
    await openDeck(fixtures, `${brandUrl('default')}#/1/0`);
    await expect(browser.locator('.dp-sidebar')).toBeVisible();
    await browser.keyboard.press('s');
    await openDeck(fixtures, `${brandUrl('default')}#/1/0`);
    await expect(browser.locator('.dp-sidebar')).toBeHidden();
  });
});

describe('the overview', () => {
  test('picks a slide with the arrow keys and Enter, or a click, and closes with Escape', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/2/0`);
    await browser.keyboard.press('o');
    await expect(browser.locator('.dp-overview')).toBeVisible();
    await expect(browser.locator('.dp-cell')).toHaveCount(HELLO_SLIDES.length);
    await expect(browser.locator('.dp-cell[aria-selected="true"]')).toHaveAttribute(
      'data-slide-index',
      '1',
    );

    await browser.keyboard.press('ArrowRight');
    await browser.keyboard.press('ArrowRight');
    await expect(browser.locator('.dp-cell[aria-selected="true"]')).toHaveAttribute(
      'data-slide-index',
      '3',
    );
    await browser.keyboard.press('Enter');
    await expect(browser.locator('.dp-overview')).toBeHidden();
    await expect(browser).toHaveURL(/#\/4\/0$/);

    await browser.keyboard.press('o');
    await browser.locator('.dp-cell[data-slide-index="0"]').click();
    await expect(browser).toHaveURL(/#\/1\/0$/);

    await browser.keyboard.press('o');
    await browser.keyboard.press('Escape');
    await expect(browser.locator('.dp-overview')).toBeHidden();
    await expect(browser).toHaveURL(/#\/1\/0$/);
  });
});

describe('go to a slide', () => {
  test('g, a number and Enter move the deck; a number that does not exist keeps the prompt', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/1/0`);
    await browser.keyboard.press('g');
    await expect(browser.locator('.dp-goto')).toBeVisible();
    await browser.keyboard.press('3');
    await browser.keyboard.press('Enter');
    await expect(browser).toHaveURL(/#\/3\/0$/);
    await expect(browser.locator('.dp-goto')).toBeHidden();

    await browser.keyboard.press('g');
    await browser.keyboard.press('9');
    await browser.keyboard.press('Enter');
    await expect(browser.locator('.dp-goto')).toBeVisible();
    await expect(browser).toHaveURL(/#\/3\/0$/);
    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/3\/0$/);
    await browser.keyboard.press('Escape');
    await expect(browser.locator('.dp-goto')).toBeHidden();
  });
});

describe('blackout and whiteout', () => {
  test('b covers the slide in black, w in white, and the same key or Escape uncovers it', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/1/0`);
    await browser.keyboard.press('b');
    await expect(browser.locator('.dp-blackout[data-mode="black"]')).toBeVisible();
    await browser.keyboard.press('b');
    await expect(browser.locator('.dp-blackout')).toBeHidden();

    await browser.keyboard.press('w');
    await expect(browser.locator('.dp-blackout[data-mode="white"]')).toBeVisible();
    await browser.keyboard.press('Escape');
    await expect(browser.locator('.dp-blackout')).toBeHidden();
  });
});

describe('the help overlay', () => {
  test('lists every registered shortcut and closes with Escape', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/1/0`);
    await browser.keyboard.press('?');
    await expect(browser.locator('dialog[aria-label="Keyboard shortcuts"]')).toBeVisible();
    for (const id of [
      'navigation.goto',
      'presenting.fullscreen',
      'presenting.blackout',
      'presenting.laser',
      'panels.presenter',
      'panels.sidebar',
      'panels.overview',
      'panels.help',
    ]) {
      await expect(browser.locator(`[data-shortcut="${id}"]`)).toBeVisible();
    }

    await browser.keyboard.press('Escape');
    await expect(browser.locator('dialog[aria-label="Keyboard shortcuts"]')).toBeHidden();
  });
});

describe('the laser pointer', () => {
  test('l puts a dot under the cursor, and l again removes it', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${brandUrl('default')}#/1/0`);
    await browser.keyboard.press('l');
    await browser.mouse.move(700, 400);
    await expect(browser.locator('.dp-laser[data-laser="local"]')).toBeVisible();
    await browser.keyboard.press('l');
    await expect(browser.locator('.dp-laser')).toBeHidden();
  });
});
