import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { closeness, MIN_DIVERGING_ENDS_DELTA_E } from '#checks/data-thresholds.ts';
import { formatHex, fromHex } from '#color/color.ts';
import { contrastRatio } from '#color/contrast.ts';
import { oklabToOklch, rgbToOklab } from '#color/oklab.ts';
import { DIFF_TINT_MIN_DISTANCE, diffTints, oklabDistance } from '#resolve/derive-themes.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * The default brand's code panel on its blue gradient surface, where a plain mix of the roles
 * turned added lines blue and removed lines purple, and the roles' own hues at full strength laid
 * saturated teal and orange bands across the blue.
 */
const GRADIENT = {
  background: fromHex('#3f51c1'),
  foreground: fromHex('#ffffff'),
  positive: fromHex('#a5f3fc'),
  negative: fromHex('#ffa98f'),
};

/**
 * The OKLCH hue of a color, in degrees.
 */
function hueOf(color: ReturnType<typeof fromHex>): number {
  return oklabToOklch(rgbToOklab(color)).h;
}

/**
 * The OKLCH chroma of a color.
 */
function chromaOf(color: ReturnType<typeof fromHex>): number {
  return oklabToOklch(rgbToOklab(color)).c;
}

/**
 * The distance between two hues in degrees, the short way round.
 */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe('diffTints', () => {
  it('turns each tint toward its role on a saturated panel, quieter than the panel and readable', () => {
    const { background, foreground, positive, negative } = GRADIENT;
    const { added, removed } = diffTints(background, positive, negative, foreground);
    for (const [tint, role] of [
      [added, positive],
      [removed, negative],
    ] as const) {
      expect(contrastRatio(foreground, tint)).toBeGreaterThanOrEqual(4.5);
      expect(oklabDistance(tint, background)).toBeGreaterThanOrEqual(DIFF_TINT_MIN_DISTANCE);
      expect(hueDistance(hueOf(tint), hueOf(role))).toBeLessThan(
        hueDistance(hueOf(background), hueOf(role)),
      );
      expect(chromaOf(tint)).toBeLessThan(chromaOf(background));
      expect(oklabDistance(tint, background)).toBeLessThan(oklabDistance(role, background) / 2);
    }

    expect(oklabDistance(added, removed)).toBeGreaterThanOrEqual(DIFF_TINT_MIN_DISTANCE);
  });

  it('gives a neutral panel pale tints in the roles’ hues', () => {
    const background = fromHex('#f4f5f8');
    const { added, removed } = diffTints(
      background,
      GRADIENT.positive,
      GRADIENT.negative,
      fromHex('#161920'),
    );
    expect(hueDistance(hueOf(added), hueOf(GRADIENT.positive))).toBeLessThan(20);
    expect(hueDistance(hueOf(removed), hueOf(GRADIENT.negative))).toBeLessThan(20);
    expect(oklabDistance(added, removed)).toBeGreaterThanOrEqual(DIFF_TINT_MIN_DISTANCE);
  });
});

/**
 * Whether a pair of tints passes what the brand's diff check asks of it.
 */
function passesCheck(
  pair: { added: ReturnType<typeof fromHex>; removed: ReturnType<typeof fromHex> },
  background: ReturnType<typeof fromHex>,
  foreground: ReturnType<typeof fromHex>,
): boolean {
  const added = fromHex(formatHex(pair.added));
  const removed = fromHex(formatHex(pair.removed));
  return (
    contrastRatio(foreground, added) >= 4.5 &&
    contrastRatio(foreground, removed) >= 4.5 &&
    oklabDistance(added, background) >= DIFF_TINT_MIN_DISTANCE &&
    oklabDistance(removed, background) >= DIFF_TINT_MIN_DISTANCE &&
    oklabDistance(added, removed) >= DIFF_TINT_MIN_DISTANCE
  );
}

/**
 * A repeatable stream of random hex colors.
 */
