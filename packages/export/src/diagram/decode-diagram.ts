import type { DiagramDescription } from '@deckster/kit/diagram-description';

import {
  DIAGRAM_DESCRIPTION_ATTRIBUTE,
  DIAGRAM_DESCRIPTION_VERSION,
} from '@deckster/kit/diagram-description';
import { Schema } from 'effect';

/**
 * A box in canvas pixels.
 */
const Box = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
});

/**
 * A point in canvas pixels.
 */
const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number });

/**
 * A color, or `null` for none.
 */
const Color = Schema.NullOr(Schema.String);

/**
 * Text as the diagram sets it.
 */
const Text = Schema.Struct({
  text: Schema.String,
  box: Box,
  color: Color,
  fontFamily: Schema.String,
  fontSizePx: Schema.Number,
  fontWeight: Schema.Number,
  align: Schema.Literals(['left', 'center', 'right']),
  opacity: Schema.optionalKey(Schema.Number),
});

/**
 * Fill and outline.
 */
const Paint = Schema.Struct({
  fill: Color,
  stroke: Color,
  strokeWidth: Schema.Number,
  dashed: Schema.Boolean,
  opacity: Schema.Number,
});

/**
 * The shadow a node's card casts.
 */
const Shadow = Schema.Struct({
  layers: Schema.Array(
    Schema.Struct({ x: Schema.Number, y: Schema.Number, blur: Schema.Number, color: Color }),
  ),
  fill: Color,
  opacity: Schema.Number,
});

/**
 * A card's accent stripe.
 */
const Accent = Schema.Struct({
  side: Schema.Literals(['left', 'top', 'right', 'bottom']),
  box: Box,
  color: Color,
  opacity: Schema.Number,
});

/**
 * A node.
 */
const Node = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  state: Schema.String,
  shape: Schema.Literals([
    'rect',
    'roundRect',
    'pill',
    'can',
    'pipe',
    'hexagon',
    'octagon',
    'foldedCorner',
    'diamond',
    'ellipse',
  ]),
  path: Schema.String,
  box: Box,
  radius: Schema.Number,
  paint: Paint,
  texts: Schema.Array(Text),
  decorations: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        kind: Schema.Literals(['under', 'details']),
        path: Schema.String,
        paint: Paint,
      }),
    ),
  ),
  icon: Schema.NullOr(Schema.Struct({ box: Box, color: Color, svg: Schema.String })),
  group: Schema.NullOr(Schema.String),
  card: Schema.optionalKey(Schema.String),
  shadow: Schema.optionalKey(Schema.NullOr(Shadow)),
  accent: Schema.optionalKey(Schema.NullOr(Accent)),
});

/**
 * A labelled container.
 */
const Group = Schema.Struct({
  id: Schema.String,
  box: Box,
  radius: Schema.Number,
  paint: Paint,
  label: Schema.NullOr(Text),
  parent: Schema.NullOr(Schema.String),
});

/**
 * A connector between two nodes.
 */
const Edge = Schema.Struct({
  id: Schema.String,
  from: Schema.String,
  to: Schema.String,
  route: Schema.Literals(['orthogonal', 'straight', 'curved']),
  points: Schema.Array(Point),
  path: Schema.String,
  cornerRadius: Schema.Number,
  color: Color,
  width: Schema.Number,
  dashed: Schema.Boolean,
  arrowStart: Schema.Boolean,
  arrowEnd: Schema.Boolean,
  arrow: Schema.optionalKey(Schema.Literals(['triangle', 'open', 'dot'])),
  tone: Schema.String,
  opacity: Schema.Number,
  label: Schema.NullOr(Schema.Struct({ ...Text.fields, background: Color })),
});

/**
 * A packet frozen on its edge.
 */
const Packet = Schema.Struct({
  at: Point,
  radius: Schema.Number,
  angle: Schema.Number,
  color: Color,
  reply: Schema.Boolean,
  label: Schema.NullOr(Text),
});

/**
 * A plain line that is not an edge.
 */
const Line = Schema.Struct({
  role: Schema.Literals(['lifeline', 'axis', 'progress']),
  node: Schema.NullOr(Schema.String),
  points: Schema.Array(Point),
  color: Color,
  width: Schema.Number,
  dashed: Schema.Boolean,
  opacity: Schema.Number,
});

/**
 * The parts of a kit diagram description (`@deckster/kit/diagram-description`, version 1) the PPTX
 * writer reads, checked because the description is page data. The types are the kit's: the two
 * functions below fail to typecheck when this schema and the kit's types drift apart.
 */
const Description = Schema.Struct({
  version: Schema.Literal(DIAGRAM_DESCRIPTION_VERSION),
  kind: Schema.Literals(['flow', 'sequence', 'timeline', 'layers', 'cycle', 'tree', 'svg']),
  id: Schema.String,
  step: Schema.Number,
  box: Box,
  summary: Schema.String,
  groups: Schema.Array(Group),
  edges: Schema.Array(Edge),
  nodes: Schema.Array(Node),
  texts: Schema.Array(Text),
  packets: Schema.Array(Packet),
  lines: Schema.optionalKey(Schema.Array(Line)),
  svg: Schema.optionalKey(Schema.String),
});

/**
 * What the schema decodes, as the kit's type: fails to typecheck when the kit adds a required field
 * the schema does not read.
 *
 * @param value - A decoded description.
 */
function asKitDescription(value: typeof Description.Type): DiagramDescription {
  return value;
}

/**
 * The kit's type as what the schema decodes: fails to typecheck when the kit drops or renames a
 * field the schema reads.
 *
 * @param value - A kit description.
 */
export function asDecodedDescription(value: DiagramDescription): typeof Description.Type {
  return value;
}

/**
 * Decodes a diagram's published description.
 *
 * @param text - The value of the kit's `data-diagram-description` attribute.
 * @returns The description, or a sentence saying why it could not be read (not JSON, another
 *   version, a missing field).
 */
export function decodeDiagramDescription(text: string): DiagramDescription | string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return `${DIAGRAM_DESCRIPTION_ATTRIBUTE} is not JSON`;
  }

  const decoded = Schema.decodeUnknownExit(Description)(value);
  if (decoded._tag === 'Success') {
    return asKitDescription(decoded.value);
  }

  return (
    `${DIAGRAM_DESCRIPTION_ATTRIBUTE} does not match version ${DIAGRAM_DESCRIPTION_VERSION}: ` +
    firstLine(decoded.cause)
  );
}

/**
 * Whether a description has shapes to draw: nodes or connectors. Layers and imported SVG drawings
 * describe only their text today, so their page elements are exported instead.
 *
 * @param diagram - The description.
 */
export function isDrawableDiagram(diagram: DiagramDescription): boolean {
  return diagram.nodes.length > 0 || diagram.edges.length > 0;
}

/**
 * The first line of a decoding failure.
 *
 * @param cause - The failure.
 */
function firstLine(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  return text.split('\n')[0] ?? '';
}
