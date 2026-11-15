import type { ChartSpec } from '@deckster/kit/chart-spec';
import type { DiagramDescription } from '@deckster/kit/diagram-description';

/**
 * A rectangle in canvas pixels (the 1920x1080 slide), relative to the canvas's top-left corner.
 */
export type SceneRect = {
  /**
   * The left edge.
   */
  x: number;

  /**
   * The top edge.
   */
  y: number;

  /**
   * The width.
   */
  width: number;

  /**
   * The height.
   */
  height: number;
};

/**
 * A color as `#rrggbb`, or `#rrggbbaa` when translucent.
 */
export type SceneColor = string;

/**
 * One color stop of a gradient.
 */
export type GradientStop = {
  /**
   * The stop's color.
   */
  color: SceneColor;

  /**
   * Where the stop sits along the gradient, from 0 to 1.
   */
  at: number;
};

/**
 * How a box or a slide is filled: one color, a linear or a radial gradient.
 */
export type ScenePaint =
  | {
      /**
       * A flat color.
       */
      kind: 'solid';

      /**
       * The color.
       */
      color: SceneColor;
    }
  | {
      /**
       * A CSS `linear-gradient`.
       */
      kind: 'linear';

      /**
       * The CSS angle in degrees: 0 points up, 90 to the right.
       */
      angle: number;

      /**
       * The stops, in order.
       */
      stops: GradientStop[];
    }
  | {
      /**
       * A CSS `radial-gradient`.
       */
      kind: 'radial';

      /**
       * The center as fractions of the box, 0 to 1.
       */
      center: { x: number; y: number };

      /**
       * The stops, from the center out.
       */
      stops: GradientStop[];
    };

/**
 * One side of a box's border.
 */
export type SceneBorder = {
  /**
   * The width in canvas pixels.
   */
  width: number;

  /**
   * The color.
   */
  color: SceneColor;

  /**
   * The line style.
   */
  style: 'solid' | 'dashed' | 'dotted';
};

/**
 * One layer of a CSS `box-shadow`.
 */
export type SceneShadow = {
  /**
   * Horizontal offset in canvas pixels.
   */
  x: number;

  /**
   * Vertical offset in canvas pixels.
   */
  y: number;

  /**
   * Blur radius in canvas pixels.
   */
  blur: number;

  /**
   * Spread in canvas pixels; negative shrinks the shadow.
   */
  spread: number;

  /**
   * The shadow's color, with its alpha.
   */
  color: SceneColor;

  /**
   * Whether it is an inset shadow.
   */
  inset: boolean;
};

/**
 * Why an element cannot be drawn with native PowerPoint objects, as found in the page.
 */
export type RasterReason =
  | 'filter'
  | 'backdrop-filter'
  | 'blend-mode'
  | 'mask'
  | 'clip-path'
  | 'transform'
  | 'background-image'
  | 'conic-gradient'
  | 'translucent-gradient'
  | 'text-effect'
  | 'canvas'
  | 'iframe'
  | 'complex-svg'
  | 'vertical-text'
  | 'figure'
  | 'complex-text'
  | 'group-opacity';

/**
 * Whether a raster reason affects the element and everything inside it (`subtree`) or only what the
 * element paints itself, such as a textured background (`paint`).
 */
export type RasterScope = 'subtree' | 'paint';

/**
 * A fact the page found that keeps an element from being native.
 */
export type RasterHint = {
  /**
   * The reason.
   */
  reason: RasterReason;

  /**
   * What it affects.
   */
  scope: RasterScope;

  /**
   * The CSS that caused it, such as `filter: url(#duotone)`, for the dry-run report.
   */
  detail: string;
};

/**
 * The font and color of one run of text.
 */
export type RunStyle = {
  /**
   * The first family of the computed `font-family`.
   */
  family: string;

  /**
   * The whole computed `font-family` stack.
   */
  stack: string;

  /**
   * The font size in canvas pixels, as rendered.
   */
  size: number;

  /**
   * The numeric weight, 1 to 1000.
   */
  weight: number;

  /**
   * Whether the run is italic or oblique.
   */
  italic: boolean;

  /**
   * The text color with alpha, opacity of the element and its ancestors applied.
   */
  color: SceneColor;

  /**
   * Extra space between letters in canvas pixels.
   */
  letterSpacing: number;

  /**
   * `all` for `text-transform: uppercase` (the text keeps its source case), `small` for small caps,
   * else `none`.
   */
  caps: 'none' | 'all' | 'small';

  /**
   * Whether the run is underlined.
   */
  underline: boolean;

  /**
   * Whether the run is struck through.
   */
  strike: boolean;

  /**
   * `super` or `sub` for raised or lowered runs, else `none`.
   */
  shift: 'none' | 'super' | 'sub';

  /**
   * Font variation axes the run renders with, such as `{ wght: 640, wdth: 90 }`, from
   * `font-variation-settings` and the weight; PowerPoint cannot set them, so outlined text uses
   * them.
   */
  axes: Record<string, number>;

  /**
   * The font's ascent in canvas pixels, from the browser's font metrics.
   */
  ascent: number;

  /**
   * The font's descent in canvas pixels, from the browser's font metrics.
   */
  descent: number;
};

