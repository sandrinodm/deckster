import type { DerivedSurfaces } from '#checks/contrast-checks.ts';
import type { BrandTokens, Hex } from '#resolve/brand-tokens.ts';
import type { Brand } from '#schema/brand-schema.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import {
  closeness,
  describeCloseness,
  MIN_DIVERGING_ENDS_DELTA_E,
  type Closeness,
} from '#checks/data-thresholds.ts';

/**
 * The path of a warning about the base roles' pair.
 */
const BASE_POSITIVE_PATH = 'color.roles.positive';

/**
 * Warns when a surface's `positive` and `negative` colors look alike under a simulated color-vision
 * deficiency, the usual red-against-green trap: about one man in twelve could not tell a gain from
 * a loss by color. They must differ by ΔE {@link MIN_DIVERGING_ENDS_DELTA_E} under protanopia,
 * deuteranopia and tritanopia. A pair shared by several surfaces is reported once, and a derived
 * surface is not reported again once the base pair is.
 *
 * @param brand - The decoded brand with its surfaces completed, for the field paths.
 * @param tokens - The resolved tokens.
 * @param derived - The derived surfaces; a pair found on one is reported at the surface.
 * @returns One warning per distinct pair that merges; never an error.
 */
export function checkPositiveNegative(
  brand: Brand,
  tokens: BrandTokens,
  derived: DerivedSurfaces,
): BrandProblem[] {
  const seen = new Set<string>();
  const warnings: BrandProblem[] = [];
  for (const surface of Object.values(tokens.surfaces)) {
    const { positive, negative } = surface.roles;
    const key = `${positive} ${negative}`;
    const repeatsBase =
      derived.has(surface.name) && warnings.some((warning) => warning.path === BASE_POSITIVE_PATH);
    if (seen.has(key) || repeatsBase) {
      continue;
    }

    seen.add(key);
    const merged = closeness(positive, negative, {
      normal: 0,
      deficient: MIN_DIVERGING_ENDS_DELTA_E,
    });
    if (merged.length > 0) {
      const path = positivePath(brand, surface.name, derived);
      warnings.push(pairWarning({ path, surface: surface.name, positive, negative, merged }));
    }
  }

  return warnings;
}

/**
 * A pair that merges on one surface.
 */
type MergedPair = {
  /**
   * The field to change.
   */
  path: string;

  /**
   * The surface name.
   */
  surface: string;

  /**
   * The surface's positive color.
   */
  positive: Hex;

  /**
   * The surface's negative color.
   */
  negative: Hex;

  /**
   * The deficiencies under which the two merge.
   */
  merged: readonly Closeness[];
};

/**
 * The warning for one pair that merges.
 */
function pairWarning(pair: MergedPair): BrandProblem {
  return {
    path: pair.path,
    message:
      `On the ${pair.surface} surface, positive ${pair.positive} and negative ${pair.negative} ` +
      `look alike under ${describeCloseness(pair.merged)}.`,
    fix:
      'Make them differ in lightness as well as hue (a blue-green against an orange-red ' +
      'survives every deficiency), and show a sign or an arrow beside colored values.',
  };
}

/**
 * The field to change for a surface's positive color: the surface for a derived one, the surface's
 * own `positive` when it sets one, else the base role.
 */
function positivePath(brand: Brand, surface: string, derived: DerivedSurfaces): string {
  if (derived.has(surface)) {
    return `color.surfaces.${surface}`;
  }

  return brand.color.surfaces[surface]?.positive === undefined
    ? BASE_POSITIVE_PATH
    : `color.surfaces.${surface}.positive`;
}
