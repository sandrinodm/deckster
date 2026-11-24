import type { Browser } from '@e2e-dev/web';

import { describe, test as plainTest } from '@e2e-dev/web';
import { expect } from 'e2e';

import type { PageProblems } from './support/page-problems.ts';

import {
  CODE_LAYOUT_TARGETS,
  EDIT_URL,
  useCodeLayoutServers,
} from './support/code-layouts-servers.ts';
import { test } from './support/page-problems.ts';

/**
 * The part of the engine's `window.__deck` these tests use, and the marker they leave on a page to
 * see whether it was reloaded.
 */
type DeckWindow = Window & {
  /**
   * The deck's automation API, once the deck has mounted.
   */
  __deck?: { ready: () => Promise<void> };

  /**
   * Set by a test after the page loaded; gone after a reload.
   */
  __kept?: boolean;
};

/**
 * The selector of the slide on screen.
 */
const ACTIVE = '[data-slide-active="true"]';

/**
 * What a slide on a code layout rendered.
 */
type RenderedLayout = {
  /**
   * The text of the layout's label, or `null` when the layout did not render.
   */
  label: string | null;

  /**
   * The computed opacity of the label, set by a Tailwind utility only the layout file uses.
   */
  opacity: string | null;

  /**
   * The computed outline colour of the layout's root, set by the layout's own stylesheet.
   */
  outline: string | null;

  /**
   * The layout name the engine stamped on the slide.
   */
  stamped: string | null;
};

/**
 * The copy of the deck the editing tests change, served with hot updates.
 */
const workspace = useCodeLayoutServers();

/**
 * Opens one slide and waits until the deck reports it ready.
 *
 * @param browser - The browser fixture.
 * @param url - The server's base URL.
 * @param slide - The one-based slide number.
 */
async function openSlide(browser: Browser, url: string, slide: number): Promise<void> {
  await browser.goto(`${url}?static#/${slide}/0`);
  await expect
    .poll(() => browser.evaluate(() => (window as DeckWindow).__deck !== undefined))
    .toBe(true);
  await browser.evaluate(() => (window as DeckWindow).__deck!.ready().then(() => null));
}

/**
 * Reads what the slide on screen rendered for a layout.
 *
 * @param browser - The browser fixture.
 * @param layout - The layout name.
 * @param labelId - The `data-testid` of the layout's label.
 */
function rendered(browser: Browser, layout: string, labelId: string): Promise<RenderedLayout> {
  return browser.evaluate(
    ({ active, name, testId }) => {
      const slide = document.querySelector(active);
      const root = slide?.querySelector(`[data-layout="${name}"]`);
      const label = root?.querySelector(`[data-testid="${testId}"]`);
      return {
        label: label?.textContent ?? null,
        opacity: label ? getComputedStyle(label).opacity : null,
        outline: root ? getComputedStyle(root).outlineColor : null,
        stamped:
          document
            .querySelector(`${active}[data-deck-layout], ${active} [data-deck-layout]`)
            ?.getAttribute('data-deck-layout') ?? null,
      };
    },
    { active: ACTIVE, name: layout, testId: labelId },
  );
}

/**
 * Opens a slide through the `problems` fixture, so console errors fail the test.
 *
 * @param fixtures - The test's `browser` and `problems` fixtures.
 * @param url - The server's base URL.
 * @param slide - The one-based slide number.
 */
async function openClean(
  fixtures: { browser: Browser; problems: PageProblems },
  url: string,
  slide: number,
): Promise<void> {
  await fixtures.problems.navigate(() => openSlide(fixtures.browser, url, slide));
}

for (const target of CODE_LAYOUT_TARGETS) {
  describe(`code layouts, served by the ${target.name}`, () => {
    test('renders a slide on a brand code layout, with its stylesheet and utilities', async (fixtures) => {
      await openClean(fixtures, target.url, 1);
      expect(await rendered(fixtures.browser, 'kpi-wall', 'kpi-label')).toEqual({
        label: 'Brand wall',
        opacity: '0.37',
        outline: 'rgb(200, 0, 0)',
        stamped: 'kpi-wall',
      });
    });

    test('renders a slide on a deck code layout', async (fixtures) => {
      await openClean(fixtures, target.url, 2);
      const layout = await rendered(fixtures.browser, 'funnel', 'funnel-label');
      expect(layout.label).toBe('Deck funnel');
      expect(layout.opacity).toBe('0.41');
      expect(layout.stamped).toBe('funnel');
    });

    plainTest(
      'shows a layout that fails to load as a problem on its own slide',
      async ({ browser }) => {
        await openSlide(browser, target.url, 3);
        const problem = await browser.evaluate((active) => {
          const element = document.querySelector(`${active} [data-deck-problem]`);
          return {
            problem: element?.getAttribute('data-deck-problem') ?? null,
            layout: element?.getAttribute('data-deck-problem-layout') ?? null,
            text: element?.textContent ?? '',
          };
        }, ACTIVE);
        expect(problem.problem).toBe('layout-load-failed');
        expect(problem.layout).toBe('broken');
        expect(problem.text).toContain('the broken fixture layout does not load');
      },
    );

    test('keeps the other slides working next to the broken layout', async (fixtures) => {
      await openClean(fixtures, target.url, 4);
      const title = await fixtures.browser.evaluate(
        (active) => document.querySelector(`${active} [data-layout="title"]`)?.textContent ?? null,
        ACTIVE,
      );
      expect(title).toContain('A kit layout still works');
    });
  });
}

