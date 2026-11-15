import { compositeOver, formatHex, fromHex, type Rgba } from '#color/color.ts';
import { oklabToOklch, oklabToRgb, oklchToOklab, rgbToOklab, toLinear } from '#color/oklab.ts';

/**
 * WCAG 2.x adds this to both luminances so pure black does not divide by zero.
 */
const FLARE = 0.05;

/**
 * The weight of linear red in WCAG 2.x relative luminance.
 */
const LUMINANCE_RED = 0.2126;

/**
 * The weight of linear green in WCAG 2.x relative luminance.
 */
const LUMINANCE_GREEN = 0.7152;

/**
 * The weight of linear blue in WCAG 2.x relative luminance.
 */
const LUMINANCE_BLUE = 0.0722;

/**
 * Lightness change per step when searching for a color that reaches a contrast ratio.
 */
const LIGHTNESS_STEP = 0.005;

/**
 * The most steps a lightness search takes: enough to cross the whole range from 0 to 1, so the cap
 * only matters if the start is not a lightness at all.
 */
const MAX_LIGHTNESS_STEPS = Math.ceil(1 / LIGHTNESS_STEP) + 1;

/**
 * Opaque black, the darkest color a search can end on.
 */
const BLACK: Rgba = fromHex('#000000');

/**
 * Opaque white, the lightest color a search can end on.
 */
const WHITE: Rgba = fromHex('#ffffff');

/**
 * `1` to make a color lighter, `-1` to make it darker.
 */
export type Direction = 1 | -1;

/**
 * WCAG 2.x relative luminance of an opaque color.
 *
 * @param color - An sRGB color; alpha is ignored.
 * @returns A value from 0 (black) to 1 (white).
 */
export function relativeLuminance(color: Rgba): number {
  return (
    LUMINANCE_RED * toLinear(color.r) +
    LUMINANCE_GREEN * toLinear(color.g) +
    LUMINANCE_BLUE * toLinear(color.b)
  );
}

/**
 * WCAG 2.x contrast ratio between a foreground and the background it sits on. A translucent
 * foreground is painted over the background first.
 *
 * @param foreground - Text or mark color.
 * @param background - The opaque color underneath.
 * @returns A ratio from 1 to 21.
 */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const top = foreground.alpha < 1 ? compositeOver(foreground, background) : foreground;
  const a = relativeLuminance(top);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + FLARE) / (Math.min(a, b) + FLARE);
}

/**
 * The lowest contrast ratio a color reaches across several backgrounds.
 *
 * @param color - Text or mark color.
 * @param backgrounds - Opaque backgrounds, such as every color of a gradient.
 * @returns The worst ratio, or `Infinity` when there are no backgrounds.
 */
export function worstContrast(color: Rgba, backgrounds: readonly Rgba[]): number {
  return Math.min(...backgrounds.map((background) => contrastRatio(color, background)));
}

/**
 * Moves a color's OKLCH lightness the least amount needed to reach a contrast ratio against a
 * background. See {@link ensureContrastOnAll}.
 *
 * @param color - The color to adjust.
 * @param background - The opaque background.
 * @param ratio - The contrast ratio to reach, such as 4.5.
 * @returns The adjusted color, rounded to 8-bit hex, or black or white (whichever contrasts more)
 *   when no lightness reaches the ratio.
 */
export function ensureContrast(color: Rgba, background: Rgba, ratio: number): Rgba {
  return ensureContrastOnAll(color, [background], ratio);
}

/**
 * Moves a color's OKLCH lightness the least amount needed to reach a contrast ratio against every
 * background at once: first further away on the side the color is already on (darker text gets
 * darker), then, if that side cannot reach the ratio, on the other side. Hue and chroma stay as
 * close as sRGB allows. Every candidate is rounded to 8-bit hex before it is measured, so the
 * result still passes once it is written out.
 *
 * @param color - The color to adjust; its alpha is kept.
 * @param backgrounds - Opaque backgrounds, such as every color of a gradient.
 * @param ratio - The contrast ratio to reach.
 * @returns The adjusted color, or black or white (whichever has the better worst case) when no
 *   lightness passes on every background; measure the result when that matters.
 */
export function ensureContrastOnAll(
  color: Rgba,
  backgrounds: readonly Rgba[],
  ratio: number,
): Rgba {
  /**
   * Whether a candidate reaches the ratio on every background.
   */
  const passes = (candidate: Rgba): boolean => worstContrast(candidate, backgrounds) >= ratio;
  const rounded = roundToHex(color);
  if (passes(rounded)) {
    return rounded;
  }

  const natural = naturalDirection(rounded, backgrounds);
  const found =
    searchLightness(rounded, natural, passes) ?? searchLightness(rounded, flip(natural), passes);
  return found ?? bestExtreme(backgrounds);
}

