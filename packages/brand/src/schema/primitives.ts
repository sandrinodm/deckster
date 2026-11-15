import { Schema } from 'effect';

import { isColorLiteral } from '#color/color.ts';

/**
 * Lowercase words joined by single hyphens, such as `accent-fg`.
 */
export const KEBAB_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * `<palette>.<step>`, optionally with an opacity in percent: `ink.900` or `ink.900/12`.
 */
export const PALETTE_REF_PATTERN = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z0-9]+)(?:\/(\d{1,3}))?$/;

/**
 * The failure message of a field that takes only a literal color.
 */
const COLOR_LITERAL_MESSAGE =
  'Expected a color such as "#1f2937" or "oklch(0.62 0.19 259)" (lightness and alpha from 0 to 1)';

/**
 * The failure message of a field that takes a literal color or a palette reference.
 */
const COLOR_REF_MESSAGE =
  'Expected a color such as "#1f2937" or "oklch(0.62 0.19 259)", ' +
  'or a palette reference such as "ink.900" or "ink.900/12"';

/**
 * A kebab-case name for a palette, surface, gradient or other named brand entry.
 *
 * @param kind - What the name identifies, used in the failure message.
 * @param example - An example name, used in the failure message.
 */
export function KebabName(kind: string, example: string): Schema.String {
  return Schema.String.check(
    Schema.isPattern(KEBAB_NAME_PATTERN, {
      message: `Expected a ${kind} in kebab-case, such as "${example}"`,
    }),
  );
}

/**
 * A color written out: hex (`#rgb`, `#rrggbb`, with optional alpha) or `oklch(L C H [/ A])`.
 */
export const ColorLiteral = Schema.String.check(
  Schema.makeFilter((value: string) => isColorLiteral(value), { message: COLOR_LITERAL_MESSAGE }),
);

/**
 * A color literal or a reference to a palette step. References are checked against the palette
 * after decoding, so a typo names the palette steps that exist.
 */
export const ColorRef = Schema.String.check(
  Schema.makeFilter((value: string) => isColorLiteral(value) || PALETTE_REF_PATTERN.test(value), {
    message: COLOR_REF_MESSAGE,
  }),
);

/**
 * The largest length a brand sets, in canvas pixels: the canvas width.
 */
export const MAX_PIXELS = 1920;

/**
 * A finite number. Every number in a brand is one: `NaN` and the infinities (`1e999` in a brand
 * file) would reach CSS as `NaNpx` or `Infinitypx`.
 */
export const FiniteNumber = Schema.Finite;

/**
 * A finite number within a range, with the message given when it is outside.
 *
 * @param minimum - The smallest value allowed.
 * @param maximum - The largest value allowed.
 * @param message - What the field expects.
 */
export function FiniteBetween(minimum: number, maximum: number, message: string): Schema.Finite {
  return Schema.Finite.check(Schema.isBetween({ minimum, maximum }, { message }));
}

/**
 * A length in canvas pixels (the canvas is 1920x1080), from 0 to {@link MAX_PIXELS}.
 */
export const Pixels = FiniteBetween(
  0,
  MAX_PIXELS,
  `Expected a size in canvas pixels, from 0 to ${MAX_PIXELS}`,
);

/**
 * A signed offset in canvas pixels, such as a shadow's offset or spread.
 */
export const PixelOffset = FiniteBetween(
  -MAX_PIXELS,
  MAX_PIXELS,
  `Expected an offset in canvas pixels, from -${MAX_PIXELS} to ${MAX_PIXELS}`,
);

/**
 * A percentage from 0 to 100.
 */
export const Percent = Schema.Finite.check(
  Schema.isBetween(
    { minimum: 0, maximum: 100 },
    { message: 'Expected a percentage from 0 to 100' },
  ),
);

/**
 * An opacity from 0 to 1.
 */
export const Opacity = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1 }, { message: 'Expected an opacity from 0 to 1' }),
);

/**
 * A slide corner, for chrome and logo placement.
 */
export const Corner = Schema.Literals(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

/**
 * A slide corner.
 */
export type Corner = typeof Corner.Type;
