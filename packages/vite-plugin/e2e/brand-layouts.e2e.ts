import type { Browser } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { PageProblems } from './support/page-problems.ts';

import {
  BRAND_LAYOUTS_DIST,
  layoutBrandUrl,
  useBrandLayoutServers,
  type LayoutBrand,
} from './support/brand-layouts-servers.ts';
import { FIXTURE_WORKSPACE } from './support/case-servers.ts';
import { test } from './support/page-problems.ts';

/**
 * The part of the engine's `window.__deck` these tests use.
 */
type DeckWindow = Window & {
  /**
   * The deck's automation API, once the deck has mounted.
   */
  __deck?: { ready: () => Promise<void> };
};

/**
 * What a slide rendered with: its layout, and whether that layout is a brand layout.
 */
type RenderedLayout = {
  /**
   * The `data-layout` of the slide's layout.
   */
  layout: string | null;

  /**
   * Whether the layout carries `data-brand-layout`.
   */
  brandLayout: boolean;
};

/**
 * The files of a build the browser downloads, which must not name another brand or its layouts.
 */
const BUILT_FILE_PATTERN = /\.(?:html|js|css|json)$/;

/**
 * The TSX slide on the other brand's layout, as the dev server serves modules outside its root.
 */
const TSX_SLIDE = path.join(
  FIXTURE_WORKSPACE,
  'decks',
  'brand-layouts',
  'slides',
  'other-layout-tsx.tsx',
);

useBrandLayoutServers();

/**
 * Opens one slide of the deck served in a brand and reports the layout it rendered with.
 *
 * @param fixtures - The test's `browser` and `problems` fixtures.
 * @param brand - The brand whose server to open.
 * @param slide - The one-based slide number.
 */
async function renderedLayout(
  fixtures: { browser: Browser; problems: PageProblems },
  brand: LayoutBrand,
  slide: number,
): Promise<RenderedLayout> {
  const { browser, problems } = fixtures;
  await problems.navigate(() => browser.goto(`${layoutBrandUrl(brand)}?static#/${slide}/0`));
  await expect
    .poll(() => browser.evaluate(() => (window as DeckWindow).__deck !== undefined))
    .toBe(true);
  await browser.evaluate(() => (window as DeckWindow).__deck!.ready().then(() => null));
  return browser.evaluate(() => {
    const layout = document.querySelector('[data-slide-active="true"] [data-layout]');
    return {
      layout: layout?.getAttribute('data-layout') ?? null,
      brandLayout: layout?.hasAttribute('data-brand-layout') ?? false,
    };
  });
}

/**
 * The text of every file a build wrote that the browser downloads.
 *
 * @param dir - The build's output folder.
 */
function builtText(dir: string): string {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => BUILT_FILE_PATTERN.test(file))
    .map((file) => readFileSync(path.join(dir, file), 'utf8'))
    .join('\n');
}

describe('a deck whose brand has layouts', () => {
  test('renders a slide on the brand layout with data-brand-layout', async (fixtures) => {
    const rendered = await renderedLayout(fixtures, 'fx-brand', 1);
    expect(rendered).toEqual({ layout: 'fx-cover', brandLayout: true });
  });

  test('renders a slide on another brand’s layout with its kit fallback', async (fixtures) => {
    const rendered = await renderedLayout(fixtures, 'fx-brand', 2);
    expect(rendered).toEqual({ layout: 'title', brandLayout: false });
  });

  test('renders a TSX slide on another brand’s layout with its kit fallback', async (fixtures) => {
    const rendered = await renderedLayout(fixtures, 'fx-brand', 3);
    expect(rendered).toEqual({ layout: 'title', brandLayout: false });
  });

  test('serves the TSX slide with the fallback layout, not the other brand’s', async () => {
    const response = await fetch(`${layoutBrandUrl('fx-brand')}@fs${TSX_SLIDE}`);
    const text = await response.text();
    expect(text).toContain('layout: "title"');
    expect(text).not.toContain('fx-hero');
  });

  test('swaps which slide is on the brand layout when the deck is served in the other brand', async (fixtures) => {
    expect(await renderedLayout(fixtures, 'fx-other', 1)).toEqual({
      layout: 'title',
      brandLayout: false,
    });
    expect(await renderedLayout(fixtures, 'fx-other', 2)).toEqual({
      layout: 'fx-hero',
      brandLayout: true,
    });
  });

  test('builds without another brand’s layout names or brand names', () => {
    const text = builtText(BRAND_LAYOUTS_DIST);
    expect(text).toContain('fx-cover');
    expect(text).not.toContain('fx-hero');
    expect(text).not.toContain('fx-other');
  });
});
