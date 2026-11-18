import type {
  DescribedBox,
  DescribedEdge,
  DescribedShadow,
  DescribedGroup,
  DescribedLine,
  DescribedNode,
  DescribedPaint,
  DescribedPacket,
  DescribedText,
  DiagramDescription,
} from '@deckster/kit/diagram-description';

import type { DiagramParts } from '#diagram/diagram-parts.ts';
import type { ConnectionSite } from '#diagram/diagram-sites.ts';
import type { IdAllocator } from '#pptx/shape-xml.ts';
import type { TextContext } from '#pptx/text-xml.ts';
import type {
  BoxNode,
  RunStyle,
  SceneParagraph,
  SceneRect,
  SceneShadow,
  SlideScene,
  SvgNode,
} from '#scene/scene.ts';
import type { PathCommand, Point } from '#vector/svg-path.ts';

import { clipOutlineToBox } from '#diagram/clip-outline.ts';
import { matchDiagramParts, textOf } from '#diagram/diagram-parts.ts';
import { connectorGeometry, type ConnectorGeometry } from '#diagram/diagram-routes.ts';
import { findSite, outlineSites, presetSites, touchesBox } from '#diagram/diagram-sites.ts';
import { el, escapeXml } from '#ooxml/xml.ts';
import { textFrameXml } from '#pptx/frame-xml.ts';
import { boxXml, cNvPr, shadowXml, vectorGroupXml, xfrm } from '#pptx/shape-xml.ts';
import { layoutFrame, paragraphXml } from '#pptx/text-xml.ts';
import { colorXml } from '#pptx/theme.ts';
import { degreesToDrawing, pxToEmu } from '#units.ts';
import { parsePathData, pathBounds } from '#vector/svg-path.ts';

/**
 * DrawingML guide values are fractions of 100000.
 */
const GUIDE_UNIT = 100_000;

/**
 * The preset each described node shape keeps when its connectors meet the preset's connection
 * sites; the other shapes (cylinders, hexagons, cut corners, documents) are drawn from their exact
 * outline, which PowerPoint's nearest presets do not match.
 */
const NODE_PRESETS: Readonly<Partial<Record<DescribedNode['shape'], string>>> = {
  /**
   * A plain box.
   */
  rect: 'rect',

  /**
   * A card.
   */
  roundRect: 'roundRect',

  /**
   * A pill: a rounded rectangle at the largest radius.
   */
  pill: 'roundRect',

  /**
   * An ellipse.
   */
  ellipse: 'ellipse',

  /**
   * A decision.
   */
  diamond: 'diamond',
};

/**
 * The states the kit draws with a soft ring around the node.
 */
const RING_STATES = new Set(['highlighted', 'error', 'success']);

/**
 * The ring around an emphasised node: its outline stroked this wide, at this opacity, under it.
 */
const RING = {
  /**
   * The ring's stroke width in canvas pixels.
   */
  width: 12,

  /**
   * The ring's opacity.
   */
  opacity: 0.16,
} as const;

/**
 * The kit's arrowheads: about five line widths long and four wide, PowerPoint's large size.
 */
const ARROW_SIZE = 'lg';

/**
 * PowerPoint's line end for each of the kit's arrowheads, and its size: a filled triangle, an open
 * chevron (`arrow`, two strokes), and a dot (`oval`, about three line widths across like the kit's,
 * though PowerPoint centres it on the line's end where the kit sets it just before).
 */
const ARROW_ENDS: Readonly<Record<NonNullable<DescribedEdge['arrow']>, Record<string, string>>> = {
  /**
   * The default filled triangle.
   */
  triangle: { type: 'triangle', w: ARROW_SIZE, len: ARROW_SIZE },

  /**
   * An open chevron.
   */
  open: { type: 'arrow', w: ARROW_SIZE, len: ARROW_SIZE },

  /**
   * A filled dot.
   */
  dot: { type: 'oval', w: 'med', len: 'med' },
};

/**
 * How close to a shape's sides its text may run when a label set in another font needs more room,
 * in canvas pixels.
 */
const TEXT_PADDING_PX = 4;

/**
 * How much wider than its text a free text box is, as a share of the text's width.
 */
const TEXT_BOX_SLACK = 0.3;

/**
 * Fallback line metrics for a described text without a measured element, as shares of its size.
 */
const FALLBACK_METRICS = {
  /**
   * The ascent.
   */
  ascent: 0.95,

  /**
   * The descent.
   */
  descent: 0.25,
} as const;

/**
 * Hex digits of an opaque color.
 */
const OPAQUE_HEX_LENGTH = 6;

/**
 * The full value of an 8-bit channel, which an alpha byte is scaled to.
 */
const CHANNEL_MAX = 255;

/**
 * Hex digits per channel and the radix they are written in.
 */
const HEX_RADIX = 16;

/**
 * The smallest width or height, in canvas pixels, that a freeform shape's box takes.
 */
const MIN_SHAPE_EXTENT_PX = 0.01;

/**
 * The ring of a packet that is a reply, as a share of the packet's radius.
 */
const PACKET_RING_SHARE = 0.4;

/**
 * The thinnest ring a reply packet is drawn with, in canvas pixels.
 */
const MIN_PACKET_RING_PX = 2;

/**
 * A text sits below the one above it once its top is this share of the upper text's height lower.
 */
const STACK_BELOW_SHARE = 0.5;

/**
 * How far, in canvas pixels, two texts' left or centre edges may differ and still share a column.
 */
const SAME_COLUMN_TOLERANCE_PX = 4;

/**
 * How far, in canvas pixels, a box may stick out of another and still count as inside it.
 */
const INSIDE_SLACK_PX = 4;

/**
 * Matches the `name` attribute of a shape's markup.
 */
const NAME_ATTRIBUTE = /name="[^"]*"/;

/**
 * What the diagram writer needs.
 */
export type DiagramWriteInput = {
  /**
   * The description.
   */
  diagram: DiagramDescription;

  /**
   * The id of the diagram's scene node.
   */
  nodeId: number;

  /**
   * The slide's scene, whose elements inside the diagram give text styles, icons and the boxes the
   * description does not name.
   */
  scene: Pick<SlideScene, 'nodes' | 'tree'>;

  /**
   * Allocates shape ids; the group's id is allocated last.
   */
  nextId: IdAllocator;

  /**
   * The slide's theme, fonts and links.
   */
  context: TextContext;
};

/**
 * How a node is drawn and where connectors glue to it.
 */
