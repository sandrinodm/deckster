import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { fromHex } from '#color/color.ts';
import { contrastRatio } from '#color/contrast.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { meshSamples } from '#resolve/surface-colors.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * A translucent black glow at the middle of the slide.
 */
const VEIL = { color: '#00000066', x: 50, y: 50, size: 40 };

/**
 * The test brand with a gradient surface over a white mesh with the given glows, and roles that
 * read on one veil but not on two stacked.
 *
 * @param points - The mesh's glows.
 */
function veiledBrand(points: readonly (typeof VEIL)[]): unknown {
  return testBrand({
    gradients: { veil: { type: 'mesh', base: 'gray.0', points } },
    'color.surfaces.gradient': {
      gradient: 'veil',
      surface: 'gray.0',
      fg: '#000000',
      heading: '#000000',
      muted: '#000000',
      accent: '#000000',
      'accent-fg': 'gray.0',
      border: 'gray.900',
      positive: '#000000',
      negative: '#000000',
    },
  });
}

/**
 * The problems a brand fails with, or none when it resolves.
 *
 * @param brand - The brand as written.
 */
function problemsOf(brand: unknown) {
  const result = Effect.runSync(Effect.result(resolveBrand(brand)));
  return Result.isFailure(result) ? result.failure.problems : [];
}

describe('mesh gradient contrast', () => {
  it('accepts text that reads on one translucent glow', () => {
    expect(problemsOf(veiledBrand([VEIL]))).toEqual([]);
  });

  it('measures text where glows overlap, not each glow alone over the base', () => {
    const paths = problemsOf(veiledBrand([VEIL, VEIL])).map((problem) => problem.path);
    expect(paths).toContain('color.surfaces.gradient.fg');
  });

  it('samples the composite of every glow over the base', () => {
    const samples = meshSamples({ base: '#ffffff', points: [VEIL, VEIL] }, fromHex('#ffffff'));
    const black = Math.min(...samples.map((sample) => contrastRatio(fromHex('#000000'), sample)));
    expect(black).toBeCloseTo(3.13, 1);
    expect(samples.map((sample) => contrastRatio(fromHex('#000000'), sample))).toContain(21);
  });
});
