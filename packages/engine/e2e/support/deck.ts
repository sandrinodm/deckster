import type { Browser, WebApp } from '@e2e-dev/web';

import { expect } from 'e2e';

import type { PageProblems } from './page-problems.ts';

/**
 * The port the hello deck's dev server listens on during the suite; a clash fails the run.
 */
export const DECK_PORT = 5199;

/**
 * Slide ids of the hello deck, in manifest order.
 */
export const HELLO_SLIDES = ['title', 'steps', 'live-counter', 'closing'];

/**
 * Step counts of the hello deck: `steps.mdx` has steps 0-3, the TSX slide 0-1.
 */
export const HELLO_STEP_COUNTS = [1, 4, 2, 1];

/**
 * The CSS selector of the slide on screen.
 */
const ACTIVE_SLIDE = '[data-slide-active="true"]';

/**
 * Opens the deck at a path relative to the dev server and waits until `window.__deck` is published.
 * What the previous document logged is collected first, so a reload loses nothing.
 *
 * @param fixtures - The test's `app`, `browser` and `problems` fixtures.
 * @param path - The path, query and hash to open, such as `/#/2/1`.
 */
export async function openDeck(
  fixtures: { app: WebApp; browser: Browser; problems: PageProblems },
  path: string,
): Promise<void> {
  await fixtures.problems.navigate(() => fixtures.app.open(path));
  await expect.poll(() => fixtures.browser.evaluate(() => window.__deck !== undefined)).toBe(true);
}

/**
 * The slide on screen.
 *
 * @param browser - The browser fixture.
 */
export function activeSlide(browser: Browser) {
  return browser.locator(ACTIVE_SLIDE);
}

/**
 * The list item inside `<Step at={at}>` on the slide on screen.
 *
 * @param browser - The browser fixture.
 * @param at - The step the item appears at.
 */
export function stepItem(browser: Browser, at: number) {
  return browser.locator(`${ACTIVE_SLIDE} [data-step="${at}"] li`);
}

/**
 * The TSX slide's paragraph that prints its current step.
 *
 * @param browser - The browser fixture.
 */
export function liveStep(browser: Browser) {
  return browser.locator(`${ACTIVE_SLIDE} [data-testid="live-step"]`);
}
