import type {
  BoxNode,
  ImageNode,
  MediaNode,
  SceneLink,
  SceneNodeBase,
  ScenePaint,
  SvgNode,
  TableNode,
  TextNode,
} from '#scene/scene.ts';

/**
 * One drawable element of an inline SVG as the page found it: its tag and geometry attributes in
 * the SVG's own units, and the matrix that maps those units to canvas pixels.
 */
export type RawVectorShape = {
  /**
   * The element: `path`, `rect`, `circle`, `ellipse`, `line`, `polyline` or `polygon`.
   */
  tag: string;

  /**
   * Its geometry attributes, such as `d`, `points`, `x`, `y`, `r`.
   */
  attrs: Record<string, string>;

  /**
   * The affine matrix `[a, b, c, d, e, f]` from the element's units to canvas pixels.
   */
  matrix: [number, number, number, number, number, number];

  /**
   * The fill with alpha, or `null` for none.
   */
  fill: string | null;

  /**
   * The stroke with alpha, or `null` for none.
   */
  stroke: string | null;

  /**
   * The stroke width in canvas pixels.
   */
  strokeWidth: number;

  /**
   * The computed `stroke-linecap`.
   */
  cap: string;

  /**
   * The computed `stroke-linejoin`.
   */
  join: string;

  /**
   * Whether the fill rule is `evenodd`.
   */
  evenOdd: boolean;
};

/**
 * An inline SVG as collected, with its shapes still in SVG syntax.
 */
export type CollectedSvg = Omit<SvgNode, 'shapes'> & {
  /**
   * The drawable elements, or `null` when the SVG has parts PowerPoint geometry cannot draw.
   */
  shapes: RawVectorShape[] | null;
};

/**
 * A chart or diagram element with the published description it carries, still as JSON.
 */
export type CollectedSpec = SceneNodeBase & {
  /**
   * The node kind: a chart (`data-chart-spec`) or a diagram (`data-diagram-description`,
   * `@deckster/kit/diagram-description`).
   */
  kind: 'chart-spec' | 'diagram-spec';

  /**
   * The attribute's text.
   */
  spec: string;
};

/**
 * Anything the page collected.
 */
export type CollectedNode =
  | BoxNode
  | TextNode
  | ImageNode
  | CollectedSvg
  | MediaNode
  | TableNode
  | CollectedSpec;

/**
 * What the in-page collector returns for one slide at one step, before descriptions are decoded,
 * SVG paths are normalised and paragraphs are grouped into frames.
 */
export type CollectedScene = {
  /**
   * The canvas size in canvas pixels; zero when the page has no active slide.
   */
  canvas: { width: number; height: number };

  /**
   * The brand surface of the slide.
   */
  surface: string;

  /**
   * The slide's layout, from the frame's `data-layout`, else `default`.
   */
  layout: string;

  /**
   * The paint of the box that covers the canvas, if any.
   */
  background: ScenePaint | null;

  /**
   * Whether that box paints a picture or a texture.
   */
  backgroundIsImage: boolean;

  /**
   * Everything drawn, in paint order.
   */
  nodes: CollectedNode[];

  /**
   * Every link on the slide.
   */
  links: SceneLink[];

  /**
   * Problems found while measuring.
   */
  warnings: string[];

  /**
   * The parent of every element the walk visited, by element id (as a string key), `null` at the
   * top: nodes are only the elements that draw, so this is how containment is followed.
   */
  tree: Record<string, number | null>;
};

/**
 * What the export asks the collector to look for.
 */
export type CollectOptions = {
  /**
   * CSS selectors from the layout's `pptx` mapping; text inside one of them records it in
   * {@link TextNode.matches}.
   */
  placeholderSelectors: string[];
};
