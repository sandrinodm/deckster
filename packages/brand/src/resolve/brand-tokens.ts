import type { TextTone } from '#resolve/text-colors.ts';
import type { LayerAnchor } from '#schema/background-schema.ts';
import type {
  ChartColor,
  LineDash,
  NumberNotation,
  SignDisplay,
  TableEmphasis,
} from '#schema/charts-schema.ts';
import type { Role } from '#schema/color-schema.ts';
import type { TransitionKind } from '#schema/presentation-schema.ts';
import type { Corner } from '#schema/primitives.ts';
import type { ShadowName } from '#schema/shape-schema.ts';
import type { CodeToken, DiagramToken } from '#schema/theme-schema.ts';
import type { FamilyRole, FontSource, TypeStep } from '#schema/typography-schema.ts';

/**
 * A color as `#rrggbb`, or `#rrggbbaa` when translucent.
 */
export type Hex = string;

/**
 * A brand with every reference resolved, every default applied and every check passed. This is what
 * the compiler turns into CSS, what `useBrand()` returns at runtime and what `deck brand --json`
 * prints. Every color is hex; every size is canvas pixels.
 */
export type BrandTokens = {
  /**
   * The brand's folder name under `brands/`, set as `data-brand` on the deck.
   */
  name: string;

  /**
   * The brand's display name, for people.
   */
  label: string;

  /**
   * Every palette, by name, with its steps as hex.
   */
  palette: Readonly<Record<string, Readonly<Record<string, Hex>>>>;

  /**
   * Every surface, `default` first, with its roles fully resolved.
   */
  surfaces: Readonly<Record<string, SurfaceTokens>>;

  /**
   * Every named gradient, compiled to CSS.
   */
  gradients: Readonly<Record<string, GradientTokens>>;

  /**
   * Font families and the type scale.
   */
  typography: TypographyTokens;

  /**
   * Radii, strokes and shadows.
   */
  shape: ShapeTokens;

  /**
   * The spacing scale, slide margins and column grid.
   */
  spacing: SpacingTokens;

  /**
   * Logo variants and where the logo sits.
   */
  logo: LogoTokens;

  /**
   * The icon set name and its stroke width in canvas pixels.
   */
  icons: { set: string; strokeWidth: number };

  /**
   * Image treatments and the default one.
   */
  imagery: ImageryTokens;

  /**
   * Page number, footer, progress bar and logo shown around slides.
   */
  chrome: ChromeTokens;

  /**
   * Easings, durations and the default slide transition.
   */
  motion: MotionTokens;

  /**
   * The brand's own chart palettes; each surface's `data` may replace some of them.
   */
  data: DataTokens;

  /**
   * Chart, stat and table styles that do not change between surfaces; the colors are per surface,
   * in each surface's `charts`.
   */
  charts: ChartTokens;
};

/**
 * A surface's resolved roles and the themes derived from them.
 */
export type SurfaceTokens = {
  /**
   * The surface name, set as `data-surface` on a slide.
   */
  name: string;

  /**
   * `dark` when the background is dark; sets CSS `color-scheme` and the Shiki theme type.
   */
  scheme: 'light' | 'dark';

  /**
   * Every role resolved to hex for this surface.
   */
  roles: Readonly<Record<Role, Hex>>;

  /**
   * The CSS `background` value: the gradient when the surface has one, else `roles.bg`. A gradient
   * with translucent colors is layered over the solid color it is painted on.
   */
  background: string;

  /**
   * The gradient painted on this surface, if any.
   */
  gradient: string | undefined;

  /**
   * Image and gradient layers painted in order over `background`, under the slide's content. Kit
   * layouts draw them (`Backdrop`); the CSS `background` never holds them.
   */
  layers: readonly BackgroundLayerTokens[];

  /**
   * Every color text on this surface may sit on: `bg` plus the gradient's colors, each painted over
   * what lies underneath, and the tints and gradient layers painted over `bg`, so every entry is
   * opaque.
   */
  backdrop: readonly Hex[];

  /**
   * The color small text in a role is set in, per role: the role itself where it reaches 4.5:1 on
   * every backdrop color and the chart plate, else the nearest lightness of it that does (or `fg`
   * when none does). Eyebrows, links, deltas and badges below the large-text size use these, so a
   * brand may hold `accent`, `positive` and `negative` to 3:1. Compiled to
   * `--brand-color-accent-text`, `--brand-color-positive-text` and `--brand-color-negative-text`.
   */
  text: Readonly<Record<TextTone, Hex>>;

  /**
   * The logo variant shown on this surface.
   */
  logo: string;

  /**
   * The syntax-highlighting colors for code on this surface.
   */
  code: Readonly<Record<CodeToken, Hex>>;

  /**
   * The colors of diagram nodes, edges and labels on this surface.
   */
  diagram: Readonly<Record<DiagramToken, Hex>>;

  /**
   * Chart palettes for this surface and the plate charts draw behind themselves: the brand's
   * palettes, any the surface replaces, and the brand's lists adjusted in lightness where they fall
   * short on the plate.
   */
  data: SurfaceDataTokens;

  /**
   * Chart colors on this surface, from the roles the brand's `charts` section names.
   */
  charts: Readonly<Record<ChartColor, Hex>>;

  /**
   * Shadows on this surface: the brand's, with any the surface replaces.
   */
  shadow: Readonly<Record<ShadowName, ShadowTokens>>;
};

