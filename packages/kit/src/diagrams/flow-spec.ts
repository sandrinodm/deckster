import type { DiagramLineStyle } from '#diagrams/diagram-design.ts';
import type { Side } from '#diagrams/geometry.ts';
import type { NodeKind } from '#diagrams/node-kinds.ts';

/**
 * Separators allowed between ids in a written list: whitespace and commas.
 */
const ID_LIST_SEPARATORS = /[\s,]+/;

/**
 * The emphasis a node or an edge can show: the default look, picked out in the accent, pushed back,
 * failed or healthy.
 */
export const DIAGRAM_STATES = ['default', 'highlighted', 'muted', 'error', 'success'] as const;

/**
 * One of {@link DIAGRAM_STATES}.
 */
export type DiagramState = (typeof DIAGRAM_STATES)[number];

/**
 * The color role a packet travels in: the accent (the default), the surface's positive or negative
 * role, or the foreground.
 */
export const PACKET_ROLES = ['accent', 'positive', 'negative', 'fg'] as const;

/**
 * One of {@link PACKET_ROLES}.
 */
export type PacketRole = (typeof PACKET_ROLES)[number];

/**
 * Packet speeds; each is a multiple of the brand's motion durations.
 */
export const PACKET_SPEEDS = ['slow', 'normal', 'fast'] as const;

/**
 * One of {@link PACKET_SPEEDS}.
 */
export type PacketSpeed = (typeof PACKET_SPEEDS)[number];

/**
 * Packet sizes.
 */
export const PACKET_SIZES = ['sm', 'md', 'lg'] as const;

/**
 * One of {@link PACKET_SIZES}.
 */
export type PacketSize = (typeof PACKET_SIZES)[number];

/**
 * How an edge runs between its nodes.
 */
export const EDGE_ROUTES = ['orthogonal', 'straight', 'curved'] as const;

/**
 * One of {@link EDGE_ROUTES}.
 */
export type EdgeRoute = (typeof EDGE_ROUTES)[number];

/**
 * Where an edge draws arrowheads.
 */
export const EDGE_ARROWS = ['end', 'start', 'both', 'none'] as const;

/**
 * One of {@link EDGE_ARROWS}.
 */
export type EdgeArrow = (typeof EDGE_ARROWS)[number];

/**
 * Automatic layout algorithms (ELK).
 */
export const AUTO_LAYOUTS = ['layered', 'tree', 'force', 'radial'] as const;

/**
 * One of {@link AUTO_LAYOUTS}.
 */
export type AutoLayout = (typeof AUTO_LAYOUTS)[number];

/**
 * Which way an automatic layout flows.
 */
export const FLOW_DIRECTIONS = ['right', 'down', 'left', 'up'] as const;

/**
 * One of {@link FLOW_DIRECTIONS}.
 */
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number];

/**
 * Where a node or group sits on the diagram's grid. Columns and rows count from 1; a computed
 * layout (a tree, an automatic layout) may use fractions.
 */
export type GridCell = {
  /**
   * The first column.
   */
  col: number;

  /**
   * The first row.
   */
  row: number;

  /**
   * How many columns it covers; 1 by default.
   */
  colSpan: number;

  /**
   * How many rows it covers; 1 by default.
   */
  rowSpan: number;
};

/**
 * A node as the layout and the choreography see it.
 */
export type FlowNodeSpec = {
  /**
   * Desired width in canvas pixels.
   */
  width?: number;

  /**
   * Minimum height in canvas pixels.
   */
  height?: number;

  /**
   * The id edges and packets name it by.
   */
  id: string;

  /**
   * What it is; sets its shape and icon.
   */
  kind: NodeKind;

  /**
   * The name on the node.
   */
  title: string;

  /**
   * A second, quieter line.
   */
  subtitle?: string;

  /**
   * A small status pill on its corner, such as `p99 40 ms` or `503`.
   */
  badge?: string;

  /**
   * The emphasis it starts with.
   */
  state: DiagramState;

  /**
   * The step that reveals it; always shown without one.
   */
  at?: number;

  /**
   * Its place on the grid; `undefined` for an automatic layout.
   */
  cell?: GridCell;

  /**
   * The id of the innermost group it sits in.
   */
  group?: string;

  /**
   * The card (node style) it asked for; the diagram's card, the brand's card for its kind or
   * `default` apply when it has none or the brand lacks it.
   */
  card?: string;
};

