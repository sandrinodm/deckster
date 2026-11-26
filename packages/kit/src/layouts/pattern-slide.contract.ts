import { Schema } from 'effect';

import {
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  FocalField,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * Common frontmatter for visual patterns with an eyebrow and optional staged reading.
 */
export const patternFields = {
  /**
   * The short context line above the assertion.
   */
  eyebrow: EyebrowField,

  /**
   * Build the visual a beat at a time when true.
   */
  reveal: RevealField,

  /**
   * Whether the brand's footer and progress chrome show.
   */
  chrome: chromeField(true),
};

/**
 * The longest alternative text that a visual pattern accepts, in characters.
 */
export const PATTERN_ALT_MAX_CHARS = 160;

/**
 * Shared hints added to each visual pattern's catalog entry.
 */
export const patternHints = {
  /**
   * A short context line above the slide title.
   */
  eyebrow: EYEBROW_HINT,
};

/**
 * A piece of local artwork with alternative text and a crop position.
 */
export const PatternImage = Schema.Struct({
  src: Schema.NonEmptyString,
  alt: textField(PATTERN_ALT_MAX_CHARS, 'an artwork description'),
  focal: FocalField,
});

/**
 * An image and its description from frontmatter.
 */
export type PatternImageData = typeof PatternImage.Type;

/**
 * Percent coordinates place labels on a visual regardless of the viewport scale.
 */
export const PatternPercent = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 }));

/**
 * A plot anchor from the top left. Both coordinates are percentages.
 */
export const PatternPoint = Schema.Struct({ x: PatternPercent, y: PatternPercent });

/**
 * A descriptive line below a visual, used primarily for its source.
 */
export const patternFootnote = {
  /**
   * The visual's source or qualification, in a single line.
   */
  footnote: { description: 'A source or caveat on the bottom line.', accepts: ['text'] },
} as const;

/**
 * A file-free illustration for `deckster new` and catalog examples. Draws the supplied outlines
 * against a percent-escaped background color on a 640 × 360 canvas.
 */
export function patternExampleImage(fill: string, outline: string): string {
  return (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E" +
    `%3Cpath fill='${fill}' d='M0 0h640v360H0z'/%3E` +
    "%3Cpath fill='none' stroke='%233c4a62' stroke-width='7' stroke-linecap='round' " +
    `stroke-linejoin='round' d='${outline}'/%3E%3C/svg%3E`
  );
}
