import type { ComponentType, ReactNode, SVGProps } from 'react';

import type { DiagramLineStyle } from '#diagrams/diagram-design.ts';
import type { FlowPartName } from '#diagrams/flow-spec-builder.ts';
import type {
  DiagramState,
  EdgeArrow,
  EdgeRoute,
  PacketRole,
  PacketSize,
  PacketSpeed,
  PlayMode,
} from '#diagrams/flow-spec.ts';
import type { Side } from '#diagrams/geometry.ts';

/**
 * An icon component, as `~icons/<set>/<name>` imports provide.
 */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * A step range: `at` starts it, `until` (exclusive) ends it.
 */
type StepRange = {
  /**
   * The step it starts on.
   */
  at?: number;

  /**
   * The step it stops at; it lasts to the end without one.
   */
  until?: number;
};

/**
 * Where something sits on the grid. Columns and rows count from 1.
 */
type CellProps = {
  /**
   * The column, from 1 on the left.
   */
  col?: number;

  /**
   * The row, from 1 at the top.
   */
  row?: number;

  /**
   * How many columns it covers.
   */
  colSpan?: number;

  /**
   * How many rows it covers.
   */
  rowSpan?: number;
};

/**
 * Props of {@link Node}.
 */
export type NodeProps = CellProps & {
  /**
   * Preferred width in canvas pixels.
   */
  width?: number;

  /**
   * Minimum measured height in canvas pixels.
   */
  height?: number;

  /**
   * The id edges and packets name it by.
   */
  id: string;

  /**
   * What it is, which sets its shape and icon: `service`, `database`, `queue`, `cache`, `storage`,
   * `user`, `client`, `mobile`, `cloud`, `external`, `function`, `gateway`, `loadbalancer`,
   * `agent`, `llm`, `tool`, `document`, `decision` or `node` (the default). `deckster diagrams`
   * lists them with aliases.
   */
  kind?: string;

  /**
   * The name on the node; the id when left out.
   */
  title?: string;

  /**
   * A second, quieter line, such as `Postgres 16` or `us-east-1`.
   */
  subtitle?: string;

  /**
   * A small status pill on its corner, such as `503` or `p99 40 ms`.
   */
  badge?: string;

  /**
   * The emphasis it starts with: `default`, `highlighted`, `muted`, `error` or `success`.
   */
  state?: DiagramState;

  /**
   * The step that reveals it.
   */
  at?: number;

  /**
   * The card (a node style the brand defines) it is drawn with: `default`, `outline`, `solid`,
   * `tint`, `raised` or one of the brand's own (`deckster brand <name>` lists them). Without one it
   * takes the diagram's `card`, else the card the brand maps its kind to, else `default`.
   */
  card?: string;

  /**
   * An Iconify name (MDX), icon component, image URL, or `none` to omit the icon.
   */
  icon?: string | IconComponent;

  /**
   * Content of your own instead of the title and subtitle, for a generic node.
   */
  children?: ReactNode;
};

/**
 * A node of a `<Flow>`. It renders nothing by itself: the diagram reads its props.
 *
 * ```mdx
 * <Node id="db" kind="database" title="Orders DB" subtitle="Postgres" col={4} row={2} />
 * ```
 */
export function Node(_props: NodeProps): ReactNode {
  return null;
}

/**
 * Props of {@link Group}.
 */
export type GroupProps = CellProps & {
  /**
   * Outline width in canvas pixels; zero hides the outline.
   */
  strokeWidth?: number;

  /**
   * The outline pattern.
   */
  lineStyle?: DiagramLineStyle;

  /**
   * Its id; made from the label when left out.
   */
  id?: string;

  /**
   * The label in its top-left corner, such as `VPC` or `Client side`.
   */
  label: string;

  /**
   * The step that reveals it.
   */
  at?: number;

  /**
   * The nodes and groups inside it. Without a cell of its own, the group wraps them.
   */
  children?: ReactNode;
};

