import { deckCommand } from '@deckster/engine/command';

import type {
  EdgeFlowProps,
  EdgeProps,
  FocusProps,
  GroupProps,
  HopProps,
  JourneyProps,
  NodeProps,
  PacketLookProps,
  PacketProps,
  StateProps,
} from '#diagrams/flow-parts.tsx';
import type {
  DiagramState,
  FlowEdgeSpec,
  FlowFocus,
  FlowGroupSpec,
  FlowJourney,
  FlowNodeSpec,
  FlowSpec,
  FlowStateChange,
  FlowTraffic,
  FlowTripSpec,
  GridCell,
  PlayMode,
} from '#diagrams/flow-spec.ts';

import { normalizeState } from '#diagrams/diagram-props.ts';
import { defaultEdgeId, idList } from '#diagrams/flow-spec.ts';
import { resolveNodeKind, type NodeKind } from '#diagrams/node-kinds.ts';
import { pushAll } from '#foundation/lists.ts';

/**
 * The names of the elements a `<Flow>` takes.
 */
export type FlowPartName =
  | 'Node'
  | 'Group'
  | 'Edge'
  | 'Packet'
  | 'Journey'
  | 'Hop'
  | 'State'
  | 'Focus';

/**
 * Every element name a `<Flow>` takes.
 */
export const FLOW_PART_NAMES: ReadonlySet<string> = new Set<FlowPartName>([
  'Node',
  'Group',
  'Edge',
  'Packet',
  'Journey',
  'Hop',
  'State',
  'Focus',
]);

/**
 * One element of a `<Flow>`, read from React elements in the browser or from MDX at build time:
 * which part it is, its props and the parts nested in it.
 */
export type FlowPart = {
  /**
   * Which part.
   */
  part: FlowPartName;

  /**
   * Its props.
   */
  props: Readonly<Record<string, unknown>>;

  /**
   * Parts nested in it: a group's nodes, a journey's hops.
   */
  children: readonly FlowPart[];
};

/**
 * Particles on an edge with `flow` when no count is given.
 */
const DEFAULT_FLOW_COUNT = 3;

/**
 * Any run of characters that cannot appear in a group id made from a label.
 */
const NON_SLUG_CHARACTERS = /[^a-z0-9]+/g;

/**
 * Hyphens at either end of a slug, which are trimmed away.
 */
const SLUG_EDGE_HYPHENS = /^-|-$/g;

/**
 * Reads a `<Flow>`'s parts into a diagram declaration.
 *
 * @param parts - The parts, in source order.
 * @returns The declaration.
 * @throws Error naming the element and the fix for an unknown node kind or a `<Hop>` outside a
 *   `<Journey>`.
 */
export function buildFlowSpec(parts: readonly FlowPart[]): FlowSpec {
  const builder = new SpecBuilder();
  builder.visit(parts, undefined);
  return builder.result();
}

/**
 * Collects the parts of a diagram while walking its children.
 */
class SpecBuilder {
  /**
   * Nodes, in source order.
   */
  private readonly nodes: FlowNodeSpec[] = [];

  /**
   * Groups, outermost first.
   */
  private readonly groups: FlowGroupSpec[] = [];

  /**
   * Edges, in source order.
   */
  private readonly edges: FlowEdgeSpec[] = [];

  /**
   * Packets and hops.
   */
  private readonly trips: FlowTripSpec[] = [];

  /**
   * Journeys.
   */
  private readonly journeys: FlowJourney[] = [];

  /**
   * State changes.
   */
  private readonly states: FlowStateChange[] = [];

  /**
   * Focus ranges.
   */
  private readonly focus: FlowFocus[] = [];

  /**
   * Reads parts, with the group they sit in.
   *
   * @param parts - The parts.
   * @param group - The enclosing group's id.
   */
  visit(parts: readonly FlowPart[], group: string | undefined): void {
    for (const part of parts) {
      this.part(part, group);
    }
  }