type NodeShape = {
  /**
   * The node.
   */
  node: DescribedNode;

  /**
   * The shape id.
   */
  id: number;

  /**
   * The preset, or `null` for the exact outline.
   */
  preset: string | null;

  /**
   * The connection sites, in index order.
   */
  sites: ConnectionSite[];
};

/**
 * A described diagram as native PowerPoint objects, its summary as the first shape's alt text:
 * groups as rounded regions with their labels, plain lines (lifelines, axes), edges as connectors
 * glued to the connection sites of the nodes they join (straight or bent with adjust values that
 * follow the route; curved and unusual routes as freeform lines with arrowheads), nodes as preset
 * shapes (or their exact outline) with their title and subtitle as the shape's text, a ring under
 * emphasised nodes, the shape's decorations, the page's own boxes the description does not name
 * (icon chips, badge pills), icons as vector shapes, edge labels on their chips, packets, and loose
 * text. Text keeps the measured element's runs, so fonts, axes and spacing match the slide's other
 * text. The shapes are not grouped: Apple's Office renderer (Quick Look, Keynote) draws no freeform
 * shape inside a group.
 *
 * @param input - The description, the scene, ids and the text context.
 * @returns The shapes' markup, in paint order.
 */
export function diagramXml(input: DiagramWriteInput): string {
  const { diagram, context } = input;
  const parts = matchDiagramParts(input.scene, input.nodeId, diagram);
  const writer: DiagramWriter = { input, parts, nodes: new Map() };
  for (const node of diagram.nodes) {
    writer.nodes.set(node.id, nodeShape(writer, node));
  }

  const children = [
    ...diagram.groups.map((group) => groupXml(writer, group)),
    ...diagram.nodes.flatMap((node) => castShadowXml(writer, node)),
    ...(diagram.lines ?? []).map((line) => plainLineXml(writer, line)),
    ...diagram.edges.map((edge) => edgeXml(writer, edge)),
    ...diagram.nodes.flatMap((node) => nodeXml(writer, node)),
    ...parts.extraBoxes.map((box) => boxXml(box, input.nextId, context.theme)),
    ...diagram.nodes.map((node) => iconXml(writer, node)),
    ...parts.extraIcons.map((icon) => iconShapesXml(writer, icon, 'Icon')),
    ...diagram.edges.map((edge) => edgeLabelXml(writer, edge)),
    ...diagram.packets.map((packet) => packetXml(writer, packet)),
    ...diagram.nodes.flatMap((node) =>
      looseNodeTexts(node).map((text) => textBoxXml(writer, text, `Label: ${text.text}`, null)),
    ),
    ...diagram.texts.map((text) => textBoxXml(writer, text, `Text: ${text.text}`, null)),
    ...parts.extraTexts.map((text) =>
      textFrameXml(text.paragraphs, input.nextId(), `Text: ${textOf(text)}`, context, null),
    ),
  ].filter((child) => child !== '');
  const [first = '', ...rest] = children;
  return withDescription(first, diagram.summary) + rest.join('');
}

/**
 * The state of one diagram being written.
 */
type DiagramWriter = {
  /**
   * The input.
   */
  input: DiagramWriteInput;

  /**
   * The page elements matched to the description.
   */
  parts: DiagramParts;

  /**
   * Each node's shape, by node id.
   */
  nodes: Map<string, NodeShape>;
};

/**
 * Decides how a node is drawn: its preset when every connector that ends at it meets one of the
 * preset's connection sites, else its exact outline with a site where each connector ends.
 *
 * @param writer - The diagram's state.
 * @param node - The node.
 */
function nodeShape(writer: DiagramWriter, node: DescribedNode): NodeShape {
  const ends = writer.input.diagram.edges.flatMap((edge) => {
    const points: Point[] = [];
    const first = edge.points[0];
    const last = edge.points.at(-1);
    if (edge.from === node.id && first !== undefined && touchesBox(node.box, first)) {
      points.push(first);
    }

    if (edge.to === node.id && last !== undefined && touchesBox(node.box, last)) {
      points.push(last);
    }

    return points;
  });
  const preset = presetFor(node);
  const id = writer.input.nextId();
  if (preset !== null) {
    const sites = presetSites(preset, node.box);
    if (ends.every((end) => findSite(sites, end) !== null)) {
      return { node, id, preset, sites };
    }
  }

  return { node, id, preset: null, sites: outlineSites(node.box, ends) };
}

/**
 * The preset a node keeps, if any: a diamond or ellipse with text is drawn from its outline, as
 * those presets set text in a smaller rectangle than the shape.
 *
 * @param node - The node.
 */
function presetFor(node: DescribedNode): string | null {
  const preset = NODE_PRESETS[node.shape] ?? null;
  const smallTextRect = preset === 'diamond' || preset === 'ellipse';
  return smallTextRect && node.texts.length > 0 ? null : preset;
}

/**
 * A group region with its label set in it.
 *
 * @param writer - The diagram's state.
 * @param group - The group.
 */
function groupXml(writer: DiagramWriter, group: DescribedGroup): string {
  const id = writer.input.nextId();
  const label = group.label === null ? [] : [group.label];
  return shapeXml(writer, {
    id,
    name: `Group: ${group.label?.text ?? group.id}`,
    box: group.box,
    geometry: roundedGeometry(group.box, group.radius),
    paint: group.paint,
    texts: label,
    textInset: roundedTextInset(group.box, group.radius),
  });
}

/**
 * A node: the ring under an emphasised node, its `under` decorations, the shape with its title and
 * subtitle, then its `details` decorations.
 *
 * @param writer - The diagram's state.
 * @param node - The node.
 */
function nodeXml(writer: DiagramWriter, node: DescribedNode): string[] {
  const shape = writer.nodes.get(node.id);
  if (shape === undefined) {
    return [];
  }

  const geometry = nodeGeometry(shape, node);
  const ring =
    RING_STATES.has(node.state) && node.paint.stroke !== null
      ? ringXml(writer, node, geometry)
      : '';
  const decorations = node.decorations ?? [];
  /**
   * The decorations of one kind as freeform shapes.
   */
  const drawn = (kind: 'under' | 'details'): string[] =>
    decorations
      .filter((decoration) => decoration.kind === kind)
      .map((decoration) =>
        freeformXml(writer, parsePathData(decoration.path), decoration.paint, {
          name: `Detail: ${nodeTitle(node)}`,
          arrows: null,
        }),
      );
  const own = castsItself(node) ? (node.shadow ?? null) : null;
  const cast = node.shadow?.fill ?? null;
  const flattens = cast !== null && node.paint.fill !== null && !isOpaqueFill(node.paint);
  const main = shapeXml(writer, {
    id: shape.id,
    name: `Node: ${nodeTitle(node)}`,
    box: node.box,
    geometry,
    paint: node.paint,
    texts: stackedTexts(node),
    textInset: shape.preset === 'roundRect' ? roundedTextInset(node.box, cornerRadius(node)) : 0,
    effects: own === null ? '' : shadowEffectXml(writer, own, node.box),
    ...(cast !== null && flattens ? { fill: flattenedFill(writer, node, cast) } : {}),
  });
  const accent = accentXml(writer, node);
  return [
    ring,
    ...drawn('under'),
    main,
    accent,
    accent === '' ? '' : outlineOverXml(writer, node, geometry),
    ...drawn('details'),
  ];
}

