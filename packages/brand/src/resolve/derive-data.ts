import type { Hex } from '#resolve/brand-tokens.ts';
import type { SurfaceColors } from '#resolve/surface-colors.ts';

import { GRAPHIC_CONTRAST } from '#checks/contrast-thresholds.ts';
import {
  closeness,
  COMFORTABLE_ADJACENT_DELTA_E,
  CONTEXT_CONTRAST,
  CONTEXT_CONTRAST_RANGE,
  MIN_ADJACENT_DELTA_E,
  MIN_ADJACENT_DELTA_E_CVD,
} from '#checks/data-thresholds.ts';
import { formatHex, fromHex, type Rgba } from '#color/color.ts';
import {
  closestLightness,
  contrastRatio,
  directionAway,
  ensureContrast,
  searchLightness,
  worstContrast,
} from '#color/contrast.ts';

/**
 * Contrast the surface's text must reach on a background before charts can draw on it directly.
 * Chart marks need 3:1 against what they sit on while the text needs 4.5:1; a background where the
 * text reaches less than this is a mid-tone that leaves too narrow a band of lightness for six
 * distinct chart colors, so charts there draw a plate. A derived plate is moved until the text
 * reaches this ratio on it.
 */
export const CHART_PLATE_CONTRAST = 10;

/**
 * The context color a fitted palette aims for first: just above {@link CONTEXT_CONTRAST}, so thin
 * context lines stay visible while the color stays well under the series and the text.
 */
const CONTEXT_TARGET = {
  /**
   * The contrast every context color is held to.
   */
  minimum: CONTEXT_CONTRAST,

  /**
   * Comfortably below the 4.5:1 at which it competes with text and the series.
   */
  maximum: 3.4,
} as const;

/**
 * The band a context color is accepted in without fitting: at least {@link CONTEXT_CONTRAST}, under
 * the failing maximum.
 */
const CONTEXT_ACCEPTED = {
  /**
   * The contrast every context color is held to.
   */
  minimum: CONTEXT_CONTRAST,

  /**
   * The ratio past which it fails.
   */
  maximum: CONTEXT_CONTRAST_RANGE.maximum,
} as const;

/**
 * The plate charts on a surface draw behind themselves: the brand's plate for the surface when it
 * sets one; `bg` on a solid surface whose text reaches {@link CHART_PLATE_CONTRAST} on it, so the
 * plate is invisible; otherwise the backdrop color the text reads best on, moved in lightness away
 * from the text until it reaches that ratio.
 *
 * @param surface - The surface's roles and backdrop.
 * @param override - The plate the brand sets for this surface, resolved, if any.
 * @returns An opaque hex color, unless the brand's own plate is translucent (which fails its
 *   check).
 */
export function chartPlate(surface: SurfaceColors, override: Hex | undefined): Hex {
  if (override !== undefined) {
    return override;
  }

  const fg = fromHex(surface.roles.fg);
  const backdrop = surface.backdrop.map(fromHex);
  if (surface.gradient === undefined && worstContrast(fg, backdrop) >= CHART_PLATE_CONTRAST) {
    return surface.roles.bg;
  }

  const ranked = [...backdrop].sort((a, b) => contrastRatio(fg, b) - contrastRatio(fg, a));
  const deepest = ranked[0] ?? fromHex(surface.roles.bg);
  /**
   * Whether the text reaches the plate contrast on a candidate.
   */
  const roomy = (candidate: Rgba): boolean => contrastRatio(fg, candidate) >= CHART_PLATE_CONTRAST;
  const away = directionAway(deepest, fg);
  const plate =
    searchLightness(deepest, away, roomy) ?? ensureContrast(deepest, fg, CHART_PLATE_CONTRAST);
  return formatHex(plate);
}

/**
 * Whether every color of a palette reaches 3:1 on a plate, the WCAG minimum for chart marks.
 *
 * @param colors - The palette.
 * @param plate - The opaque plate.
 */
export function marksVisible(colors: readonly Hex[], plate: Rgba): boolean {
  return colors.every((hex) => contrastRatio(fromHex(hex), plate) >= GRAPHIC_CONTRAST);
}

