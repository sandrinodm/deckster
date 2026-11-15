import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * The problems a brand fails with, or none when it resolves.
 *
 * @param brand - The brand as written.
 */
function problemsOf(brand: unknown) {
  const result = Effect.runSync(Effect.result(resolveBrand(brand)));
  return Result.isFailure(result) ? result.failure.problems : [];
}

describe('surface data palettes', () => {
  it('refuse empty lists a surface replaces, which leave charts without colors', () => {
    const problems = problemsOf(
      testBrand({
        'color.surfaces.default': {
          data: { categorical: [], sequential: [], diverging: [] },
        },
      }),
    );
    expect(problems.map((problem) => problem.path)).toEqual(
      expect.arrayContaining([
        'color.surfaces.default.data.categorical',
        'color.surfaces.default.data.sequential',
        'color.surfaces.default.data.diverging',
      ]),
    );
  });

  it('hold a replaced list to the counts of the brand-wide one', () => {
    const problems = problemsOf(
      testBrand({
        'color.surfaces.default': {
          data: {
            categorical: ['blue.600', 'orange.600'],
            diverging: ['blue.300', 'gray.50', 'orange.300', 'blue.800'],
          },
        },
      }),
    );
    expect(problems.map((problem) => problem.path)).toEqual(
      expect.arrayContaining([
        'color.surfaces.default.data.categorical',
        'color.surfaces.default.data.diverging',
      ]),
    );
  });
});
