import type { DropShadow } from '#diagrams/describe-dom.ts';
import type {
  DescribedAccent,
  DescribedDecoration,
  DescribedEdge,
  DescribedGroup,
  DescribedLine,
  DescribedNode,
  DescribedPacket,
  DescribedPaint,
  DescribedShadow,
  DescribedText,
  DiagramDescription,
  DiagramKind,
} from '#diagrams/diagram-description.ts';
import type { PacketDot, PacketTag } from '#diagrams/flow-packets.tsx';
import type { NodeShape } from '#diagrams/node-kinds.ts';

import {
  canvasOrigin,
  cssColorToHex,
  describeText,
  iconMarkup,
  offsetWithin,
  opacityWithin,
  parseBoxShadows,
  parseDropShadows,
  primaryFontFamily,
  shiftBox,
} from '#diagrams/describe-dom.ts';
import { DIAGRAM_DESCRIPTION_VERSION } from '#diagrams/diagram-description.ts';
import { round2, type Point, type Rect } from '#diagrams/geometry.ts';
import { shapeGeometry } from '#diagrams/node-shapes.ts';
import { PACKET_RADII } from '#diagrams/packet-motion.ts';
import { flattenPath, pathData, type PathSegment } from '#diagrams/path-geometry.ts';

/**
 * The role attributes an `<Svg>` shape can carry and the paint property each sets.
 */
const PAINTED: readonly (readonly [string, string])[] = [
  ['fill', 'fill'],
  ['stroke', 'stroke'],
  ['stop', 'stop-color'],
];

/**
 * The custom property of each packet role's color.
 */
const PACKET_COLORS: Readonly<Record<string, string>> = {
  /**
   * The diagram's packet color.
   */
  accent: '--brand-diagram-packet',

  /**
   * The surface's positive role.
   */
  positive: '--brand-color-positive',

  /**
   * The surface's negative role.
   */
  negative: '--brand-color-negative',

  /**
   * The surface's foreground.
   */
  fg: '--brand-color-fg',
};

/**
 * A packet's trip name without its `:<index>` suffix, which its tag shares.
 */
const TRIP_SUFFIX_PATTERN = /:\d+$/;

/**
 * A `translate(x y)` transform, with either separator between the two numbers.
 */
const TRANSLATE_PATTERN = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/;

/**
 * The font size a packet tag is estimated at when no tag element was drawn and its own is unset.
 */
const FALLBACK_TAG_FONT_PX = 24;

/**
 * The average width of a tag's character as a share of its font size, for the estimated box.
 */
const TAG_CHAR_WIDTH_EM = 0.55;

/**
 * The height of an estimated tag box, as a share of its font size.
 */
const TAG_HEIGHT_EM = 1.5;

/**
 * The gap between an estimated tag box and its packet, as a share of the tag's font size.
 */
const TAG_GAP_EM = 0.6;

/**
 * The font weight of a packet tag that does not set one.
 */
const DEFAULT_FONT_WEIGHT = 400;

/**
 * The sides an accent stripe can run along.
 */
const ACCENT_SIDES: readonly DescribedAccent['side'][] = ['left', 'top', 'right', 'bottom'];

/**
 * The arrowhead styles a `data-arrow` can name besides the default filled triangle.
 */
const ARROW_STYLES: readonly NonNullable<DescribedEdge['arrow']>[] = ['open', 'dot'];

/**
 * A node to describe: where the layout put it and how it is drawn.
 */
export type DescribeNode = {
  /**
   * Its id; the rendered node carries it as `data-node`.
   */
  id: string;

  /**
   * Its kind, such as `database` or `actor`.
   */
  kind: string;

  /**
   * Its emphasis at this step.
   */
  state: string;

  /**
   * Its shape.
   */
  shape: NodeShape;

  /**
   * Its box, in diagram pixels.
   */
  rect: Rect;

  /**
   * The group it sits in.
   */
  group?: string;
};

/**
 * An edge to describe: its ends, its route and its look at this step.
 */
export type DescribeEdge = {
  /**
   * Its id; the rendered edge carries it as `data-edge`.
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
   * How it runs.
   */
  route: 'orthogonal' | 'straight' | 'curved';

  /**
   * Where its arrowheads are.
   */
  arrow: 'end' | 'start' | 'both' | 'none';

  /**
   * Its corners, in diagram pixels.
   */
  points: readonly Point[];

  /**
   * Its path as drawn, in diagram pixels.
   */
  segments: readonly PathSegment[];

  /**
   * Its tone at this step.
   */
  tone: string;
};