/**
 * Whether a node casts its shadow from its own shape: a box drawn in HTML, whose description gives
 * no cast color. Other nodes cast it from a copy under the edges (see {@link castShadowXml}).
 *
 * @param node - The node.
 */
function castsItself(node: DescribedNode): boolean {
  return node.shadow?.fill === null;
}

/**
 * The opaque color a node with a cast shadow is filled with, and its copy under the edges: the
 * node's fill at its opacity laid over what is behind it (the slide's background and the fills of
 * the groups it sits in), or just that backdrop for a node without a fill. The page masks its copy
 * out inside the outline; PowerPoint cannot, so a translucent or dimmed node is flattened onto its
 * backdrop instead, and looks the same.
 *
 * @param writer - The diagram's state.
 * @param node - The node.
 * @param background - The slide's background behind the diagram.
 */
function flattenedFill(writer: DiagramWriter, node: DescribedNode, background: string): string {
  const groups = new Map(writer.input.diagram.groups.map((group) => [group.id, group]));
  const chain: DescribedGroup[] = [];
  for (let id = node.group; id !== null && chain.length < groups.size;) {
    const group = groups.get(id);
    if (group === undefined) {
      break;
    }

    chain.unshift(group);
    id = group.parent;
  }

  const backdrop = chain.reduce(
    (under, group) =>
      group.paint.fill === null
        ? under
        : over(withOpacity(group.paint.fill, group.paint.opacity), under),
    opaque(background),
  );
  return node.paint.fill === null
    ? backdrop
    : over(withOpacity(node.paint.fill, node.paint.opacity), backdrop);
}

/**
 * A color laid over an opaque one.
 *
 * @param top - `#rrggbb` or `#rrggbbaa`.
 * @param under - `#rrggbb`.
 */
export function over(top: string, under: string): string {
  const alpha =
    top.length > OPAQUE_HEX_LENGTH + 1
      ? Number.parseInt(top.slice(OPAQUE_HEX_LENGTH + 1), HEX_RADIX) / CHANNEL_MAX
      : 1;
  /**
   * One 8-bit channel of a color, 0 for red.
   */
  const channel = (hex: string, index: number): number =>
    Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), HEX_RADIX);
  const mixed = [0, 1, 2].map((index) =>
    Math.round(channel(top, index) * alpha + channel(under, index) * (1 - alpha))
      .toString(HEX_RADIX)
      .padStart(2, '0'),
  );
  return `#${mixed.join('')}`;
}

/**
 * A color without its alpha.
 *
 * @param hex - `#rrggbb` or `#rrggbbaa`.
 */
function opaque(hex: string): string {
  return hex.slice(0, OPAQUE_HEX_LENGTH + 1);
}

/**
 * Whether a paint fills its shape with an opaque color at full opacity.
 *
 * @param paint - The paint.
 */
function isOpaqueFill(paint: DescribedPaint): boolean {
  return paint.fill !== null && paint.fill.length <= OPAQUE_HEX_LENGTH + 1 && paint.opacity >= 1;
}

/**
 * The outline's line drawn again over a card's accent stripe, with no fill, so the stripe sits
 * under the whole stroke as it does on the page.
 *
 * @param writer - The diagram's state.
 * @param node - The node.
 * @param geometry - The node's geometry markup.
 */
function outlineOverXml(writer: DiagramWriter, node: DescribedNode, geometry: string): string {
  if (node.paint.stroke === null || node.paint.strokeWidth <= 0) {
    return '';
  }

  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(writer.input.nextId(), `Outline: ${nodeTitle(node)}`),
      el('p:cNvSpPr'),
      el('p:nvPr'),
    ),
    el('p:spPr', {}, xfrm(node.box), geometry, el('a:noFill'), outlineXml(writer, node.paint)),
  );
}

/**
 * The shadow a node's card casts under the edges and lifelines: a copy of its outline (and of its
 * back layer) in the node's own opaque fill with the shadow as its effect, drawn before them so
 * arrowheads stay on top; the node covers the copy exactly, so only the shadow outside it shows, as
 * on the page. A node that casts its shadow itself (see {@link castsItself}) gets the effect on its
 * own shape instead, and nothing here.
 *
 * @param writer - The diagram's state.
 * @param node - The node.
 */
function castShadowXml(writer: DiagramWriter, node: DescribedNode): string[] {
  const shadow = node.shadow;
  const shape = writer.nodes.get(node.id);
  if (shadow === undefined || shadow === null || shadow.fill === null || shape === undefined) {
    return [];
  }

  const effects = shadowEffectXml(writer, shadow, node.box);
  if (effects === '') {
    return [];
  }

  const paint: DescribedPaint = {
    fill: flattenedFill(writer, node, shadow.fill),
    stroke: null,
    strokeWidth: 0,
    dashed: false,
    opacity: 1,
  };
  const name = `Shadow: ${nodeTitle(node)}`;
  const under = (node.decorations ?? [])
    .filter((decoration) => decoration.kind === 'under')
    .map((decoration) =>
      freeformXml(writer, parsePathData(decoration.path), paint, { name, arrows: null, effects }),
    );
  return [
    ...under,
    el(
      'p:sp',
      {},
      el('p:nvSpPr', {}, cNvPr(writer.input.nextId(), name), el('p:cNvSpPr'), el('p:nvPr')),
      el(
        'p:spPr',
        {},
        xfrm(node.box),
        shape.preset === null
          ? outlineGeometry(parsePathData(node.path), node.box, [])
          : presetGeometry(shape.preset, node.box, cornerRadius(node)),
        fillXml(writer, paint.fill, paint.opacity),
        el('a:ln', {}, el('a:noFill')),
        effects,
      ),
    ),
  ];
}

/**
 * A described shadow as the shape effect the slide's other boxes use: PowerPoint draws one outer
 * shadow per shape, so the most visible layer is kept, its color at the shadow's opacity.
 *
 * @param writer - The diagram's state.
 * @param shadow - The shadow.
 * @param box - The box that casts it.
 */
