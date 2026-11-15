import type { TypographyTokens } from '#resolve/brand-tokens.ts';

import {
  BOLD_WEIGHT,
  LARGE_BOLD_TEXT_PX,
  LARGE_TEXT_PX,
  MIN_TYPE_SIZE_PX,
  TYPE_STEPS,
  type TypeStep,
} from '#schema/typography-schema.ts';

/**
 * What a lint needs to know about sizes: the one minimum every brand and every rendered text
 * shares, WCAG's large-text sizes, and the brand's own scale.
 */
export type TypeScaleFacts = {
  /**
   * The smallest text allowed anywhere, in canvas pixels ({@link MIN_TYPE_SIZE_PX}).
   */
  minimum: number;

  /**
   * WCAG's large text: at least `size`, or at least `boldSize` at `boldWeight` or heavier. Large
   * text needs 3:1 contrast instead of 4.5:1.
   */
  largeText: { size: number; boldSize: number; boldWeight: number };

  /**
   * Every size in the brand's scale, smallest first, without repeats.
   */
  sizes: readonly number[];

  /**
   * The brand's smallest step and its size.
   */
  smallest: { step: TypeStep; size: number };

  /**
   * Each step's size and weight, and whether it counts as large text.
   */
  steps: Readonly<Record<TypeStep, { size: number; weight: number; large: boolean }>>;
};

/**
 * Whether text counts as large under WCAG 2.x (18pt, or 14pt bold, at 1 canvas pixel per CSS
 * pixel), so it needs only 3:1 contrast.
 *
 * @param sizePx - The rendered size in canvas pixels.
 * @param weight - The rendered CSS font weight.
 */
export function isLargeText(sizePx: number, weight: number): boolean {
  return sizePx >= LARGE_TEXT_PX || (weight >= BOLD_WEIGHT && sizePx >= LARGE_BOLD_TEXT_PX);
}

/**
 * The facts about a brand's type scale that `deck lint` and other tools check rendered text
 * against.
 *
 * @param scale - The brand's resolved type scale, from `tokens.typography.scale`.
 */
export function typeScaleFacts(scale: TypographyTokens['scale']): TypeScaleFacts {
  const steps = Object.fromEntries(
    TYPE_STEPS.map((step) => {
      const { size, weight } = scale[step];
      return [step, { size, weight, large: isLargeText(size, weight) }];
    }),
  ) as TypeScaleFacts['steps'];
  const smallest = TYPE_STEPS.reduce((least, step) =>
    scale[step].size < scale[least].size ? step : least,
  );
  return {
    minimum: MIN_TYPE_SIZE_PX,
    largeText: { size: LARGE_TEXT_PX, boldSize: LARGE_BOLD_TEXT_PX, boldWeight: BOLD_WEIGHT },
    sizes: [...new Set(TYPE_STEPS.map((step) => scale[step].size))].sort((a, b) => a - b),
    smallest: { step: smallest, size: scale[smallest].size },
    steps,
  };
}
