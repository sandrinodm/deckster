import { Schema } from 'effect';

import { ColorRef, PixelOffset, Pixels } from '#schema/primitives.ts';

/**
 * Radius names every brand defines; each becomes a `rounded-<name>` utility.
 */
export const RADIUS_NAMES = ['sm', 'md', 'lg', 'xl'] as const;

/**
 * Stroke widths every brand defines, for borders, rules and diagram edges.
 */
export const STROKE_NAMES = ['hairline', 'regular', 'bold'] as const;

/**
 * A stroke width name.
 */
export type StrokeName = (typeof STROKE_NAMES)[number];

/**
 * Shadow names every brand defines; each becomes a `shadow-<name>` utility.
 */
export const SHADOW_NAMES = ['sm', 'md', 'lg'] as const;

/**
 * A shadow name.
 */
export type ShadowName = (typeof SHADOW_NAMES)[number];

/**
 * Spacing steps every brand defines; each becomes `p-<name>`, `gap-<name>` and so on.
 */
export const SPACE_NAMES = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const;

/**
 * Most columns a layout grid may have.
 */
export const MAX_GRID_COLUMNS = 24;

/**
 * One layer of a shadow, as CSS `box-shadow` and PowerPoint's shadow effects both describe it. The
 * color is usually a palette reference with an opacity, such as `ink.950/14`.
 */
const ShadowLayer = Schema.Struct({
  /**
   * Horizontal offset in canvas pixels; positive moves the shadow right. Defaults to 0.
   */
  x: Schema.optionalKey(PixelOffset),

  /**
   * Vertical offset in canvas pixels; positive moves the shadow down.
   */
  y: PixelOffset,

  /**
   * Blur radius in canvas pixels.
   */
  blur: Pixels,

  /**
   * How far the shadow grows (positive) or shrinks (negative) before blurring, in canvas pixels.
   * Defaults to 0. PowerPoint has no spread, so exports approximate it.
   */
  spread: Schema.optionalKey(PixelOffset),

  /**
   * The shadow color, with its opacity.
   */
  color: ColorRef,

  /**
   * Draws the shadow inside the box instead of outside. Defaults to `false`.
   */
  inset: Schema.optionalKey(Schema.Boolean),
});

/**
 * A decoded shadow layer.
 */
export type ShadowLayer = typeof ShadowLayer.Type;

/**
 * A shadow: `"none"`, or its layers, top first.
 */
const Shadow = Schema.Union([
  Schema.Literal('none'),
  Schema.Array(ShadowLayer).check(
    Schema.isMinLength(1, { message: 'Expected at least one shadow layer' }),
  ),
]).annotate({
  message: 'Expected "none" or a list of layers such as [{ y: 8, blur: 24, color: "ink.950/14" }]',
});

/**
 * A decoded shadow.
 */
export type Shadow = typeof Shadow.Type;

/**
 * Every shadow the brand defines, by name.
 */
const Shadows = Schema.Struct({ sm: Shadow, md: Shadow, lg: Shadow });

/**
 * Shadows a surface replaces, for shadows that only read on its background (a dark surface needs
 * deeper shadows than a light one).
 */
export const SurfaceShadows = Schema.Struct({
  sm: Schema.optionalKey(Shadow),
  md: Schema.optionalKey(Shadow),
  lg: Schema.optionalKey(Shadow),
});

/**
 * The `shape` section of a brand: corner radii, stroke widths and shadows.
 */
export const BrandShape = Schema.Struct({
  radius: Schema.Struct({ sm: Pixels, md: Pixels, lg: Pixels, xl: Pixels }),
  stroke: Schema.Struct({ hairline: Pixels, regular: Pixels, bold: Pixels }),
  shadow: Shadows,
});

/**
 * The `spacing` section of a brand: the spacing scale, the slide margins and the column grid, all
 * in canvas pixels.
 */
export const BrandSpacing = Schema.Struct({
  scale: Schema.Struct({
    '2xs': Pixels,
    xs: Pixels,
    sm: Pixels,
    md: Pixels,
    lg: Pixels,
    xl: Pixels,
    '2xl': Pixels,
    '3xl': Pixels,
  }),
  margin: Schema.Struct({ x: Pixels, y: Pixels }),
  grid: Schema.Struct({
    columns: Schema.Int.check(
      Schema.isBetween(
        { minimum: 1, maximum: MAX_GRID_COLUMNS },
        { message: `Expected a whole number of columns from 1 to ${MAX_GRID_COLUMNS}` },
      ),
    ),
    gutter: Pixels,
  }),
});