function shadowEffectXml(
  writer: DiagramWriter,
  shadow: DescribedShadow,
  box: DescribedBox,
): string {
  const layers = shadow.layers.flatMap((layer): SceneShadow[] =>
    layer.color === null
      ? []
      : [
          {
            x: layer.x,
            y: layer.y,
            blur: layer.blur,
            spread: 0,
            color: withOpacity(layer.color, shadow.opacity),
            inset: false,
          },
        ],
  );
  return shadowXml(layers, box, theme(writer));
}

/**
 * A card's accent stripe: the node's outline clipped to the stripe's box, filled with the accent.
 *
 * @param writer - The diagram's state.
 * @param node - The node.
 */
function accentXml(writer: DiagramWriter, node: DescribedNode): string {
  const accent = node.accent;
  if (accent === undefined || accent === null || accent.color === null) {
    return '';
  }

  const commands = clipOutlineToBox(parsePathData(node.path), accent.box);
  if (commands.length === 0) {
    return '';
  }

  return freeformXml(
    writer,
    commands,
    { fill: accent.color, stroke: null, strokeWidth: 0, dashed: false, opacity: accent.opacity },
    { name: `Accent: ${nodeTitle(node)}`, arrows: null },
  );
}

/**
 * A node's geometry: its exact outline when it has no preset, else the preset with the node's
 * corners.
 *
 * @param shape - The node's shape.
 * @param node - The node.
 */
function nodeGeometry(shape: NodeShape, node: DescribedNode): string {
  if (shape.preset === null) {
    return outlineGeometry(parsePathData(node.path), node.box, shape.sites);
  }

  return presetGeometry(shape.preset, node.box, cornerRadius(node));
}

/**
 * The corner radius a node's geometry uses. A pill has none: it is drawn with fully rounded ends.
 *
 * @param node - The node.
 */
function cornerRadius(node: DescribedNode): number | null {
  return node.shape === 'pill' ? null : node.radius;
}

/**
 * The soft ring the kit draws around an emphasised node: its outline stroked wide and faint.
 *
 * @param writer - The diagram's state.
 * @param node - The node.
 * @param geometry - The node's geometry markup.
 */
function ringXml(writer: DiagramWriter, node: DescribedNode, geometry: string): string {
  const color = node.paint.stroke ?? '#000000';
  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      cNvPr(writer.input.nextId(), `Highlight: ${nodeTitle(node)}`),
      el('p:cNvSpPr'),
      el('p:nvPr'),
    ),
    el(
      'p:spPr',
      {},
      xfrm(node.box),
      geometry,
      el('a:noFill'),
      el(
        'a:ln',
        { w: pxToEmu(RING.width) },
        el(
          'a:solidFill',
          {},
          colorXml(withOpacity(color, RING.opacity * node.paint.opacity), theme(writer)),
        ),
        el('a:round'),
      ),
    ),
  );
}

/**
 * How a shape with text is drawn.
 */
type ShapeSpec = {
  /**
   * The shape id.
   */
  id: number;

  /**
   * The name the selection pane shows.
   */
  name: string;

  /**
   * The shape's box.
   */
  box: DescribedBox;

  /**
   * The geometry markup.
   */
  geometry: string;

  /**
   * Fill and outline.
   */
  paint: DescribedPaint;

  /**
   * The texts set in the shape, top to bottom.
   */
  texts: readonly DescribedText[];

  /**
   * How far inside the box the geometry's own text rectangle starts, in canvas pixels: PowerPoint
   * applies the insets inside it.
   */
  textInset: number;

  /**
   * The shape's `a:effectLst`, such as its shadow; empty for none.
   */
  effects?: string;

  /**
   * An opaque fill that replaces the paint's, with the paint's opacity left to the outline (a node
   * flattened onto its backdrop under a cast shadow).
   */
  fill?: string;
};

/**
 * A shape with its fill, outline and the texts set in it where the page set them.
 *
 * @param writer - The diagram's state.
 * @param spec - The shape.
 */
function shapeXml(writer: DiagramWriter, spec: ShapeSpec): string {
  return el(
    'p:sp',
    {},
    el('p:nvSpPr', {}, cNvPr(spec.id, spec.name), el('p:cNvSpPr'), el('p:nvPr')),
    el(
      'p:spPr',
      {},
      xfrm(spec.box),
      spec.geometry,
      spec.fill === undefined
        ? fillXml(writer, spec.paint.fill, spec.paint.opacity)
        : fillXml(writer, spec.fill, 1),
      outlineXml(writer, spec.paint),
      spec.effects ?? '',
    ),
    textBodyXml(writer, spec.texts, spec.box, true, spec.textInset),
  );
}

/**
 * A shape's text body: the texts' paragraphs with insets that put them where the page drew them.
 * Centred text gets the widest box centred on the same point and left-aligned text the widest box
 * starting at the same edge, so a label set in another font wraps only when it does not fit the
 * shape; text the page wrapped keeps its measured width.
 *
 * @param writer - The diagram's state.
 * @param texts - The texts, top to bottom.
 * @param box - The shape's box.
 * @param wide - Whether the text may use the shape's width (a node or group); a text box keeps
 *   single lines unwrapped instead.
 * @param textInset - How far inside the box the geometry's text rectangle starts.
 */
function textBodyXml(
  writer: DiagramWriter,
  texts: readonly DescribedText[],
  box: DescribedBox,
  wide: boolean,
  textInset: number,
): string {
  const paragraphs = texts.flatMap((text) => paragraphsFor(writer, text));
  if (paragraphs.length === 0) {
    return el(
      'p:txBody',
      {},
      el('a:bodyPr', { rtlCol: 0, anchor: 'ctr' }),
      el('a:lstStyle'),
      el('a:p', {}, el('a:endParaRPr', { lang: 'en-US', dirty: 0 })),
    );
  }

  const layout = layoutFrame(paragraphs);
  const frame = wide ? widenFrame(layout.rect, box, paragraphs) : layout.rect;
  const insets = {
    lIns: pxToEmu(Math.max(0, frame.x - box.x - textInset)),
    tIns: pxToEmu(Math.max(0, frame.y - box.y - textInset)),
    rIns: pxToEmu(Math.max(0, box.x + box.width - (frame.x + frame.width) - textInset)),
    bIns: 0,
  };
  const centred = paragraphs.every((paragraph) => paragraph.align === 'center');
  const laidOut = centred
    ? layout.paragraphs.map((paragraph) => ({ ...paragraph, marginLeft: 0, marginRight: 0 }))
    : layout.paragraphs;
  const wrap = wide || paragraphs.some((paragraph) => paragraph.lines.length > 1);
  return el(
    'p:txBody',
    {},
    el(
      'a:bodyPr',
      { wrap: wrap ? 'square' : 'none', ...insets, rtlCol: 0, anchor: 't', anchorCtr: 0 },
      el('a:noAutofit'),
    ),
    el('a:lstStyle'),
    ...laidOut.map((paragraph) => paragraphXml(paragraph, writer.input.context)),
  );
}

