import type { BrandLayoutTokens } from '@deckster/brand';

import { holdCode, resetCodeGate, type LoadedBrand } from '@deckster/brand/node';
import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, type FileSystem } from 'effect';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach } from 'vite-plus/test';

import type { DeckBuildError } from '#errors.ts';

import { loadDeckBrand } from '#brand/load-deck-brand.ts';
import { deckLocation } from '#decks/deck-paths.ts';
import { FIXTURE_WORKSPACE } from '#layouts/brand-workspace.fixture.ts';
import { deckCatalog } from '#layouts/deck-catalog.ts';
import {
  componentSource,
  contractRuns,
  contractSource,
  defaultReplacementSource,
  resetContractRuns,
  scratchRoot,
  writeFiles,
} from '#layouts/layout-workspace.fixture.ts';
import { loadLayoutCatalog } from '#layouts/load-layout-catalog.ts';

/**
 * The fixture brand `fx-brand` (which has the data layout `fx-cover`), as if its folder were
 * `brands/fx-brand` of a scratch workspace, where its code layouts are written.
 *
 * @param root - The scratch workspace root.
 */
function scratchBrand(
  root: string,
): Effect.Effect<LoadedBrand, DeckBuildError, FileSystem.FileSystem> {
  return loadDeckBrand(FIXTURE_WORKSPACE, 'fx-brand').pipe(
    Effect.map((loaded) => ({
      ...loaded,
      location: { ...loaded.location, dir: path.join(root, 'brands', 'fx-brand') },
    })),
  );
}

/**
 * The two files of a valid code layout, under a `layouts/` folder.
 *
 * @param layoutsDir - The folder, relative to the workspace, with forward slashes.
 * @param name - The layout name.
 * @param description - The contract's description.
 */
function layoutFiles(
  layoutsDir: string,
  name: string,
  description?: string,
): Record<string, string> {
  return {
    [`${layoutsDir}/${name}/contract.ts`]: contractSource(
      name,
      description === undefined ? {} : { description },
    ),
    [`${layoutsDir}/${name}/layout.tsx`]: componentSource(name),
  };
}

beforeEach(() => {
  resetCodeGate();
  resetContractRuns();
});

afterEach(() => {
  resetCodeGate();
});