/**
 * A stretch of text on one rendered line with one style.
 */
export type SceneRun = {
  /**
   * The text, whitespace collapsed as rendered; a tab separates a list number from its text.
   */
  text: string;

  /**
   * The style.
   */
  style: RunStyle;

  /**
   * The link the run is part of, if any: a URL, or `#/n` for slide n.
   */
  href: string | null;

  /**
   * Where the run sits on the canvas, for outlined text and checks.
   */
  rect: SceneRect;
};

/**
 * One rendered line of a paragraph.
 */
export type SceneLine = {
  /**
   * The runs, left to right.
   */
  runs: SceneRun[];

  /**
   * The baseline's position in canvas pixels from the top of the canvas.
   */
  baseline: number;

  /**
   * The left edge of the line's first glyph.
   */
  left: number;

  /**
   * The right edge of the line's last glyph.
   */
  right: number;

  /**
   * The largest ascent of the line's runs.
   */
  ascent: number;

  /**
   * The largest descent of the line's runs.
   */
  descent: number;

  /**
   * Whether the line ends where the source breaks it (a `<br>` or a preserved newline), so the
   * break is written as one; other line ends are where the text wrapped.
   */
  authored: boolean;
};

/**
 * The marker of a list item.
 */
export type SceneBullet =
  | {
      /**
       * A drawn marker, such as the kit's small square: a box beside the first line.
       */
      kind: 'shape';

      /**
       * Where it is drawn.
       */
      rect: SceneRect;

      /**
       * Its fill.
       */
      color: SceneColor;

      /**
       * Its corner radius in canvas pixels.
       */
      radius: number;
    }
  | {
      /**
       * A text marker, such as `01` or `•`.
       */
      kind: 'text';

      /**
       * The marker text.
       */
      text: string;

      /**
       * Its style.
       */
      style: RunStyle;

      /**
       * Its left edge in canvas pixels.
       */
      left: number;
    };

/**
 * A block of text as rendered: a heading, a paragraph, a list item, a label.
 */
export type SceneParagraph = {
  /**
   * The rendered lines, top to bottom.
   */
  lines: SceneLine[];

  /**
   * The step at which the paragraph appears, or `null` when it is always shown.
   */
  step: number | null;

  /**
   * The computed `text-align`, with `start` and `end` resolved.
   */
  align: 'left' | 'center' | 'right' | 'justify';

  /**
   * The block's content box: lines are aligned in it.
   */
  box: SceneRect;

  /**
   * The computed line height in canvas pixels.
   */
  lineHeight: number;

  /**
   * The list marker, if the block is a list item.
   */
  bullet: SceneBullet | null;

  /**
   * The list nesting depth, 0 outside lists.
   */
  level: number;

  /**
   * The width, in canvas pixels from where the text starts, at which wrapping the text greedily
   * gives the browser's line breaks (checked in the page), or `null` when the text does not wrap
   * (`white-space: nowrap`, one line that must stay one line).
   */
  wrapWidth: number | null;

  /**
   * Whether every rendered line break is kept as a break in PowerPoint: when no width reproduces
   * the browser's lines by plain wrapping (such as a balanced heading in a wide box).
   */
  keepBreaks: boolean;
};

/**
 * Fields every scene node has.
 */
export type SceneNodeBase = {
  /**
   * The node's id within the scene: the index of the element it came from, unique per slide.
   */
  id: number;

  /**
   * The id of the nearest ancestor node, or `null` at the top.
   */
  parent: number | null;

  /**
   * Where the node is drawn.
   */
  rect: SceneRect;

  /**
   * A CSS-like path to the element, for reports.
   */
  selector: string;

  /**
   * Paint order: nodes are drawn in ascending order.
   */
  order: number;

  /**
   * The element's effective opacity, its ancestors included, 0 to 1.
   */
  opacity: number;

  /**
   * Why the element cannot be native, if anything.
   */
  hints: RasterHint[];

  /**
   * The slot the node is in (`.deck-slot[data-slot]`), or `null`.
   */
  slot: string | null;

  /**
   * The step at which the node appears (the order of its nearest step wrapper), or `null`.
   */
  step: number | null;

  /**
   * Set on the nodes of a layout's background layers (`[data-backdrop]`): the surface's image,
   * pattern and gradient layers and the slide's own `background:` image. They are drawn first and
   * locked, and are never taken for the slide's background.
   */
  backdrop?: true;
};