/**
 * The box text is set in inside a shape: the measured frame widened to the shape for single-line
 * text, keeping its centre for centred text and its edge for left- or right-aligned text.
 *
 * @param frame - The measured frame.
 * @param box - The shape's box.
 * @param paragraphs - The paragraphs.
 */
function widenFrame(
  frame: SceneRect,
  box: DescribedBox,
  paragraphs: readonly SceneParagraph[],
): SceneRect {
  if (paragraphs.some((paragraph) => paragraph.lines.length > 1)) {
    return frame;
  }

  const left = Math.max(0, frame.x - box.x);
  const right = Math.max(0, box.x + box.width - (frame.x + frame.width));
  const align = paragraphs[0]?.align ?? 'left';
  if (align === 'center') {
    const side = Math.min(left, right, TEXT_PADDING_PX);
    return { ...frame, x: box.x + side, width: Math.max(frame.width, box.width - 2 * side) };
  }

  const margin = Math.min(left, right, TEXT_PADDING_PX);
  if (align === 'right') {
    return { ...frame, x: box.x + margin, width: frame.x + frame.width - (box.x + margin) };
  }

  return { ...frame, width: box.x + box.width - margin - frame.x };
}

/**
 * The paragraphs of a described text: the measured element's, which carry its exact runs, or one
 * paragraph built from the description.
 *
 * @param writer - The diagram's state.
 * @param text - The described text.
 */
function paragraphsFor(writer: DiagramWriter, text: DescribedText): SceneParagraph[] {
  const measured = writer.parts.texts.get(text);
  if (measured !== undefined) {
    return measured.paragraphs;
  }

  if (text.text.trim() === '') {
    return [];
  }

  return [describedParagraph(text)];
}

/**
 * One paragraph from a described text, for text no element was measured for: the description's
 * family, size, weight and color, its line in its box.
 *
 * @param text - The described text.
 */
function describedParagraph(text: DescribedText): SceneParagraph {
  const size = text.fontSizePx;
  const ascent = size * FALLBACK_METRICS.ascent;
  const descent = size * FALLBACK_METRICS.descent;
  const style = describedRunStyle(text, ascent, descent);
  const { box } = text;
  const baseline = box.y + (box.height - (ascent + descent)) / 2 + ascent;
  return {
    lines: [
      {
        runs: [{ text: text.text, style, href: null, rect: box }],
        baseline,
        left: box.x,
        right: box.x + box.width,
        ascent,
        descent,
        authored: false,
      },
    ],
    step: null,
    replacedAt: null,
    align: text.align,
    box,
    lineHeight: box.height,
    bullet: null,
    level: 0,
    wrapWidth: null,
    keepBreaks: false,
  };
}

/**
 * The run style of a described text: its family, size, weight and color, with the line metrics it
 * was measured with.
 *
 * @param text - The described text.
 * @param ascent - The ascent, in canvas pixels.
 * @param descent - The descent, in canvas pixels.
 */
function describedRunStyle(text: DescribedText, ascent: number, descent: number): RunStyle {
  return {
    family: text.fontFamily,
    stack: text.fontFamily,
    size: text.fontSizePx,
    weight: text.fontWeight,
    italic: false,
    color: withOpacity(text.color ?? '#000000', text.opacity ?? 1),
    letterSpacing: 0,
    caps: 'none',
    underline: false,
    strike: false,
    shift: 'none',
    axes: { wght: text.fontWeight },
    ascent,
    descent,
  };
}

/**
 * A free text box at a described text's place, with a chip behind it when it has one.
 *
 * @param writer - The diagram's state.
 * @param text - The described text.
 * @param name - The shape's name.
 * @param chip - The chip's color and corner radius, or `null` for none.
 */
function textBoxXml(
  writer: DiagramWriter,
  text: DescribedText,
  name: string,
  chip: { color: string; radius: number } | null,
): string {
  const paragraphs = paragraphsFor(writer, text);
  if (paragraphs.length === 0) {
    return '';
  }

  const id = writer.input.nextId();
  const box = chip === null ? withSlack(layoutFrame(paragraphs).rect, text.align) : text.box;
  return el(
    'p:sp',
    {},
    el('p:nvSpPr', {}, cNvPr(id, name), el('p:cNvSpPr', { txBox: 1 }), el('p:nvPr')),
    el(
      'p:spPr',
      {},
      xfrm(box),
      chip === null ? presetGeometry('rect', box, 0) : roundedGeometry(box, chip.radius),
      chip === null ? el('a:noFill') : fillXml(writer, chip.color, 1),
      el('a:ln', {}, el('a:noFill')),
    ),
    textBodyXml(writer, [text], box, false, chip === null ? 0 : roundedTextInset(box, chip.radius)),
  );
}

/**
 * A free text box made wider than its text on the side it grows to, so a renderer that wraps
 * unwrapped text at the box (Apple's does) keeps a label set in a wider font on one line.
 *
 * @param frame - Where the text is set.
 * @param align - How it is aligned.
 */
function withSlack(frame: SceneRect, align: DescribedText['align']): SceneRect {
  const extra = frame.width * TEXT_BOX_SLACK;
  if (align === 'center') {
    return { ...frame, x: frame.x - extra / 2, width: frame.width + extra };
  }

  return align === 'right'
    ? { ...frame, x: frame.x - extra, width: frame.width + extra }
    : { ...frame, width: frame.width + extra };
}

/**
 * An edge label on its chip: one text box filled with the chip's color, or the measured chip drawn
 * as the page drew it (with its border) under a text box.
 *
 * @param writer - The diagram's state.
 * @param edge - The edge.
 */
function edgeLabelXml(writer: DiagramWriter, edge: DescribedEdge): string {
  const label = edge.label;
  if (label === null) {
    return '';
  }

  const measured = writer.parts.chips.get(label);
  if (measured?.borders.some((border) => border !== null) === true) {
    const chipXml = boxXml(measured, writer.input.nextId, theme(writer)).replace(
      NAME_ATTRIBUTE,
      `name="${escapeXml(`Chip: ${label.text}`)}"`,
    );
    return chipXml + textBoxXml(writer, label, `Label: ${label.text}`, null);
  }

  const chip =
    label.background === null
      ? null
      : {
          color: chipColor(writer.parts.chips.get(label)) ?? label.background,
          radius: Math.min(label.box.height / 2, writer.parts.chips.get(label)?.radii[0] ?? 0),
        };
  return textBoxXml(writer, label, `Label: ${label.text}`, chip);
}