/**
 * A labelled container that nodes sit in, such as a VPC or "Client side".
 */
export type FlowGroupSpec = {
  /**
   * Outline or connector width in canvas pixels.
   */
  strokeWidth?: number;

  /**
   * Pattern to apply where no semantic style takes precedence.
   */
  lineStyle?: DiagramLineStyle;

  /**
   * Its id; generated from the label when not given.
   */
  id: string;

  /**
   * The label in its top-left corner.
   */
  label: string;

  /**
   * The id of the group it sits in.
   */
  parent?: string;

  /**
   * The step that reveals it.
   */
  at?: number;

  /**
   * An explicit area on the grid; without one it wraps its nodes.
   */
  cell?: GridCell;
};

/**
 * Continuous traffic along an edge.
 */
export type FlowTraffic = {
  /**
   * Particles on the edge at once.
   */
  count: number;

  /**
   * How fast they travel.
   */
  speed: PacketSpeed;

  /**
   * How big they are.
   */
  size: PacketSize;

  /**
   * Their color role.
   */
  role: PacketRole;

  /**
   * Travel from `to` back to `from` instead.
   */
  reverse: boolean;
};

/**
 * A connection between two nodes.
 */
export type FlowEdgeSpec = {
  /**
   * Outline or connector width in canvas pixels.
   */
  strokeWidth?: number;

  /**
   * Pattern to apply where no semantic style takes precedence.
   */
  lineStyle?: DiagramLineStyle;

  /**
   * Its id: given, else `from->to` (with a counter when two edges join the same nodes).
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
   * Text on the path, such as `HTTPS` or `publish`.
   */
  label?: string;

  /**
   * Dashed for asynchronous or optional links.
   */
  dashed: boolean;

  /**
   * How the path runs.
   */
  route: EdgeRoute;

  /**
   * Where arrowheads go.
   */
  arrow: EdgeArrow;

  /**
   * The step that reveals it; it also waits for both of its nodes.
   */
  at?: number;

  /**
   * The side of `from` it leaves by, when the router's choice is not the one you want.
   */
  fromSide?: Side;

  /**
   * The side of `to` it enters by.
   */
  toSide?: Side;

  /**
   * Continuous traffic along it, from its reveal on.
   */
  flow?: FlowTraffic;

  /**
   * The emphasis it starts with.
   */
  state: DiagramState;
};

/**
 * How a trip plays while its step is current: over and over, or once and then rest at the end.
 */
export type PlayMode = 'loop' | 'once';

/**
 * Packets travelling along a chain of edges: one hop of a journey, a request and its response, or a
 * burst of traffic.
 */
export type FlowTripSpec = {
  /**
   * A stable id, for keys and tests.
   */
  id: string;

  /**
   * The nodes it passes through, in order: at least two, each pair joined by an edge.
   */
  path: readonly string[];

  /**
   * The step it plays at; it plays on every step without one.
   */
  at?: number;

  /**
   * The step it stops at (exclusive); without one it plays only while `at` is the current step.
   */
  until?: number;

  /**
   * Particles travelling together.
   */
  count: number;

  /**
   * How fast they travel.
   */
  speed: PacketSpeed;

  /**
   * How big they are.
   */
  size: PacketSize;

  /**
   * Their color role.
   */
  role: PacketRole;

  /**
   * A short tag that rides with the packet, such as `GET /cart`.
   */
  label?: string;

  /**
   * Come back along the same path after a pause at the far end: `true`, or the response's tag.
   */
  reply?: string | true;

  /**
   * Loop while current, or play once and rest at the end.
   */
  play: PlayMode;

  /**
   * Whether it is the way back of a journey, drawn as a ring like a reply.
   */
  returning: boolean;

  /**
   * The journey it belongs to, for trails and focus.
   */
  journey?: string;
};

