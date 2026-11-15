import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

describe('a brand without a logo', () => {
  it.effect('resolves with no logo variants when it hides the logo', () =>
    Effect.gen(function* () {
      const { tokens, warnings } = yield* resolveBrand(
        testBrand({ 'logo.variants': {}, 'chrome.logo.show': false }),
      );
      expect(warnings).toEqual([]);
      expect(tokens.logo.variants).toEqual({});
      expect(tokens.chrome.logo.show).toBe(false);
    }),
  );

  it.effect('fails when the chrome still asks to show the logo, naming the field and the fix', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(resolveBrand(testBrand({ 'logo.variants': {} })));
      expect(error.problems).toEqual([
        expect.objectContaining({
          path: 'chrome.logo.show',
          fix: expect.stringContaining('`chrome.logo.show: false`'),
        }),
      ]);
    }),
  );
});
