import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { rmSync } from 'node:fs';

import type { LocalLayouts } from '#layouts/local-layouts.ts';

import { componentSource, scratchRoot, writeFiles } from '#layouts/layout-workspace.fixture.ts';
import { TEST_CATALOG } from '#layouts/test-catalog.fixture.ts';
import { checkLocalLayout } from '#slides/local-layout-check.ts';

const REF = {
  file: '/workspace/decks/talk/slides/one.mdx',
  displayPath: 'decks/talk/slides/one.mdx',
};

/**
 * No code layouts.
 */
const NOTHING: LocalLayouts = {
  layouts: [],
  catalogs: [],
  replaced: [],
  files: [],
  problems: [],
  warnings: [],
};

describe('checkLocalLayout', () => {
  it.effect('passes a slide on a layout of the catalog, on an unknown one and on none', () =>
    Effect.gen(function* () {
      const context = { local: { found: NOTHING }, fallback: undefined };
      yield* checkLocalLayout({ layout: 'split' }, TEST_CATALOG, context, REF);
      yield* checkLocalLayout({ layout: 'nowhere' }, TEST_CATALOG, context, REF);
      yield* checkLocalLayout({}, TEST_CATALOG, context, REF);
      yield* checkLocalLayout({ layout: '../x' }, TEST_CATALOG, {}, REF);
    }),
  );

  it.effect('fails a slide whose layout has a problem, even when a kit layout has the name', () =>
    Effect.gen(function* () {
      const found: LocalLayouts = {
        ...NOTHING,
        problems: [
          {
            code: 'layout-name-clash',
            file: '/workspace/decks/talk/layouts/split/contract.ts',
            layout: 'split',
            message: 'The code layout "split" has the name of a layout from test.',
            fix: 'Rename it.',
          },
        ],
      };
      const error = yield* Effect.flip(
        checkLocalLayout({ layout: 'split' }, TEST_CATALOG, { local: { found } }, REF),
      );
      expect(error.message).toBe(
        [
          "The slide's layout cannot be used in decks/talk/slides/one.mdx:",
          '  - layout: The code layout "split" has the name of a layout from test.',
          '    Fix: Rename it.',
        ].join('\n'),
      );
      expect(error.problems.map((problem) => problem.code)).toEqual(['layout-name-clash']);
      yield* checkLocalLayout({ layout: 'default' }, TEST_CATALOG, { local: { found } }, REF);
      yield* checkLocalLayout({}, TEST_CATALOG, { local: { found } }, REF);
    }),
  );

  it.effect('keeps the code of every kind of problem on the build error', () =>
    Effect.gen(function* () {
      const file = '/workspace/brands/acme/layouts/title/contract.ts';
      const codes = [
        'layout-replace-breaks',
        'layout-held',
        'layout-load-failed',
        'layout-contract-invalid',
      ] as const;
      const found: LocalLayouts = {
        ...NOTHING,
        problems: codes.map((code) => ({
          code,
          file,
          layout: 'split',
          message: `The ${code} problem.`,
          fix: 'Fix it.',
        })),
      };
      const error = yield* Effect.flip(
        checkLocalLayout({ layout: 'split' }, TEST_CATALOG, { local: { found } }, REF),
      );
      expect(error.problems.map((problem) => problem.code)).toEqual(codes);
    }),
  );

  it.effect('checks a slide that names no layout as one on default', () =>
    Effect.gen(function* () {
      const found: LocalLayouts = {
        ...NOTHING,
        problems: [
          {
            code: 'layout-name-clash',
            file: '/workspace/decks/talk/layouts/default/contract.ts',
            layout: 'default',
            message: 'The code layout "default" has the name of a layout from @deckster/engine.',
            fix: 'Rename it.',
          },
        ],
      };
      const error = yield* Effect.flip(
        checkLocalLayout({ title: 'Hi' }, TEST_CATALOG, { local: { found } }, REF),
      );
      expect(error.message).toContain('The code layout "default" has the name');
    }),
  );

  it.effect('fails a slide on a layout left out by a version mismatch, with that problem', () =>
    Effect.gen(function* () {
      const found: LocalLayouts = {
        ...NOTHING,
        layouts: [
          {
            name: 'funnel',
            source: 'deck:talk',
            contractFile: '/workspace/decks/talk/layouts/funnel/contract.ts',
            componentFile: '/workspace/decks/talk/layouts/funnel/layout.tsx',
          },
        ],
        problems: [
          {
            code: 'layout-version',
            file: '/workspace/decks/talk/deck.config.ts',
            message: 'The code layouts of the talk deck are written for deckster >=99.',
            fix: 'Install it.',
          },
        ],
      };
      const error = yield* Effect.flip(
        checkLocalLayout({ layout: 'funnel' }, TEST_CATALOG, { local: { found } }, REF),
      );
      expect(error.message).toContain('written for deckster >=99');
      expect(error.problems.map((problem) => problem.code)).toEqual(['layout-version']);
      yield* checkLocalLayout({ layout: 'split' }, TEST_CATALOG, { local: { found } }, REF);
    }),
  );

  it.effect('fails a slide on a version-blocked replacement although the kit has the name', () =>
    Effect.gen(function* () {
      const split = {
        name: 'split',
        source: 'brand-code:acme',
        contractFile: '/workspace/brands/acme/layouts/split/contract.ts',
        componentFile: '/workspace/brands/acme/layouts/split/layout.tsx',
      } as const;
      const version = {
        code: 'layout-version',
        file: '/workspace/brands/acme/brand.json',
        message: 'The code layouts of the acme brand are written for deckster >=99.',
        fix: 'Install it.',
      } as const;
      const found: LocalLayouts = { ...NOTHING, layouts: [split], problems: [version] };
      const error = yield* Effect.flip(
        checkLocalLayout({ layout: 'split' }, TEST_CATALOG, { local: { found } }, REF),
      );
      expect(error.problems.map((problem) => problem.code)).toEqual(['layout-version']);
      const deckVersion: LocalLayouts = {
        ...found,
        problems: [{ ...version, file: '/workspace/decks/talk/deck.config.ts' }],
      };
      yield* checkLocalLayout(
        { layout: 'split' },
        TEST_CATALOG,
        { local: { found: deckVersion } },
        REF,
      );
      const loaded: LocalLayouts = {
        ...found,
        catalogs: [
          {
            source: 'brand-code:acme',
            ref: { file: split.contractFile, displayPath: 'brands/acme/layouts/split/contract.ts' },
            exported: {},
          },
        ],
      };
      yield* checkLocalLayout({ layout: 'split' }, TEST_CATALOG, { local: { found: loaded } }, REF);
    }),
  );

  it.effect('fails a slide on a replacement brand add left out instead of using the kit one', () =>
    Effect.gen(function* () {
      const local = {
        found: NOTHING,
        skipped: { source: 'github.com/acme/brand', names: ['split'] },
      };
      const fallback = { workspaceRoot: '/workspace', brand: 'acme' };
      const error = yield* Effect.flip(
        checkLocalLayout({ layout: 'split' }, TEST_CATALOG, { local, fallback }, REF),
      );
      expect(error.problems.map((problem) => problem.code)).toEqual(['layout-code-skipped']);
      const copied = {
        ...local,
        found: {
          ...NOTHING,
          layouts: [
            {
              name: 'split',
              source: 'brand-code:acme',
              contractFile: '/workspace/brands/acme/layouts/split/contract.ts',
              componentFile: '/workspace/brands/acme/layouts/split/layout.tsx',
            } as const,
          ],
        },
      };
      yield* checkLocalLayout({ layout: 'split' }, TEST_CATALOG, { local: copied, fallback }, REF);
    }),
  );

  it.effect('fails a slide on a code layout brand add left out, with where to get it', () =>
    Effect.gen(function* () {
      const local = {
        found: NOTHING,
        skipped: { source: 'github.com/acme/brand', names: ['kpi-wall'] },
      };
      const fallback = { workspaceRoot: '/workspace', brand: 'acme' };
      const error = yield* Effect.flip(
        checkLocalLayout({ layout: 'kpi-wall' }, TEST_CATALOG, { local, fallback }, REF),
      );
      expect(error.problems).toEqual([
        {
          code: 'layout-code-skipped',
          message:
            'layout: "kpi-wall" is a code layout of the acme brand that `brand add` left out, ' +
            'because a fetched brand is added as data and its code is not copied.',
          fix:
            "Read the layout's code at github.com/acme/brand, then copy its layouts/kpi-wall/ " +
            'folder (and what it imports from layouts/_shared/) into brands/acme/layouts/. Or ' +
            'use a layout the brand has here.',
        },
      ]);
    }),
  );

  it.effect('fails a slide on a layout only another brand has as code, naming that brand', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/kpi-wall/layout.tsx': componentSource('kpi-wall'),
        'brands/mine/layouts/kpi-wall/layout.tsx': componentSource('kpi-wall'),
        'brands/zeta/layouts/other/layout.tsx': componentSource('other'),
      });
      const context = {
        local: { found: NOTHING },
        fallback: { workspaceRoot: root, brand: 'mine' },
      };
      const error = yield* Effect.flip(
        checkLocalLayout({ layout: 'kpi-wall' }, TEST_CATALOG, context, REF),
      );
      expect(error.problems[0]?.code).toBe('layout-code-skipped');
      expect(error.problems[0]?.message).toBe(
        'layout: There is no "kpi-wall" layout in the mine brand. It is a code layout of the ' +
          'acme brand, and a code layout has no fallback in another brand.',
      );
      yield* checkLocalLayout({ layout: 'nowhere' }, TEST_CATALOG, context, REF);
      rmSync(root, { recursive: true, force: true });
    }),
  );
});