/**
 * The flat color of a chip the page measured, opacity included.
 *
 * @param chip - The chip's box, if one was measured.
 */
function chipColor(chip: BoxNode | undefined): string | null {
  return chip?.fill?.kind === 'solid' ? chip.fill.color : null;
}

/**
 * A packet: a dot on its edge, a ring when it is a reply, and its tag.
 *
 * @param writer - The diagram's state.
 * @param packet - The packet.
 */
function packetXml(writer: DiagramWriter, packet: DescribedPacket): string {
  const box = {
    x: packet.at.x - packet.radius,
    y: packet.at.y - packet.radius,
    width: packet.radius * 2,
    height: packet.radius * 2,
  };
  const color = packet.color ?? '#000000';
  const ringWidth = Math.max(MIN_PACKET_RING_PX, packet.radius * PACKET_RING_SHARE);
  const dot = el(
    'p:sp',
    {},
    el('p:nvSpPr', {}, cNvPr(writer.input.nextId(), 'Packet'), el('p:cNvSpPr'), el('p:nvPr')),
    el(
      'p:spPr',
      {},
      xfrm(packet.reply ? inset(box, ringWidth / 2) : box),
      presetGeometry('ellipse', box, 0),
      packet.reply ? fillXml(writer, '#ffffff', 1) : fillXml(writer, color, 1),
      packet.reply
        ? el(
            'a:ln',
            { w: pxToEmu(ringWidth) },
            el('a:solidFill', {}, colorXml(color, theme(writer))),
          )
        : el('a:ln', {}, el('a:noFill')),
    ),
  );
  const label =
    packet.label === null
      ? ''
      : textBoxXml(writer, packet.label, `Label: ${packet.label.text}`, null);
  return dot + label;
}

/**
 * Node texts set outside the node's own text, such as a badge on its corner.
 *
 * @param node - The node.
 */
function looseNodeTexts(node: DescribedNode): DescribedText[] {
  const stacked = new Set(stackedTexts(node));
  return node.texts.filter((text) => !stacked.has(text));
}

/**
 * The node texts set as the shape's own text: the title and the texts stacked under it in the same
 * column, inside the node.
 *
 * @param node - The node.
 */
function stackedTexts(node: DescribedNode): DescribedText[] {
  const [title, ...rest] = node.texts;
  if (title === undefined || !insideBox(title.box, node.box)) {
    return [];
  }

  const stack = [title];
  for (const text of rest) {
    const previous = stack.at(-1) ?? title;
    const below = text.box.y >= previous.box.y + previous.box.height * STACK_BELOW_SHARE;
    const sameColumn =
      text.align === title.align &&
      (title.align === 'center'
        ? Math.abs(centerX(text.box) - centerX(title.box)) <= SAME_COLUMN_TOLERANCE_PX
        : Math.abs(text.box.x - title.box.x) <= SAME_COLUMN_TOLERANCE_PX);
    if (below && sameColumn && insideBox(text.box, node.box)) {
      stack.push(text);
    }
  }

  return stack;
}

/**
 * A node's icon as vector shapes, from the drawing the page measured for it.
 *
 * @param writer - The diagram's state.
 * @param node - The node.
 */
function iconXml(writer: DiagramWriter, node: DescribedNode): string {
  const icon = writer.parts.icons.get(node.id);
  return icon === undefined ? '' : iconShapesXml(writer, icon, `Icon: ${nodeTitle(node)}`);
}

/**
 * The vector shapes of an icon the page drew, one shape each, not grouped.
 *
 * @param writer - The diagram's state.
 * @param icon - The icon's drawing.
 * @param name - The shapes' name.
 */
function iconShapesXml(writer: DiagramWriter, icon: SvgNode, name: string): string {
  return (icon.shapes ?? [])
    .map((shape) =>
      vectorGroupXml([shape], icon.rect, name, writer.input.nextId, theme(writer), null).replace(
        'name="Vector"',
        `name="${escapeXml(name)}"`,
      ),
    )
    .join('');
}

/**
 * An edge: a preset connector glued to the nodes it joins when one draws the route, else a freeform
 * line along the exact path.
 *
 * @param writer - The diagram's state.
 * @param edge - The edge.
 */
function edgeXml(writer: DiagramWriter, edge: DescribedEdge): string {
  const name = `Connector: ${titleOf(writer, edge.from)} → ${titleOf(writer, edge.to)}`;
  const paint: DescribedPaint = {
    fill: null,
    stroke: edge.color,
    strokeWidth: edge.width,
    dashed: edge.dashed,
    opacity: edge.opacity,
  };
  const arrows = { start: edge.arrowStart, end: edge.arrowEnd, style: edge.arrow ?? 'triangle' };
  const geometry = edge.route === 'curved' ? null : connectorGeometry(edge.points);
  if (geometry === null) {
    return freeformXml(writer, parsePathData(edge.path), paint, { name, arrows });
  }

  const start = edge.points[0];
  const end = edge.points.at(-1);
  return connectorXml(writer, geometry, paint, {
    name,
    arrows,
    start: start === undefined ? null : glue(writer, edge.from, start),
    end: end === undefined ? null : glue(writer, edge.to, end),
  });
}

/**
 * The shape and site a connector end is glued to, when it ends on the node.
 *
 * @param writer - The diagram's state.
 * @param nodeId - The node's id.
 * @param point - The connector's end.
 */
function glue(
  writer: DiagramWriter,
  nodeId: string,
  point: Point,
): { id: number; index: number } | null {
  const shape = writer.nodes.get(nodeId);
  if (shape === undefined || !touchesBox(shape.node.box, point)) {
    return null;
  }

  const site = findSite(shape.sites, point);
  return site === null ? null : { id: shape.id, index: site.index };
}

/**
 * A line the diagram draws that is not an edge: a lifeline, an axis or its progress.
 *
 * @param writer - The diagram's state.
 * @param line - The line.
 */
