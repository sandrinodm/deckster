/**
 * How far content may stick out before it counts as overflow, in canvas pixels; absorbs sub-pixel
 * rounding.
 */
export const OVERFLOW_TOLERANCE_PX = 2;

/**
 * Longest excerpt of an element's text quoted in a message.
 */
export const TEXT_EXCERPT_LENGTH = 40;

/**
 * Below this effective opacity, text counts as invisible and the text rules skip it.
 */
export const MIN_VISIBLE_OPACITY = 0.05;

/**
 * The share of the font size, centered on each line, that text rules treat as the glyphs: capitals
 * and most of the ascenders and descenders, but less than the tightest leading brands use (0.9), so
 * stacked lines of display type do not count as overlapping.
 */
export const GLYPH_BAND_RATIO = 0.85;

/**
 * How much two lines must overlap side by side, as a share of the smaller font size, before they
 * count as drawn over each other: about one glyph.
 */
export const MIN_OVERLAP_WIDTH_EM = 0.5;

/**
 * How far an 8-bit color channel may differ from a brand token and still count as that token: color
 * mixing and canvas round-trips shift channels by one or two.
 */
export const COLOR_CHANNEL_TOLERANCE = 2;

/**
 * How far a font size or spacing value may differ from a token, in canvas pixels, and still count
 * as it.
 */
export const TOKEN_SIZE_TOLERANCE_PX = 0.5;

/**
 * Tailwind's default spacing unit (`--spacing`, 0.25rem at a 16px root): `p-4` is 16px. A spacing
 * value that is a multiple of it and not a brand token comes from Tailwind's numeric scale.
 */
export const TAILWIND_SPACING_UNIT_PX = 4;

/**
 * An image counts as low resolution when its intrinsic size is below this share of the size it is
 * drawn at on a 1x screenshot.
 */
export const MIN_IMAGE_RESOLUTION_RATIO = 0.95;

/**
 * How many slides in a row with the same layout and surface `layout-repetition` reports.
 */
export const REPEATED_LAYOUT_RUN = 3;

/**
 * The fewest chart, diagram and code slides a deck has before `few-builds` looks at how many of
 * them build in steps; a shorter deck may well show its few figures whole.
 */
export const FEW_BUILDS_MIN_EVIDENCE_SLIDES = 4;

/**
 * The share of a deck's chart, diagram and code slides that should build in steps, as a fraction
 * from 0 to 1; `few-builds` reports a deck below it.
 */
export const FEW_BUILDS_MIN_SHARE = 0.25;
