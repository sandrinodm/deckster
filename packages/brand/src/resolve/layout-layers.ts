import type { BackgroundLayerTokens, BrandLayoutTokens } from '#resolve/brand-tokens.ts';

import { ownValue } from '#resolve/own-value.ts';

/**
 * The key under `layers` that holds the art written for every surface.
 */
export const ALL_SURFACES_KEY = '*';

/**
 * The art a layout paints on a surface: the layers written for that surface, else the ones written
 * for every surface.
 *
 * @param layout - The brand layout.
 * @param surface - The surface name the slide uses.
 * @returns The layers, or `undefined` when the layout has no art for the surface, so the surface's
 *   own layers show as usual.
 */
export function layoutLayers(
  layout: BrandLayoutTokens,
  surface: string,
): readonly BackgroundLayerTokens[] | undefined {
  return ownValue(layout.layers, surface) ?? ownValue(layout.layers, ALL_SURFACES_KEY);
}