/**
 * A labelled container around nodes: nest the `<Node>`s (and inner `<Group>`s) it holds.
 *
 * ```mdx
 * <Group label="VPC">
 *   <Node id="api" kind="service" title="Orders API" col={3} row={1} />
 * </Group>
 * ```
 */
export function Group(_props: GroupProps): ReactNode {
  return null;
}

/**
 * Continuous traffic along an edge.
 */
export type EdgeFlowProps = {
  /**
   * Particles on the edge at once; 3 by default.
   */
  count?: number;

  /**
   * How fast they travel.
   */
  speed?: PacketSpeed;

  /**
   * How big they are.
   */
  size?: PacketSize;

  /**
   * Their color role: `accent` (the default), `positive`, `negative` or `fg`.
   */
  role?: PacketRole;

  /**
   * Travel from `to` back to `from`.
   */
  reverse?: boolean;
};

/**
 * Props of {@link Edge}.
 */
export type EdgeProps = {
  /**
   * Connector width in canvas pixels.
   */
  strokeWidth?: number;

  /**
   * The connector pattern for ordinary edges.
   */
  lineStyle?: DiagramLineStyle;

  /**
   * Its id, for `<State edge>`; `from->to` when left out.
   */
  id?: string;

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
   * A dashed line, for asynchronous or optional links.
   */
  dashed?: boolean;

  /**
   * Another name for `dashed`: an asynchronous link.
   */
  async?: boolean;

  /**
   * How it runs: `orthogonal` (the default), `straight` or `curved`.
   */
  route?: EdgeRoute;

  /**
   * Where arrowheads go: `end` (the default), `start`, `both` or `none`.
   */
  arrow?: EdgeArrow;

  /**
   * Arrowheads at both ends; the same as `arrow="both"`.
   */
  bidirectional?: boolean;

  /**
   * The step that reveals it; it also waits for its nodes.
   */
  at?: number;

  /**
   * The side of `from` it leaves by.
   */
  fromSide?: Side;

  /**
   * The side of `to` it enters by.
   */
  toSide?: Side;

  /**
   * Continuous traffic along it: `true`, a particle count, or the details.
   */
  flow?: boolean | number | EdgeFlowProps;

  /**
   * The emphasis it starts with.
   */
  state?: DiagramState;
};

/**
 * A connection between two nodes of a `<Flow>`.
 *
 * ```mdx
 * <Edge from="api" to="db" label="SQL" />
 * <Edge from="api" to="queue" label="publish" async flow />
 * ```
 */
export function Edge(_props: EdgeProps): ReactNode {
  return null;
}

/**
 * What every kind of packet shares.
 */
export type PacketLookProps = {
  /**
   * Particles travelling together; 1 by default.
   */
  count?: number;

  /**
   * How fast they travel: `slow`, `normal` (the default) or `fast`.
   */
  speed?: PacketSpeed;

  /**
   * How big they are: `sm`, `md` (the default) or `lg`.
   */
  size?: PacketSize;

  /**
   * Their color role: `accent` (the default), `positive`, `negative` or `fg`.
   */
  role?: PacketRole;

  /**
   * Loop while the step is current (the default), or play once and rest at the end.
   */
  play?: PlayMode;
};

/**
 * Props of {@link Packet}.
 */
export type PacketProps = PacketLookProps &
  StepRange & {
    /**
     * The node it starts at.
     */
    from?: string;

    /**
     * The node it travels to.
     */
    to?: string;

    /**
     * Several hops in one go instead of `from` and `to`: node ids in order, such as `"web gateway
     * api"`.
     */
    path?: string | readonly string[];

    /**
     * A short tag that rides with it, such as `GET /cart`.
     */
    label?: string;

    /**
     * Come back after a pause at the far end, as a request and its response: `true`, or the
     * response's tag, such as `200 OK`.
     */
    reply?: boolean | string;
  };

/**
 * Traffic along edges, played while its step is current (on every step without `at`, from `at` up
 * to `until` with one). Static mode shows it frozen partway along with its tail.
 *
 * ```mdx
 * <Packet from="web" to="api" at={2} label="POST /orders" reply="201" />
 * ```
 */
