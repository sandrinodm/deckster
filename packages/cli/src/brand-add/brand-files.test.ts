import * as NodeServices from '@effect/platform-node/NodeServices';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { FetchedFile } from '#brand-add/fetch-brand.ts';

import { planBrandFiles } from '#brand-add/brand-files.ts';

/**
 * Fetched files with a fixed size, none of them a symbolic link.
 *
 * @param paths - The paths inside the brand folder.
 */
function files(...paths: string[]): FetchedFile[] {
  return paths.map((file) => ({ path: file, bytes: 10, symlink: false }));
}

describe('planBrandFiles', () => {
  it.effect('leaves out everything inside the folder of a code layout', () =>
    Effect.gen(function* () {
      const plan = yield* planBrandFiles(
        files(
          'brand.ts',
          'README.md',
          'layouts.ts',
          'logos/mark.svg',
          'layouts/kpi-wall/contract.ts',
          'layouts/kpi-wall/layout.tsx',
          'layouts/kpi-wall/README.md',
          'layouts/kpi-wall/preview.png',
          'layouts/kpi-wall/assets/LICENSE',
        ),
        'gh:acme/kit/brands/acme',
      );
      expect(plan.copy).toEqual(['brand.ts', 'README.md', 'layouts.ts', 'logos/mark.svg']);
      expect(plan.skipped).toEqual([
        { path: 'layouts/kpi-wall/contract.ts', reason: 'code' },
        { path: 'layouts/kpi-wall/layout.tsx', reason: 'code' },
        { path: 'layouts/kpi-wall/README.md', reason: 'code layout' },
        { path: 'layouts/kpi-wall/preview.png', reason: 'code layout' },
        { path: 'layouts/kpi-wall/assets/LICENSE', reason: 'code layout' },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('keeps the documents of folders that are not code layouts', () =>
    Effect.gen(function* () {
      const plan = yield* planBrandFiles(
        files(
          'brand.ts',
          'layouts/_shared/README.md',
          'layouts/_shared/contract.ts',
          'layouts/notes/README.md',
          'layouts/notes/helper.ts',
          'layouts/README.md',
        ),
        'gh:acme/kit/brands/acme',
      );
      expect(plan.copy).toEqual([
        'brand.ts',
        'layouts/_shared/README.md',
        'layouts/notes/README.md',
        'layouts/README.md',
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