/**
 * A group to describe.
 */
export type DescribeGroup = {
  /**
   * Its id; the rendered group carries it as `data-group`.
   */
  id: string;

  /**
   * Its box, in diagram pixels.
   */
  rect: Rect;

  /**
   * The group it sits in.
   */
  parent?: string;
};

/**
 * What {@link describeDiagram} reads: the rendered diagram and the parts visible at this step.
 */
export type DescribeInput = {
  /**
   * The diagram's root element.
   */
  element: HTMLElement;

  /**
   * The component that drew it.
   */
  kind: DiagramKind;

  /**
   * The diagram's id.
   */
  id: string;

  /**
   * The step shown.
   */
  step: number;

  /**
   * The text summary.
   */
  summary: string;

  /**
   * Visible groups, outermost first.
   */
  groups: readonly DescribeGroup[];

  /**
   * Visible edges.
   */
  edges: readonly DescribeEdge[];

  /**
   * Visible nodes.
   */
  nodes: readonly DescribeNode[];

  /**
   * Other text elements to describe, such as timeline dates.
   */
  texts?: readonly Element[];

  /**
   * The packets of the step's still, with their tags; without them the packets drawn in the DOM
   * (static mode) are described.
   */
  packets?: { dots: readonly PacketDot[]; tags: readonly PacketTag[] };

  /**
   * Plain lines to describe: lifelines, a timeline's axis, by element.
   */
  lines?: readonly {
    role: DescribedLine['role'];
    node?: string;
    element: Element;
    points: readonly Point[];
  }[];

  /**
   * For `<Svg>`: the element whose markup is the drawing.
   */
  svg?: Element;

  /**
   * Nodes of the other forms (milestones, layers, items), described from their elements.
   */
  boxes?: readonly DescribeBox[];
};

/**
 * A node of a form that draws its nodes in HTML (a timeline's milestones, a layer stack's bands and
 * items): its element and what it is.
 */
export type DescribeBox = {
  /**
   * An id for it.
   */
  id: string;

  /**
   * `milestone`, `layer` or `item`.
   */
  kind: string;

  /**
   * Its emphasis.
   */
  state: string;

  /**
   * The element drawn as its shape (the dot, the band, the chip).
   */
  shape: Element;

  /**
   * The shape it is described as.
   */
  described: DescribedNode['shape'];

  /**
   * Its text elements, in reading order.
   */
  texts: readonly Element[];

  /**
   * The group (a layer, for an item) it sits in.
   */
  group?: string;
};

/**
 * Describes a rendered diagram at its current step for native exports: every visible group, edge,
 * node and packet with canvas positions, the colors the browser resolved for them, and their text
 * as set. Each diagram component lists its visible parts; the paint, text and icons are read from
 * the rendered elements.
 *
 * @param input - The rendered diagram and its visible parts.
 */
export function describeDiagram(input: DescribeInput): DiagramDescription {
  const { element } = input;
  const origin = canvasOrigin(element);
  const style = getComputedStyle(element);
  const radius = Number.parseFloat(style.getPropertyValue('--brand-radius-md')) || 0;
  const largeRadius = Number.parseFloat(style.getPropertyValue('--brand-radius-lg')) || 0;
  const groupRadius = lengthOr(style.getPropertyValue('--brand-diagram-group-radius'), largeRadius);
  const sharp = style.getPropertyValue('--brand-diagram-edge-corners').trim() === 'sharp';
  const cornerRadius = sharp ? 0 : largeRadius;
  return {
    version: DIAGRAM_DESCRIPTION_VERSION,
    kind: input.kind,
    id: input.id,
    step: input.step,
    box: shiftBox({ x: 0, y: 0, width: element.offsetWidth, height: element.offsetHeight }, origin),
    summary: input.summary,
    groups: describeGroups(input, element, origin, groupRadius),
    edges: input.edges.flatMap((edge) => describeEdge(edge, element, origin, cornerRadius)),
    nodes: [
      ...input.nodes.flatMap((node) => describeFlowNode(node, element, origin, radius)),
      ...(input.boxes ?? []).map((box) => describeBox(box, element, origin)),
    ],
    texts: (input.texts ?? [])
      .map((text) => describeText(text, element, origin))
      .filter((text) => text !== null),
    packets:
      input.packets === undefined
        ? describePackets(element, origin)
        : stillPackets(input.packets, element, origin),
    ...(input.lines === undefined
      ? {}
      : { lines: input.lines.map((line) => describeLine(line, element, origin)) }),
    ...(input.svg === undefined ? {} : { svg: svgMarkup(input.svg) }),
  };
}