/**
 * A painted box: background, border, rounded corners, shadow.
 */
export type BoxNode = SceneNodeBase & {
  /**
   * The node kind.
   */
  kind: 'box';

  /**
   * The background, or `null` when only borders or shadows are painted.
   */
  fill: ScenePaint | null;

  /**
   * The border sides: top, right, bottom, left; `null` for a side without one.
   */
  borders: [SceneBorder | null, SceneBorder | null, SceneBorder | null, SceneBorder | null];

  /**
   * Corner radii in canvas pixels: top-left, top-right, bottom-right, bottom-left.
   */
  radii: [number, number, number, number];

  /**
   * The `box-shadow` layers, outermost first.
   */
  shadows: SceneShadow[];

  /**
   * Whether the box covers the whole canvas (a slide background).
   */
  fullBleed: boolean;
};

/**
 * Text: one or more paragraphs set in one frame.
 */
export type TextNode = SceneNodeBase & {
  /**
   * The node kind.
   */
  kind: 'text';

  /**
   * The paragraphs, top to bottom.
   */
  paragraphs: SceneParagraph[];

  /**
   * The id of the nearest ancestor that paints a background or border, or `null`: paragraphs in
   * different painted containers are never set in one frame.
   */
  container: number | null;

  /**
   * The placeholder selectors (from the layout's `pptx` mapping) that contain the text.
   */
  matches: string[];
};

/**
 * A picture: an `<img>` or a video or app poster.
 */
export type ImageNode = SceneNodeBase & {
  /**
   * The node kind.
   */
  kind: 'image';

  /**
   * The image URL as the page loaded it.
   */
  src: string;

  /**
   * The alt text.
   */
  alt: string;

  /**
   * The intrinsic size in image pixels.
   */
  natural: { width: number; height: number };

  /**
   * How much of the image is cut off on each side, as fractions of its size, from `object-fit` and
   * `object-position`.
   */
  crop: { left: number; top: number; right: number; bottom: number };

  /**
   * Corner radii in canvas pixels, from the image or the frame that clips it.
   */
  radii: [number, number, number, number];

  /**
   * Whether the image is an SVG file.
   */
  vector: boolean;

  /**
   * Whether the picture is grayscale through a CSS `grayscale(1)` filter, which PowerPoint can
   * apply natively.
   */
  grayscale: boolean;

  /**
   * The link the picture is part of, if any.
   */
  href: string | null;
};

/**
 * A shape inside an inline SVG, in canvas coordinates.
 */
export type VectorShape = {
  /**
   * The outline as absolute path commands: `M x y`, `L x y`, `C x1 y1 x2 y2 x y`, `Z`.
   */
  path: string;

  /**
   * The fill, or `null` for none.
   */
  fill: SceneColor | null;

  /**
   * The stroke, or `null` for none.
   */
  stroke: SceneColor | null;

  /**
   * The stroke width in canvas pixels.
   */
  strokeWidth: number;

  /**
   * The line cap.
   */
  cap: 'butt' | 'round' | 'square';

  /**
   * The line join.
   */
  join: 'miter' | 'round' | 'bevel';

  /**
   * Whether the path is filled with the even-odd rule.
   */
  evenOdd: boolean;
};

/**
 * An inline `<svg>`: its markup with colors resolved, and its shapes when every part of it can be
 * drawn as PowerPoint geometry.
 */
export type SvgNode = SceneNodeBase & {
  /**
   * The node kind.
   */
  kind: 'svg';

  /**
   * Standalone SVG markup sized to the node, with computed colors inlined.
   */
  markup: string;

  /**
   * The shapes, or `null` when the SVG uses something PowerPoint geometry cannot draw (text,
   * gradients, filters, masks, images).
   */
  shapes: VectorShape[] | null;

  /**
   * The link the drawing is part of, if any.
   */
  href: string | null;

  /**
   * The corner radii of the `<svg>` element's own `border-radius`, which clips what it draws, in
   * canvas pixels: top-left, top-right, bottom-right and bottom-left. Absent when it has none.
   */
  radii?: [number, number, number, number];
};