/**
 * A surface background layer with its defaults filled in and its colors resolved.
 */
export type BackgroundLayerTokens =
  | ImageLayerTokens
  | PlacedLayerTokens
  | PatternLayerTokens
  | GradientLayerTokens;

/**
 * A photo or texture that fills the slide.
 */
export type ImageLayerTokens = {
  /**
   * Tells the layer kinds apart.
   */
  type: 'image';

  /**
   * The file, relative to the brand folder.
   */
  file: string;

  /**
   * `cover` crops the image to the slide around `focal`; `contain` shows all of it.
   */
  fit: 'cover' | 'contain';

  /**
   * The point of the image kept in view when it is cropped, in percent.
   */
  focal: { x: number; y: number };

  /**
   * From 0 to 1.
   */
  opacity: number;

  /**
   * The image treatment applied, by name, if any.
   */
  treatment: string | undefined;

  /**
   * A color laid over the image at an opacity, if any.
   */
  tint: { color: Hex; opacity: number } | undefined;
};

/**
 * An image at a fixed place on the slide.
 */
export type PlacedLayerTokens = {
  /**
   * Tells the layer kinds apart.
   */
  type: 'placed';

  /**
   * The file, relative to the brand folder.
   */
  file: string;

  /**
   * Width divided by height.
   */
  aspect: number;

  /**
   * The corner, edge middle or center it is placed from.
   */
  anchor: LayerAnchor;

  /**
   * Its width in canvas pixels.
   */
  width: number;

  /**
   * How far it is moved from its anchor, in canvas pixels; positive is right and down.
   */
  offset: { x: number; y: number };

  /**
   * From 0 to 1.
   */
  opacity: number;

  /**
   * Its rotation in degrees, clockwise, around its center.
   */
  rotate: number;
};

/**
 * An image repeated across the slide.
 */
export type PatternLayerTokens = {
  /**
   * Tells the layer kinds apart.
   */
  type: 'pattern';

  /**
   * The file, relative to the brand folder.
   */
  file: string;

  /**
   * Width divided by height.
   */
  aspect: number;

  /**
   * The tile width in canvas pixels.
   */
  tile: number;

  /**
   * Where the first tile starts, in canvas pixels from the top left corner.
   */
  offset: { x: number; y: number };

  /**
   * From 0 to 1.
   */
  opacity: number;
};

/**
 * One of the brand's gradients laid over the layers below it.
 */
export type GradientLayerTokens = {
  /**
   * Tells the layer kinds apart.
   */
  type: 'gradient';

  /**
   * The gradient's name.
   */
  gradient: string;

  /**
   * The gradient's CSS `background-image` value.
   */
  css: string;

  /**
   * From 0 to 1.
   */
  opacity: number;
};

/**
 * A gradient compiled to CSS and described as data, for exports that cannot read CSS.
 */
export type GradientTokens = LinearGradientTokens | RadialGradientTokens | MeshGradientTokens;

