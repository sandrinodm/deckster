import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { layoutLayers } from '#resolve/layout-layers.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { TEST_LAYOUTS, testBrand } from '#test-brand.fixture.ts';

/**
 * Resolves the test brand with layouts.
 */
function resolveWith(layouts: unknown) {
  return resolveBrand(
    testBrand(),
    {},
    { input: layouts, source: 'brands/test/layouts.ts', file: '/x/layouts.ts' },
  );
}

/**
 * The first fixture layout, as a layout with fields replaced.
 */
function two(overrides: Readonly<Record<string, unknown>>): unknown {
  return [{ ...structuredClone(TEST_LAYOUTS[2]), ...overrides }];
}

describe('resolving a brand with layouts', () => {
  it.effect('has no layouts when the brand has no layouts.ts', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(testBrand());
      expect(tokens.layouts).toEqual([]);
    }),
  );

  it.effect('resolves the fixture layouts with every default filled in', () =>
    Effect.gen(function* () {
      const { tokens, warnings } = yield* resolveWith(TEST_LAYOUTS);
      expect(tokens.layouts.map((layout) => layout.name)).toEqual([
        'fixture-cover',
        'fixture-photo',
        'fixture-two-up',
      ]);
      expect(warnings).toEqual([]);
      const [cover, photo, twoUp] = tokens.layouts;
      expect(cover?.title).toEqual({
        box: [120, 380, 1100, 320],
        type: 'display',
        align: 'start',
        anchor: 'end',
        color: 'fg',
      });
      expect(cover?.regions[1]).toEqual({
        bind: { field: 'byline' },
        box: [120, 880, 800, 40],
        kind: 'text',
        type: 'label',
        align: 'start',
        anchor: 'start',
        color: undefined,
        fit: undefined,
        treatment: undefined,
      });
      expect(cover?.regions[0]?.type).toBe('lead');
      expect(cover?.layersMode).toBe('replace');
      expect(photo?.layersMode).toBe('over');
      expect(photo?.regions[0]).toMatchObject({ kind: 'media', fit: 'cover', type: undefined });
      expect(twoUp?.regions[0]).toMatchObject({ kind: 'text', type: 'body', fit: undefined });
      expect(twoUp?.regions[1]?.align).toBe('end');
      expect(twoUp?.chrome).toEqual({});
      expect(twoUp?.fields).toEqual([]);
      expect(twoUp?.budget).toEqual({});
      expect(photo?.budget).toEqual({ caption: { maxWords: 10 } });
    }),
  );

  it.effect('keeps keyed art under its surface keys and an unkeyed list under *', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveWith([
        ...TEST_LAYOUTS,
        {
          ...structuredClone(TEST_LAYOUTS[2]),
          name: 'all-art',
          background: [
            { type: 'placed', file: 'backgrounds/m.svg', aspect: 1, anchor: 'top', width: 50 },
          ],
        },
      ]);
      const [cover, photo, , allArt] = tokens.layouts;
      expect(Object.keys(cover?.layers ?? {})).toEqual(['default', 'inverse']);
      expect(photo?.layers).toEqual({});
      expect(Object.keys(allArt?.layers ?? {})).toEqual(['*']);
      expect(cover?.layers['inverse']?.[0]).toMatchObject({
        type: 'placed',
        opacity: 0.5,
        rotate: 0,
      });
    }),
  );

  it.effect('layoutLayers picks the surface key, else *, else nothing', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveWith(
        [
          TEST_LAYOUTS[0],
          {
            ...structuredClone(TEST_LAYOUTS[2]),
            background: [
              { type: 'placed', file: 'backgrounds/m.svg', aspect: 1, anchor: 'top', width: 50 },
            ],
          },
          TEST_LAYOUTS[1],
        ].map((layout, index) => (index === 1 ? { ...layout, name: 'wild' } : layout)),
      );
      const [cover, wild, photo] = tokens.layouts;
      expect(layoutLayers(cover!, 'inverse')?.[0]).toMatchObject({ anchor: 'bottom-right' });
      expect(layoutLayers(cover!, 'default')?.[0]).toMatchObject({ anchor: 'top-right' });
      expect(layoutLayers(cover!, 'accent')).toBeUndefined();
      expect(layoutLayers(wild!, 'accent')?.[0]).toMatchObject({ anchor: 'top' });
      expect(layoutLayers(photo!, 'default')).toBeUndefined();
    }),
  );

  it.effect('layoutLayers does not answer to inherited names', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveWith(TEST_LAYOUTS);
      expect(layoutLayers(tokens.layouts[0]!, 'constructor')).toBeUndefined();
    }),
  );

  it.effect('names layouts.ts when a layout does not decode', () =>
    Effect.gen(function* () {
      const message = yield* resolveWith(two({ fallback: 3 })).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      expect(message).toContain('Invalid layouts in brands/test/layouts.ts');
      expect(message).toContain('layouts[0].fallback');
    }),
  );

  it.effect('names layouts.ts when a check fails, with the layout path', () =>
    Effect.gen(function* () {
      const error = yield* resolveWith(two({ surface: 'night' })).pipe(Effect.flip);
      expect(error.source).toBe('brands/test/layouts.ts');
      expect(error.file).toBe('/x/layouts.ts');
      expect(error.problems[0]?.path).toBe('layouts[0].surface');
    }),
  );

  it.effect('counts a derived required surface as defined', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveWith(two({ surface: 'gradient' }));
      expect(tokens.layouts[0]?.surface).toBe('gradient');
    }),
  );

  it.effect('reports a bad tint color in a layout image with its layout path', () =>
    Effect.gen(function* () {
      const background = [
        { type: 'image', file: 'backgrounds/a.png', tint: { color: 'nope.1', opacity: 0.5 } },
      ];
      const error = yield* resolveWith(two({ background })).pipe(Effect.flip);
      expect(error.problems[0]?.path).toBe('layouts[0].background[0].tint.color');
    }),
  );

  it.effect('returns the overlap warnings of the layouts', () =>
    Effect.gen(function* () {
      const { warnings } = yield* resolveWith(
        two({ regions: [{ bind: { slot: 'body' }, box: [120, 100, 400, 400] }] }),
      );
      expect(warnings.map((warning) => warning.path)).toEqual(['layouts[0].regions[0].box']);
    }),
  );
});