  /**
   * Reads one diagram part.
   *
   * @param part - Which part.
   * @param props - Its props.
   * @param group - The enclosing group's id.
   */
  private part({ part, props, children }: FlowPart, group: string | undefined): void {
    switch (part) {
      case 'Node':
        this.node(props as NodeProps, group);
        return;
      case 'Group':
        this.group(props as GroupProps, children, group);
        return;
      case 'Edge':
        this.edge(props as EdgeProps);
        return;
      case 'Packet':
        this.packet(props as PacketProps);
        return;
      case 'Journey':
        this.journey(props as JourneyProps, children);
        return;
      case 'State':
        this.state(props as StateProps);
        return;
      case 'Focus':
        this.focusRange(props as FocusProps);
        return;
      case 'Hop':
        throw new Error('A <Hop> sits outside a <Journey>. Wrap the hops in <Journey at={n}>.');
    }
  }

  /**
   * Reads a node.
   *
   * @param props - Its props.
   * @param group - The enclosing group's id.
   */
  private node(props: NodeProps, group: string | undefined): void {
    const kind = nodeKind(props);
    const cell = cellOf(props);
    this.nodes.push({
      id: props.id,
      kind,
      title: props.title ?? props.id,
      ...optional('subtitle', props.subtitle),
      ...optional('badge', props.badge),
      state: stateOf(props.state) ?? 'default',
      ...optional('at', props.at),
      ...optional('cell', cell),
      ...optional('group', group),
      ...optional('card', props.card),
    });
  }

  /**
   * Reads a group and the parts inside it.
   *
   * @param props - Its props.
   * @param children - The parts inside it.
   * @param parent - The enclosing group's id.
   */
  private group(
    props: GroupProps,
    children: readonly FlowPart[],
    parent: string | undefined,
  ): void {
    const id = props.id ?? slug(props.label, this.groups.length);
    this.groups.push({
      id,
      label: props.label,
      ...optional('parent', parent),
      ...optional('at', props.at),
      ...optional('cell', cellOf(props)),
    });
    this.visit(children, id);
  }

  /**
   * Reads an edge.
   *
   * @param props - Its props.
   */
  private edge(props: EdgeProps): void {
    const base = props.id ?? defaultEdgeId(props.from, props.to);
    const taken = this.edges.filter((edge) => edge.id.startsWith(base)).length;
    const keepsBase = taken === 0 || props.id !== undefined;
    const flow = trafficOf(props.flow);
    this.edges.push({
      id: keepsBase ? base : `${base}#${taken + 1}`,
      from: props.from,
      to: props.to,
      ...optional('label', props.label),
      dashed: props.dashed === true || props.async === true,
      route: props.route ?? 'orthogonal',
      arrow: props.bidirectional === true ? 'both' : (props.arrow ?? 'end'),
      ...optional('at', props.at),
      ...optional('fromSide', props.fromSide),
      ...optional('toSide', props.toSide),
      ...optional('flow', flow),
      state: stateOf(props.state) ?? 'default',
    });
  }

  /**
   * Reads a packet.
   *
   * @param props - Its props.
   */
  private packet(props: PacketProps): void {
    this.trips.push({
      id: `packet-${this.trips.length + 1}`,
      path: pathOf(props),
      ...optional('at', props.at),
      ...optional('until', props.until),
      ...look(props, 'loop'),
      ...optional('label', props.label),
      ...optional('reply', replyOf(props.reply)),
      returning: false,
    });
  }

  /**
   * Reads a journey: its `path` shorthand or its `<Hop>` children, one step each.
   *
   * @param props - Its props.
   * @param children - Its hops.
   */
  private journey(props: JourneyProps, children: readonly FlowPart[]): void {
    const id = props.id ?? `journey-${this.journeys.length + 1}`;
    const start = props.at ?? 1;
    const hops =
      props.path === undefined
        ? this.hops(props, children, id, start)
        : this.pathHops(props, id, start);
    pushAll(this.trips, hops);
    this.journeys.push({
      id,
      trips: hops.map((hop) => hop.id),
      focus: props.focus === true,
      trail: props.trail ?? true,
    });
  }