function randomColors(seed: number): () => string {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return `#${(state % 0x1000000).toString(16).padStart(6, '0')}`;
  };
}

describe('derived diff tints', () => {
  it('pass the diff check where the hue route alone set them almost alike', () => {
    // Roles that survive every color-vision deficiency, which the old derivation still tinted
    // within ΔOK 0.05 of each other once the code text was made readable on them.
    const cases = [
      ['#f3f677', '#2c43c7', '#b62f9d', '#740b4a'],
      ['#1e2537', '#2fadac', '#147fae', '#85c813'],
      ['#3c2b6b', '#d9a2ad', '#c5d9d5', '#09ba51'],
      ['#fefdbc', '#506ec5', '#43614f', '#c23ea1'],
    ];
    for (const [bg, fg, positive, negative] of cases) {
      const background = fromHex(bg!);
      const foreground = fromHex(fg!);
      const pair = diffTints(background, fromHex(positive!), fromHex(negative!), foreground);
      expect(passesCheck(pair, background, foreground), `${bg} ${fg} ${positive} ${negative}`).toBe(
        true,
      );
    }
  });

  it('never fail the diff check for roles a valid brand may have', () => {
    const next = randomColors(7);
    let tried = 0;
    while (tried < 400) {
      const [bg, fg, positive, negative] = [next(), next(), next(), next()];
      const background = fromHex(bg);
      const foreground = fromHex(fg);
      const valid =
        contrastRatio(foreground, background) >= 4.5 &&
        contrastRatio(fromHex(positive), background) >= 3 &&
        contrastRatio(fromHex(negative), background) >= 3 &&
        closeness(positive, negative, { normal: 0, deficient: MIN_DIVERGING_ENDS_DELTA_E })
          .length === 0;
      if (!valid) {
        continue;
      }

      tried += 1;
      const pair = diffTints(background, fromHex(positive), fromHex(negative), foreground);
      expect(passesCheck(pair, background, foreground), `${bg} ${fg} ${positive} ${negative}`).toBe(
        true,
      );
    }
  });

  it('derive the other tint apart from one the brand sets', () => {
    const background = fromHex('#f4f5f8');
    const foreground = fromHex('#161920');
    const fixed = fromHex('#f8deda');
    const { added, removed } = diffTints(
      background,
      GRADIENT.positive,
      fromHex('#d23c28'),
      foreground,
      { removed: fixed },
    );
    expect(formatHex(removed)).toBe('#f8deda');
    expect(passesCheck({ added, removed }, background, foreground)).toBe(true);
  });
});

describe('the diff tint check', () => {
  it.effect('finds nothing to report on derived tints of a valid brand', () =>
    Effect.gen(function* () {
      const { warnings } = yield* resolveBrand(
        testBrand({ 'color.roles.positive': '#147fae', 'color.roles.negative': '#c8331f' }),
      );
      expect(warnings.filter((warning) => warning.message.includes('line'))).toEqual([]);
    }),
  );

  it.effect(
    'names the code colors, not tints nobody wrote, when no two tints can stand apart',
    () =>
      Effect.gen(function* () {
        const { warnings } = yield* resolveBrand(
          testBrand({ code: { background: '#ffffff', foreground: '#757575' } }),
        );
        const diff = warnings.filter(
          (warning) =>
            warning.message.includes('line tints') && warning.message.includes('default surface'),
        );
        expect(diff).toEqual([
          expect.objectContaining({
            path: 'code.foreground',
            message: expect.stringContaining('reads on so few colors near the code background'),
          }),
        ]);
      }),
  );

  it('warns when an overridden tint is the code background, so a diff shows nothing', () => {
    const { warnings } = Effect.runSync(
      resolveBrand(testBrand({ code: { background: '#f4f5f8', added: '#f4f5f8' } })),
    );
    expect(warnings.map((warning) => warning.message)).toContainEqual(
      expect.stringContaining('added line tint #f4f5f8 is too close to the code background'),
    );
  });
});