/**
 * Whether a context color needs no fitting on a plate: it reaches {@link CONTEXT_CONTRAST}, so thin
 * context lines stay visible, and stays under the maximum at which it competes with the series.
 *
 * @param hex - The context color.
 * @param plate - The opaque plate.
 */
export function contextFits(hex: Hex, plate: Rgba): boolean {
  const ratio = contrastRatio(fromHex(hex), plate);
  return ratio >= CONTEXT_ACCEPTED.minimum && ratio < CONTEXT_ACCEPTED.maximum;
}

/**
 * Adjusts a categorical palette for a plate it falls short on. Each color keeps its hue and its
 * place in the order and moves to the nearest lightness that reaches 3:1 on the plate and stays
 * apart from the color before it, comfortably if it can (ΔE 15 with normal vision, 8 under each
 * deficiency), else at least at the failing distance; failing both, it only reaches 3:1, and the
 * checks report the neighbours.
 *
 * @param colors - The brand's categorical palette, in chart order.
 * @param plate - The opaque plate charts draw on.
 * @returns The adjusted palette, as long as the original.
 */
export function fitCategorical(colors: readonly Hex[], plate: Rgba): Hex[] {
  const fitted: Hex[] = [];
  for (const hex of colors) {
    const color = fromHex(hex);
    const previous = fitted.at(-1);
    const chosen =
      closestLightness(color, (candidate) =>
        fitsCategorical(candidate, plate, previous, COMFORTABLE_ADJACENT_DELTA_E),
      ) ??
      closestLightness(color, (candidate) =>
        fitsCategorical(candidate, plate, previous, MIN_ADJACENT_DELTA_E),
      ) ??
      ensureContrast(color, plate, GRAPHIC_CONTRAST);
    fitted.push(formatHex(chosen));
  }

  return fitted;
}

/**
 * Whether a candidate for a categorical color reaches 3:1 on the plate and stays apart from the
 * color before it: by `normal` under normal vision, and by the deficient minimum under each
 * color-vision deficiency. The first color has no neighbour, so only the plate counts.
 *
 * @param candidate - The color under test.
 * @param plate - The opaque plate charts draw on.
 * @param previous - The hex color before it in the palette, if any.
 * @param normal - The least ΔE from `previous` under normal vision.
 */
function fitsCategorical(
  candidate: Rgba,
  plate: Rgba,
  previous: Hex | undefined,
  normal: number,
): boolean {
  return (
    contrastRatio(candidate, plate) >= GRAPHIC_CONTRAST &&
    (previous === undefined ||
      closeness(previous, formatHex(candidate), {
        normal,
        deficient: MIN_ADJACENT_DELTA_E_CVD,
      }).length === 0)
  );
}

/**
 * Adjusts a context color for a plate it does not fit: the nearest lightness of the same hue whose
 * contrast lands just above {@link CONTEXT_CONTRAST}, else anywhere from there up to the maximum,
 * else anywhere in the band that does not fail.
 *
 * @param hex - The brand's context color.
 * @param plate - The opaque plate charts draw on.
 * @returns The adjusted color, or the original when no lightness fits.
 */
export function fitContext(hex: Hex, plate: Rgba): Hex {
  const color = fromHex(hex);
  const chosen =
    closestLightness(color, (candidate) => inBand(candidate, plate, CONTEXT_TARGET)) ??
    closestLightness(color, (candidate) => inBand(candidate, plate, CONTEXT_ACCEPTED)) ??
    closestLightness(color, (candidate) => inBand(candidate, plate, CONTEXT_CONTRAST_RANGE));
  return chosen === undefined ? hex : formatHex(chosen);
}

/**
 * Whether a color's contrast on the plate falls inside a band: at least its minimum and under its
 * maximum.
 *
 * @param candidate - The color under test.
 * @param plate - The opaque plate charts draw on.
 * @param band - The contrast range to land in.
 */
function inBand(
  candidate: Rgba,
  plate: Rgba,
  band: { readonly minimum: number; readonly maximum: number },
): boolean {
  const ratio = contrastRatio(candidate, plate);
  return ratio >= band.minimum && ratio < band.maximum;
}