function plainLineXml(writer: DiagramWriter, line: DescribedLine): string {
  const paint: DescribedPaint = {
    fill: null,
    stroke: line.color,
    strokeWidth: line.width,
    dashed: line.dashed,
    opacity: line.opacity,
  };
  const name = `Line: ${line.role}`;
  const geometry = connectorGeometry(line.points);
  if (geometry?.preset === 'straightConnector1') {
    return connectorXml(writer, geometry, paint, { name, arrows: null, start: null, end: null });
  }

  const commands: PathCommand[] = line.points.map((point, index) =>
    index === 0 ? { type: 'M', points: [point] } : { type: 'L', points: [point] },
  );
  return freeformXml(writer, commands, paint, { name, arrows: null });
}

/**
 * Arrowheads at a line's ends.
 */
type Arrows = {
  /**
   * An arrowhead where the line starts.
   */
  start: boolean;

  /**
   * An arrowhead where the line ends.
   */
  end: boolean;

  /**
   * How the arrowheads are drawn; a filled triangle without one.
   */
  style?: NonNullable<DescribedEdge['arrow']>;
};

/**
 * A preset connector, glued at the ends that have a site.
 *
 * @param writer - The diagram's state.
 * @param geometry - The connector's geometry.
 * @param paint - Its line.
 * @param options - Its name, arrowheads and glue.
 * @param options.name - The name.
 * @param options.arrows - The arrowheads, or `null`.
 * @param options.start - The shape and site its start is glued to, or `null`.
 * @param options.end - The shape and site its end is glued to, or `null`.
 */
function connectorXml(
  writer: DiagramWriter,
  geometry: ConnectorGeometry,
  paint: DescribedPaint,
  options: {
    name: string;
    arrows: Arrows | null;
    start: { id: number; index: number } | null;
    end: { id: number; index: number } | null;
  },
): string {
  const { box } = geometry;
  const avList = geometry.adjust.map((value, index) =>
    el('a:gd', { name: `adj${index + 1}`, fmla: `val ${value}` }),
  );
  return el(
    'p:cxnSp',
    {},
    el(
      'p:nvCxnSpPr',
      {},
      cNvPr(writer.input.nextId(), options.name),
      el(
        'p:cNvCxnSpPr',
        {},
        options.start === null
          ? ''
          : el('a:stCxn', { id: options.start.id, idx: options.start.index }),
        options.end === null ? '' : el('a:endCxn', { id: options.end.id, idx: options.end.index }),
      ),
      el('p:nvPr'),
    ),
    el(
      'p:spPr',
      {},
      el(
        'a:xfrm',
        {
          rot: geometry.rotation === 0 ? undefined : degreesToDrawing(geometry.rotation),
          flipH: geometry.flipH ? 1 : undefined,
          flipV: geometry.flipV ? 1 : undefined,
        },
        el('a:off', { x: pxToEmu(box.x), y: pxToEmu(box.y) }),
        el('a:ext', { cx: pxToEmu(box.width), cy: pxToEmu(box.height) }),
      ),
      el('a:prstGeom', { prst: geometry.preset }, el('a:avLst', {}, ...avList)),
      el('a:noFill'),
      outlineXml(writer, paint, options.arrows),
    ),
  );
}

/**
 * A freeform shape along path commands in canvas pixels: an open line with arrowheads, or a filled
 * decoration.
 *
 * @param writer - The diagram's state.
 * @param commands - The path.
 * @param paint - Its fill and line.
 * @param options - Its name, arrowheads and effects.
 * @param options.name - The name.
 * @param options.arrows - The arrowheads, or `null`.
 * @param options.effects - Its `a:effectLst`, such as a shadow.
 */
function freeformXml(
  writer: DiagramWriter,
  commands: readonly PathCommand[],
  paint: DescribedPaint,
  options: { name: string; arrows: Arrows | null; effects?: string },
): string {
  const bounds = pathBounds(commands);
  if (bounds === null) {
    return '';
  }

  const box = {
    ...bounds,
    width: Math.max(bounds.width, MIN_SHAPE_EXTENT_PX),
    height: Math.max(bounds.height, MIN_SHAPE_EXTENT_PX),
  };
  return el(
    'p:sp',
    {},
    el('p:nvSpPr', {}, cNvPr(writer.input.nextId(), options.name), el('p:cNvSpPr'), el('p:nvPr')),
    el(
      'p:spPr',
      {},
      xfrm(box),
      outlineGeometry(commands, box, [], paint.fill !== null),
      fillXml(writer, paint.fill, paint.opacity),
      outlineXml(writer, paint, options.arrows),
      options.effects ?? '',
    ),
  );
}

/**
 * The fill of a shape: its color at the shape's opacity, or none.
 *
 * @param writer - The diagram's state.
 * @param color - The color, or `null`.
 * @param opacity - The shape's opacity.
 */
function fillXml(writer: DiagramWriter, color: string | null, opacity: number): string {
  if (color === null || opacity <= 0) {
    return el('a:noFill');
  }

  return el('a:solidFill', {}, colorXml(withOpacity(color, opacity), theme(writer)));
}

/**
 * The outline of a shape or line: width, color at its opacity, dashes, round joins and arrowheads.
 *
 * @param writer - The diagram's state.
 * @param paint - The paint.
 * @param arrows - The arrowheads, if it is a line.
 */
function outlineXml(
  writer: DiagramWriter,
  paint: DescribedPaint,
  arrows: Arrows | null = null,
): string {
  const strokeWidth = paint.strokeWidth;
  if (paint.stroke === null || strokeWidth <= 0 || paint.opacity <= 0) {
    return el('a:ln', {}, el('a:noFill'));
  }

  const arrow = ARROW_ENDS[arrows?.style ?? 'triangle'];
  return el(
    'a:ln',
    { w: pxToEmu(strokeWidth) },
    el('a:solidFill', {}, colorXml(withOpacity(paint.stroke, paint.opacity), theme(writer))),
    el('a:prstDash', { val: paint.dashed ? 'dash' : 'solid' }),
    el('a:round'),
    arrows?.start === true ? el('a:headEnd', arrow) : '',
    arrows?.end === true ? el('a:tailEnd', arrow) : '',
  );
}

/**
 * A preset geometry: a rounded rectangle's corner as its adjust value (`null` for a pill).
 *
 * @param preset - The preset.
 * @param box - The shape's box.
 * @param radius - The corner radius in canvas pixels, or `null` for fully rounded ends.
 */
function presetGeometry(preset: string, box: DescribedBox, radius: number | null): string {
  if (preset !== 'roundRect') {
    return el('a:prstGeom', { prst: preset }, el('a:avLst'));
  }

  const shorter = Math.max(1, Math.min(box.width, box.height));
  const value =
    radius === null
      ? GUIDE_UNIT / 2
      : Math.min(GUIDE_UNIT / 2, Math.round((radius / shorter) * GUIDE_UNIT));
  return el(
    'a:prstGeom',
    { prst: 'roundRect' },
    el('a:avLst', {}, el('a:gd', { name: 'adj', fmla: `val ${value}` })),
  );
}

