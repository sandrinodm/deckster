import type { Rgba } from '#color/color.ts';

import { linearToRgba, rgbToLinear, rgbToOklab } from '#color/oklab.ts';

/**
 * The color-vision deficiencies the data palette checks simulate.
 */
export type ColorVision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';

/**
 * The deficiencies to simulate, without normal vision.
 */
export const COLOR_VISION_DEFICIENCIES = ['protanopia', 'deuteranopia', 'tritanopia'] as const;

/**
 * A 3x3 matrix applied to linear red, green and blue, one row per output channel.
 */
type Matrix = readonly [Row, Row, Row];

/**
 * The weights of linear red, green and blue that make one output channel.
 */
type Row = readonly [number, number, number];

/**
 * Machado, Oliveira and Fernandes (2009) simulation matrices at full severity, applied to linear
 * RGB. The same matrices back the brand-import skill's checks, so both report the same numbers.
 */
const SIMULATION_MATRICES: Readonly<Record<Exclude<ColorVision, 'normal'>, Matrix>> = {
  /**
   * No working long-wavelength (red) cones.
   */
  protanopia: [
    [0.152_286, 1.052_583, -0.204_868],
    [0.114_503, 0.786_281, 0.099_216],
    [-0.003_882, -0.048_116, 1.051_998],
  ],

  /**
   * No working medium-wavelength (green) cones.
   */
  deuteranopia: [
    [0.367_322, 0.860_646, -0.227_968],
    [0.280_085, 0.672_501, 0.047_413],
    [-0.011_82, 0.042_94, 0.968_881],
  ],

  /**
   * No working short-wavelength (blue) cones.
   */
  tritanopia: [
    [1.255_528, -0.076_749, -0.178_779],
    [-0.078_411, 0.930_809, 0.147_602],
    [0.004_733, 0.691_367, 0.303_9],
  ],
};

/**
 * OKLab distances are reported ×100, so about 2 is a just-noticeable difference.
 */
const DELTA_E_SCALE = 100;

/**
 * Simulates how a color looks with a color-vision deficiency.
 *
 * @param color - An sRGB color.
 * @param vision - The deficiency; `normal` returns the color unchanged.
 */
export function simulateColorVision(color: Rgba, vision: ColorVision): Rgba {
  if (vision === 'normal') {
    return color;
  }

  const matrix = SIMULATION_MATRICES[vision];
  const linear = rgbToLinear(color);
  /**
   * One output channel: the row's weighted sum of the linear input channels.
   */
  const apply = (row: Row): number => row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2];
  return linearToRgba([apply(matrix[0]), apply(matrix[1]), apply(matrix[2])], color.alpha);
}

/**
 * Perceptual distance between two colors: Euclidean distance in OKLab, ×100.
 *
 * @param a - One color.
 * @param b - The other color.
 * @returns 0 for identical colors; 15 or more reads as clearly different at a glance.
 */
export function deltaE(a: Rgba, b: Rgba): number {
  const x = rgbToOklab(a);
  const y = rgbToOklab(b);
  return DELTA_E_SCALE * Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

/**
 * OKLab lightness of a color, from 0 to 1.
 *
 * @param color - An sRGB color.
 */
export function lightness(color: Rgba): number {
  return rgbToOklab(color).l;
}