  /**
   * The hops of a journey written as a `path`.
   *
   * @param props - The journey's props.
   * @param id - Its id.
   * @param start - The step of its first hop.
   */
  private pathHops(props: JourneyProps, id: string, start: number): FlowTripSpec[] {
    const path = idList(props.path);
    const shared = { ...look(props, 'loop'), journey: id };
    if (props.pace === 'trip') {
      return [
        {
          id: `${id}-trip`,
          path,
          at: start,
          ...shared,
          ...optional('reply', props.back === true ? (true as const) : undefined),
          returning: false,
        },
      ];
    }

    const forward = path.slice(1).map((to, index) => ({ from: path[index] as string, to }));
    const backward =
      props.back === true
        ? [...forward].reverse().map(({ from, to }) => ({ from: to, to: from }))
        : [];
    return [...forward, ...backward].map((hop, index) => ({
      id: `${id}-hop-${index + 1}`,
      path: [hop.from, hop.to],
      at: start + index,
      ...shared,
      returning: index >= forward.length,
    }));
  }

  /**
   * The hops of a journey written as `<Hop>` children.
   *
   * @param props - The journey's props.
   * @param children - Its hops.
   * @param id - Its id.
   * @param start - The step of its first hop.
   */
  private hops(
    props: JourneyProps,
    children: readonly FlowPart[],
    id: string,
    start: number,
  ): FlowTripSpec[] {
    const hops: FlowTripSpec[] = [];
    let nextStep = start;
    for (const child of children) {
      if (child.part !== 'Hop') {
        throw new Error(`A <Journey> holds only <Hop>s; found <${child.part}>.`);
      }

      const hop = child.props as HopProps;
      const at = hop.at ?? nextStep;
      nextStep = at + 1;
      hops.push({
        id: `${id}-hop-${hops.length + 1}`,
        path: pathOf(hop),
        at,
        ...look({ ...props, ...definedLook(hop) }, 'loop'),
        ...optional('label', hop.label),
        ...optional('reply', replyOf(hop.reply)),
        returning: hop.returning === true,
        journey: id,
      });
    }

    return hops;
  }

  /**
   * Reads a state change.
   *
   * @param props - Its props.
   */
  private state(props: StateProps): void {
    this.states.push({
      ...optional('node', props.node),
      ...optional('edge', props.edge),
      at: props.at ?? 0,
      ...optional('until', props.until),
      is: stateOf(props.is) ?? props.is,
      ...optional('badge', props.badge),
    });
  }

  /**
   * Reads a focus range.
   *
   * @param props - Its props.
   */
  private focusRange(props: FocusProps): void {
    this.focus.push({
      nodes: idList(props.nodes),
      at: props.at ?? 0,
      ...optional('until', props.until),
    });
  }

  /**
   * The declaration collected so far.
   */
  result(): FlowSpec {
    return {
      nodes: this.nodes,
      groups: this.groups,
      edges: this.edges,
      trips: this.trips,
      journeys: this.journeys,
      states: this.states,
      focus: this.focus,
    };
  }
}

/**
 * A node's kind from its props.
 *
 * @param props - The node's props.
 * @throws Error listing the kinds when the kind is unknown.
 */
function nodeKind(props: NodeProps): NodeKind {
  if (props.kind === undefined) {
    return 'node';
  }

  const kind = resolveNodeKind(props.kind);
  if (kind === undefined) {
    throw new Error(
      `<Node id="${props.id}" kind="${props.kind}"> is not a node kind. ` +
        'Run `' +
        deckCommand() +
        ' diagrams` for the kinds, or use kind="node" with an icon.',
    );
  }

  return kind;
}