/**
 * What every kind of gradient resolves to.
 */
type GradientCommon = {
  /**
   * A CSS `background-image` value, grain layer included.
   */
  css: string;

  /**
   * Every color in the gradient, in order and as written (translucent colors keep their alpha), for
   * contrast checks and solid fallbacks.
   */
  colors: readonly Hex[];

  /**
   * The opacity of the noise layer from 0 to 1, or `undefined` for a gradient without grain.
   */
  grain: number | undefined;
};

/**
 * A straight gradient at an angle.
 */
export type LinearGradientTokens = GradientCommon & {
  /**
   * Tells the gradient kinds apart.
   */
  type: 'linear';

  /**
   * CSS degrees: 0 points up, 90 points right.
   */
  angle: number;

  /**
   * The color stops, each with its position filled in as CSS would.
   */
  stops: readonly GradientStopTokens[];
};

/**
 * A gradient from a center outward.
 */
export type RadialGradientTokens = GradientCommon & {
  /**
   * Tells the gradient kinds apart.
   */
  type: 'radial';

  /**
   * An ellipse fills the slide's aspect; a circle keeps its radius equal in both directions.
   */
  shape: 'circle' | 'ellipse';

  /**
   * The center in percent of the slide's width and height.
   */
  center: { x: number; y: number };

  /**
   * The color stops from the center outward, each with its position filled in as CSS would.
   */
  stops: readonly GradientStopTokens[];
};

/**
 * Soft glows over a base color.
 */
export type MeshGradientTokens = GradientCommon & {
  /**
   * Tells the gradient kinds apart.
   */
  type: 'mesh';

  /**
   * The color under every glow.
   */
  base: Hex;

  /**
   * The glows, bottom first, as CSS paints them over the base.
   */
  points: readonly MeshPointTokens[];
};

/**
 * One color stop of a linear or radial gradient.
 */
export type GradientStopTokens = {
  /**
   * The color as written, `#rrggbbaa` when translucent.
   */
  color: Hex;

  /**
   * The position in percent along the gradient line, from 0 to 100.
   */
  at: number;
};

/**
 * One glow of a mesh gradient.
 */
export type MeshPointTokens = {
  /**
   * The color at the glow's center, fading to transparent at its edge.
   */
  color: Hex;

  /**
   * The center's horizontal position in percent of the slide width.
   */
  x: number;

  /**
   * The center's vertical position in percent of the slide height.
   */
  y: number;

  /**
   * How far the glow reaches, in percent of the slide.
   */
  size: number;
};

/**
 * Families and the type scale.
 */
export type TypographyTokens = {
  /**
   * The display, body and mono families.
   */
  families: Readonly<Record<FamilyRole, FamilyTokens>>;

  /**
   * Every type step with its defaults filled in.
   */
  scale: Readonly<Record<TypeStep, TypeStepTokens>>;
};

/**
 * A font family as CSS uses it.
 */
export type FamilyTokens = {
  /**
   * The family name as `@font-face` declares it, unquoted.
   */
  family: string;

  /**
   * The CSS `font-family` value: the family and its fallbacks, quoted where needed.
   */
  stack: string;

  /**
   * Where the font files come from, as written in the brand.
   */
  source: FontSource;

  /**
   * The installed family exported documents name as the family's stand-in, with its PANOSE,
   * pitch-and-family and charset: the brand's `substitute`, else one derived from the fallback
   * stack (Georgia for serif, Courier New for monospace, Arial otherwise).
   */
  substitute: SubstituteTokens;
};

/**
 * An installed family exported documents fall back to, with every field filled in.
 */
export type SubstituteTokens = {
  /**
   * The family name, such as `Arial`.
   */
  family: string;

  /**
   * The ten PANOSE bytes as 20 upper-case hex digits; all zeros when unknown.
   */
  panose: string;

  /**
   * The Windows pitch-and-family byte: 34 for proportional sans, 18 for proportional serif, 49 for
   * monospace.
   */
  pitchFamily: number;

  /**
   * The Windows charset byte: 0 (ANSI) unless the brand says otherwise.
   */
  charset: number;

  /**
   * The kind of letterform, for checks and fallbacks.
   */
  category: 'sans' | 'serif' | 'mono';
};