layer(NodeFileSystem.layer)('deckCatalog', (it) => {
  it.effect(
    'orders kit, brand code, brand data, then deck code layouts, each with its source',
    () =>
      Effect.gen(function* () {
        const root = scratchRoot();
        writeFiles(root, {
          ...layoutFiles('brands/fx-brand/layouts', 'kpi-wall'),
          ...layoutFiles('decks/talk/layouts', 'funnel'),
        });
        const { index, local } = yield* deckCatalog({
          root,
          brand: yield* scratchBrand(root),
          deck: deckLocation(root, 'talk'),
          code: 'load',
        });
        expect(local.problems).toEqual([]);
        expect([...index.keys()].slice(-3)).toEqual(['kpi-wall', 'fx-cover', 'funnel']);
        expect(index.get('kpi-wall')?.source).toBe('brand-code:fx-brand');
        expect(index.get('fx-cover')?.source).toBe('brand:fx-brand');
        expect(index.get('funnel')?.source).toBe('deck:talk');
        expect(index.get('title')?.source).toBe('@deckster/kit');
        expect(local.replaced).toEqual([]);
        rmSync(root, { recursive: true, force: true });
      }),
  );

  it.effect('leaves out a code layout whose name is taken, as a problem, and keeps the rest', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        ...layoutFiles('brands/fx-brand/layouts', 'title', 'Mine.'),
        ...layoutFiles('brands/fx-brand/layouts', 'fx-cover', 'Mine.'),
        ...layoutFiles('brands/fx-brand/layouts', 'kpi-wall', 'The brand’s.'),
        ...layoutFiles('decks/talk/layouts', 'kpi-wall', 'The deck’s.'),
        ...layoutFiles('decks/talk/layouts', 'section', 'Mine.'),
        ...layoutFiles('decks/talk/layouts', 'fx-cover', 'Mine.'),
        ...layoutFiles('decks/talk/layouts', 'funnel'),
      });
      const { index, local } = yield* deckCatalog({
        root,
        brand: yield* scratchBrand(root),
        deck: deckLocation(root, 'talk'),
        code: 'load',
      });
      expect(
        local.problems.map(
          (problem) => `${problem.code} ${path.relative(root, problem.file)} ${problem.message}`,
        ),
      ).toEqual([
        'layout-name-clash brands/fx-brand/layouts/fx-cover/contract.ts The fx-brand brand ' +
          'defines "fx-cover" twice: as a code layout ' +
          '(brands/fx-brand/layouts/fx-cover/contract.ts) and in brands/fx-brand/layouts.ts.',
        'layout-name-clash brands/fx-brand/layouts/title/contract.ts The code layout "title" ' +
          '(brands/fx-brand/layouts/title/contract.ts) has the name of a layout from ' +
          '@deckster/kit.',
        'layout-name-clash decks/talk/layouts/fx-cover/contract.ts The deck layout "fx-cover" ' +
          "(decks/talk/layouts/fx-cover/contract.ts) has the name of a layout of the deck's " +
          'brand (brand:fx-brand).',
        'layout-name-clash decks/talk/layouts/kpi-wall/contract.ts The deck layout "kpi-wall" ' +
          "(decks/talk/layouts/kpi-wall/contract.ts) has the name of a layout of the deck's " +
          'brand (brand-code:fx-brand).',
        'layout-name-clash decks/talk/layouts/section/contract.ts The code layout "section" ' +
          '(decks/talk/layouts/section/contract.ts) has the name of a layout from @deckster/kit.',
      ]);
      expect(index.get('title')?.source).toBe('@deckster/kit');
      expect(index.get('section')?.source).toBe('@deckster/kit');
      expect(index.get('fx-cover')?.source).toBe('brand:fx-brand');
      expect(index.get('kpi-wall')?.contract.description).toBe('The brand’s.');
      expect(index.get('funnel')?.source).toBe('deck:talk');
      expect(local.catalogs.map((entry) => entry.ref.displayPath)).toEqual([
        'brands/fx-brand/layouts/kpi-wall/contract.ts',
        'decks/talk/layouts/funnel/contract.ts',
      ]);
      expect(local.layouts).toHaveLength(7);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('lists code layouts without loading them when told to skip code', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, layoutFiles('brands/fx-brand/layouts', 'kpi-wall'));
      const { index, local } = yield* deckCatalog({
        root,
        brand: yield* scratchBrand(root),
        code: 'skip',
      });
      expect(local.layouts.map((layout) => layout.name)).toEqual(['kpi-wall']);
      expect(index.has('kpi-wall')).toBe(false);
      expect(index.has('fx-cover')).toBe(true);
      expect(contractRuns()).toBe(0);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('never evaluates a contract changed during an agent turn, on any path', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, layoutFiles('decks/talk/layouts', 'funnel', 'Before.'));
      const options = { root, deck: deckLocation(root, 'talk'), code: 'load' } as const;
      yield* deckCatalog(options);
      expect(contractRuns()).toBe(1);
      const hold = holdCode([path.join(root, 'decks', 'talk')]);
      writeFiles(root, {
        ...layoutFiles('decks/talk/layouts', 'funnel', 'Changed.'),
        ...layoutFiles('decks/talk/layouts', 'added', 'New.'),
      });
      const during = yield* deckCatalog(options);
      expect(contractRuns()).toBe(1);
      expect(during.index.get('funnel')?.contract.description).toBe('Before.');
      expect(during.index.has('added')).toBe(false);
      expect(during.local.problems.map((problem) => problem.code)).toEqual(['layout-held']);
      hold.release();
      const after = yield* deckCatalog(options);
      expect(contractRuns()).toBe(3);
      expect(after.index.get('funnel')?.contract.description).toBe('Changed.');
      expect(after.index.has('added')).toBe(true);
      rmSync(root, { recursive: true, force: true });
    }),
  );
});

/**
 * The files of a brand code layout `default` that replaces the kit's, with a component.
 *
 * @param layoutsDir - The `layouts/` folder, relative to the workspace.
 * @param budget - The body budget, as a source literal; the kit's own when left out.
 */
function defaultReplacementFiles(layoutsDir: string, budget?: string): Record<string, string> {
  return {
    [`${layoutsDir}/default/contract.ts`]: defaultReplacementSource(budget),
    [`${layoutsDir}/default/layout.tsx`]: componentSource('default'),
  };
}

