import type { TreatmentTokens } from '@deckster/brand';

/**
 * A `#rrggbb` color, capturing its three channels.
 */
const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i;

/**
 * The largest value of a color channel.
 */
const CHANNEL_MAX = 255;

/**
 * Decimals in the values of a duotone table.
 */
const TABLE_DECIMALS = 4;

/**
 * How a treatment is drawn: styles for the image, an overlay for a tint, and a color filter for a
 * duotone. Every value comes from the brand's token for the treatment.
 */
export type TreatmentPlan = {
  /**
   * The corner radius in canvas pixels; 0 for square corners.
   */
  radius: number;

  /**
   * Whether the image is drawn in grayscale.
   */
  grayscale: boolean;

  /**
   * The two colors of a duotone, as red, green and blue between 0 and 1, from dark to light.
   */
  duotone?: {
    shadow: readonly [number, number, number];
    highlight: readonly [number, number, number];
  };

  /**
   * The color and strength of a tint laid over the image.
   */
  tint?: { color: string; opacity: number };
};

/**
 * The plan for a treatment token.
 *
 * @param treatment - A treatment from the brand's `imagery.treatments`; `undefined` for none.
 */
export function planTreatment(treatment: TreatmentTokens | undefined): TreatmentPlan {
  if (treatment === undefined) {
    return { radius: 0, grayscale: false };
  }

  switch (treatment.type) {
    case 'rounded':
      return { radius: treatment.radius, grayscale: false };
    case 'none':
      return { radius: 0, grayscale: false };
    case 'grayscale':
      return { radius: 0, grayscale: true };
    case 'duotone':
      return {
        radius: 0,
        grayscale: true,
        duotone: { shadow: rgbOf(treatment.shadow), highlight: rgbOf(treatment.highlight) },
      };
    case 'tint':
      return {
        radius: 0,
        grayscale: false,
        tint: { color: treatment.color, opacity: treatment.opacity },
      };
  }
}

/**
 * The `tableValues` of the three `feFuncR/G/B` elements of a duotone filter: each channel maps
 * black to the shadow's value and white to the highlight's.
 *
 * @param duotone - The duotone colors.
 * @returns A table per channel, red first.
 */
export function duotoneTables(
  duotone: NonNullable<TreatmentPlan['duotone']>,
): [string, string, string] {
  const [shadowR, shadowG, shadowB] = duotone.shadow;
  const [highlightR, highlightG, highlightB] = duotone.highlight;
  return [
    `${format(shadowR)} ${format(highlightR)}`,
    `${format(shadowG)} ${format(highlightG)}`,
    `${format(shadowB)} ${format(highlightB)}`,
  ];
}

/**
 * A hex color as red, green and blue between 0 and 1; black for anything that is not `#rrggbb`.
 *
 * @param hex - A color token.
 */
function rgbOf(hex: string): [number, number, number] {
  const match = HEX_COLOR.exec(hex);
  if (match === null) {
    return [0, 0, 0];
  }

  return [
    Number.parseInt(match[1] ?? '0', 16) / CHANNEL_MAX,
    Number.parseInt(match[2] ?? '0', 16) / CHANNEL_MAX,
    Number.parseInt(match[3] ?? '0', 16) / CHANNEL_MAX,
  ];
}

/**
 * A channel value with four decimals.
 *
 * @param value - A number between 0 and 1.
 */
function format(value: number): string {
  return value.toFixed(TABLE_DECIMALS);
}
