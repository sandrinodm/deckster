/**
 * The serialisable description of a rendered diagram, for exporters that draw native shapes and
 * connectors (PowerPoint, Keynote, Figma) instead of a picture.
 *
 * Every kit diagram (`<Flow>`, `<SequenceDiagram>`, `<Timeline>`, `<Layers>`, `<Cycle>`, `<Tree>`,
 * `<Svg>`) puts its description, as JSON, in the {@link DIAGRAM_DESCRIPTION_ATTRIBUTE} attribute of
 * its root element (`[data-diagram]`) once it is laid out, and rewrites it on every step. Read them
 * in the page with {@link readDiagramDescriptions}, or with
 * `JSON.parse(element.getAttribute('data-diagram-description'))`. Positions and sizes are canvas
 * pixels from the top-left corner of the 1920x1080 slide (layout geometry, unaffected by the deck's
 * scaling); colors are `#rrggbb` (`#rrggbbaa` when translucent), resolved from the brand on the
 * slide's surface at that step. Text sizes are canvas pixels too. Wait for `window.__deck.ready()`
 * before reading: the attribute appears once layout (and ELK) has finished. In static mode the
 * description matches what the step shows, packets included.
 *
 * This module is plain TypeScript with no DOM or React imports, so Node code can import the types
 * (`@deckster/kit/diagram-description`).
 */

/**
 * The version of the description's shape. It changes only when a field changes meaning or goes
 * away; new optional fields keep the version.
 */
export const DIAGRAM_DESCRIPTION_VERSION = 1;

/**
 * The attribute that holds a diagram's description as JSON.
 */
export const DIAGRAM_DESCRIPTION_ATTRIBUTE = 'data-diagram-description';

/**
 * The attribute that marks a diagram's root element, with its kind as the value.
 */
export const DIAGRAM_ROOT_ATTRIBUTE = 'data-diagram';

/**
 * The diagram components that write a description.
 */
export type DiagramKind = 'flow' | 'sequence' | 'timeline' | 'layers' | 'cycle' | 'tree' | 'svg';

/**
 * A color as `#rrggbb` or `#rrggbbaa`; `null` for none (a transparent fill, no stroke).
 */
export type DescribedColor = string | null;

/**
 * A box in canvas pixels.
 */
