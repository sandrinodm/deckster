import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { brandLayoutFallbackRule } from '#lint/rules/brand-layout-fallback.ts';
import { deckInput, testBrandTokens } from '#lint/snapshot.fixture.ts';

describe('brand-layout-fallback', () => {
  it.effect('names the brand that has the layout and the fallback used', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      const input = deckInput(tokens, [
        {},
        {
          layout: 'image',
          brandFallback: {
            sourceLayout: 'acme-photo',
            brands: [{ brand: 'acme', fallback: 'image' }],
          },
        },
      ]);
      const [violation, ...rest] = brandLayoutFallbackRule.check(input);
      expect(rest).toEqual([]);
      expect(violation).toMatchObject({ slide: 's2' });
      expect(violation?.message).toContain('"acme-photo" of the "acme" brand');
      expect(violation?.message).toContain('renders with the image layout');
      expect(violation?.fix).toContain('Switch the deck back to that brand');
      expect(violation?.fix).toContain('layouts');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('says nothing for slides that name a layout the brand has', () =>
    Effect.gen(function* () {
      const tokens = yield* testBrandTokens('default');
      expect(brandLayoutFallbackRule.check(deckInput(tokens, [{}, {}]))).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