/**
 * An emphasis as written, with synonyms (`highlight`, `fail`, `ok`, ...) read as the state they
 * mean.
 *
 * @param value - The prop as written.
 */
function stateOf(value: string | undefined): DiagramState | undefined {
  return normalizeState(value) as DiagramState | undefined;
}

/**
 * A grid cell from `col` and `row` props.
 *
 * @param props - Props with optional cell fields.
 * @returns The cell; `undefined` when neither `col` nor `row` is set.
 */
function cellOf(props: {
  col?: number;
  row?: number;
  colSpan?: number;
  rowSpan?: number;
}): GridCell | undefined {
  if (props.col === undefined && props.row === undefined) {
    return undefined;
  }

  return {
    col: props.col ?? 1,
    row: props.row ?? 1,
    colSpan: props.colSpan ?? 1,
    rowSpan: props.rowSpan ?? 1,
  };
}

/**
 * The path of a packet or hop: `path`, else `from` and `to`.
 *
 * @param props - The props.
 */
function pathOf(props: {
  from?: string;
  to?: string;
  path?: string | readonly string[];
}): string[] {
  if (props.path !== undefined) {
    return idList(props.path);
  }

  return [props.from, props.to].filter((id) => id !== undefined);
}

/**
 * The traffic an edge's `flow` prop asks for.
 *
 * @param flow - The prop.
 */
function trafficOf(flow: EdgeProps['flow']): FlowTraffic | undefined {
  if (flow === undefined || flow === false) {
    return undefined;
  }

  const details = flowDetails(flow);
  return {
    count: details.count ?? DEFAULT_FLOW_COUNT,
    speed: details.speed ?? 'normal',
    size: details.size ?? 'sm',
    role: details.role ?? 'accent',
    reverse: details.reverse === true,
  };
}

/**
 * The details of a `flow` prop written as a count, `true` or an object.
 *
 * @param flow - The prop, set.
 */
function flowDetails(flow: true | number | EdgeFlowProps): EdgeFlowProps {
  if (typeof flow === 'number') {
    return { count: flow };
  }

  return flow === true ? {} : flow;
}

/**
 * A packet's look with defaults.
 *
 * @param props - The look props.
 * @param play - The default play mode.
 */
function look(
  props: PacketLookProps,
  play: PlayMode,
): Pick<FlowTripSpec, 'count' | 'speed' | 'size' | 'role' | 'play'> {
  return {
    count: props.count ?? 1,
    speed: props.speed ?? 'normal',
    size: props.size ?? 'md',
    role: props.role ?? 'accent',
    play: props.play ?? play,
  };
}

/**
 * The look props a hop sets itself, so they override its journey's.
 *
 * @param hop - The hop's props.
 */
function definedLook(hop: HopProps): PacketLookProps {
  return {
    ...optional('count', hop.count),
    ...optional('speed', hop.speed),
    ...optional('size', hop.size),
    ...optional('role', hop.role),
    ...optional('play', hop.play),
  };
}

/**
 * A `reply` prop as the spec keeps it.
 *
 * @param reply - The prop.
 */
function replyOf(reply: boolean | string | undefined): string | true | undefined {
  if (reply === undefined || reply === false) {
    return undefined;
  }

  return reply;
}

/**
 * An object with one key when the value is defined, for spreading optional fields under
 * `exactOptionalPropertyTypes`.
 *
 * @param key - The key.
 * @param value - The value.
 */
export function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
}

/**
 * A group id made from its label.
 *
 * @param label - The label.
 * @param index - The group's position, to keep ids unique.
 */
function slug(label: string, index: number): string {
  const base = label.toLowerCase().replace(NON_SLUG_CHARACTERS, '-').replace(SLUG_EDGE_HYPHENS, '');
  return `group-${base === '' ? index + 1 : base}`;
}