export type DescribedBox = {
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
 * A point in canvas pixels.
 */
export type DescribedPoint = {
  /**
   * From the slide's left edge.
   */
  x: number;

  /**
   * From the slide's top edge.
   */
  y: number;
};

/**
 * Text as it is set: the string, its box and its type.
 */
export type DescribedText = {
  /**
   * The text, as it reads (case transforms applied).
   */
  text: string;

  /**
   * Where the text sits.
   */
  box: DescribedBox;

  /**
   * The text color.
   */
  color: DescribedColor;

  /**
   * The first family of the font stack, such as `Inter Variable`.
   */
  fontFamily: string;

  /**
   * The font size in canvas pixels.
   */
  fontSizePx: number;

  /**
   * The font weight, such as 600.
   */
  fontWeight: number;

  /**
   * How the lines align in the box.
   */
  align: 'left' | 'center' | 'right';

  /**
   * The text's opacity, 0 to 1, after dimming and muting (added in a later revision of version 1;
   * read a missing value as 1).
   */
  opacity?: number;
};

/**
 * Stroke and fill of a shape.
 */
export type DescribedPaint = {
  /**
   * The fill.
   */
  fill: DescribedColor;

  /**
   * The outline.
   */
  stroke: DescribedColor;

  /**
   * The outline's width in canvas pixels.
   */
  strokeWidth: number;

  /**
   * Whether the outline is dashed.
   */
  dashed: boolean;

  /**
   * The shape's opacity, 0 to 1, after dimming.
   */
  opacity: number;
};

/**
 * The shape a node is drawn with, named after the nearest PowerPoint preset: `roundRect` (a card),
 * `pill`, `can` (a database cylinder), `pipe` (a queue, a cylinder on its side), `hexagon` (a
 * gateway), `octagon` (a function's cut corners), `foldedCorner` (a document), `diamond` (a
 * decision), `ellipse`, `rect`. `path` always has the exact outline as SVG path data in canvas
 * pixels, for exporters that draw free-form shapes.
 */
export type DescribedShape =
  | 'rect'
  | 'roundRect'
  | 'pill'
  | 'can'
  | 'pipe'
  | 'hexagon'
  | 'octagon'
  | 'foldedCorner'
  | 'diamond'
  | 'ellipse';

/**
 * A node: its box, shape, paint, texts and icon.
 */
export type DescribedNode = {
  /**
   * The node id from the slide source.
   */
  id: string;

  /**
   * The node kind, such as `database` (an actor's kind in a sequence diagram); `milestone` in a
   * timeline, `layer` and `item` in a layer stack.
   */
  kind: string;

  /**
   * Its emphasis at this step: `default`, `highlighted`, `muted`, `error` or `success`.
   */
  state: string;

  /**
   * The nearest preset shape.
   */
  shape: DescribedShape;

  /**
   * The exact outline as SVG path data in canvas pixels.
   */
  path: string;

  /**
   * The node's box.
   */
  box: DescribedBox;

  /**
   * The corner radius of a `roundRect`, in canvas pixels.
   */
  radius: number;

  /**
   * Fill and outline.
   */
  paint: DescribedPaint;

  /**
   * The title, then the subtitle, then the badge (a status pill on the node's top-right corner, or
   * just above it on a narrow node), as set.
   */
  texts: readonly DescribedText[];

  /**
   * The parts of the shape drawn besides its outline, which `shape` alone does not give: a browser
   * window's title bar, a cylinder's cap, a document's folded corner, a double border, the back
   * card of a stack. Draw `under` before the outline and `details` after it. Absent in descriptions
   * written before this field existed.
   */
  decorations?: readonly DescribedDecoration[];

  /**
   * The icon, if the node has one.
   */
  icon: DescribedIcon | null;

  /**
   * The group the node sits in, if any.
   */
  group: string | null;
};

/**
 * A drawn part of a node's shape besides its outline.
 */
export type DescribedDecoration = {
  /**
   * `under` (a back layer, drawn before the outline) or `details` (lines drawn over the outline: a
   * window bar, a cylinder's cap, a folded corner, an inner border).
   */
  kind: 'under' | 'details';

  /**
   * The part as SVG path data in canvas pixels.
   */
  path: string;

  /**
   * Its fill and outline; details have no fill.
   */
  paint: DescribedPaint;
};

/**
 * A plain line a diagram draws that is not an edge: a sequence diagram's lifeline, a timeline's
 * axis and the part of it that is filled in.
 */
export type DescribedLine = {
  /**
   * What it is: `lifeline`, `axis` or `progress`.
   */
  role: 'lifeline' | 'axis' | 'progress';

  /**
   * The node it belongs to, for a lifeline.
   */
  node: string | null;

  /**
   * Its points in canvas pixels.
   */
  points: readonly DescribedPoint[];

  /**
   * The line color.
   */
  color: DescribedColor;

  /**
   * The line width in canvas pixels.
   */
  width: number;

  /**
   * Whether it is dashed.
   */
  dashed: boolean;

  /**
   * Its opacity, 0 to 1.
   */
  opacity: number;
};

/**
 * An icon: its box, its color and its SVG markup, with `currentColor` resolved.
 */
export type DescribedIcon = {
  /**
   * Where the icon sits.
   */
  box: DescribedBox;

  /**
   * The icon's stroke or fill color.
   */
  color: DescribedColor;

  /**
   * A standalone `<svg>` document of the icon, colors resolved, sized to its box.
   */
  svg: string;
};

/**
 * A labelled container around nodes.
 */
export type DescribedGroup = {
  /**
   * The group id.
   */
  id: string;

  /**
   * Its box.
   */
  box: DescribedBox;

  /**
   * The corner radius in canvas pixels.
   */
  radius: number;

  /**
   * Fill and outline.
   */
  paint: DescribedPaint;

  /**
   * Its label.
   */
  label: DescribedText | null;

  /**
   * The group it sits in, if any.
   */
  parent: string | null;
};

/**
 * A connector between two nodes.
 */
export type DescribedEdge = {
  /**
   * The edge id (`from->to` unless the source names one).
   */
  id: string;

  /**
   * The node it starts at.
   */
  from: string;

  /**
   * The node it ends at.
   */
  to: string;

  /**
   * How it runs; `orthogonal` paths have only horizontal and vertical runs between `points`.
   */
  route: 'orthogonal' | 'straight' | 'curved';

  /**
   * The corners from the start port to the end port, in canvas pixels; for a curve, a flattened
   * polyline of it.
   */
  points: readonly DescribedPoint[];

  /**
   * The exact path as SVG path data in canvas pixels (rounded corners, curves).
   */
  path: string;

  /**
   * The corner radius orthogonal paths are drawn with.
   */
  cornerRadius: number;

  /**
   * The line color.
   */
  color: DescribedColor;

  /**
   * The line width in canvas pixels.
   */
  width: number;

  /**
   * Whether the line is dashed.
   */
  dashed: boolean;

  /**
   * Whether an arrowhead sits at the start.
   */
  arrowStart: boolean;

  /**
   * Whether an arrowhead sits at the end.
   */
  arrowEnd: boolean;

  /**
   * Its emphasis at this step: `default`, `active` (a packet runs on it), `trail`, `highlighted`,
   * `muted`, `error` or `success`.
   */
  tone: string;

  /**
   * The opacity after dimming, 0 to 1.
   */
  opacity: number;

  /**
   * Its label, with the background chip behind it.
   */
  label: (DescribedText & { background: DescribedColor }) | null;
};

/**
 * A packet frozen where static mode shows it: a dot on its edge with its direction of travel.
 */
export type DescribedPacket = {
  /**
   * The centre.
   */
  at: DescribedPoint;

  /**
   * The dot's radius in canvas pixels.
   */
  radius: number;

  /**
   * The direction of travel in degrees clockwise from the positive x axis.
   */
  angle: number;

  /**
   * The dot's color.
   */
  color: DescribedColor;

  /**
   * Whether it is a reply on its way back (drawn as a ring).
   */
  reply: boolean;

  /**
   * The tag riding with it, if any.
   */
  label: DescribedText | null;
};

/**
 * One rendered diagram at one step.
 */
export type DiagramDescription = {
  /**
   * The description's version: {@link DIAGRAM_DESCRIPTION_VERSION}.
   */
  version: typeof DIAGRAM_DESCRIPTION_VERSION;

  /**
   * Which component drew it.
   */
  kind: DiagramKind;

  /**
   * The diagram's id: the `id` prop, else a stable index on the slide.
   */
  id: string;

  /**
   * The step the description shows.
   */
  step: number;

  /**
   * The diagram's own box on the slide.
   */
  box: DescribedBox;

  /**
   * The accessible text summary: nodes and connections in reading order.
   */
  summary: string;

  /**
   * Groups, outermost first (draw them first).
   */
  groups: readonly DescribedGroup[];

  /**
   * Connectors, in source order (draw them before the nodes).
   */
  edges: readonly DescribedEdge[];

  /**
   * Nodes, in source order.
   */
  nodes: readonly DescribedNode[];

  /**
   * Other text the diagram sets, such as timeline dates or layer names.
   */
  texts: readonly DescribedText[];

  /**
   * Packets at this step, where the still of the step shows them (in a live deck too, where they
   * move: the still is what an export draws).
   */
  packets: readonly DescribedPacket[];

  /**
   * Lines that are not edges: lifelines, a timeline's axis and progress. Absent in descriptions
   * written before this field existed.
   */
  lines?: readonly DescribedLine[];

  /**
   * For `<Svg>`: the drawing's markup as shown, sanitised, with brand colors resolved to hex, sized
   * to `box`. Absent for other kinds.
   */
  svg?: string;
};

/**
 * The part of a DOM element or document that {@link readDiagramDescriptions} uses, so this module
 * typechecks without the DOM library.
 */
export type DescriptionRoot = {
  /**
   * `Element.querySelectorAll` or `Document.querySelectorAll`.
   */
  querySelectorAll: (selectors: string) => ArrayLike<{
    getAttribute: (name: string) => string | null;
  }>;
};

/**
 * Reads every diagram description under a root element, for exporters running in the page.
 *
 * @param root - The slide, or the whole document.
 * @returns The descriptions in document order; diagrams that have not laid out yet are left out.
 */
export function readDiagramDescriptions(root: DescriptionRoot): DiagramDescription[] {
  const elements = Array.from(root.querySelectorAll(`[${DIAGRAM_DESCRIPTION_ATTRIBUTE}]`));
  return elements.flatMap((element) => {
    const json = element.getAttribute(DIAGRAM_DESCRIPTION_ATTRIBUTE);
    if (json === null || json === '') {
      return [];
    }

    try {
      return [JSON.parse(json) as DiagramDescription];
    } catch {
      return [];
    }
  });
}