describe('editing a code layout while the dev server runs', () => {
  plainTest('applies a stylesheet edit without reloading the page', async ({ browser }) => {
    await openSlide(browser, EDIT_URL, 1);
    await browser.evaluate(() => {
      (window as DeckWindow).__kept = true;
      return null;
    });
    await workspace.edit(
      'brands/fx-code/layouts/kpi-wall/layout.css',
      'rgb(200, 0, 0)',
      'rgb(0, 0, 200)',
    );
    await expect
      .poll(async () => (await rendered(browser, 'kpi-wall', 'kpi-label')).outline)
      .toBe('rgb(0, 0, 200)');
    expect(await browser.evaluate(() => (window as DeckWindow).__kept === true)).toBe(true);
  });

  plainTest(
    'hot-updates an edited brand layout component without reloading the page',
    async ({ browser }) => {
      await openSlide(browser, EDIT_URL, 1);
      await browser.evaluate(() => {
        (window as DeckWindow).__kept = true;
        return null;
      });
      await workspace.edit(
        'brands/fx-code/layouts/kpi-wall/layout.tsx',
        'Brand wall',
        'Brand wall 2',
      );
      await expect
        .poll(async () => (await rendered(browser, 'kpi-wall', 'kpi-label')).label)
        .toBe('Brand wall 2');
      expect(await browser.evaluate(() => (window as DeckWindow).__kept === true)).toBe(true);
    },
  );

  plainTest(
    'hot-updates an edited deck layout component without reloading the page',
    async ({ browser }) => {
      await openSlide(browser, EDIT_URL, 2);
      await browser.evaluate(() => {
        (window as DeckWindow).__kept = true;
        return null;
      });
      await workspace.edit(
        'decks/code-layouts/layouts/funnel/layout.tsx',
        'Deck funnel',
        'Funnel 2',
      );
      await expect
        .poll(async () => (await rendered(browser, 'funnel', 'funnel-label')).label)
        .toBe('Funnel 2');
      expect(await browser.evaluate(() => (window as DeckWindow).__kept === true)).toBe(true);
    },
  );

  plainTest(
    'validates slides against an edited contract and reloads the page',
    async ({ browser }) => {
      await openSlide(browser, EDIT_URL, 2);
      await browser.evaluate(() => {
        (window as DeckWindow).__kept = true;
        return null;
      });
      const slide = `${EDIT_URL}@fs${workspace.file('decks/code-layouts/slides/deck-layout.mdx')}`;
      expect((await fetch(slide)).status).toBe(200);
      await workspace.edit(
        'decks/code-layouts/layouts/funnel/contract.ts',
        'stage: Schema.optionalKey(Schema.String)',
        'step: Schema.optionalKey(Schema.String)',
      );
      await workspace.edit(
        'decks/code-layouts/layouts/funnel/contract.ts',
        "frontmatter: { stage: 'Trial' }",
        "frontmatter: { step: 'Trial' }",
      );
      await expect.poll(async () => (await fetch(slide)).status).toBe(500);
      await expect
        .poll(() => browser.evaluate(() => (window as DeckWindow).__kept === true))
        .toBe(false);
      await workspace.edit(
        'decks/code-layouts/layouts/funnel/contract.ts',
        'step: Schema.optionalKey(Schema.String)',
        'stage: Schema.optionalKey(Schema.String)',
      );
      await workspace.edit(
        'decks/code-layouts/layouts/funnel/contract.ts',
        "frontmatter: { step: 'Trial' }",
        "frontmatter: { stage: 'Trial' }",
      );
      await expect.poll(async () => (await fetch(slide)).status).toBe(200);
    },
  );

  plainTest('validates slides against an edited brand contract', async ({ browser }) => {
    await openSlide(browser, EDIT_URL, 1);
    const slide = `${EDIT_URL}@fs${workspace.file('decks/code-layouts/slides/brand-layout.mdx')}`;
    const contract = 'brands/fx-code/layouts/kpi-wall/contract.ts';
    expect((await fetch(slide)).status).toBe(200);
    await workspace.edit(contract, 'frontmatter: { columns: 3 }', 'frontmatter: { columns: 2 }');
    await workspace.edit(contract, 'Schema.Literals([2, 3])', 'Schema.Literals([2, 4])');
    await expect.poll(async () => (await fetch(slide)).status).toBe(500);
    await workspace.edit(contract, 'Schema.Literals([2, 4])', 'Schema.Literals([2, 3])');
    await expect.poll(async () => (await fetch(slide)).status).toBe(200);
  });
});
