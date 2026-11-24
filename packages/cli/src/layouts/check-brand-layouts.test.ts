import { loadBrand } from '@deckster/brand/node';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
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
          expect(contractRan(MARKER)).toBe(true);
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
});
