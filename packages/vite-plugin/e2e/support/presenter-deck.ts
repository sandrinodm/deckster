import type { Browser, WebApp } from '@e2e-dev/web';

import { expect } from 'e2e';

import type { PageProblems } from './page-problems.ts';

/**
 * Slide ids of the hello deck, in manifest order.
 */
export const HELLO_SLIDES = ['title', 'steps', 'live-counter', 'closing'];

/**
 * The name the presenter popup is opened under, which `window.open` finds it by again.
 */
const PRESENTER_NAME = 'deck-presenter';

/**
 * Opens a URL and waits until the deck publishes `window.__deck`.
 *
 * @param fixtures - The test's `app`, `browser` and `problems` fixtures.
 * @param url - An absolute URL, such as `http://localhost:5331/#/2/0`.
 */
export async function openDeck(
  fixtures: { app: WebApp; browser: Browser; problems: PageProblems },
  url: string,
): Promise<void> {
  await fixtures.problems.navigate(() => fixtures.app.open(url));
  await expect.poll(() => fixtures.browser.evaluate(() => window.__deck !== undefined)).toBe(true);
}

/**
 * The text of an element in the presenter popup, or `null` while the popup or the element is not
 * there yet. The popup is same-origin, so the page can read it.
 *
 * @param browser - The audience window's browser fixture.
 * @param selector - A CSS selector in the presenter window.
 */
export function presenterText(browser: Browser, selector: string): Promise<string | null> {
  return browser.evaluate(
    (args: { name: string; selector: string }) => {
      const popup = window.open('', args.name);
      return popup?.document.querySelector(args.selector)?.textContent ?? null;
    },
    { name: PRESENTER_NAME, selector },
  );
}

/**
 * Whether an element exists in the presenter popup.
 *
 * @param browser - The audience window's browser fixture.
 * @param selector - A CSS selector in the presenter window.
 */
export function presenterHas(browser: Browser, selector: string): Promise<boolean> {
  return browser.evaluate(
    (args: { name: string; selector: string }) => {
      const popup = window.open('', args.name);
      return popup?.document.querySelector(args.selector) != null;
    },
    { name: PRESENTER_NAME, selector },
  );
}

/**
 * Presses a key in the presenter popup, as if the presenter had focused it.
 *
 * @param browser - The audience window's browser fixture.
 * @param key - A `KeyboardEvent.key` value.
 */
export function pressInPresenter(browser: Browser, key: string): Promise<null> {
  return browser.evaluate(
    (args: { name: string; key: string }) => {
      const popup = window.open('', args.name) as (Window & typeof globalThis) | null;
      popup?.dispatchEvent(new popup.KeyboardEvent('keydown', { key: args.key, bubbles: true }));
      return null;
    },
    { name: PRESENTER_NAME, key },
  );
}

/**
 * Clicks an element in the presenter popup.
 *
 * @param browser - The audience window's browser fixture.
 * @param selector - A CSS selector in the presenter window.
 */
export function clickInPresenter(browser: Browser, selector: string): Promise<null> {
  return browser.evaluate(
    (args: { name: string; selector: string }) => {
      const popup = window.open('', args.name);
      popup?.document.querySelector<HTMLElement>(args.selector)?.click();
      return null;
    },
    { name: PRESENTER_NAME, selector },
  );
}

/**
 * Focuses an element in the presenter popup and presses a key on it, as a presenter does after
 * clicking a button.
 *
 * @param browser - The audience window's browser fixture.
 * @param selector - A CSS selector in the presenter window.
 * @param key - A `KeyboardEvent.key` value.
 */
export function pressOnInPresenter(browser: Browser, selector: string, key: string): Promise<null> {
  return browser.evaluate(
    (args: { name: string; selector: string; key: string }) => {
      const popup = window.open('', args.name) as (Window & typeof globalThis) | null;
      const element = popup?.document.querySelector<HTMLElement>(args.selector);
      element?.focus();
      element?.dispatchEvent(
        new popup!.KeyboardEvent('keydown', { key: args.key, bubbles: true, cancelable: true }),
      );
      return null;
    },
    { name: PRESENTER_NAME, selector, key },
  );
}

/**
 * Closes the presenter popup, so no presenter window outlives its test and moves the next test's
 * deck over the shared channel. When none is open, the lookup opens a blank one, which is closed at
 * once too.
 *
 * @param browser - The audience window's browser fixture.
 */
export function closePresenter(browser: Browser): Promise<null> {
  return browser.evaluate((name: string) => {
    const popup = window.open('', name);
    popup?.close();
    return null;
  }, PRESENTER_NAME);
}
