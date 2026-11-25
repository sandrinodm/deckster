import { loadBrand } from '@deckster/brand/node';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';

import { checkCatalogLayouts, layoutProblemWithFile } from '#layouts/check-brand-layouts.ts';
import {
  CODE_BRAND,
  codeLayoutsWorkspace,
  contractRan,
  writeThrowingLayout,
} from '#layouts/code-layouts.fixture.ts';

/**
 * The global the throwing contract sets when it runs.
 */
const MARKER = '__deckCheckBrandLayoutsRan';

/**
 * Room for loading the kit catalog and a contract on a busy machine.
 */
const CHECK_TEST_TIMEOUT_MS = 60_000;

describe('checkCatalogLayouts', () => {
  it.effect(
    'never runs a code layout with skip, and reports what it throws with load',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const layoutsDir = path.join(root, 'brands', CODE_BRAND, 'layouts');
          writeThrowingLayout(layoutsDir, 'evil', MARKER);
          const brand = yield* loadBrand(root, CODE_BRAND);
          const skipped = yield* checkCatalogLayouts(root, brand, 'skip');
          expect(contractRan(MARKER)).toBe(false);
          expect(skipped.local.layouts.map((layout) => layout.name)).toEqual(['evil', 'kpi-wall']);
          expect(skipped.local.catalogs).toEqual([]);
          expect(skipped.local.problems).toEqual([]);
          const loaded = yield* checkCatalogLayouts(root, brand, 'load');
          // It throws in the check process, so it never runs in this one.
          expect(contractRan(MARKER)).toBe(false);
          expect(loaded.local.catalogs.map((entry) => entry.source)).toEqual([
            `brand-code:${CODE_BRAND}`,
          ]);
          const problems = loaded.local.problems.map((problem) =>
            layoutProblemWithFile(brand, problem),
          );
          expect(problems).toEqual([
            {
              path: '',
              file: `brands/${CODE_BRAND}/layouts/evil/contract.ts`,
              code: 'layout-load-failed',
              layout: 'evil',
              message: expect.stringContaining('the evil contract does not load'),
              fix: expect.any(String),
            },
          ]);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    CHECK_TEST_TIMEOUT_MS,
  );

  it.effect(
    'with skip, checks the data layouts that fall back to a code layout left out as not checked',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const brandDir = path.join(root, 'brands', CODE_BRAND);
          fs.writeFileSync(path.join(brandDir, 'layouts.ts'), dataLayouts(['kpi-wall', 'nowhere']));
          const brand = yield* loadBrand(root, CODE_BRAND);
          const skipped = yield* checkCatalogLayouts(root, brand, 'skip');
          expect(skipped.errors).toEqual([
            expect.objectContaining({
              path: 'layouts[1].fallback',
              message: expect.stringContaining('nowhere'),
            }),
          ]);
          expect(skipped.warnings).toContainEqual({
            path: 'layouts[0].fallback',
            message: expect.stringContaining('"kpi-wall"'),
            fix: expect.stringContaining('layouts/kpi-wall/'),
          });
          const loaded = yield* checkCatalogLayouts(root, brand, 'load');
          expect(loaded.errors.map((problem) => problem.path)).toEqual(['layouts[1].fallback']);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    CHECK_TEST_TIMEOUT_MS,
  );

  it.effect(
    'with load, reports a data layout whose fallback code layout fails once, as that problem',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const brandDir = path.join(root, 'brands', CODE_BRAND);
          writeThrowingLayout(path.join(brandDir, 'layouts'), 'kpi-wall', MARKER);
          fs.writeFileSync(path.join(brandDir, 'layouts.ts'), dataLayouts(['kpi-wall']));
          const brand = yield* loadBrand(root, CODE_BRAND);
          const loaded = yield* checkCatalogLayouts(root, brand, 'load');
          // It throws in the check process, so it never runs in this one.
          expect(contractRan(MARKER)).toBe(false);
          expect(loaded.errors).toEqual([]);
          expect(loaded.warnings).toEqual([]);
          expect(loaded.local.problems.map((problem) => [problem.code, problem.layout])).toEqual([
            ['layout-load-failed', 'kpi-wall'],
            ['layout-fallback-unavailable', 'acme-0'],
          ]);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    CHECK_TEST_TIMEOUT_MS,
  );

  it.effect(
    'with load, does not report the data layouts of a failed code layout as unknown fallbacks when another data layout is wrong',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const brandDir = path.join(root, 'brands', CODE_BRAND);
          writeThrowingLayout(path.join(brandDir, 'layouts'), 'kpi-wall', MARKER);
          fs.writeFileSync(path.join(brandDir, 'layouts.ts'), dataLayouts(['kpi-wall', 'nowhere']));
          const brand = yield* loadBrand(root, CODE_BRAND);
          const loaded = yield* checkCatalogLayouts(root, brand, 'load');
          // It throws in the check process, so it never runs in this one.
          expect(contractRan(MARKER)).toBe(false);
          expect(loaded.errors.map((problem) => problem.path)).toEqual(['layouts[1].fallback']);
          expect(loaded.local.problems.map((problem) => problem.code)).toContain(
            'layout-load-failed',
          );
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    CHECK_TEST_TIMEOUT_MS,
  );
});

/**
 * The text of a `layouts.ts` with one data layout per fallback.
 *
 * @param fallbacks - The fallback of each layout, in order.
 */
function dataLayouts(fallbacks: readonly string[]): string {
  const layouts = fallbacks.map((fallback, index) => ({
    name: `acme-${index}`,
    label: `Acme ${index}`,
    description: 'Text next to a picture.',
    fallback,
    title: { box: [120, 80, 1680, 160] },
    regions: [{ bind: { slot: 'body' }, kind: 'text', box: [120, 300, 1680, 600] }],
  }));
  return [
    "import { defineBrandLayouts } from '@deckster/brand';",
    `export default defineBrandLayouts(${JSON.stringify(layouts)});`,
    '',
  ].join('\n');
}
