import type { Hex } from '#resolve/brand-tokens.ts';
import type { SurfaceColors } from '#resolve/surface-colors.ts';

import { TEXT_CONTRAST } from '#checks/contrast-thresholds.ts';
import { formatHex, fromHex, type Rgba } from '#color/color.ts';
import { ensureContrastOnAll, worstContrast } from '#color/contrast.ts';

/**
 * The roles that also come as a text color: a role a brand may hold to 3:1 (large text and marks),
 * which small text in that role (an eyebrow, a link, a delta, a badge) reads in instead.
 */
export const TEXT_TONES = ['accent', 'positive', 'negative'] as const;

/**
 * One of {@link TEXT_TONES}.
 */
export type TextTone = (typeof TEXT_TONES)[number];

/**
 * The color small text in each role is set in on one surface, guaranteed to reach 4.5:1 on every
 * color it may sit on: every backdrop color and the chart plate. A role that already reads there is
 * kept as it is; one that falls short (an accent held only to 3:1) is moved in OKLCH lightness, hue
 * and chroma kept, the least amount that reaches 4.5:1; and where no lightness of the role does (a
 * gradient running from light to dark), the surface's `fg` stands in, moved the same way. The brand
 * check verifies the result, so a brand that passes `deck brand check` passes `deck lint` for
 * role-colored text at any size.
 *
 * @param surface - The surface's roles and backdrop.
 * @param plate - The surface's opaque chart plate.
 * @returns One hex color per tone.
 */
export function deriveTextColors(surface: SurfaceColors, plate: Hex): Record<TextTone, Hex> {
  const backgrounds = textBackgrounds(surface.backdrop, plate);
  const fallback = ensureContrastOnAll(fromHex(surface.roles.fg), backgrounds, TEXT_CONTRAST);
  /**
   * One tone's text color: its role moved until it reads, else the readable `fg`.
   */
  const toneColor = (tone: TextTone): Hex => {
    const moved = ensureContrastOnAll(fromHex(surface.roles[tone]), backgrounds, TEXT_CONTRAST);
    return formatHex(worstContrast(moved, backgrounds) >= TEXT_CONTRAST ? moved : fallback);
  };
  return {
    accent: toneColor('accent'),
    positive: toneColor('positive'),
    negative: toneColor('negative'),
  };
}

/**
 * The opaque colors role-colored text may sit on: the backdrop and the chart plate.
 *
 * @param backdrop - The surface's backdrop colors.
 * @param plate - The surface's opaque chart plate.
 */
export function textBackgrounds(backdrop: readonly Hex[], plate: Hex): Rgba[] {
  return [...new Set([...backdrop, plate].map((color) => color.toLowerCase()))].map(fromHex);
}
