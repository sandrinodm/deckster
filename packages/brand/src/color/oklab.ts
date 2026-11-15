/**
 * A color in sRGB: channels and alpha from 0 to 1.
 */
export type Rgba = {
  /**
   * Red, gamma-encoded.
   */
  r: number;

  /**
   * Green, gamma-encoded.
   */
  g: number;

  /**
   * Blue, gamma-encoded.
   */
  b: number;

  /**
   * Opacity: 0 is transparent, 1 opaque.
   */
  alpha: number;
};

/**
 * A color in OKLab: lightness from 0 to 1, `a` and `b` roughly from -0.4 to 0.4.
 */
export type Oklab = {
  /**
   * Perceptual lightness: 0 is black, 1 white.
   */
  l: number;

  /**
   * The green (negative) to red (positive) axis.
   */
  a: number;

  /**
   * The blue (negative) to yellow (positive) axis.
   */
  b: number;
};

/**
 * A color in OKLCH: lightness from 0 to 1, chroma from 0 to about 0.4, hue in degrees.
 */
export type Oklch = {
  /**
   * Perceptual lightness: 0 is black, 1 white.
   */
  l: number;

  /**
   * Chroma: 0 is gray.
   */
  c: number;

  /**
   * Hue angle in degrees.
   */
  h: number;
};

/**
 * Linear-light red, green and blue; values outside 0..1 are outside sRGB.
 */
type LinearRgb = [number, number, number];

/**
 * Three numbers: a row of a matrix, or the channels it works on.
 */
type Triple = readonly [number, number, number];

/**
 * A 3x3 matrix, one row per output value.
 */
type Matrix = readonly [Triple, Triple, Triple];

/**
 * The highest chroma the gamut search starts from: no sRGB color reaches it, so a larger chroma
 * maps to the same color.
 */
const GAMUT_SEARCH_MAX_CHROMA = 0.5;

/**
 * The most halvings the gamut search makes; from {@link GAMUT_SEARCH_MAX_CHROMA} it reaches
 * {@link GAMUT_SEARCH_EPSILON} in about 13.
 */
const GAMUT_SEARCH_MAX_STEPS = 64;

/**
 * Below this chroma difference the gamut search stops; far below what anyone can see.
 */
const GAMUT_SEARCH_EPSILON = 0.0001;

/**
 * Slack allowed on each linear channel before a color counts as outside sRGB.
 */
const GAMUT_TOLERANCE = 0.000_01;

/**
 * Converts hue angles between radians and degrees.
 */
const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * A full turn of the hue circle, in degrees.
 */
const DEGREES_PER_TURN = 360;

/**
 * The sRGB transfer curve (IEC 61966-2-1). Below the decode limit the encoding is a straight line
 * with slope {@link SRGB_LINEAR_SLOPE}; above it, a power curve with {@link SRGB_GAMMA}.
 */
const SRGB_DECODE_LIMIT = 0.040_45;

/**
 * The linear-light value below which encoding uses the straight segment.
 */
const SRGB_ENCODE_LIMIT = 0.003_130_8;

/**
 * The slope of the straight segment near black, in both directions.
 */
const SRGB_LINEAR_SLOPE = 12.92;

/**
 * The offset of the power curve, in the encoding direction.
 */
const SRGB_CURVE_OFFSET = 0.055;

/**
 * The scale of the power curve.
 */
const SRGB_CURVE_SCALE = 1.055;

/**
 * The exponent of the power curve.
 */
const SRGB_GAMMA = 2.4;

/**
 * Linear sRGB to the cone responses (LMS), Björn Ottosson's OKLab matrix.
 */
const LINEAR_RGB_TO_LMS: Matrix = [
  [0.412_221_470_8, 0.536_332_536_3, 0.051_445_992_9],
  [0.211_903_498_2, 0.680_699_545_1, 0.107_396_956_6],
  [0.088_302_461_9, 0.281_718_837_6, 0.629_978_700_5],
];

/**
 * Cube-rooted cone responses to OKLab, rows for lightness, `a` and `b`.
 */
const LMS_TO_OKLAB: Matrix = [
  [0.210_454_255_3, 0.793_617_785, -0.004_072_046_8],
  [1.977_998_495_1, -2.428_592_205, 0.450_593_709_9],
  [0.025_904_037_1, 0.782_771_766_2, -0.808_675_766],
];

/**
 * OKLab to cube-rooted cone responses, the inverse of {@link LMS_TO_OKLAB}.
 */
const OKLAB_TO_LMS: Matrix = [
  [1, 0.396_337_777_4, 0.215_803_757_3],
  [1, -0.105_561_345_8, -0.063_854_172_8],
  [1, -0.089_484_177_5, -1.291_485_548],
];

/**
 * Cone responses to linear sRGB, the inverse of {@link LINEAR_RGB_TO_LMS}.
 */
const LMS_TO_LINEAR_RGB: Matrix = [
  [4.076_741_662_1, -3.307_711_591_3, 0.230_969_929_2],
  [-1.268_438_004_6, 2.609_757_401_1, -0.341_319_396_5],
  [-0.004_196_086_3, -0.703_418_614_7, 1.707_614_701],
];

/**
 * Converts one sRGB channel to linear light.
 *
 * @param channel - A gamma-encoded channel from 0 to 1.
 */
export function toLinear(channel: number): number {
  if (channel <= SRGB_DECODE_LIMIT) {
    return channel / SRGB_LINEAR_SLOPE;
  }

  return ((channel + SRGB_CURVE_OFFSET) / SRGB_CURVE_SCALE) ** SRGB_GAMMA;
}

