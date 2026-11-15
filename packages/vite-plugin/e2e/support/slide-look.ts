import type { Browser } from '@e2e-dev/web';

import { expect } from 'e2e';

import type { PageProblems } from './page-problems.ts';

/**
 * The part of the engine's `window.__deck` the brand suite uses.
 */
type DeckWindow = Window & {
  /**
   * The deck's automation API, once the deck has mounted.
   */
  __deck?: {
    /**
     * Resolves when fonts and the images on the slide on screen have loaded.
     */
    ready: () => Promise<void>;
  };
};

/**
 * What the active slide looks like, read from computed styles.
 */
export type SlideLook = {
  /**
   * The deck's `data-brand` attribute.
   */
  brand: string | null;

  /**
   * The slide's `data-surface` attribute.
   */
  surface: string | null;

  /**
   * The slide's background image, or its background color when it has no image.
   */
  background: string;

  /**
   * The computed font family of the layout's heading.
   */
  headingFont: string;

  /**
   * The computed color of the layout's heading.
   */
  headingColor: string;

  /**
   * The computed font size of the layout's heading.
   */
  headingSize: string;

  /**
   * How far the layout's content starts from the slide's left edge: the brand's margin.
   */
  paddingLeft: string;

  /**
   * The top-left radius of the layout's accent rule.
   */
  ruleRadius: string;

  /**
   * The background color of the layout's accent rule.
   */
  ruleColor: string;
};

/**
 * Opens one slide of the deck in static mode and reads the styles the brand controls.
 *
 * @param fixtures - The test's `browser` and `problems` fixtures.
 * @param url - The base URL of the dev server.
 * @param index - The zero-based slide index.
 * @throws Error when the slide has no default layout with a heading, an accent rule and a safe
 *   area.
 */
export async function readSlide(
  fixtures: { browser: Browser; problems: PageProblems },
  url: string,
  index: number,
): Promise<SlideLook> {
  const { browser, problems } = fixtures;
  await problems.navigate(() => browser.goto(`${url}?static#/${index + 1}/0`));
  await expect
    .poll(() => browser.evaluate(() => (window as DeckWindow).__deck !== undefined))
    .toBe(true);
  await browser.evaluate(() => (window as DeckWindow).__deck!.ready().then(() => null));
  return browser.evaluate(() => {
    const slide = document.querySelector<HTMLElement>('[data-slide-active="true"]');
    const layout = slide?.querySelector<HTMLElement>('[data-layout="default"]');
    const heading = layout?.querySelector<HTMLElement>('h1, h2');
    const rule = layout?.querySelector<HTMLElement>('.kit-default-rule');
    const safe = layout?.querySelector<HTMLElement>('.kit-safe');
    if (!slide || !layout || !heading || !rule || !safe) {
      throw new Error('The slide has no default layout with a heading.');
    }

    const slideStyle = getComputedStyle(slide);
    const background =
      slideStyle.backgroundImage === 'none'
        ? slideStyle.backgroundColor
        : slideStyle.backgroundImage;
    const headingStyle = getComputedStyle(heading);
    const ruleStyle = getComputedStyle(rule);
    return {
      brand: document.querySelector('[data-brand]')?.getAttribute('data-brand') ?? null,
      surface: slide.getAttribute('data-surface'),
      background,
      headingFont: headingStyle.fontFamily,
      headingColor: headingStyle.color,
      headingSize: headingStyle.fontSize,
      paddingLeft: getComputedStyle(safe).left,
      ruleRadius: ruleStyle.borderTopLeftRadius,
      ruleColor: ruleStyle.backgroundColor,
    };
  });
}