/**
 * One type step with every default filled in.
 */
export type TypeStepTokens = {
  /**
   * Which of the brand's families the step uses.
   */
  family: FamilyRole;

  /**
   * The font size in canvas pixels.
   */
  size: number;

  /**
   * The line height as a multiple of the size.
   */
  lineHeight: number;

  /**
   * In em.
   */
  tracking: number;

  /**
   * The font weight, as in CSS `font-weight`.
   */
  weight: number;

  /**
   * `upper` sets the text in capitals.
   */
  case: 'none' | 'upper';

  /**
   * The font style.
   */
  style: 'normal' | 'italic';

  /**
   * OpenType feature tags to turn on, such as `tnum`; empty for none.
   */
  features: readonly string[];

  /**
   * Variable-font axis values by axis tag, such as `{ opsz: 72 }`; empty for none.
   */
  axes: Readonly<Record<string, number>>;
};

/**
 * Radii, strokes and shadows.
 */
export type ShapeTokens = {
  /**
   * Corner radii in canvas pixels.
   */
  radius: Readonly<Record<'sm' | 'md' | 'lg' | 'xl', number>>;

  /**
   * Line widths in canvas pixels.
   */
  stroke: Readonly<Record<'hairline' | 'regular' | 'bold', number>>;

  /**
   * The brand's shadows; a surface may replace some of them (see `SurfaceTokens.shadow`).
   */
  shadow: Readonly<Record<ShadowName, ShadowTokens>>;
};

/**
 * A shadow as layers and as CSS.
 */
export type ShadowTokens = {
  /**
   * The layers, top first; empty for no shadow.
   */
  layers: readonly ShadowLayerTokens[];

  /**
   * The CSS `box-shadow` value, `none` for no layers.
   */
  css: string;
};

/**
 * One shadow layer, in canvas pixels.
 */
export type ShadowLayerTokens = {
  /**
   * Horizontal offset; positive moves the shadow right.
   */
  x: number;

  /**
   * Vertical offset; positive moves the shadow down.
   */
  y: number;

  /**
   * Blur radius.
   */
  blur: number;

  /**
   * How far the shadow grows before blurring; negative shrinks it.
   */
  spread: number;

  /**
   * The shadow color as opaque `#rrggbb`.
   */
  color: Hex;

  /**
   * The shadow's opacity from 0 to 1.
   */
  alpha: number;

  /**
   * Whether the shadow is drawn inside the box.
   */
  inset: boolean;
};

/**
 * The spacing scale, slide margins and column grid.
 */
export type SpacingTokens = {
  /**
   * Spacing steps in canvas pixels, smallest first.
   */
  scale: Readonly<Record<'2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl', number>>;

  /**
   * The slide's horizontal and vertical margins in canvas pixels.
   */
  margin: { x: number; y: number };

  /**
   * The number of layout columns and the gap between them in canvas pixels.
   */
  grid: { columns: number; gutter: number };
};

/**
 * Logo variants (paths relative to the brand folder) and placement.
 */
export type LogoTokens = {
  /**
   * Each variant's file, relative to the brand folder, and its width divided by its height.
   */
  variants: Readonly<Record<string, { file: string; aspect: number }>>;

  /**
   * The variant used where a surface names none.
   */
  default: string;

  /**
   * A multiple of the logo height.
   */
  clearSpace: number;

  /**
   * The corner the logo sits in and its height in canvas pixels.
   */
  placement: { corner: Corner; height: number };
};

/**
 * A resolved image treatment.
 */
export type TreatmentTokens =
  | { type: 'none' }
  | { type: 'rounded'; radius: number }
  | { type: 'grayscale' }
  | { type: 'duotone'; shadow: Hex; highlight: Hex }
  | { type: 'tint'; color: Hex; opacity: number };

/**
 * Image treatments and the default one.
 */
export type ImageryTokens = {
  /**
   * Every named treatment, resolved.
   */
  treatments: Readonly<Record<string, TreatmentTokens>>;

  /**
   * The treatment an image gets when it names none.
   */
  default: string;
};

/**
 * What chrome shows and where.
 */