layer(NodeFileSystem.layer)('deckCatalog with a replaced kit layout', (it) => {
  it.effect('puts a replacement where the kit layout was, with its source and warnings', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, defaultReplacementFiles('brands/fx-brand/layouts', '{ maxWords: 60 }'));
      const before = [...(yield* loadLayoutCatalog()).keys()];
      const { index, local } = yield* deckCatalog({
        root,
        brand: yield* scratchBrand(root),
        code: 'load',
      });
      expect(local.problems).toEqual([]);
      expect([...index.keys()].indexOf('default')).toBe(before.indexOf('default'));
      expect(index.get('default')?.source).toBe('brand-code:fx-brand');
      expect(index.get('default')?.replaces).toBe('@deckster/kit');
      expect(local.replaced).toEqual(['default']);
      expect(local.catalogs).toHaveLength(1);
      expect(local.warnings.map((warning) => `${warning.level} ${warning.code}`)).toEqual([
        'warning layout-replace-pptx',
        'note layout-replace-budget',
        'note layout-replace-budget',
      ]);
      expect(local.warnings[1]?.message).toContain(
        'The budget of "body" sets maxWords to 60; the original default layout sets 80.',
      );
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('lets a deck replace a kit layout too', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, defaultReplacementFiles('decks/talk/layouts'));
      const { index, local } = yield* deckCatalog({
        root,
        deck: deckLocation(root, 'talk'),
        code: 'load',
      });
      expect(local.problems).toEqual([]);
      expect(index.get('default')?.source).toBe('deck:talk');
      expect(local.replaced).toEqual(['default']);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('leaves out a replacement that breaks slides of the kit layout, naming why', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/fx-brand/layouts/title/contract.ts': contractSource('title', { replaces: true }),
        'brands/fx-brand/layouts/title/layout.tsx': componentSource('title'),
      });
      const { index, local } = yield* deckCatalog({
        root,
        brand: yield* scratchBrand(root),
        code: 'load',
      });
      expect(index.get('title')?.source).toBe('@deckster/kit');
      expect(local.replaced).toEqual([]);
      expect(local.catalogs).toEqual([]);
      expect(new Set(local.problems.map((problem) => problem.code))).toEqual(
        new Set(['layout-replace-breaks']),
      );
      expect(local.problems.map((problem) => problem.message)).toContain(
        'The code layout "title" (brands/fx-brand/layouts/title/contract.ts) replaces the title ' +
          'layout of @deckster/kit, and slides written for that layout would stop building: The ' +
          'replacement has no field "byline", which the original title layout accepts, so ' +
          'slides that set it stop building.',
      );
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('rejects `replaces: true` on a name no kit layout has, and on a brand layout', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/fx-brand/layouts/kpi-wall/contract.ts': contractSource('kpi-wall', {
          replaces: true,
        }),
        'brands/fx-brand/layouts/kpi-wall/layout.tsx': componentSource('kpi-wall'),
        ...defaultReplacementFiles('brands/fx-brand/layouts'),
        ...defaultReplacementFiles('decks/talk/layouts'),
      });
      const { index, local } = yield* deckCatalog({
        root,
        brand: yield* scratchBrand(root),
        deck: deckLocation(root, 'talk'),
        code: 'load',
      });
      expect(
        local.problems.map((problem) => `${problem.code} ${path.relative(root, problem.file)}`),
      ).toEqual([
        'layout-contract-invalid brands/fx-brand/layouts/kpi-wall/contract.ts',
        'layout-name-clash decks/talk/layouts/default/contract.ts',
      ]);
      expect(local.problems[0]?.message).toContain('says `replaces: true`, but no kit or engine');
      expect(index.has('kpi-wall')).toBe(false);
      expect(index.get('default')?.source).toBe('brand-code:fx-brand');
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('lets a brand data layout fall back to a brand code layout, by the same rules', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, layoutFiles('brands/fx-brand/layouts', 'kpi-wall'));
      const loaded = yield* scratchBrand(root);
      const [cover] = loaded.tokens.layouts;
      const onCode: BrandLayoutTokens = {
        ...cover!,
        fallback: 'kpi-wall',
        regions: cover!.regions.filter((region) => 'slot' in region.bind),
      };
      /**
       * The brand with the cover changed.
       *
       * @param layout - The cover's replacement.
       */
      const withCover = (layout: BrandLayoutTokens): LoadedBrand => ({
        ...loaded,
        tokens: { ...loaded.tokens, layouts: [layout] },
      });
      const { index } = yield* deckCatalog({ root, brand: withCover(onCode), code: 'load' });
      expect(index.get('fx-cover')?.fallback).toBe('kpi-wall');
      expect(Object.keys(index.get('fx-cover')?.contract.slots ?? {})).toEqual(['body']);
      const error = yield* Effect.flip(
        deckCatalog({
          root,
          brand: withCover({ ...onCode, regions: cover!.regions }),
          code: 'load',
        }),
      );
      expect(error.message).toContain('The fallback "kpi-wall" has no field "byline".');
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('leaves out a data layout whose code fallback did not load, with the reason', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/fx-brand/layouts/kpi-wall/contract.ts': "throw new Error('boom');\n",
        'brands/fx-brand/layouts/kpi-wall/layout.tsx': componentSource('kpi-wall'),
        ...layoutFiles('decks/talk/layouts', 'fx-cover'),
        ...layoutFiles('decks/talk/layouts', 'kpi-wall'),
      });
      const loaded = yield* scratchBrand(root);
      const [cover] = loaded.tokens.layouts;
      const onCode: BrandLayoutTokens = {
        ...cover!,
        fallback: 'kpi-wall',
        regions: cover!.regions.filter((region) => 'slot' in region.bind),
      };
      const brand = { ...loaded, tokens: { ...loaded.tokens, layouts: [onCode] } };
      const deck = deckLocation(root, 'talk');
      const { index, local } = yield* deckCatalog({ root, brand, deck, code: 'load' });
      expect(index.has('fx-cover')).toBe(false);
      expect(index.has('title')).toBe(true);
      expect(local.problems.map((problem) => `${problem.code}:${problem.layout}`)).toEqual([
        'layout-load-failed:kpi-wall',
        'layout-name-clash:fx-cover',
        'layout-name-clash:kpi-wall',
        'layout-fallback-unavailable:fx-cover',
      ]);
      expect(index.has('kpi-wall')).toBe(false);
      expect(local.problems[3]?.message).toContain(
        'falls back to the brand\'s code layout "kpi-wall", which is not loaded: ' +
          'brands/fx-brand/layouts/kpi-wall/contract.ts: Loading it failed: boom',
      );

      resetContractRuns();
      const skipped = yield* deckCatalog({ root, brand, code: 'skip' });
      expect(skipped.index.has('fx-cover')).toBe(false);
      expect(skipped.index.has('title')).toBe(true);
      expect(skipped.local.problems).toEqual([]);
      expect(skipped.local.warnings.map((problem) => `${problem.code}:${problem.layout}`)).toEqual([
        'layout-fallback-unavailable:fx-cover',
      ]);
      expect(contractRuns()).toBe(0);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('keeps a code layout from replacing a layout of a catalog other than the kit', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      const extra = path.join(root, 'catalogs/extra.ts');
      writeFiles(root, {
        ...defaultReplacementFiles('decks/talk/layouts'),
        'catalogs/extra.ts': [
          "import catalog from '@deckster/kit/catalog';",
          '',
          'export default {',
          "  source: 'extra-pack',",
          "  layouts: catalog.layouts.filter((layout) => layout.name === 'default'),",
          '};',
          '',
        ].join('\n'),
      });
      const { index, local } = yield* deckCatalog({
        root,
        deck: deckLocation(root, 'talk'),
        code: 'load',
        specifiers: ['@deckster/kit/catalog', extra],
      });
      expect(index.get('default')?.source).toBe('extra-pack');
      expect(local.replaced).toEqual([]);
      expect(local.problems.map((problem) => problem.message)).toEqual([
        'The code layout "default" (decks/talk/layouts/default/contract.ts) has the name of a ' +
          'layout from extra-pack, which a code layout cannot replace: only kit and engine ' +
          'layouts can be.',
      ]);
      rmSync(root, { recursive: true, force: true });
    }),
  );
});

layer(NodeFileSystem.layer)('loadLayoutCatalog with code layouts', (it) => {
  it.effect('fails for a code layout whose name is taken, naming its contract', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, layoutFiles('decks/talk/layouts', 'title'));
      const { local } = yield* deckCatalog({
        root,
        deck: deckLocation(root, 'talk'),
        code: 'load',
      });
      expect(local.catalogs).toEqual([]);
      const file = path.join(root, 'decks/talk/layouts/title/contract.ts');
      const taken = [
        {
          source: 'deck:talk' as const,
          ref: { file, displayPath: 'decks/talk/layouts/title/contract.ts' },
          exported: (yield* loadLayoutCatalog()).get('title')?.contract,
        },
      ];
      const error = yield* Effect.flip(loadLayoutCatalog(undefined, { local: taken }));
      expect(error.id).toBe(file);
      expect(error.message).toContain(
        'Invalid code layouts in decks/talk/layouts/title/contract.ts:',
      );
      expect(error.message).toContain('has the name of a layout from @deckster/kit.');
      rmSync(root, { recursive: true, force: true });
    }),
  );
});
