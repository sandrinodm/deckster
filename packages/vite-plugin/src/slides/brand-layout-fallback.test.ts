import { NodeFileSystem } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { LayoutCatalogIndex } from '#layouts/load-layout-catalog.ts';

import { FIXTURE_WORKSPACE } from '#layouts/brand-workspace.fixture.ts';
import { loadLayoutCatalog } from '#layouts/load-layout-catalog.ts';
import { withBrandLayoutFallback } from '#slides/brand-layout-fallback.ts';
import {
  transformMdxSlide,
  transformTsxSlide,
  transformTsxSlideMapped,
} from '#slides/transform-slide.ts';

const REF = { file: '/workspace/decks/demo/slides/s.mdx', displayPath: 'decks/demo/slides/s.mdx' };
const SLIDE_META_PATTERN = /export const slideMeta = (.*);\n$/;
const IN_FIXTURE_BRAND = { workspaceRoot: FIXTURE_WORKSPACE, brand: 'fx-brand' };

/**
 * A brand folder with the one file the fallback lookup reads, `layouts.ts`.
 */
const writeBrandLayouts = Effect.fn('writeBrandLayouts')(function* (
  root: string,
  brand: string,
  fallback: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const dir = path.join(root, 'brands', brand);
  yield* fs.makeDirectory(dir, { recursive: true });
  yield* fs.writeFileString(
    path.join(dir, 'layouts.ts'),
    [
      "import { defineBrandLayouts } from '@deckster/brand';",
      '',
      'export default defineBrandLayouts([',
      `  { name: 'shared-look', description: 'Test.', fallback: '${fallback}', title: { box: [100, 100, 800, 200] }, regions: [] },`,
      ']);',
      '',
    ].join('\n'),
  );
});

layer(NodeFileSystem.layer)('withBrandLayoutFallback', (it) => {
  const kit = (): Effect.Effect<LayoutCatalogIndex, unknown, FileSystem.FileSystem> =>
    loadLayoutCatalog();

  it.effect('swaps another brand’s layout for the fallback its brand names', () =>
    Effect.gen(function* () {
      const catalog = yield* kit();
      const data = { layout: 'fx-hero', title: 'Hello' };
      const swapped = yield* withBrandLayoutFallback(data, catalog, IN_FIXTURE_BRAND, REF);
      expect(swapped).toEqual({ layout: 'title', title: 'Hello' });
    }),
  );

  it.effect('leaves a layout the catalog has, a layout no brand has and no layout alone', () =>
    Effect.gen(function* () {
      const catalog = yield* kit();
      for (const data of [{ layout: 'title' }, { layout: 'nobody-has-this' }, { title: 'x' }]) {
        expect(yield* withBrandLayoutFallback(data, catalog, IN_FIXTURE_BRAND, REF)).toBe(data);
      }
    }),
  );

  it.effect('does nothing without a place to look', () =>
    Effect.gen(function* () {
      const catalog = yield* kit();
      const data = { layout: 'fx-hero' };
      expect(yield* withBrandLayoutFallback(data, catalog, undefined, REF)).toBe(data);
    }),
  );

  it.effect('names both brands when they define a layout with different fallbacks', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-fallback-' });
      yield* writeBrandLayouts(root, 'alpha', 'title');
      yield* writeBrandLayouts(root, 'beta', 'section');
      const catalog = yield* kit();
      const error = yield* Effect.flip(
        withBrandLayoutFallback(
          { layout: 'shared-look' },
          catalog,
          { workspaceRoot: root, brand: 'gamma' },
          REF,
        ),
      );
      expect(error.message).toContain('alpha (falls back to title)');
      expect(error.message).toContain('beta (falls back to section)');
      expect(error.message).toContain('Fix: Rename "shared-look"');
    }),
  );

  it.effect('swaps when the brands that define the layout share a fallback', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-fallback-' });
      yield* writeBrandLayouts(root, 'alpha', 'section');
      yield* writeBrandLayouts(root, 'beta', 'section');
      const catalog = yield* kit();
      const swapped = yield* withBrandLayoutFallback(
        { layout: 'shared-look' },
        catalog,
        { workspaceRoot: root, brand: 'gamma' },
        REF,
      );
      expect(swapped).toEqual({ layout: 'section' });
    }),
  );
});

