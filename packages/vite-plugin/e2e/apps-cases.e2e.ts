import type { Browser } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import { APPS_CASES_URL, useAppsCasesServer } from './support/apps-cases-server.ts';
import { test } from './support/page-problems.ts';
import { openDeck } from './support/presenter-deck.ts';

/**
 * The one-based slide numbers of the app cases deck.
 */
const SLIDE = {
  /**
   * A frame for an app the deck does not have, named at run time.
   */
  missing: 1,

  /**
   * An app that reports ready, then throws.
   */
  thrower: 2,

  /**
   * An external page on a host that does not answer (nothing listens on its port), with a
   * recording.
   */
  unreachable: 3,

  /**
   * An external page with no bridge.
   */
  noBridge: 4,
} as const;

useAppsCasesServer();

/**
 * Counts the elements on the slide on screen that match a selector.
 *
 * @param browser - The browser fixture.
 * @param selector - A CSS selector inside the slide.
 */
function count(browser: Browser, selector: string): Promise<number> {
  return browser.evaluate(
    (css: string) => document.querySelectorAll(`[data-slide-active="true"] ${css}`).length,
    selector,
  );
}

/**
 * The text of the first element on the slide on screen that matches a selector.
 *
 * @param browser - The browser fixture.
 * @param selector - A CSS selector inside the slide.
 */
function text(browser: Browser, selector: string): Promise<string> {
  return browser.evaluate(
    (css: string) => document.querySelector(`[data-slide-active="true"] ${css}`)?.textContent ?? '',
    selector,
  );
}

describe('an app the deck does not have', () => {
  test('shows a card that says so and never loads the deck inside itself', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${APPS_CASES_URL}#/${SLIDE.missing}/0`);
    await expect.poll(() => count(browser, '.kit-app[data-app-missing]')).toBe(1);
    expect(await text(browser, '[data-app-fallback]')).toContain('There is no app "not-there"');
    expect(await count(browser, 'iframe')).toBe(0);
    expect(
      await browser.evaluate(() => document.querySelectorAll('iframe[src*="not-there"]').length),
    ).toBe(0);
  });
});

describe('an app that throws', () => {
  test('is reported to the deck, which shows its card with the message clamped', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${APPS_CASES_URL}#/${SLIDE.thrower}/0`);
    await expect
      .poll(() => text(browser, '[data-app-fallback]'), { timeout: 8000 })
      .toContain('The thrower failed on purpose');
    const message = await browser.evaluate(() => {
      const element = document.querySelector<HTMLElement>(
        '[data-slide-active="true"] .kit-app-fallback-message',
      );
      const screen = element?.closest('.kit-app-screen')?.getBoundingClientRect();
      const box = element?.getBoundingClientRect();
      return element === null || screen === undefined || box === undefined
        ? null
        : {
            lines: Math.round(
              element.clientHeight / Number.parseFloat(getComputedStyle(element).lineHeight),
            ),
            inside: box.bottom <= screen.bottom && box.right <= screen.right,
          };
    });
    expect(message?.inside).toBe(true);
    expect(message?.lines).toBeLessThanOrEqual(6);
  });
});

describe('a host that does not answer', () => {
  test('plays the recording, and the presenter switches to the page and back', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${APPS_CASES_URL}#/${SLIDE.unreachable}/0`);
    await expect.poll(() => count(browser, 'video.kit-app-fallback-video')).toBe(1);
    expect(await text(browser, '.kit-app-tool[aria-pressed]')).toContain('Recording');
    await browser.locator('[data-slide-active="true"] .kit-app-tool[aria-pressed]').click();
    await expect.poll(() => count(browser, 'video.kit-app-fallback-video')).toBe(0);
    expect(await count(browser, 'iframe.kit-app-iframe')).toBe(1);
    await browser.keyboard.press('v');
    await expect.poll(() => count(browser, 'video.kit-app-fallback-video')).toBe(1);
    await expect(browser).toHaveURL(/#\/3\/0$/);
  });
});

describe('an outside page with no bridge', () => {
  test('shows a Return to deck control while it holds the keyboard, which gives it back', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${APPS_CASES_URL}#/${SLIDE.noBridge}/0`);
    await browser.frameLocator('iframe.kit-app-iframe').locator('#field').click();
    await expect.poll(() => count(browser, '.kit-app-release')).toBe(1);
    const visible = await browser.evaluate(() => {
      const control = document.querySelector('[data-slide-active="true"] .kit-app-release');
      const box = control?.getBoundingClientRect();
      const hit =
        box === undefined
          ? null
          : document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return control !== null && hit !== null && control?.contains(hit) === true;
    });
    expect(visible).toBe(true);
    await browser.keyboard.press('ArrowLeft');
    await expect(browser).toHaveURL(/#\/4\/0$/);
    await browser.locator('[data-slide-active="true"] .kit-app-release').click();
    await expect.poll(() => count(browser, '.kit-app-release')).toBe(0);
    await browser.keyboard.press('ArrowLeft');
    await expect(browser).toHaveURL(/#\/3\/0$/);
  });
});
