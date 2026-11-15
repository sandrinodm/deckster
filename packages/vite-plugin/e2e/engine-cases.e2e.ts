import type { Browser } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';
import { build } from 'vite-plus';

import type { PageProblems } from './support/page-problems.ts';

import { CASE_TARGETS, fixtureConfig, useCaseServers } from './support/case-servers.ts';
import { test } from './support/page-problems.ts';

/**
 * The part of `window.__deck` these tests use.
 */
type DeckWindow = Window & {
  /**
   * The deck's automation API, once the deck has mounted.
   */
  __deck?: {
    /**
     * Resolves once the slides it covers are ready to capture.
     */
    ready: () => Promise<void>;

    /**
     * The slides, with step counts once known.
     */
    slides: readonly { id: string; stepCount: number | undefined }[];

    /**
     * The slide and step on screen.
     */
    position: { slide: number; step: number };

    /**
     * Shows a slide at a step.
     */
    goto: (slide: number, step: number) => void;
  };
};

/**
 * The selector of the slide on screen.
 */
const ACTIVE = '[data-slide-active="true"]';

useCaseServers();

/**
 * Opens a page of the cases deck and waits until `window.__deck` is published.
 *
 * @param fixtures - The test's `browser` and `problems` fixtures.
 * @param url - The full URL to open.
 */
async function openCases(
  fixtures: { browser: Browser; problems: PageProblems },
  url: string,
): Promise<void> {
  const { browser, problems } = fixtures;
  await problems.navigate(() => browser.goto(url));
  await expect
    .poll(() => browser.evaluate(() => (window as DeckWindow).__deck !== undefined))
    .toBe(true);
}

/**
 * The step counts `window.__deck.slides` reports right after `ready()` resolves.
 *
 * @param browser - The browser fixture.
 */
function stepCountsAfterReady(browser: Browser): Promise<(number | null)[]> {
  return browser.evaluate(async () => {
    const deck = (window as DeckWindow).__deck!;
    await deck.ready();
    return deck.slides.map((slide) => slide.stepCount ?? null);
  });
}

for (const target of CASE_TARGETS) {
  describe(`readiness, served by the ${target.name}`, () => {
    test('ready() waits for steps a slide registers after 600 ms', async (fixtures) => {
      await openCases(fixtures, `${target.url}#/1/0`);
      const counts = await stepCountsAfterReady(fixtures.browser);
      expect(counts[0]).toBe(5);
    });

    test('ready() in static mode counts late, conditional and gapped steps on every slide', async (fixtures) => {
      await openCases(fixtures, `${target.url}?static#/1/0`);
      expect(await stepCountsAfterReady(fixtures.browser)).toEqual([5, 3, 1, 1, 1]);
    });

    test('a hash naming a step that registers late lands on it, never reporting step 0', async (fixtures) => {
      const { browser } = fixtures;
      await openCases(fixtures, `${target.url}#/1/4`);
      const pending = await browser.evaluate(() => ({
        position: (window as DeckWindow).__deck!.position,
        hash: window.location.hash,
      }));
      expect(pending).toEqual({ position: { slide: 0, step: 4 }, hash: '#/1/4' });
      const landed = await browser.evaluate(async () => {
        const deck = (window as DeckWindow).__deck!;
        await deck.ready();
        return deck.position;
      });
      expect(landed).toEqual({ slide: 0, step: 4 });
      await expect(browser.locator(`${ACTIVE} [data-step="4"]`)).toHaveAttribute(
        'data-step-state',
        'current',
      );
      await expect(browser).toHaveURL(/#\/1\/4$/);
    });

    test('goto() a late step right after load lands on it in static mode once ready()', async (fixtures) => {
      const { browser } = fixtures;
      await openCases(fixtures, `${target.url}?static#/2/0`);
      const landed = await browser.evaluate(async () => {
        const deck = (window as DeckWindow).__deck!;
        deck.goto(0, 3);
        await deck.ready();
        return {
          position: deck.position,
          state:
            document
              .querySelector('[data-slide-active="true"] [data-step="3"]')
              ?.getAttribute('data-step-state') ?? null,
        };
      });
      expect(landed).toEqual({ position: { slide: 0, step: 3 }, state: 'current' });
    });

    test('ready() waits for CSS background images', async (fixtures) => {
      const { browser } = fixtures;
      // A dev page loads more modules than the default 250 resource entries hold.
      await browser.addInitScript(() => performance.setResourceTimingBufferSize(10_000));
      await openCases(fixtures, `${target.url}#/3/0`);
      const loaded = await browser.evaluate(async () => {
        await (window as DeckWindow).__deck!.ready();
        // A resource entry is added once the response has fully arrived.
        const entries = performance.getEntriesByType('resource');
        return entries.some((entry) => entry.name.endsWith('/pattern.svg'));
      });
      expect(loaded).toBe(true);
    });

    test('a layout gets MDX and TSX content sorted into its slots', async (fixtures) => {
      const { browser } = fixtures;
      await openCases(fixtures, `${target.url}#/4/0`);
      const layout = `${ACTIVE} [data-layout="columns"]`;
      await expect(browser.locator(layout)).toHaveAttribute('data-gap', 'loose');
      await expect(browser.locator(`${layout} header`)).toHaveText('Slots in MDX');
      await expect(
        browser.locator(`${layout} [data-column="left"] [data-slot="left"] li`),
      ).toHaveText('The claim sits on the left');
      await expect(
        browser.locator(`${layout} [data-column="right"] [data-testid="counter"]`),
      ).toBeVisible();

      await openCases(fixtures, `${target.url}#/5/0`);
      await expect(browser.locator(`${ACTIVE} header`)).toHaveText('Slots in TSX');
      await expect(browser.locator(`${ACTIVE} [data-column="right"]`)).toHaveText(
        'Right from an export',
      );
    });
  });
}

describe('interactive content inside a slide', () => {
  test('a click on a button, or Space on it, works the button and does not move the deck', async (fixtures) => {
    const { browser } = fixtures;
    await openCases(fixtures, `${CASE_TARGETS[0].url}#/4/0`);
    const counter = browser.locator(`${ACTIVE} [data-testid="counter"]`);
    await counter.click();
    await expect(counter).toHaveText('Clicked 1');
    await counter.secondaryTap();
    await counter.press('Space');
    await expect(counter).toHaveText('Clicked 2');
    await expect(browser).toHaveURL(/#\/4\/0$/);
  });
});

describe('layout validation', () => {
  test('a slide that names an unknown layout fails the build with the fix', async () => {
    const error = await build(fixtureConfig('bad-layout')).then(
      () => 'the build succeeded',
      (caught: unknown) => (caught instanceof Error ? caught.message : String(caught)),
    );
    expect(error).toContain('Invalid frontmatter in decks/bad-layout/slides/oops.mdx');
    expect(error).toContain('layout: There is no "defualt" layout.');
    expect(error).toContain('Fix: Use "default".');
  });
});
