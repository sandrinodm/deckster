import type { Browser, WebApp } from '@e2e-dev/web';

import { expect } from 'e2e';

import type { PageProblems } from './page-problems.ts';

/**
 * The brands the suite renders the exemplars deck in, one target each.
 */
export const BRANDS = ['default', 'nocturne'] as const;

/**
 * One of {@link BRANDS}.
 */
export type Brand = (typeof BRANDS)[number];

/**
 * The port of the first brand's dev server; each later brand takes the next one.
 */
const FIRST_PORT = 5331;

/**
 * How long a slide transition and its entrance take at most in either brand, in milliseconds.
 */
export const SETTLE_MS = 1_800;

/**
 * The fixtures the helpers use.
 */
export type DeckFixtures = {
  /**
   * The app fixture, which opens paths on the deck's dev server.
   */
  app: WebApp;

  /**
   * The browser fixture.
   */
  browser: Browser;

  /**
   * The console problems the pages logged.
   */
  problems: PageProblems;
};

/**
 * What the kit's fitting decided for one element on the slide on screen.
 */
export type FitReading = {
  /**
   * The element's first two classes, to tell the elements apart.
   */
  element: string;

  /**
   * Its `data-fit` result, if it is fitted text.
   */
  fit: string | null;

  /**
   * The type step a fit ladder moved it to, if any.
   */
  step: string | null;

  /**
   * The text step a density measurement chose, if it is running text.
   */
  text: string | null;

  /**
   * The computed font size.
   */
  size: string;
};

/**
 * The port a brand's dev server listens on.
 *
 * @param brand - The brand.
 */
export function deckPort(brand: Brand): number {
  return FIRST_PORT + BRANDS.indexOf(brand);
}

/**
 * Opens the deck at a path and waits until it is ready (fonts and images loaded, text fitted).
 *
 * @param fixtures - The test's fixtures.
 * @param path - The path, query and hash, such as `/?static#/3/0`.
 */
export async function openDeck(fixtures: DeckFixtures, path: string): Promise<void> {
  await fixtures.problems.navigate(() => fixtures.app.open(path));
  await expect.poll(() => fixtures.browser.evaluate(() => window.__deck !== undefined)).toBe(true);
  await fixtures.browser.evaluate(() => window.__deck!.ready().then(() => null));
}

/**
 * The number of slides in the deck on screen.
 *
 * @param browser - The browser fixture.
 */
export function slideCount(browser: Browser): Promise<number> {
  return browser.evaluate(() => window.__deck!.slides.length);
}

/**
 * The brand the deck on screen renders in.
 *
 * @param browser - The browser fixture.
 */
export function deckBrand(browser: Browser): Promise<string | null> {
  return browser.evaluate(
    () => document.querySelector('[data-brand]')?.getAttribute('data-brand') ?? null,
  );
}

/**
 * What the kit fitted on the slide on screen: every fitted text and every measured run of text.
 *
 * @param browser - The browser fixture.
 */
export function readFits(browser: Browser): Promise<FitReading[]> {
  return browser.evaluate(() => {
    const slide = document.querySelector('[data-slide-active="true"]');
    const elements =
      slide?.querySelectorAll<HTMLElement>('[data-fit], .kit-prose[data-text]') ?? [];
    return Array.from(elements, (element) => ({
      element: element.className.split(' ').slice(0, 2).join('.'),
      fit: element.dataset['fit'] ?? null,
      step: element.dataset['kitStep'] ?? null,
      text: element.dataset['text'] ?? null,
      size: getComputedStyle(element).fontSize,
    }));
  });
}

/**
 * The top of the first element matching a selector on the slide on screen, in canvas pixels from
 * the top of the slide, or `null` when there is none.
 *
 * @param browser - The browser fixture.
 * @param selector - The element to measure.
 */
export function topOf(browser: Browser, selector: string): Promise<number | null> {
  return browser.evaluate((query: string) => {
    const slide = document.querySelector<HTMLElement>('[data-slide-active="true"]');
    const element = slide?.querySelector<HTMLElement>(query);
    if (!slide || !element) {
      return null;
    }

    return Math.round(element.getBoundingClientRect().top - slide.getBoundingClientRect().top);
  }, selector);
}
