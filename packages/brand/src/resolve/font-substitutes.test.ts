import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { resolveSubstitute } from '#resolve/font-substitutes.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

describe('font substitutes', () => {
  it.effect('derives Arial, Courier New and a stack family when the brand names none', () =>
    Effect.gen(function* () {
      const { tokens } = yield* resolveBrand(
        testBrand({ 'typography.families.display.fallback': ['Georgia', 'serif'] }),
      );
      const { display, body, mono } = tokens.typography.families;
      expect(display.substitute).toEqual({
        family: 'Georgia',
        panose: '02040502050405020303',
        pitchFamily: 18,
        charset: 0,
        category: 'serif',
      });
      expect(body.substitute.family).toBe('Arial');
      expect(body.substitute.pitchFamily).toBe(34);
      expect(mono.substitute).toMatchObject({ family: 'Courier New', pitchFamily: 49 });
    }),
  );

  it.effect('keeps a declared substitute and completes it from the known families', () =>
    Effect.gen(function* () {
      const { tokens, warnings } = yield* resolveBrand(
        testBrand({ 'typography.families.body.substitute': { family: 'Verdana', charset: 1 } }),
      );
      expect(tokens.typography.families.body.substitute).toEqual({
        family: 'Verdana',
        panose: '020B0604030504040204',
        pitchFamily: 34,
        charset: 1,
        category: 'sans',
      });
      expect(warnings.filter((warning) => warning.path.includes('substitute'))).toEqual([]);
    }),
  );

  it.effect('warns about a substitute of another kind and an unknown one without PANOSE', () =>
    Effect.gen(function* () {
      const { warnings } = yield* resolveBrand(
        testBrand({
          'typography.families.mono.substitute': { family: 'Arial' },
          'typography.families.body.substitute': { family: 'Acme Sans' },
        }),
      );
      const paths = warnings.map((warning) => warning.path);
      expect(paths).toContain('typography.families.mono.substitute.family');
      expect(paths).toContain('typography.families.body.substitute.panose');
    }),
  );

  it.effect('rejects a PANOSE that is not 20 hex digits', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolveBrand(
          testBrand({
            'typography.families.body.substitute': { family: 'Arial', panose: '020B06' },
          }),
        ),
      );
      expect(error.message).toContain('typography.families.body.substitute.panose');
    }),
  );
});

describe('substitutes for inherited names', () => {
  it('treats a fallback or substitute named like an object property as an unknown family', () => {
    for (const name of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
      const family = {
        family: 'Acme',
        fallback: [name, 'sans-serif'],
        source: { kind: 'system' as const },
      };
      expect(resolveSubstitute(family), name).toEqual({
        family: 'Arial',
        panose: '020B0604020202020204',
        pitchFamily: 34,
        charset: 0,
        category: 'sans',
      });
      expect(resolveSubstitute({ ...family, substitute: { family: name } }).category, name).toBe(
        'sans',
      );
    }
  });
});