/**
 * Describes the visible groups that were rendered, outermost first, with their paint and labels. A
 * group without a rendered border is left out.
 *
 * @param input - The rendered diagram and its visible parts.
 * @param element - The diagram's root.
 * @param origin - Its place on the canvas.
 * @param groupRadius - The radius group borders are drawn with.
 */
function describeGroups(
  input: DescribeInput,
  element: HTMLElement,
  origin: Point,
  groupRadius: number,
): DescribedGroup[] {
  return input.groups.flatMap((group): DescribedGroup[] => {
    const path = element.querySelector(`[data-group="${CSS.escape(group.id)}"]`);
    if (path === null) {
      return [];
    }

    return [
      {
        id: group.id,
        box: shiftBox(group.rect, origin),
        radius: groupRadius,
        paint: paintOf(path, element),
        label: describeText(
          element.querySelector(`[data-measure-group="${CSS.escape(group.id)}"]`),
          element,
          origin,
        ),
        parent: group.parent ?? null,
      },
    ];
  });
}

/**
 * Describes one visible flow node from its rendered shape, body and badge. A node whose shape or
 * body did not render is left out.
 *
 * @param node - The node.
 * @param element - The diagram's root.
 * @param origin - Its place on the canvas.
 * @param radius - The radius node corners are drawn with.
 */
function describeFlowNode(
  node: DescribeNode,
  element: HTMLElement,
  origin: Point,
  radius: number,
): DescribedNode[] {
  const shapeElement = element.querySelector(`.kit-flow-shape[data-node="${CSS.escape(node.id)}"]`);
  const outline = shapeElement?.querySelector('.kit-flow-outline') ?? null;
  const body = element.querySelector(`.kit-flow-node[data-node="${CSS.escape(node.id)}"]`);
  if (outline === null || body === null || shapeElement === null) {
    return [];
  }

  const cardRadius = lengthOr(
    getComputedStyle(shapeElement).getPropertyValue('--kit-card-radius'),
    radius,
  );
  const geometry = shapeGeometry(node.shape, shiftRect(node.rect, origin), cardRadius);
  const icon = body.querySelector('.kit-flow-node-icon svg');
  const card = cardName(shapeElement);
  const shadow = castShadow(
    element.querySelector(`.kit-flow-shadow[data-node="${CSS.escape(node.id)}"]`),
    element,
  );
  const accent = stripeOf(shapeElement.querySelector('.kit-flow-accent'), element, origin);
  const color = icon === null ? null : cssColorToHex(getComputedStyle(icon).color);
  return [
    {
      id: node.id,
      kind: node.kind,
      state: node.state,
      shape: geometry.described,
      path: geometry.outline,
      box: shiftBox(node.rect, origin),
      radius: round2(geometry.radius),
      paint: paintOf(outline, element),
      texts: [
        describeText(body.querySelector('.kit-flow-node-title'), element, origin),
        describeText(body.querySelector('.kit-flow-node-subtitle'), element, origin),
        describeText(
          element.querySelector(
            `.kit-flow-badge[data-node="${CSS.escape(node.id)}"]:not([data-visible="false"])`,
          ),
          element,
          origin,
        ),
      ].filter((text) => text !== null),
      icon:
        icon instanceof SVGSVGElement
          ? {
              box: shiftBox(offsetWithin(icon, element), origin),
              color,
              svg: iconMarkup(icon, color),
            }
          : null,
      group: node.group ?? null,
      decorations: nodeDecorations(shapeElement, geometry, element),
      ...cardFields(card, shadow, accent),
    },
  ];
}

/**
 * The card a node element is drawn with: its `data-card`, when the stylesheet defines cards (the
 * element carries the card's `--kit-card-*` variables inline); `null` for a stylesheet without
 * cards, whose nodes are described as they were before cards existed.
 *
 * @param shape - The node's shape element.
 */
