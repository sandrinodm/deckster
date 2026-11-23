import type { Hex } from '#resolve/brand-tokens.ts';

import {
  COLOR_VISION_DEFICIENCIES,
  deltaE,
  simulateColorVision,
  type ColorVision,
} from '#color/color-vision.ts';
import { fromHex } from '#color/color.ts';

/**
 * Neighbouring categorical colors closer than this (OKLab ×100, normal vision) fail.
 */
export const MIN_ADJACENT_DELTA_E = 10;

/**
 * Neighbouring categorical colors closer than this with normal vision get a warning.
 */
export const COMFORTABLE_ADJACENT_DELTA_E = 15;

/**
 * Neighbouring categorical colors closer than this under any simulated deficiency fail.
 */
export const MIN_ADJACENT_DELTA_E_CVD = 8;

/**
 * Two colors that carry opposite meanings (a diverging palette's ends, `positive` and `negative`)
 * must differ by this much under every simulated deficiency.
 */
export const MIN_DIVERGING_ENDS_DELTA_E = 12;

/**
 * The contrast the context color is held to on every surface's plate. Context data is drawn as thin
 * lines, small dots and muted bars, so it needs the 3:1 of graphical objects (WCAG 1.4.11) to stay
 * visible; the resolver moves the brand's context color in lightness until it reaches this on each
 * plate, and `deckster brand check` warns about a context color a surface writes that stays under
 * it.
 */
export const CONTEXT_CONTRAST = 3;

/**
 * The band outside which a context color fails: under the minimum context data is invisible; from
 * the maximum on it reads as strong as text and competes with the series. Inside the band but under
 * {@link CONTEXT_CONTRAST} it is a warning.
 */
export const CONTEXT_CONTRAST_RANGE = {
  /**
   * The lowest contrast ratio against the plate; fainter context data is invisible.
   */
  minimum: 1.4,

  /**
   * The ratio the context color must stay under, so it never competes with text or a series.
   */
  maximum: 4.5,
} as const;

/**
 * Normal vision and every simulated deficiency, in the order messages list them.
 */
export const VISIONS: readonly ColorVision[] = ['normal', ...COLOR_VISION_DEFICIENCIES];

/**
 * Two colors that are too close under one vision.
 */
export type Closeness = {
  /**
   * Normal vision or the simulated deficiency.
   */
  vision: ColorVision;

  /**
   * Their OKLab distance ×100 under that vision.
   */
  distance: number;

  /**
   * The distance they needed to reach.
   */
  minimum: number;
};

/**
 * How two colors compare under each vision, against a normal-vision minimum and a minimum for the
 * simulated deficiencies.
 *
 * @param a - One color.
 * @param b - The other color.
 * @param minimums - The distances to reach with normal vision and under each deficiency.
 * @returns The visions under which the two are closer than their minimum; empty when they are apart
 *   under every vision.
 */
export function closeness(
  a: Hex,
  b: Hex,
  minimums: { normal: number; deficient: number },
): Closeness[] {
  return VISIONS.flatMap((vision) => {
    const distance = deltaE(
      simulateColorVision(fromHex(a), vision),
      simulateColorVision(fromHex(b), vision),
    );
    const minimum = vision === 'normal' ? minimums.normal : minimums.deficient;
    return distance < minimum ? [{ vision, distance, minimum }] : [];
  });
}

/**
 * Lists the visions under which two colors are too close, with each distance and its minimum.
 *
 * @param results - The failing visions, from {@link closeness}.
 */
export function describeCloseness(results: readonly Closeness[]): string {
  return results
    .map((result) => `${result.vision} (ΔE ${result.distance.toFixed(1)}, wants ${result.minimum})`)
    .join(', ');
}