export type ChromeTokens = {
  /**
   * The page number, its format with `{n}` and `{total}`, and its corner.
   */
  pageNumber: { show: boolean; format: string; corner: Corner };

  /**
   * The footer text and its corner.
   */
  footer: { show: boolean; text: string; corner: Corner };

  /**
   * The progress bar, the edge it runs along and its thickness in canvas pixels.
   */
  progress: { show: boolean; edge: 'top' | 'bottom'; thickness: number };

  /**
   * Whether the logo is drawn on slides.
   */
  logo: { show: boolean };

  /**
   * Hides the chrome on the first slide, which is usually the title.
   */
  skipFirst: boolean;
};

/**
 * A cubic Bézier easing curve as `[x1, y1, x2, y2]`, as in CSS `cubic-bezier()`.
 */
type BezierCurve = readonly [number, number, number, number];

/**
 * Easings, durations and the resolved default transition.
 */
export type MotionTokens = {
  /**
   * Named easing curves as `[x1, y1, x2, y2]`, as in CSS `cubic-bezier()`.
   */
  easings: Readonly<Record<string, BezierCurve>>;

  /**
   * In milliseconds.
   */
  durations: Readonly<Record<string, number>>;

  /**
   * The default slide transition, with its duration in milliseconds and its easing curve resolved
   * from their names.
   */
  transition: {
    kind: TransitionKind;
    duration: number;
    easing: BezierCurve;
  };
};

/**
 * Chart palettes, all hex.
 */
export type DataTokens = {
  /**
   * Distinct colors for unordered series, in the order charts use them.
   */
  categorical: readonly Hex[];

  /**
   * Colors from low to high for ordered values.
   */
  sequential: readonly Hex[];

  /**
   * Colors from one extreme through a neutral midpoint to the other.
   */
  diverging: readonly Hex[];

  /**
   * The muted color for data that is not highlighted.
   */
  context: Hex;
};

/**
 * A surface's chart palettes and the plate charts draw on there.
 */
export type SurfaceDataTokens = DataTokens & {
  /**
   * The opaque panel a chart draws behind itself on this surface; its colors are checked against
   * it. It equals `roles.bg` on a solid surface whose text reaches 10:1 there, so drawing it
   * changes nothing; on a gradient or mid-tone surface it is a deeper shade of the background that
   * leaves room for six distinct chart colors.
   */
  plate: Hex;
};

/**
 * Chart, stat and table styles shared by every surface. Colors are role names; each surface's
 * `charts` has them resolved.
 */
export type ChartTokens = {
  /**
   * Gridlines: drawn or not, the role they take their color from, their width in canvas pixels and
   * their dash.
   */
  grid: ChartLineTokens;

  /**
   * The axis line, as gridlines, plus whether it has tick marks.
   */
  axis: ChartLineTokens & {
    /**
     * Whether the axis draws tick marks.
     */
    ticks: boolean;
  };

  /**
   * The type steps of axis labels, data value labels, legends and annotations, and the role axis
   * and legend labels take their color from.
   */
  labels: {
    axis: TypeStep;
    value: TypeStep;
    legend: TypeStep;
    annotation: TypeStep;
    color: Role;
  };

  /**
   * Number formatting defaults, as `Intl.NumberFormat` options.
   */
  numbers: {
    locale: string;
    notation: NumberNotation;
    currency: string;
    maximumFractionDigits: number;
    signDisplay: SignDisplay;
  };

  /**
   * Big numbers: the number's type step, its label's type step and the role it is colored with.
   */
  stat: { step: TypeStep; label: TypeStep; color: Role };

  /**
   * Tables: header and body type steps, how emphasized rows are marked, the row rule's width in
   * canvas pixels and whether rows alternate in tint.
   */
  table: {
    header: TypeStep;
    body: TypeStep;
    emphasis: TableEmphasis;
    rule: number;
    zebra: boolean;
  };
};

/**
 * Gridlines or an axis line.
 */
export type ChartLineTokens = {
  /**
   * Whether the line is drawn.
   */
  show: boolean;

  /**
   * The role the line takes its color from on each surface.
   */
  color: Role;

  /**
   * The line width in canvas pixels.
   */
  stroke: number;

  /**
   * The line style.
   */
  dash: LineDash;
};