/**
 * Converts one linear-light channel back to gamma-encoded sRGB, clamped to 0..1.
 *
 * @param channel - A linear channel; values outside 0..1 are clamped.
 */
export function fromLinear(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel));
  if (clamped <= SRGB_ENCODE_LIMIT) {
    return clamped * SRGB_LINEAR_SLOPE;
  }

  return SRGB_CURVE_SCALE * clamped ** (1 / SRGB_GAMMA) - SRGB_CURVE_OFFSET;
}

/**
 * Converts an sRGB color to OKLab (Björn Ottosson's matrices). Alpha is ignored.
 *
 * @param color - An sRGB color.
 */
export function rgbToOklab(color: Rgba): Oklab {
  const cones = applyMatrix(LINEAR_RGB_TO_LMS, rgbToLinear(color));
  const lms: Triple = [Math.cbrt(cones[0]), Math.cbrt(cones[1]), Math.cbrt(cones[2])];
  const [l, a, b] = applyMatrix(LMS_TO_OKLAB, lms);
  return { l, a, b };
}

/**
 * Converts OKLab to sRGB. Colors outside the sRGB gamut lose chroma at constant lightness and hue
 * until they fit, which is how CSS maps wide-gamut colors.
 *
 * @param color - An OKLab color.
 * @param alpha - The alpha to attach, from 0 to 1.
 * @throws TypeError when a channel or the alpha is not finite.
 */
export function oklabToRgb(color: Oklab, alpha = 1): Rgba {
  if (![color.l, color.a, color.b, alpha].every(Number.isFinite)) {
    throw new TypeError('An OKLab color has a channel that is not a finite number.');
  }

  const direct = oklabToLinear(color);
  if (isInGamut(direct)) {
    return linearToRgba(direct, alpha);
  }

  return linearToRgba(oklabToLinear(fitChroma(color)), alpha);
}

/**
 * Converts OKLab to OKLCH.
 *
 * @param color - An OKLab color.
 */
export function oklabToOklch(color: Oklab): Oklch {
  const c = Math.hypot(color.a, color.b);
  const h =
    (Math.atan2(color.b, color.a) * DEGREES_PER_RADIAN + DEGREES_PER_TURN) % DEGREES_PER_TURN;
  return { l: color.l, c, h };
}

/**
 * Converts OKLCH to OKLab.
 *
 * @param color - An OKLCH color; the hue is in degrees.
 */
export function oklchToOklab(color: Oklch): Oklab {
  const radians = color.h / DEGREES_PER_RADIAN;
  return { l: color.l, a: color.c * Math.cos(radians), b: color.c * Math.sin(radians) };
}

/**
 * Linear-light sRGB channels, for color-vision simulation.
 *
 * @param color - An sRGB color.
 */
export function rgbToLinear(color: Rgba): LinearRgb {
  return [toLinear(color.r), toLinear(color.g), toLinear(color.b)];
}

/**
 * Builds an sRGB color from linear-light channels, clamping each to 0..1.
 *
 * @param channels - Linear red, green and blue.
 * @param alpha - The alpha to attach.
 */
export function linearToRgba(channels: Triple, alpha = 1): Rgba {
  const [r, g, b] = channels;
  return { r: fromLinear(r), g: fromLinear(g), b: fromLinear(b), alpha };
}

/**
 * Converts OKLab to linear-light sRGB without clamping, so the gamut check can see how far out a
 * color is.
 *
 * @param color - A color in OKLab.
 */
function oklabToLinear(color: Oklab): Triple {
  const cones = applyMatrix(OKLAB_TO_LMS, [color.l, color.a, color.b]);
  const cubed: Triple = [cones[0] ** 3, cones[1] ** 3, cones[2] ** 3];
  return applyMatrix(LMS_TO_LINEAR_RGB, cubed);
}

/**
 * Multiplies a matrix by a column of three numbers.
 *
 * @param matrix - The matrix, one row per output value.
 * @param channels - The three input values.
 */
function applyMatrix(matrix: Matrix, channels: Triple): Triple {
  return [dot(matrix[0], channels), dot(matrix[1], channels), dot(matrix[2], channels)];
}

/**
 * The weighted sum of one matrix row and three input values.
 *
 * @param row - The weights.
 * @param channels - The three input values.
 */
function dot(row: Triple, channels: Triple): number {
  return row[0] * channels[0] + row[1] * channels[1] + row[2] * channels[2];
}

/**
 * Whether linear channels fit in sRGB, allowing {@link GAMUT_TOLERANCE} of rounding slack.
 *
 * @param channels - Linear red, green and blue.
 */
function isInGamut(channels: Triple): boolean {
  return channels.every((channel) => channel >= -GAMUT_TOLERANCE && channel <= 1 + GAMUT_TOLERANCE);
}

/**
 * Bisects chroma down until the color fits in sRGB, keeping lightness and hue. The search starts at
 * {@link GAMUT_SEARCH_MAX_CHROMA} at most and stops after {@link GAMUT_SEARCH_MAX_STEPS} halvings
 * whatever happens, keeping the highest chroma found to fit (gray, chroma 0, if none did).
 *
 * @param color - An OKLab color outside sRGB, with finite channels.
 */
export function fitChroma(color: Oklab): Oklab {
  const lch = oklabToOklch(color);
  const { l, h } = lch;
  let low = 0;
  let high = Math.min(lch.c, GAMUT_SEARCH_MAX_CHROMA);
  for (let step = 0; step < GAMUT_SEARCH_MAX_STEPS && high - low > GAMUT_SEARCH_EPSILON; step++) {
    const middle = (low + high) / 2;
    if (isInGamut(oklabToLinear(oklchToOklab({ l, c: middle, h })))) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return oklchToOklab({ l, c: low, h });
}