/**
 * A video, mini app or iframe, shown as its poster.
 */
export type MediaNode = SceneNodeBase & {
  /**
   * The node kind.
   */
  kind: 'media';

  /**
   * What it is.
   */
  media: 'video' | 'app' | 'iframe' | 'lottie';

  /**
   * The poster URL the page shows in static mode, or `null` when there is none.
   */
  poster: string | null;

  /**
   * The video file or app URL, if known.
   */
  src: string | null;

  /**
   * A URL a viewer can open instead: the hosted app or an external video, or `null`.
   */
  href: string | null;

  /**
   * Corner radii of the frame that shows it, in canvas pixels: top-left, top-right, bottom-right
   * and bottom-left.
   */
  radii?: [number, number, number, number];
};

/**
 * One cell of a table.
 */
export type SceneCell = {
  /**
   * The cell's box.
   */
  rect: SceneRect;

  /**
   * The text in the cell.
   */
  paragraphs: SceneParagraph[];

  /**
   * The background, or `null`.
   */
  fill: SceneColor | null;

  /**
   * Borders: top, right, bottom, left.
   */
  borders: [SceneBorder | null, SceneBorder | null, SceneBorder | null, SceneBorder | null];

  /**
   * Padding in canvas pixels: top, right, bottom, left.
   */
  padding: [number, number, number, number];

  /**
   * Columns the cell spans.
   */
  colSpan: number;

  /**
   * Rows the cell spans.
   */
  rowSpan: number;

  /**
   * Whether it is a header cell.
   */
  header: boolean;

  /**
   * The vertical alignment of the content.
   */
  verticalAlign: 'top' | 'middle' | 'bottom';
};

/**
 * An HTML table with its grid as rendered.
 */
export type TableNode = SceneNodeBase & {
  /**
   * The node kind.
   */
  kind: 'table';

  /**
   * Column widths in canvas pixels, left to right.
   */
  columns: number[];

  /**
   * The rows, each with its height and its cells; spanned positions are left out.
   */
  rows: { height: number; cells: SceneCell[] }[];
};

/**
 * A chart that published its data.
 */
export type ChartNode = SceneNodeBase & {
  /**
   * The node kind.
   */
  kind: 'chart';

  /**
   * The chart's description, as the kit publishes it (`@deckster/kit/chart-spec`).
   */
  chart: ChartSpec;
};

/**
 * A diagram that published its nodes and edges.
 */
export type DiagramNode = SceneNodeBase & {
  /**
   * The node kind.
   */
  kind: 'diagram';

  /**
   * The diagram's description, decoded.
   */
  diagram: DiagramDescription;
};

/**
 * Anything drawn on a slide.
 */
export type SceneNode =
  | BoxNode
  | TextNode
  | ImageNode
  | SvgNode
  | MediaNode
  | TableNode
  | ChartNode
  | DiagramNode;

/**
 * A link area on the slide, for link hotspots over pictures.
 */
export type SceneLink = {
  /**
   * The link's box.
   */
  rect: SceneRect;

  /**
   * The URL, or `#/n` for slide n.
   */
  href: string;
};

/**
 * Everything drawn on one slide at one step, as measured in the browser: the scene description the
 * PPTX writer maps to native objects.
 */
export type SlideScene = {
  /**
   * The canvas size in canvas pixels; 1920x1080 for every deck.
   */
  canvas: { width: number; height: number };

  /**
   * The brand surface of the slide.
   */
  surface: string;

  /**
   * The layout the slide uses.
   */
  layout: string;

  /**
   * The slide background: the paint of the box that covers the canvas, or `null` when the surface's
   * own background shows.
   */
  background: ScenePaint | null;

  /**
   * Whether the background is a picture or a texture (such as gradient grain) that only a picture
   * reproduces exactly.
   */
  backgroundIsImage: boolean;

  /**
   * Everything drawn, in paint order.
   */
  nodes: SceneNode[];

  /**
   * Every link on the slide.
   */
  links: SceneLink[];

  /**
   * Text a placeholder maps from frontmatter rather than the page, such as a statement slide's
   * title, by placeholder kind.
   */
  fieldText: Record<string, string>;

  /**
   * Problems the page reported while the scene was measured, such as a chart description that did
   * not decode.
   */
  warnings: string[];

  /**
   * The parent of every element the walk visited, by element id (as a string key), `null` at the
   * top: nodes are only the elements that draw, so this is how containment is followed.
   */
  tree: Record<string, number | null>;
};
