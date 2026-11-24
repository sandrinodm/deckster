import { NodeFileSystem } from '@effect/platform-node';
import { Effect } from 'effect';
import path from 'node:path';
import { normalizePath } from 'vite-plus';
import { describe, expect, it } from 'vite-plus/test';

import { affectsFallbacks, brandModuleSource } from '#brand/active-brand.ts';
import { resolvedBrandCssId } from '#brand/brand-modules.ts';
import { loadDeckBrand } from '#brand/load-deck-brand.ts';
import { deckLocation } from '#decks/deck-paths.ts';
import { FIXTURE_WORKSPACE } from '#layouts/brand-workspace.fixture.ts';
import { VIRTUAL_LOCAL_LAYOUTS_ID } from '#virtual-modules.ts';

const BRANDS = path.join('/workspace', 'brands');

describe('affectsFallbacks', () => {
  it('is true for any brand’s layouts.ts, added, changed or removed', () => {
    for (const event of ['add', 'change', 'unlink']) {
      expect(affectsFallbacks(BRANDS, event, path.join(BRANDS, 'other', 'layouts.ts'))).toBe(true);
    }
  });

  it('is true for a brand folder appearing or disappearing', () => {
    expect(affectsFallbacks(BRANDS, 'addDir', path.join(BRANDS, 'new'))).toBe(true);
    expect(affectsFallbacks(BRANDS, 'unlinkDir', path.join(BRANDS, 'old'))).toBe(true);
  });

  it('is false for other files and for paths outside brands', () => {
    expect(affectsFallbacks(BRANDS, 'change', path.join(BRANDS, 'other', 'brand.ts'))).toBe(false);
    expect(affectsFallbacks(BRANDS, 'addDir', path.join(BRANDS, 'other', 'art'))).toBe(false);
    expect(affectsFallbacks(BRANDS, 'change', '/workspace/decks/x/layouts.ts')).toBe(false);
  });
});

describe('brandModuleSource', () => {
  it('makes Tailwind scan the deck, the brand and each plugin folder, and no virtual plugin', async () => {
    const brand = await Effect.runPromise(
      loadDeckBrand(FIXTURE_WORKSPACE, 'fx-brand').pipe(Effect.provide(NodeFileSystem.layer)),
    );
    const deck = deckLocation(FIXTURE_WORKSPACE, 'brand-layouts');
    const css = brandModuleSource(
      { addWatchFile: () => undefined, warn: () => undefined },
      {
        id: resolvedBrandCssId(deck.dir),
        brand,
        deck,
        pluginFiles: ['/framework/kit/src/runtime.ts', VIRTUAL_LOCAL_LAYOUTS_ID, '/p/runtime.ts'],
      },
    );
    const sources = [...css.matchAll(/^@source (.+);$/gm)].map((match) => match[1]);
    expect(sources).toEqual(
      [deck.dir, brand.location.dir, '/framework/kit/src', '/p'].map((dir) =>
        JSON.stringify(normalizePath(dir)),
      ),
    );
  });
});
