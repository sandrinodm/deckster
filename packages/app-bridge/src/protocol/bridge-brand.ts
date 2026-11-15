import { Schema } from 'effect';

/**
 * A color scheme, as CSS `color-scheme` names it.
 */
export const ColorScheme = Schema.Literals(['light', 'dark']);

/**
 * A color scheme, as CSS `color-scheme` names it.
 */
export type ColorScheme = typeof ColorScheme.Type;

/**
 * One type step of the brand's scale, in canvas pixels.
 */
export const BridgeTypeStep = Schema.Struct({
  /**
   * The font family stack, ready for CSS `font-family`.
   */
  family: Schema.String,

  /**
   * The font size in canvas pixels.
   */
  size: Schema.Number,

  /**
   * The line height as a multiple of the size.
   */
  lineHeight: Schema.Number,

  /**
   * The font weight.
   */
  weight: Schema.Number,
});

/**
 * One type step of the brand's scale, in canvas pixels.
 */
export type BridgeTypeStep = typeof BridgeTypeStep.Type;

/**
 * The brand as the slide's surface shows it, as a typed object for apps that draw on a canvas or
 * compute with colors. Every color is hex; every size is canvas pixels, which are CSS pixels inside
 * the app's frame. The same values arrive as CSS custom properties in `cssVariables`.
 */
export const BridgeBrand = Schema.Struct({
  /**
   * The brand's folder name, such as `default`.
   */
  name: Schema.String,

  /**
   * The brand's display name.
   */
  label: Schema.String,

  /**
   * The name of the surface the app sits on, such as `default` or `inverse`.
   */
  surface: Schema.String,

  /**
   * Whether the surface is `light` or `dark`.
   */
  scheme: ColorScheme,

  /**
   * The surface's semantic color roles by name (`bg`, `surface`, `fg`, `heading`, `muted`,
   * `accent`, `accent-fg`, `border`, `positive`, `negative`) as hex.
   */
  roles: Schema.Record(Schema.String, Schema.String),

  /**
   * The CSS `background` of the surface: a gradient or the solid background color.
   */
  background: Schema.String,

  /**
   * The font stacks by role: `display`, `body` and `mono`.
   */
  fonts: Schema.Record(Schema.String, Schema.String),

  /**
   * The type scale by step name (`display`, `headline`, `body`, `caption`, ...).
   */
  type: Schema.Record(Schema.String, BridgeTypeStep),

  /**
   * Corner radii by name (`sm`, `md`, `lg`, `xl`).
   */
  radius: Schema.Record(Schema.String, Schema.Number),

  /**
   * Line widths by name (`hairline`, `regular`, `bold`).
   */
  stroke: Schema.Record(Schema.String, Schema.Number),

  /**
   * Spacing steps by name (`2xs` to `3xl`).
   */
  space: Schema.Record(Schema.String, Schema.Number),

  /**
   * Box shadows by name (`sm`, `md`, `lg`) as CSS `box-shadow` values.
   */
  shadow: Schema.Record(Schema.String, Schema.String),

  /**
   * The surface's chart colors: categorical series in order, and the muted context color.
   */
  data: Schema.Struct({
    /**
     * Distinct colors for unordered series.
     */
    categorical: Schema.Array(Schema.String),

    /**
     * The muted color for data that is not highlighted.
     */
    context: Schema.String,
  }),
});

/**
 * The brand as the slide's surface shows it.
 */
export type BridgeBrand = typeof BridgeBrand.Type;