/**
 * Where a rounded rectangle preset's text rectangle starts inside its box: its corners' radius
 * times 1 - cos 45° (`il = x1 * 29289 / 100000` in `presetShapeDefinitions.xml`).
 *
 * @param box - The box.
 * @param radius - The corner radius, or `null` for fully rounded ends.
 */
function roundedTextInset(box: DescribedBox, radius: number | null): number {
  const half = Math.min(box.width, box.height) / 2;
  return Math.min(radius ?? half, half) * (1 - Math.SQRT1_2);
}

/**
 * A rectangle, or a rounded rectangle when it has a radius.
 *
 * @param box - The box.
 * @param radius - The corner radius in canvas pixels.
 */
function roundedGeometry(box: DescribedBox, radius: number): string {
  return radius > 0 ? presetGeometry('roundRect', box, radius) : presetGeometry('rect', box, 0);
}

/**
 * `a:custGeom` for an exact outline, with the connection sites connectors are glued to.
 *
 * @param commands - The outline in canvas pixels.
 * @param box - The shape's box.
 * @param sites - The connection sites in canvas pixels.
 * @param filled - Whether the path is filled.
 */
export function outlineGeometry(
  commands: readonly PathCommand[],
  box: DescribedBox,
  sites: readonly ConnectionSite[],
  filled = true,
): string {
  const steps = pathStepsXml(commands, box);
  const connections = sites.map((site) =>
    el(
      'a:cxn',
      { ang: degreesToDrawing(site.angle) },
      el('a:pos', { x: pxToEmu(site.x - box.x), y: pxToEmu(site.y - box.y) }),
    ),
  );
  return el(
    'a:custGeom',
    {},
    el('a:avLst'),
    el('a:gdLst'),
    el('a:ahLst'),
    el('a:cxnLst', {}, ...connections),
    el('a:rect', { l: 0, t: 0, r: 'r', b: 'b' }),
    el(
      'a:pathLst',
      {},
      el(
        'a:path',
        {
          w: Math.max(1, pxToEmu(box.width)),
          h: Math.max(1, pxToEmu(box.height)),
          fill: filled ? undefined : 'none',
        },
        ...steps,
      ),
    ),
  );
}

/**
 * The path steps of an exact outline, with its points relative to the box in EMU.
 *
 * @param commands - The outline in canvas pixels.
 * @param box - The shape's box.
 */
function pathStepsXml(commands: readonly PathCommand[], box: DescribedBox): string[] {
  /**
   * A point relative to the box, in EMU.
   */
  const point = (value: Point): string =>
    el('a:pt', { x: pxToEmu(value.x - box.x), y: pxToEmu(value.y - box.y) });
  return commands.map((command) => {
    switch (command.type) {
      case 'M': {
        return el('a:moveTo', {}, point(command.points[0]));
      }

      case 'L': {
        return el('a:lnTo', {}, point(command.points[0]));
      }

      case 'C': {
        return el('a:cubicBezTo', {}, ...command.points.map(point));
      }

      case 'Z': {
        return el('a:close');
      }
    }
  });
}

/**
 * A shape with alt text added to its `p:cNvPr`: the diagram's summary goes on its first shape, as
 * the shapes are not grouped (Apple's renderer drops freeform shapes inside a group).
 *
 * @param xml - The shape's markup.
 * @param text - The alt text.
 */
function withDescription(xml: string, text: string): string {
  const index = xml.indexOf('<p:cNvPr ');
  if (index === -1 || text === '' || xml.slice(index, xml.indexOf('>', index)).includes('descr=')) {
    return xml;
  }

  const at = index + '<p:cNvPr '.length;
  return `${xml.slice(0, at)}descr="${escapeXml(text)}" ${xml.slice(at)}`;
}

/**
 * A node's title, or its id.
 *
 * @param node - The node.
 */
function nodeTitle(node: DescribedNode): string {
  return node.texts[0]?.text ?? node.id;
}

/**
 * The title of the node with an id, or the id.
 *
 * @param writer - The diagram's state.
 * @param id - The node id.
 */
function titleOf(writer: DiagramWriter, id: string): string {
  const shape = writer.nodes.get(id);
  return shape === undefined ? id : nodeTitle(shape.node);
}

/**
 * The slide's theme.
 *
 * @param writer - The diagram's state.
 */
function theme(writer: DiagramWriter): TextContext['theme'] {
  return writer.input.context.theme;
}

/**
 * A color with an opacity folded into its alpha.
 *
 * @param hex - `#rrggbb` or `#rrggbbaa`.
 * @param opacity - The opacity, 0 to 1.
 */
export function withOpacity(hex: string, opacity: number): string {
  const digits = hex.replace('#', '');
  const rgb = digits.slice(0, OPAQUE_HEX_LENGTH);
  const alpha =
    digits.length > OPAQUE_HEX_LENGTH
      ? Number.parseInt(digits.slice(OPAQUE_HEX_LENGTH), HEX_RADIX) / CHANNEL_MAX
      : 1;
  const combined = Math.max(0, Math.min(1, alpha * opacity));
  if (combined >= 1) {
    return `#${rgb}`;
  }

  return `#${rgb}${Math.round(combined * CHANNEL_MAX)
    .toString(HEX_RADIX)
    .padStart(2, '0')}`;
}

/**
 * A box shrunk on every side.
 *
 * @param box - The box.
 * @param by - How much, in canvas pixels.
 */
function inset(box: DescribedBox, by: number): DescribedBox {
  return {
    x: box.x + by,
    y: box.y + by,
    width: Math.max(0, box.width - 2 * by),
    height: Math.max(0, box.height - 2 * by),
  };
}

/**
 * Whether a box lies inside another, give or take a few pixels.
 *
 * @param inner - The inner box.
 * @param outer - The outer box.
 */
function insideBox(inner: DescribedBox, outer: DescribedBox): boolean {
  return (
    inner.x >= outer.x - INSIDE_SLACK_PX &&
    inner.y >= outer.y - INSIDE_SLACK_PX &&
    inner.x + inner.width <= outer.x + outer.width + INSIDE_SLACK_PX &&
    inner.y + inner.height <= outer.y + outer.height + INSIDE_SLACK_PX
  );
}

/**
 * The horizontal centre of a box.
 *
 * @param box - The box.
 */
function centerX(box: DescribedBox): number {
  return box.x + box.width / 2;
}