function cardName(shape: Element): string | null {
  const inline =
    shape instanceof HTMLElement || shape instanceof SVGElement
      ? shape.style.getPropertyValue('--kit-card-fill')
      : '';
  return inline === '' ? null : shape.getAttribute('data-card');
}

/**
 * The card fields of a described node, each left out when it has nothing to say, so a diagram
 * without cards is described exactly as before.
 *
 * @param card - The card's name, or `null`.
 * @param shadow - Its shadow, or `null`.
 * @param accent - Its accent stripe, or `null`.
 */
function cardFields(
  card: string | null,
  shadow: DescribedShadow | null,
  accent: DescribedAccent | null,
): Pick<DescribedNode, 'card' | 'shadow' | 'accent'> {
  return {
    ...(card === null ? {} : { card }),
    ...(shadow === null ? {} : { shadow }),
    ...(accent === null ? {} : { accent }),
  };
}

/**
 * A length read from a custom property, or a fallback when it is missing or not a number.
 *
 * @param value - The property's value, such as `12px`.
 * @param fallback - The length without one.
 */
function lengthOr(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The shadow a flow node's card casts, from its shadow group: the `drop-shadow()` layers of the
 * cast's filter, the cast's fill and the group's opacity.
 *
 * @param shadow - The node's `.kit-flow-shadow` group, if one was drawn.
 * @param element - The diagram's root.
 */
function castShadow(shadow: Element | null, element: HTMLElement): DescribedShadow | null {
  const cast = shadow?.querySelector('.kit-flow-shadow-cast') ?? null;
  if (shadow === null || cast === null) {
    return null;
  }

  const layers = shadowLayers(getComputedStyle(cast).filter);
  if (layers.length === 0) {
    return null;
  }

  const path = cast.querySelector('path');
  return {
    layers,
    fill: path === null ? null : cssColorToHex(getComputedStyle(path).fill),
    opacity: opacityWithin(shadow, element),
  };
}

/**
 * The layers of a computed `filter`'s `drop-shadow()` functions, colors as hex; a fully transparent
 * layer is left out.
 *
 * @param filter - The computed filter.
 */
function shadowLayers(filter: string): DescribedShadow['layers'] {
  return colouredLayers(parseDropShadows(filter));
}

/**
 * Shadow layers with their colors as hex; a fully transparent layer is left out.
 *
 * @param layers - The layers, colors as CSS gives them.
 */
function colouredLayers(layers: readonly DropShadow[]): DescribedShadow['layers'] {
  return layers.flatMap((layer) => {
    const color = cssColorToHex(layer.color);
    return color === null
      ? []
      : [{ x: round2(layer.x), y: round2(layer.y), blur: round2(layer.blur), color }];
  });
}

/**
 * A flow node's accent stripe from its drawn rectangle, before the clip to the outline.
 *
 * @param stripe - The `.kit-flow-accent` rectangle, if the card has one.
 * @param element - The diagram's root.
 * @param origin - Its place on the canvas.
 */
function stripeOf(
  stripe: Element | null,
  element: HTMLElement,
  origin: Point,
): DescribedAccent | null {
  const side = ACCENT_SIDES.find((one) => one === stripe?.getAttribute('data-side'));
  if (stripe === null || side === undefined) {
    return null;
  }

  /**
   * One of the rectangle's numeric attributes.
   */
  const attribute = (name: string): number => Number(stripe.getAttribute(name) ?? '0') || 0;
  return {
    side,
    box: shiftBox(
      {
        x: attribute('x'),
        y: attribute('y'),
        width: attribute('width'),
        height: attribute('height'),
      },
      origin,
    ),
    color: cssColorToHex(getComputedStyle(stripe).fill),
    opacity: opacityWithin(stripe, element),
  };
}

/**
 * The accent stripe of a node drawn in HTML (a layer's band or chip, an inset box shadow along the
 * side its `data-accent` names), inside the element's border.
 *
 * @param shape - The element.
 * @param box - Its box on the canvas.
 * @param style - Its computed style.
 * @param root - The diagram's root.
 */
function boxStripe(
  shape: Element,
  box: { x: number; y: number; width: number; height: number },
  style: CSSStyleDeclaration,
  root: HTMLElement,
): DescribedAccent | null {
  const side = ACCENT_SIDES.find((one) => one === shape.getAttribute('data-accent'));
  const width = Number.parseFloat(style.getPropertyValue('--kit-card-accent-width'));
  if (side === undefined || !Number.isFinite(width) || width <= 0) {
    return null;
  }

  const left = Number.parseFloat(style.borderLeftWidth) || 0;
  const top = Number.parseFloat(style.borderTopWidth) || 0;
  const right = Number.parseFloat(style.borderRightWidth) || 0;
  const bottom = Number.parseFloat(style.borderBottomWidth) || 0;
  const inner = {
    x: box.x + left,
    y: box.y + top,
    width: Math.max(0, box.width - left - right),
    height: Math.max(0, box.height - top - bottom),
  };
  const stripe = {
    left: { ...inner, width: Math.min(width, inner.width) },
    right: {
      ...inner,
      x: inner.x + inner.width - Math.min(width, inner.width),
      width: Math.min(width, inner.width),
    },
    top: { ...inner, height: Math.min(width, inner.height) },
    bottom: {
      ...inner,
      y: inner.y + inner.height - Math.min(width, inner.height),
      height: Math.min(width, inner.height),
    },
  }[side];
  return {
    side,
    box: shiftBox(stripe, { x: 0, y: 0 }),
    color: cssColorToHex(style.getPropertyValue('--kit-card-accent').trim()),
    opacity: opacityWithin(shape, root),
  };
}

/**
 * The under-shape and detail decorations of a node, each with the path it was given and its paint.
 * A decoration with no path is left out.
 *
 * @param shapeElement - The node's shape element.
 * @param geometry - The node's computed geometry.
 * @param element - The diagram's root.
 */
function nodeDecorations(
  shapeElement: Element,
  geometry: ReturnType<typeof shapeGeometry>,
  element: HTMLElement,
): DescribedDecoration[] {
  const decorations: DescribedDecoration[] = [];
  const under = shapeElement.querySelector('.kit-flow-under');
  if (under !== null && geometry.under !== '') {
    decorations.push({ kind: 'under', path: geometry.under, paint: paintOf(under, element) });
  }

  const details = shapeElement.querySelector('.kit-flow-details');
  if (details !== null && geometry.details !== '') {
    decorations.push({
      kind: 'details',
      path: geometry.details,
      paint: paintOf(details, element),
    });
  }

  return decorations;
}

/**
 * Describes a node of a form drawn in HTML from its elements: the shape's box, its paint read from
 * the element's background and border, and its texts.
 *
 * @param box - The node.
 * @param element - The diagram's root.
 * @param origin - Its place on the canvas.
 */
function describeBox(box: DescribeBox, element: HTMLElement, origin: Point): DescribedNode {
  const style = getComputedStyle(box.shape);
  const rect = offsetWithin(box.shape, element);
  const radius = Number.parseFloat(style.borderTopLeftRadius) || 0;
  const shifted = shiftBox(rect, origin);
  const card = cardName(box.shape);
  return {
    id: box.id,
    kind: box.kind,
    state: box.state,
    shape: box.described,
    path:
      box.described === 'ellipse'
        ? ellipsePath(shifted)
        : roundedRectPath(shifted, Math.min(radius, shifted.width / 2, shifted.height / 2)),
    box: shifted,
    radius: round2(radius),
    paint: {
      fill: cssColorToHex(style.backgroundColor),
      stroke: cssColorToHex(style.borderTopColor),
      strokeWidth: Number.parseFloat(style.borderTopWidth) || 0,
      dashed: style.borderTopStyle === 'dashed',
      opacity: opacityWithin(box.shape, element),
    },
    texts: box.texts
      .map((text) => describeText(text, element, origin))
      .filter((text): text is DescribedText => text !== null),
    icon: null,
    group: box.group ?? null,
    decorations: [],
    ...(card === null
      ? {}
      : cardFields(
          card,
          ownShadow(style, box.shape, element),
          boxStripe(box.shape, shifted, style, element),
        )),
  };
}

/**
 * The shadow an element drawn in HTML casts itself: the outer layers of its `box-shadow` (inset
 * layers are its accent stripe), else its `filter`'s `drop-shadow()` layers.
 *
 * @param style - Its computed style.
 * @param shape - The element.
 * @param root - The diagram's root.
 */
function ownShadow(
  style: CSSStyleDeclaration,
  shape: Element,
  root: HTMLElement,
): DescribedShadow | null {
  const outer = colouredLayers(parseBoxShadows(style.boxShadow));
  const layers = outer.length > 0 ? outer : shadowLayers(style.filter);
  return layers.length === 0 ? null : { layers, fill: null, opacity: opacityWithin(shape, root) };
}

/**
 * SVG path data for an ellipse filling a box.
 *
 * @param box - The box.
 */
function ellipsePath(box: { x: number; y: number; width: number; height: number }): string {
  const rx = box.width / 2;
  const ry = box.height / 2;
  const cy = round2(box.y + ry);
  const radii = `${round2(rx)} ${round2(ry)}`;
  return `M${round2(box.x)} ${cy}a${radii} 0 1 0 ${round2(box.width)} 0a${radii} 0 1 0 ${round2(-box.width)} 0Z`;
}

/**
 * SVG path data for a rounded rectangle.
 *
 * @param box - The box.
 * @param r - The corner radius.
 */
function roundedRectPath(
  box: { x: number; y: number; width: number; height: number },
  r: number,
): string {
  const { x, y, width, height } = box;
  const fmt = round2;
  return (
    `M${fmt(x + r)} ${fmt(y)}H${fmt(x + width - r)}Q${fmt(x + width)} ${fmt(y)} ${fmt(x + width)} ${fmt(y + r)}` +
    `V${fmt(y + height - r)}Q${fmt(x + width)} ${fmt(y + height)} ${fmt(x + width - r)} ${fmt(y + height)}` +
    `H${fmt(x + r)}Q${fmt(x)} ${fmt(y + height)} ${fmt(x)} ${fmt(y + height - r)}` +
    `V${fmt(y + r)}Q${fmt(x)} ${fmt(y)} ${fmt(x + r)} ${fmt(y)}Z`
  );
}

/**
 * Describes a plain line from its element's stroke and the points it was drawn through.
 *
 * @param line - The line.
 * @param element - The diagram's root.
 * @param origin - Its place on the canvas.
 */
function describeLine(
  line: NonNullable<DescribeInput['lines']>[number],
  element: HTMLElement,
  origin: Point,
): DescribedLine {
  const style = getComputedStyle(line.element);
  const html = line.element instanceof HTMLElement;
  return {
    role: line.role,
    node: line.node ?? null,
    points: line.points.map((point) => shiftPoint(point, origin)),
    color: cssColorToHex(html ? style.backgroundColor : style.stroke),
    width: html
      ? round2((line.element as HTMLElement).offsetHeight)
      : Number.parseFloat(style.strokeWidth) || 0,
    dashed: !html && style.strokeDasharray !== 'none' && style.strokeDasharray !== '',
    opacity: opacityWithin(line.element, element),
  };
}

/**
 * An `<Svg>` drawing's markup with the brand colors its roles resolve to written in as hex, so an
 * exporter can embed it as it is drawn.
 *
 * @param host - The element holding the drawing.
 */
function svgMarkup(host: Element): string {
  const drawing = host.querySelector('svg');
  if (drawing === null) {
    return '';
  }

  const clone = drawing.cloneNode(true) as SVGSVGElement;
  const originals = [drawing, ...Array.from(drawing.querySelectorAll('*'))];
  const copies = [clone, ...Array.from(clone.querySelectorAll('*'))];
  copies.forEach((copy, index) => {
    const original = originals[index];
    if (original === undefined) {
      return;
    }

    const style = getComputedStyle(original);
    for (const [attribute, property] of PAINTED) {
      if (
        original.hasAttribute(`data-${attribute}`) ||
        (original.getAttribute('style') ?? '').includes('var(')
      ) {
        const color = cssColorToHex(style.getPropertyValue(property));
        copy.setAttribute(property, color ?? 'none');
      }
    }

    copy.removeAttribute('data-visible');
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return clone.outerHTML;
}

/**
 * Describes the packets of a still from their data: their place, size, direction, color and tag.
 *
 * @param scene - The still's dots and tags.
 * @param element - The diagram's root.
 * @param origin - Its place on the canvas.
 */
function stillPackets(
  scene: NonNullable<DescribeInput['packets']>,
  element: HTMLElement,
  origin: Point,
): DescribedPacket[] {
  const style = getComputedStyle(element);
  return scene.dots.flatMap((dot): DescribedPacket[] => {
    if (dot.ghost !== 0 || dot.at === undefined) {
      return [];
    }

    const trip = dot.motion.replace(TRIP_SUFFIX_PATTERN, '');
    const tag = scene.tags.find((candidate) => candidate.motion === `${trip}:tag`);
    return [
      {
        at: shiftPoint(dot.at, origin),
        radius: PACKET_RADII[dot.size],
        angle: round2(dot.at.angle),
        color: cssColorToHex(
          style
            .getPropertyValue(
              (Object.hasOwn(PACKET_COLORS, dot.role) ? PACKET_COLORS[dot.role] : undefined) ??
                '--brand-diagram-packet',
            )
            .trim(),
        ),
        reply: dot.reply,
        label: tag === undefined ? null : tagText(tag, element, origin),
      },
    ];
  });
}

/**
 * The box a tag of a size takes on one side of its packet.
 *
 * @param at - The packet's centre.
 * @param side - The side.
 * @param size - The tag's size and its gap from the packet.
 */
function tagPlace(
  at: Point,
  side: NonNullable<PacketTag['side']>,
  size: { width: number; height: number; gap: number },
): Rect {
  const { width, height, gap } = size;
  switch (side) {
    case 'above':
      return { x: at.x - width / 2, y: at.y - height - gap, width, height };
    case 'right':
      return { x: at.x + gap, y: at.y - height / 2, width, height };
    case 'left':
      return { x: at.x - gap - width, y: at.y - height / 2, width, height };
    case 'below':
      return { x: at.x - width / 2, y: at.y + gap, width, height };
  }
}

/**
 * Describes a packet's tag: from its element when static mode drew it, else from its data with the
 * box a tag of that text takes.
 *
 * @param tag - The tag.
 * @param element - The diagram's root.
 * @param origin - Its place on the canvas.
 */
function tagText(tag: PacketTag, element: HTMLElement, origin: Point): DescribedText | null {
  const drawn = element.querySelector(
    `[data-diagram-part="packet-tag"][data-motion="${CSS.escape(tag.motion)}"]`,
  );
  if (drawn !== null) {
    return describeText(drawn, element, origin);
  }

  const sample = element.querySelector('.kit-packet-tag') ?? element;
  const style = getComputedStyle(sample);
  const size = Number.parseFloat(style.fontSize) || FALLBACK_TAG_FONT_PX;
  const width = tag.text.length * size * TAG_CHAR_WIDTH_EM + size;
  const height = size * TAG_HEIGHT_EM;
  const at = tag.at ?? { x: 0, y: 0 };
  return {
    text: tag.text,
    box: shiftBox(
      tagPlace(at, tag.side ?? 'below', { width, height, gap: size * TAG_GAP_EM }),
      origin,
    ),
    color: cssColorToHex(style.color),
    fontFamily: primaryFontFamily(style),
    fontSizePx: size,
    fontWeight: Number.parseFloat(style.fontWeight) || DEFAULT_FONT_WEIGHT,
    align: 'center',
    opacity: 1,
  };
}

/**
 * Describes one edge from its rendered line and label.
 *
 * @param edge - The edge.
 * @param element - The diagram's root.
 * @param origin - Its place on the canvas.
 * @param cornerRadius - The radius orthogonal corners are drawn with.
 */
function describeEdge(
  edge: DescribeEdge,
  element: HTMLElement,
  origin: Point,
  cornerRadius: number,
): DescribedEdge[] {
  const line = element.querySelector(
    `.kit-flow-edge[data-edge="${CSS.escape(edge.id)}"] .kit-flow-edge-line`,
  );
  if (line === null) {
    return [];
  }

  const label = element.querySelector(`.kit-flow-label[data-edge="${CSS.escape(edge.id)}"]`);
  const text = describeText(label, element, origin);
  const head = line.parentElement?.querySelector('.kit-flow-arrow')?.getAttribute('data-arrow');
  const arrow = ARROW_STYLES.find((one) => one === head) ?? 'triangle';
  const style = getComputedStyle(line);
  const shifted = shiftSegments(edge.segments, origin);
  return [
    {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      route: edge.route,
      points:
        edge.route === 'curved'
          ? flattenPath(shifted)
          : edge.points.map((point) => shiftPoint(point, origin)),
      path: pathData(shifted),
      cornerRadius: edge.route === 'orthogonal' ? cornerRadius : 0,
      color: cssColorToHex(style.stroke),
      width: Number.parseFloat(style.strokeWidth),
      dashed: style.strokeDasharray !== 'none' && style.strokeDasharray !== '',
      arrowStart: edge.arrow === 'start' || edge.arrow === 'both',
      arrowEnd: edge.arrow === 'end' || edge.arrow === 'both',
      ...(arrow === 'triangle' ? {} : { arrow }),
      tone: edge.tone,
      opacity: opacityWithin(line, element),
      label:
        text === null || label === null
          ? null
          : { ...text, background: cssColorToHex(getComputedStyle(label).backgroundColor) },
    },
  ];
}

/**
 * The packets frozen on the diagram (static mode): their place, size, direction and tag.
 *
 * @param element - The diagram's root.
 * @param origin - Its place on the canvas.
 */
function describePackets(
  element: HTMLElement,
  origin: { x: number; y: number },
): DescribedPacket[] {
  return Array.from(element.querySelectorAll<SVGGElement>('[data-diagram-part="packet"]')).flatMap(
    (packet): DescribedPacket[] => {
      const at = translation(packet.getAttribute('transform'));
      const dot = packet.querySelector('.kit-packet-dot');
      if (at === undefined || dot === null) {
        return [];
      }

      const reply = packet.getAttribute('data-reply') === 'true';
      const style = getComputedStyle(dot);
      const motion = (packet.getAttribute('data-motion') ?? '').replace(TRIP_SUFFIX_PATTERN, '');
      const tag = element.querySelector(
        `[data-diagram-part="packet-tag"][data-motion="${CSS.escape(`${motion}:tag`)}"]`,
      );
      return [
        {
          at: shiftPoint(at, origin),
          radius: Number.parseFloat(dot.getAttribute('r') ?? '0'),
          angle: Number.parseFloat(packet.getAttribute('data-angle') ?? '0'),
          color: cssColorToHex(reply ? style.stroke : style.fill),
          reply,
          label: tag === null ? null : describeText(tag, element, origin),
        },
      ];
    },
  );
}

/**
 * The fill, outline and opacity of a drawn shape.
 *
 * @param shape - The SVG element.
 * @param root - The diagram's root.
 */
function paintOf(shape: Element, root: HTMLElement): DescribedPaint {
  const style = getComputedStyle(shape);
  return {
    fill: cssColorToHex(style.fill),
    stroke: cssColorToHex(style.stroke),
    strokeWidth: Number.parseFloat(style.strokeWidth) || 0,
    dashed: style.strokeDasharray !== 'none' && style.strokeDasharray !== '',
    opacity: opacityWithin(shape, root),
  };
}

/**
 * The offset of a `translate(x y)` transform attribute.
 *
 * @param transform - The attribute.
 */
function translation(transform: string | null): Point | undefined {
  const match = TRANSLATE_PATTERN.exec(transform ?? '');
  if (match === null) {
    return undefined;
  }

  return { x: Number(match[1]), y: Number(match[2]) };
}

/**
 * A point moved onto the canvas.
 *
 * @param point - A diagram point.
 * @param by - The diagram's place on the canvas.
 */
function shiftPoint(point: Point, by: Point): Point {
  return { x: round2(point.x + by.x), y: round2(point.y + by.y) };
}

/**
 * A rectangle moved onto the canvas.
 *
 * @param rect - A diagram rectangle.
 * @param by - The diagram's place on the canvas.
 */
function shiftRect(rect: Rect, by: Point): Rect {
  return { ...rect, x: rect.x + by.x, y: rect.y + by.y };
}

/**
 * Path segments moved onto the canvas.
 *
 * @param segments - A diagram path.
 * @param by - The diagram's place on the canvas.
 */
function shiftSegments(segments: readonly PathSegment[], by: Point): PathSegment[] {
  /**
   * A point moved onto the canvas.
   */
  const move = (point: Point): Point => ({ x: point.x + by.x, y: point.y + by.y });
  return segments.map((segment): PathSegment => {
    switch (segment.kind) {
      case 'line':
        return { kind: 'line', from: move(segment.from), to: move(segment.to) };
      case 'quad':
        return {
          kind: 'quad',
          from: move(segment.from),
          control: move(segment.control),
          to: move(segment.to),
        };
      case 'cubic':
        return {
          kind: 'cubic',
          from: move(segment.from),
          c1: move(segment.c1),
          c2: move(segment.c2),
          to: move(segment.to),
        };
    }
  });
}