layer(NodeFileSystem.layer)('withBrandLayoutFallback ordering and missing fallbacks', (it) => {
  it.effect('reports ambiguity even when the first brand’s fallback is not in the catalog', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-fallback-' });
      yield* writeBrandLayouts(root, 'alpha', 'no-such-layout');
      yield* writeBrandLayouts(root, 'beta', 'section');
      const catalog = yield* loadLayoutCatalog();
      const error = yield* Effect.flip(
        withBrandLayoutFallback(
          { layout: 'shared-look' },
          catalog,
          { workspaceRoot: root, brand: 'gamma' },
          REF,
        ),
      );
      expect(error.message).toContain('alpha (falls back to no-such-layout)');
      expect(error.message).toContain('beta (falls back to section)');
    }),
  );

  it.effect('names the brand and the missing fallback of a lone match', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-fallback-' });
      yield* writeBrandLayouts(root, 'alpha', 'no-such-layout');
      const catalog = yield* loadLayoutCatalog();
      const error = yield* Effect.flip(
        withBrandLayoutFallback(
          { layout: 'shared-look' },
          catalog,
          { workspaceRoot: root, brand: 'gamma' },
          REF,
        ),
      );
      expect(error.message).toContain(
        'The alpha brand defines it with the fallback "no-such-layout"',
      );
      expect(error.message).toContain('brands/alpha/layouts.ts');
    }),
  );
});

describe('a slide on another brand’s layout', () => {
  it.effect('renders with the fallback and its slideMeta names only the kit layout', () =>
    Effect.gen(function* () {
      const layouts = yield* loadLayoutCatalog();
      const code = yield* transformMdxSlide(
        {
          ...REF,
          id: 's',
          code: '---\nlayout: fx-hero\ntitle: Hello\neyebrow: Budget\n---\nA subtitle.\n',
          layouts,
          fallback: IN_FIXTURE_BRAND,
        },
        false,
      );
      const meta = JSON.parse(SLIDE_META_PATTERN.exec(code)?.[1] ?? 'null') as {
        frontmatter: { layout: string };
      };
      expect(meta.frontmatter.layout).toBe('title');
      expect(code).not.toContain('fx-hero');
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );

  const TSX_SOURCE = [
    "import type { SlideFrontmatterInput } from '@deckster/engine';",
    '',
    'export const frontmatter = {',
    "  layout: 'fx-hero',",
    "  title: 'Hello',",
    '} satisfies SlideFrontmatterInput;',
    '',
    'export default function Body() {',
    '  return <p>Hi</p>;',
    '}',
    '',
  ].join('\n');

  it.effect('rewrites the layout in a TSX slide’s own source, with a source map', () =>
    Effect.gen(function* () {
      const layouts = yield* loadLayoutCatalog();
      const slide = { ...REF, id: 's', code: TSX_SOURCE, layouts, fallback: IN_FIXTURE_BRAND };
      const code = yield* transformTsxSlide(slide);
      expect(code).not.toContain('fx-hero');
      expect(code).toContain('layout: "title",');
      const mapped = yield* transformTsxSlideMapped(slide);
      expect(mapped.code).toBe(code);
      expect(mapped.map?.sources).toEqual([REF.file]);
      expect(mapped.map?.mappings.split(';').length).toBeGreaterThanOrEqual(10);
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );

  it.effect('leaves a TSX slide on a catalog layout as written, without a map', () =>
    Effect.gen(function* () {
      const layouts = yield* loadLayoutCatalog();
      const code = TSX_SOURCE.replace('fx-hero', 'title');
      const mapped = yield* transformTsxSlideMapped({ ...REF, id: 's', code, layouts });
      expect(mapped.map).toBeNull();
      expect(mapped.code).toContain("layout: 'title',");
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );

  it.effect('still fails for a layout no brand defines', () =>
    Effect.gen(function* () {
      const layouts = yield* loadLayoutCatalog();
      const error = yield* Effect.flip(
        transformMdxSlide(
          {
            ...REF,
            id: 's',
            code: '---\nlayout: nobody-has-this\n---\nText\n',
            layouts,
            fallback: IN_FIXTURE_BRAND,
          },
          false,
        ),
      );
      expect(error.message).toContain('There is no "nobody-has-this" layout.');
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});
