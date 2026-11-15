import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { BrandProblem } from '#validate/brand-error.ts';

import { formatHex, fromHex } from '#color/color.ts';
import { contrastRatio } from '#color/contrast.ts';
import { oklabToRgb, oklchToOklab } from '#color/oklab.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * OKLCH hues the sweep visits, in degrees.
 */
const SWEEP_HUES = Array.from({ length: 12 }, (_, index) => index * 30);

/**
 * OKLCH chromas the sweep visits.
 */
const SWEEP_CHROMAS = [0.05, 0.12, 0.2];

/**
 * OKLCH lightnesses the sweep visits.
 */
const SWEEP_LIGHTNESSES = Array.from({ length: 12 }, (_, index) => 0.3 + index * 0.05);

/**
 * Generous room for the sweep, which resolves about 900 brands.
 */
const SWEEP_TIMEOUT_MS = 60_000;

/**
 * The test brand on a dark base: light text on near-black, light chart colors.
 */
const DARK_BASE = {
  'color.roles.bg': 'gray.900',
  'color.roles.surface': '#22242a',
  'color.roles.fg': 'gray.0',
  'color.roles.muted': 'gray.300',
  'color.roles.border': 'gray.600',
  'color.roles.positive': '#5eead4',
  'color.roles.negative': '#ff7d6b',
  'color.data.categorical': ['blue.300', 'orange.300', 'gray.0'],
  'color.data.context': 'gray.600',
  'color.data.sequential': ['blue.800', 'blue.600', 'blue.300', 'blue.100'],
};

/**
 * Every problem a brand fails with, warnings included; empty when it resolves cleanly.
 */
function findings(input: unknown): { errors: readonly BrandProblem[]; warnings: BrandProblem[] } {
  return Effect.runSync(
    resolveBrand(input).pipe(
      Effect.match({
        onFailure: (error) => ({ errors: error.problems, warnings: [] }),
        onSuccess: ({ warnings }) => ({ errors: [], warnings }),
      }),
    ),
  );
}

/**
 * Whether a problem is about a surface the test brand does not write (it writes only `default`).
 */
function isDerived(problem: BrandProblem): boolean {
  return (
    problem.path.startsWith('color.surfaces.') && !problem.path.startsWith('color.surfaces.default')
  );
}

/**
 * Every accent on the sweep grid, with whichever of black and white reads better on it as its
 * `accent-fg`.
 */
function sweepAccents(): { accent: string; accentFg: string }[] {
  return SWEEP_HUES.flatMap((h) =>
    SWEEP_CHROMAS.flatMap((c) =>
      SWEEP_LIGHTNESSES.map((l) => {
        const color = oklabToRgb(oklchToOklab({ l, c, h }));
        const onWhite = contrastRatio(fromHex('#ffffff'), color);
        const onBlack = contrastRatio(fromHex('#000000'), color);
        return { accent: formatHex(color), accentFg: onWhite >= onBlack ? '#ffffff' : '#000000' };
      }),
    ),
  );
}

describe('derived surfaces', () => {
  it('pass for a mid-tone accent that black and white text barely read on', () => {
    const { errors } = findings(testBrand({ 'color.roles.accent': '#2e7d4f' }));
    expect(errors).toEqual([]);
  });

  it.each([
    ['a light base', {}],
    ['a dark base', DARK_BASE],
  ])(
    'never fail for an accent the default surface accepts, on %s',
    (_, base) => {
      const accepted = sweepAccents().flatMap(({ accent, accentFg }) => {
        const { errors } = findings(
          testBrand({ ...base, 'color.roles.accent': accent, 'color.roles.accent-fg': accentFg }),
        );
        if (errors.some((problem) => !isDerived(problem))) {
          return [];
        }

        return [{ accent, derived: errors.filter(isDerived) }];
      });
      expect(accepted.length).toBeGreaterThan(200);
      expect(accepted.filter((result) => result.derived.length > 0)).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  it('pick the text first, then lighten the background until the text reads on it and its card', () => {
    const waiver = { color: 'accent-fg', on: 'accent', surface: 'default', reason: 'Large only' };
    const { tokens } = Effect.runSync(
      resolveBrand(testBrand({ 'color.roles.accent': '#5b7cff', 'color.waivers': [waiver] })),
    );
    const accent = tokens.surfaces.accent!;
    expect(accent.roles).toMatchObject({ bg: '#6788ff', fg: '#18191d', 'accent-fg': '#6788ff' });
    for (const role of ['bg', 'surface'] as const) {
      const ratio = contrastRatio(fromHex(accent.roles.fg), fromHex(accent.roles[role]));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keep the fields a required surface writes without roles', () => {
    const { tokens } = Effect.runSync(
      resolveBrand(
        testBrand({
          'logo.variants.reversed': { file: 'logos/mark.svg', aspect: 1 },
          'color.surfaces.inverse': { logo: 'reversed' },
        }),
      ),
    );
    expect(tokens.surfaces.inverse?.logo).toBe('reversed');
    expect(tokens.surfaces.inverse?.roles.bg).toBe('#18191d');
  });

  it('report a derived surface that cannot pass at the surface, naming what it came from', () => {
    const { errors } = findings(
      testBrand({
        gradients: { split: { type: 'linear', angle: 90, stops: ['#000000', '#ffffff'] } },
      }),
    );
    expect(errors).toEqual([
      {
        path: 'color.surfaces.gradient',
        message: expect.stringMatching(
          /^The brand does not define the gradient surface, and the one derived from gradients\.split fails: fg #[0-9a-f]{6} on the gradient #[0-9a-f]{6} has contrast/,
        ),
        fix: 'Define `color.surfaces.gradient` with roles that pass, or change gradients.split.',
      },
    ]);
  });
});