/**
 * Steps a color's OKLCH lightness in one direction until a candidate is accepted (the color itself
 * first), keeping alpha, and chroma and hue as far as sRGB allows.
 *
 * @param color - The color to start from.
 * @param direction - `1` to lighten, `-1` to darken.
 * @param accepts - Whether a candidate, already rounded to 8-bit hex, is good enough.
 * @returns The first accepted candidate, or `undefined` when lightness runs out first.
 */
export function searchLightness(
  color: Rgba,
  direction: Direction,
  accepts: (candidate: Rgba) => boolean,
): Rgba | undefined {
  const own = roundToHex(color);
  if (accepts(own)) {
    return own;
  }

  const start = oklabToOklch(rgbToOklab(color)).l;
  let steps = 0;
  for (
    let l = start;
    l >= 0 && l <= 1 && steps < MAX_LIGHTNESS_STEPS;
    l += direction * LIGHTNESS_STEP
  ) {
    steps += 1;
    const candidate = withLightness(color, l);
    if (accepts(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * The accepted color nearest in OKLCH lightness to the one given (the color itself first), looking
 * both lighter and darker at once; the smaller change wins and lighter wins a tie.
 *
 * @param color - The color to start from.
 * @param accepts - Whether a candidate, already rounded to 8-bit hex, is good enough.
 * @returns The nearest accepted candidate, or `undefined` when no lightness is accepted.
 */
export function closestLightness(
  color: Rgba,
  accepts: (candidate: Rgba) => boolean,
): Rgba | undefined {
  const own = roundToHex(color);
  if (accepts(own)) {
    return own;
  }

  const start = oklabToOklch(rgbToOklab(color)).l;
  let steps = 0;
  for (
    let offset = LIGHTNESS_STEP;
    offset <= 1 && steps < MAX_LIGHTNESS_STEPS;
    offset += LIGHTNESS_STEP
  ) {
    steps += 1;
    const candidates = [start + offset, start - offset].filter((l) => l >= 0 && l <= 1);
    if (candidates.length === 0) {
      return undefined;
    }

    const found = candidates.map((l) => withLightness(color, l)).find(accepts);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

/**
 * A color with its OKLCH lightness replaced, its hue kept and its chroma reduced only as far as
 * sRGB needs, rounded to 8-bit hex.
 *
 * @param color - The color; its alpha is kept.
 * @param l - The new lightness, from 0 to 1; values outside are clamped.
 */
export function withLightness(color: Rgba, l: number): Rgba {
  const lch = oklabToOklch(rgbToOklab(color));
  const clamped = Math.min(1, Math.max(0, l));
  return roundToHex(oklabToRgb(oklchToOklab({ ...lch, l: clamped }), color.alpha));
}

/**
 * The direction that moves a color away from a background: darker when the color is darker than it,
 * lighter otherwise.
 *
 * @param color - The color that moves.
 * @param background - The opaque color it moves away from.
 */
export function directionAway(color: Rgba, background: Rgba): Direction {
  return relativeLuminance(color) < relativeLuminance(background) ? -1 : 1;
}

/**
 * A color as 8-bit hex would write it, so measurements match the tokens.
 *
 * @param color - Any sRGB color.
 */
export function roundToHex(color: Rgba): Rgba {
  return fromHex(formatHex(color));
}

/**
 * The side a color should move to: away from every background when it is darker or lighter than all
 * of them, else toward whichever of black and white contrasts better with all of them.
 */
function naturalDirection(color: Rgba, backgrounds: readonly Rgba[]): Direction {
  const own = relativeLuminance(color);
  const luminances = backgrounds.map(relativeLuminance);
  if (own <= Math.min(...luminances)) {
    return -1;
  }

  if (own >= Math.max(...luminances)) {
    return 1;
  }

  return worstContrast(BLACK, backgrounds) > worstContrast(WHITE, backgrounds) ? -1 : 1;
}

/**
 * The other direction.
 */
function flip(direction: Direction): Direction {
  return direction === 1 ? -1 : 1;
}

/**
 * Black or white, whichever has the better worst-case contrast on the backgrounds.
 */
function bestExtreme(backgrounds: readonly Rgba[]): Rgba {
  return worstContrast(BLACK, backgrounds) > worstContrast(WHITE, backgrounds) ? BLACK : WHITE;
}