export function Packet(_props: PacketProps): ReactNode {
  return null;
}

/**
 * Props of {@link Journey}.
 */
export type JourneyProps = PacketLookProps & {
  /**
   * Its id.
   */
  id?: string;

  /**
   * The step of the first hop; later hops take the steps after it.
   */
  at?: number;

  /**
   * The nodes the journey passes through, as a shorthand for one `<Hop>` per pair.
   */
  path?: string | readonly string[];

  /**
   * Come back along the path afterwards, one hop per step, drawn as replies.
   */
  back?: boolean;

  /**
   * `hop` (the default) gives each hop its own step; `trip` plays the whole path, there and back,
   * on the one step `at`.
   */
  pace?: 'hop' | 'trip';

  /**
   * Dim everything off the journey's path while it plays.
   */
  focus?: boolean;

  /**
   * Keep travelled edges lit; on by default.
   */
  trail?: boolean;

  /**
   * Explicit hops, instead of `path`.
   */
  children?: ReactNode;
};

/**
 * A multi-hop journey across a `<Flow>`, one hop per slide step: a request from the browser through
 * the gateway to the database and back. Each hop plays while its step is current, travelled edges
 * stay lit, and the node a packet reaches lights up as it lands.
 *
 * ```mdx
 * <Journey at={1} path="browser cdn gateway orders db" back focus />
 * ```
 */
export function Journey(_props: JourneyProps): ReactNode {
  return null;
}

/**
 * Props of {@link Hop}.
 */
export type HopProps = PacketLookProps & {
  /**
   * The node it starts at.
   */
  from?: string;

  /**
   * The node it travels to.
   */
  to?: string;

  /**
   * Several nodes in one hop, instead of `from` and `to`.
   */
  path?: string | readonly string[];

  /**
   * Its step; the step after the previous hop's when left out.
   */
  at?: number;

  /**
   * A tag that rides with the packet.
   */
  label?: string;

  /**
   * Come back after a pause, as a response: `true` or the response's tag.
   */
  reply?: boolean | string;

  /**
   * Draw it as a reply on its way back.
   */
  returning?: boolean;
};

/**
 * One hop of a `<Journey>`.
 *
 * ```mdx
 * <Hop from="api" to="db" label="SELECT" reply="12 rows" />
 * ```
 */
export function Hop(_props: HopProps): ReactNode {
  return null;
}

/**
 * Props of {@link State}.
 */
export type StateProps = StepRange & {
  /**
   * The node it changes.
   */
  node?: string;

  /**
   * The edge it changes, by id (`from->to` unless it has its own).
   */
  edge?: string;

  /**
   * The emphasis: `highlighted`, `muted`, `error`, `success` or `default`.
   */
  is: DiagramState;

  /**
   * A badge to show meanwhile, such as `Timeout`.
   */
  badge?: string;
};

/**
 * A change of emphasis from a step on: highlight a node at step 2, mark another failed at step 3.
 *
 * ```mdx
 * <State node="payments" at={3} is="error" badge="Timeout" />
 * ```
 */
export function State(_props: StateProps): ReactNode {
  return null;
}

/**
 * Props of {@link Focus}.
 */
export type FocusProps = StepRange & {
  /**
   * The nodes that stay lit, such as `"web api db"`; edges between them stay lit too.
   */
  nodes: string | readonly string[];
};

/**
 * Dims everything but some nodes and the edges between them over a range of steps.
 *
 * ```mdx
 * <Focus at={4} nodes="api queue worker" />
 * ```
 */
export function Focus(_props: FocusProps): ReactNode {
  return null;
}

/**
 * The part each descriptor component stands for, which `<Flow>` reads from an element's type, so
 * the check survives hot reloads that replace the functions.
 */
export const PART_NAMES = new Map<unknown, FlowPartName>([
  [Node, 'Node'],
  [Group, 'Group'],
  [Edge, 'Edge'],
  [Packet, 'Packet'],
  [Journey, 'Journey'],
  [Hop, 'Hop'],
  [State, 'State'],
  [Focus, 'Focus'],
]);