/**
 * A change of emphasis on a node or an edge from a step on.
 */
export type FlowStateChange = {
  /**
   * The node it changes, or `undefined` for an edge.
   */
  node?: string;

  /**
   * The edge it changes (by id), or `undefined` for a node.
   */
  edge?: string;

  /**
   * The step it applies from.
   */
  at: number;

  /**
   * The step it stops applying at (exclusive); it lasts to the end without one.
   */
  until?: number;

  /**
   * The emphasis it sets.
   */
  is: DiagramState;

  /**
   * A badge to show while it applies, replacing the node's own.
   */
  badge?: string;
};

/**
 * A step range during which everything but some nodes (and the edges between them) is dimmed.
 */
export type FlowFocus = {
  /**
   * The nodes that stay lit.
   */
  nodes: readonly string[];

  /**
   * The first step it applies on.
   */
  at: number;

  /**
   * The step it stops applying at (exclusive); it lasts to the end without one.
   */
  until?: number;
};

/**
 * A choreographed journey: its trips, plus whether it leaves a trail and dims the rest.
 */
export type FlowJourney = {
  /**
   * Its id.
   */
  id: string;

  /**
   * The ids of its trips, in order.
   */
  trips: readonly string[];

  /**
   * Dim every node and edge off the journey's path while it plays.
   */
  focus: boolean;

  /**
   * Keep the edges already travelled lit while the journey goes on.
   */
  trail: boolean;
};

/**
 * Everything a `<Flow>` declares, as plain data: the input of the layout, the choreography, the
 * validation and the export description.
 */
export type FlowSpec = {
  /**
   * The nodes, in source order.
   */
  nodes: readonly FlowNodeSpec[];

  /**
   * The groups, outermost first.
   */
  groups: readonly FlowGroupSpec[];

  /**
   * The edges, in source order.
   */
  edges: readonly FlowEdgeSpec[];

  /**
   * Packets and journey hops.
   */
  trips: readonly FlowTripSpec[];

  /**
   * Journeys that group trips.
   */
  journeys: readonly FlowJourney[];

  /**
   * Changes of emphasis per step.
   */
  states: readonly FlowStateChange[];

  /**
   * Focus ranges.
   */
  focus: readonly FlowFocus[];
};

/**
 * The id an edge gets when none is given.
 *
 * @param from - The node it starts at.
 * @param to - The node it ends at.
 */
export function defaultEdgeId(from: string, to: string): string {
  return `${from}->${to}`;
}

/**
 * Splits a list of ids written as one string (`"web api db"` or `"web, api, db"`) or an array.
 *
 * @param value - The list as written.
 * @returns The ids, without empty entries.
 */
export function idList(value: string | readonly string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  const items = typeof value === 'string' ? value.split(ID_LIST_SEPARATORS) : value;
  return items.map((item) => item.trim()).filter((item) => item !== '');
}

/**
 * The edge that joins two nodes in either direction, preferring one that runs `from` to `to`.
 *
 * @param edges - The diagram's edges.
 * @param from - One node.
 * @param to - The other node.
 * @returns The edge and whether a trip from `from` to `to` runs against it; `undefined` when no
 *   edge joins them.
 */
export function edgeBetween(
  edges: readonly FlowEdgeSpec[],
  from: string,
  to: string,
): { edge: FlowEdgeSpec; reversed: boolean } | undefined {
  const forward = edges.find((edge) => edge.from === from && edge.to === to);
  if (forward !== undefined) {
    return { edge: forward, reversed: false };
  }

  const backward = edges.find((edge) => edge.from === to && edge.to === from);
  return backward === undefined ? undefined : { edge: backward, reversed: true };
}
