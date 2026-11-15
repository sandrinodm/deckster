import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import { activeSlide, openDeck } from './support/deck.ts';
import { test } from './support/page-problems.ts';

describe('Space on interactive content', () => {
  test('works a focused button, summary, link or role=button and leaves the deck alone', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/#/2/0');
    await browser.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="controls" style="position:fixed;top:0;left:0;z-index:9">' +
          '<button id="button" type="button">button</button>' +
          '<details><summary id="summary">more</summary>details</details>' +
          '<a id="link" href="#/2/0">link</a>' +
          '<div id="role" role="button" tabindex="0">role</div></div>',
      );
      const clicks: string[] = [];
      Reflect.set(window, '__clicks', clicks);
      document.getElementById('button')?.addEventListener('click', () => clicks.push('button'));
      return null;
    });
    for (const id of ['button', 'summary', 'link', 'role']) {
      await browser.locator(`#${id}`).press('Space');
      await expect(browser).toHaveURL(/#\/2\/0$/);
    }

    const clicked = await browser.evaluate(() => Reflect.get(window, '__clicks') as string[]);
    expect(clicked).toEqual(['button']);
    expect(await browser.evaluate(() => document.querySelector('details')?.open ?? false)).toBe(
      true,
    );
  });
});

describe('moves faster than the slides mount', () => {
  test('six key presses in one task do not skip the steps of a slide that was not mounted', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/#/1/0');
    await browser.evaluate(() => {
      for (let press = 0; press < 6; press += 1) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      }

      return null;
    });
    await expect(browser).toHaveURL(/#\/3\/1$/);
  });
});

describe('rejected hashes', () => {
  test('a hash that names no slide, or an empty one, is replaced with the position', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/#/2/1');
    for (const hash of ['#/99', '', '#/steps/x']) {
      await browser.evaluate((next: string) => {
        window.location.hash = next;
        return null;
      }, hash);
      await expect(browser).toHaveURL(/#\/2\/1$/);
    }
  });

  test('a step past the last one is replaced with the last step', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/#/2/3');
    await browser.evaluate(() => {
      window.location.hash = '#/2/9';
      return null;
    });
    await expect(browser).toHaveURL(/#\/2\/3$/);
  });
});

describe('mouse navigation', () => {
  test('a left click moves forward and a right click back', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/#/2/0');
    await activeSlide(browser).click();
    await expect(browser).toHaveURL(/#\/2\/1$/);
    await activeSlide(browser).click();
    await expect(browser).toHaveURL(/#\/2\/2$/);
    await activeSlide(browser).secondaryTap();
    await expect(browser).toHaveURL(/#\/2\/1$/);
  });

  test('a click that ends a text selection does not move the deck', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/#/1/0');
    await browser.evaluate(() => {
      const heading = document.querySelector('[data-slide-active="true"] h1');
      const range = document.createRange();
      range.selectNodeContents(heading!);
      window.getSelection()?.addRange(range);
      heading?.dispatchEvent(
        new MouseEvent('click', { button: 0, bubbles: true, cancelable: true }),
      );
      return null;
    });
    await expect(browser).toHaveURL(/#\/1\/0$/);
  });

  test('a double-click on a word selects it and leaves the deck where it was', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/#/2/0');
    await browser.locator('[data-slide-active="true"] h2').dblclick();
    await expect(browser).toHaveURL(/#\/2\/0$/);
    const selected = await browser.evaluate(() => window.getSelection()?.toString().trim() ?? '');
    expect(selected).not.toBe('');
  });
});

describe('slide sections', () => {
  test('say where each stage slide stands and which way the deck moved', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, '/#/2/3');
    await browser.keyboard.press('ArrowRight');
    await expect(browser.locator('[data-slide-id="steps"]')).toHaveAttribute(
      'data-slide-state',
      'past',
    );
    await expect(activeSlide(browser)).toHaveAttribute('data-slide-state', 'current');
    await expect(activeSlide(browser)).toHaveAttribute('data-direction', 'forward');
    await expect(browser.locator('[data-slide-id="closing"]')).toHaveAttribute(
      'data-slide-state',
      'future',
    );
  });
});
