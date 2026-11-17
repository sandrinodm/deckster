import { Schema } from 'effect';

import { BackgroundLayers } from '#schema/background-schema.ts';
import { SurfaceDiagram } from '#schema/diagram-schema.ts';
import { ColorLiteral, ColorRef, KebabName } from '#schema/primitives.ts';
import { SurfaceShadows } from '#schema/shape-schema.ts';
import { BrandCode } from '#schema/theme-schema.ts';

/**
 * The semantic color roles every surface defines. Layouts and components use only these (through
 * Tailwind classes such as `bg-surface` and `text-muted`), never palette steps or literal colors.
 * `heading` is optional in a brand and defaults to `fg`.
 */
export const ROLE_NAMES = [
  'bg',
  'surface',
  'fg',
  'heading',
  'muted',
  'accent',
  'accent-fg',
  'border',
  'positive',
  'negative',
] as const;

/**
 * A semantic color role.
 */
export type Role = (typeof ROLE_NAMES)[number];

/**
 * Surfaces every brand has, so a slide's `surface:` frontmatter works in every brand and a deck can
 * switch brands without slide edits. A brand that leaves out `inverse`, `accent` or `gradient` gets
 * one derived from its roles; brands may add more.
 */
export const REQUIRED_SURFACES = ['default', 'inverse', 'accent', 'gradient'] as const;

/**
 * The surface a slide uses when its frontmatter names none; the engine owns the default.
 */
export { DEFAULT_SURFACE } from '@deckster/engine/frontmatter';

/**
 * Palette step names: `50`, `500`, `950`, or words such as `base`.
 */
const PaletteStep = Schema.String.check(
  Schema.isPattern(/^[a-z0-9]+$/, {
    message: 'Expected a palette step such as "50", "500" or "base"',
  }),
);

/**
 * One color scale, step name to color: `{ 50: "#f5f7ff", 500: "#3b5bfd" }`.
 */
const PaletteScale = Schema.Record(PaletteStep, ColorLiteral);

/**
 * Every role, each a color or a palette reference; `heading` falls back to `fg`.
 */
const RoleColors = Schema.Struct({
  bg: ColorRef,
  surface: ColorRef,
  fg: ColorRef,
  heading: Schema.optionalKey(ColorRef),
  muted: ColorRef,
  accent: ColorRef,
  'accent-fg': ColorRef,
  border: ColorRef,
  positive: ColorRef,
  negative: ColorRef,
} satisfies Record<Role, unknown>);

/**
 * Chart colors. `categorical` is for unordered series, `sequential` runs from low to high,
 * `diverging` runs from one extreme through a neutral midpoint to the other, and `context` is the
 * muted color for everything that is not highlighted.
 */
const DataPalettes = Schema.Struct({
  categorical: Schema.Array(ColorRef),
  sequential: Schema.Array(ColorRef),
  diverging: Schema.Array(ColorRef),
  context: ColorRef,
});

/**
 * Data palettes a surface replaces, for colors that only work on its background, and the plate
 * charts draw behind themselves on it. Lists a surface leaves out are the brand's, adjusted in
 * lightness where they fall short on the plate.
 */
const SurfaceData = Schema.Struct({
  /**
   * The opaque panel charts on this surface draw behind themselves. Defaults to `bg` on a solid
   * surface whose text reaches 10:1 on it, else to a deeper shade of the surface's background.
   */
  plate: Schema.optionalKey(ColorRef),
  categorical: Schema.optionalKey(Schema.Array(ColorRef)),
  sequential: Schema.optionalKey(Schema.Array(ColorRef)),
  diverging: Schema.optionalKey(Schema.Array(ColorRef)),
  context: Schema.optionalKey(ColorRef),
});

/**
 * A named surface: role overrides on top of the base roles, an optional gradient painted as the
 * background, image and gradient layers painted over it (`background`), the logo variant to show on
 * it, the data palettes, code and diagram colors and shadows it replaces. A surface with an image
 * or pattern layer sets its own `bg`: the color the background reads as, which contrast is checked
 * against and solid-color exports use. A gradient surface without its own `bg` uses the gradient's
 * first color (painted over the base `bg` when it is translucent) as its solid background, for
 * contrast checks and solid-color exports. `inverse`, `accent` and `gradient` surfaces that set no
 * role are derived from the base roles; their other fields still apply.
 */
const Surface = Schema.Struct({
  bg: Schema.optionalKey(ColorRef),
  surface: Schema.optionalKey(ColorRef),
  fg: Schema.optionalKey(ColorRef),
  heading: Schema.optionalKey(ColorRef),
  muted: Schema.optionalKey(ColorRef),
  accent: Schema.optionalKey(ColorRef),
  'accent-fg': Schema.optionalKey(ColorRef),
  border: Schema.optionalKey(ColorRef),
  positive: Schema.optionalKey(ColorRef),
  negative: Schema.optionalKey(ColorRef),
  gradient: Schema.optionalKey(KebabName('gradient name', 'aurora')),
  background: Schema.optionalKey(BackgroundLayers),
  logo: Schema.optionalKey(KebabName('logo variant', 'reversed')),
  data: Schema.optionalKey(SurfaceData),
  code: Schema.optionalKey(BrandCode),
  diagram: Schema.optionalKey(SurfaceDiagram),
  shadow: Schema.optionalKey(SurfaceShadows),
});

/**
 * A decoded surface.
 */
export type SurfaceSpec = typeof Surface.Type;

/**
 * An accepted contrast shortfall: the pair only has to reach WCAG's large-text 3:1, and a pass
 * below 4.5:1 is reported as a warning carrying the reason. Leave out `surface` to waive the pair
 * on every surface.
 */
const ContrastWaiver = Schema.Struct({
  color: Schema.Literals(ROLE_NAMES),
  on: Schema.Literals(ROLE_NAMES),
  surface: Schema.optionalKey(KebabName('surface name', 'accent')),
  reason: Schema.NonEmptyString,
});

/**
 * A decoded contrast waiver.
 */
export type ContrastWaiver = typeof ContrastWaiver.Type;

/**
 * The `color` section of a brand: palette scales, base roles, surfaces and data palettes.
 */
export const BrandColor = Schema.Struct({
  palette: Schema.Record(KebabName('palette name', 'ink'), PaletteScale),
  roles: RoleColors,
  surfaces: Schema.Record(KebabName('surface name', 'inverse'), Surface),
  data: DataPalettes,
  waivers: Schema.optionalKey(Schema.Array(ContrastWaiver)),
});

/**
 * The `color` section as written in `brand.ts`.
 */
export type BrandColorInput = typeof BrandColor.Encoded;

/**
 * One surface as written in `brand.ts`.
 */
export type SurfaceInput = typeof Surface.Encoded;
