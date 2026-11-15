import type { DiagramState, FlowEdgeSpec, FlowSpec, FlowTripSpec } from '#diagrams/flow-spec.ts';

import { edgeBetween } from '#diagrams/flow-spec.ts';
import { maxOf, minOf } from '#foundation/lists.ts';

/**
 * How an edge looks at a step: its own emphasis, carrying a packet now (`active`), already
 * travelled by a journey (`trail`), or one of the node states.
 */
export type EdgeTone = DiagramState | 'active' | 'trail';

/**
 * A node at one step.
 */
export type NodeFrame = {
  /**
   * Whether it has been revealed.
   */
  visible: boolean;

  /**
   * Its emphasis.
   */
  state: DiagramState;

  /**
   * The badge it shows, if any.
   */
  badge?: string;

  /**
   * Whether a packet arrives at it on this step, so it lights up when the packet lands.
   */
  arrival: boolean;
};

/**
 * An edge at one step.
 */
export type EdgeFrame = {
  /**
   * Whether it has been revealed (and both of its nodes with it).
   */
  visible: boolean;

  /**
   * How it looks.
   */
  tone: EdgeTone;
};

/**
 * One leg of a playing trip: the edge it runs along and whether it runs against the edge.
 */
export type TripLeg = {
  /**
   * The edge's id.
   */
  edge: string;

  /**
   * Whether the trip runs from the edge's `to` to its `from`.
   */
  reversed: boolean;
};

/**
 * A trip playing on this step, with the edges it runs along.
 */
export type ActiveTrip = {
  /**
   * The trip.
   */
  trip: FlowTripSpec;

  /**
   * Its legs, in travel order.
   */
  legs: readonly TripLeg[];
};

/**
 * Everything that changes with the step: what is shown, how it looks and what moves.
 */
export type FlowFrame = {
  /**
   * The step this frame shows.
   */
  step: number;

  /**
   * Nodes by id.
   */
  nodes: ReadonlyMap<string, NodeFrame>;

  /**
   * Groups by id: whether each is shown.
   */
  groups: ReadonlyMap<string, boolean>;

  /**
   * Edges by id.
   */
  edges: ReadonlyMap<string, EdgeFrame>;

  /**
   * Nodes and edges dimmed because something else has the focus, by id.
   */
  dimmed: ReadonlySet<string>;

  /**
   * Trips playing on this step.
   */
  trips: readonly ActiveTrip[];

  /**
   * Edges whose continuous `flow` runs on this step.
   */
  flows: readonly string[];
};

/**
 * Works out a diagram at one step: which nodes, groups and edges are revealed, the emphasis of each
 * (state changes, packet arrivals, journey trails), what the focus dims, and which packets play. It
 * is a pure function of the declaration and the step, so stepping back and forth, static mode and
 * exports all see the same frame for the same step.
 *
 * @param spec - The diagram.
 * @param step - The slide's current step value (`useStep()`), 0 before the first.
 */
export function flowFrame(spec: FlowSpec, step: number): FlowFrame {
  const nodes = new Map<string, NodeFrame>(
    spec.nodes.map((node) => [
      node.id,
      {
        visible: revealed(node.at, step),
        state: node.state,
        ...(node.badge === undefined ? {} : { badge: node.badge }),
        arrival: false,
      },
    ]),
  );
  const groups = new Map(spec.groups.map((group) => [group.id, revealed(group.at, step)]));
  const edges = new Map<string, EdgeFrame>(
    spec.edges.map((edge) => [
      edge.id,
      { visible: edgeVisible(edge, nodes, step), tone: edge.state },
    ]),
  );
  const trips = activeTrips(spec, step).filter((active) =>
    active.legs.every((leg) => edges.get(leg.edge)?.visible === true),
  );
  applyTrails(spec, step, edges);
  applyTrips(trips, nodes, edges);
  applyStateChanges(spec, step, nodes, edges);
  return {
    step,
    nodes,
    groups,
    edges,
    dimmed: dimmedIds(spec, step),
    trips,
    flows: spec.edges
      .filter((edge) => edge.flow !== undefined && edges.get(edge.id)?.visible === true)
      .map((edge) => edge.id),
  };
}

/**
 * The legs of a trip: the edge between each pair of nodes on its path.
 *
 * @param spec - The diagram.
 * @param trip - The trip.
 * @returns The legs; shorter than the path when two nodes are not joined, which validation reports.
 */
export function tripLegs(spec: FlowSpec, trip: FlowTripSpec): TripLeg[] {
  const legs: TripLeg[] = [];
  for (let index = 1; index < trip.path.length; index += 1) {
    const found = edgeBetween(spec.edges, trip.path[index - 1] ?? '', trip.path[index] ?? '');
    if (found !== undefined) {
      legs.push({ edge: found.edge.id, reversed: found.reversed });
    }
  }

  return legs;
}

/**
 * Whether a trip plays at a step: on every step without `at`, from `at` up to `until` when it has
 * one, else only on step `at`.
 *
 * @param trip - The trip.
 * @param step - The current step.
 */
export function tripPlays(trip: FlowTripSpec, step: number): boolean {
  if (trip.at === undefined) {
    return true;
  }

  if (trip.until !== undefined) {
    return step >= trip.at && step < trip.until;
  }

  return step === trip.at;
}

/**
 * Every distinct step a diagram reveals or changes something on, ascending, for registering with
 * the slide.
 *
 * @param spec - The diagram.
 */
export function flowSteps(spec: FlowSpec): number[] {
  const steps = [
    ...spec.nodes.map((node) => node.at),
    ...spec.groups.map((group) => group.at),
    ...spec.edges.map((edge) => edge.at),
    ...spec.trips.map((trip) => trip.at),
    ...spec.states.map((change) => change.at),
    ...spec.focus.map((focus) => focus.at),
  ].filter((at): at is number => at !== undefined && at >= 1);
  return [...new Set(steps)].sort((a, b) => a - b);
}

/**
 * Whether something with an optional `at` is shown at a step.
 *
 * @param at - Its step, or `undefined` for always.
 * @param step - The current step.
 */
function revealed(at: number | undefined, step: number): boolean {
  return at === undefined || step >= at;
}

/**
 * Whether an edge is shown: its own step has come and both of its nodes are shown.
 *
 * @param edge - The edge.
 * @param nodes - The node frames.
 * @param step - The current step.
 */
function edgeVisible(
  edge: FlowEdgeSpec,
  nodes: ReadonlyMap<string, NodeFrame>,
  step: number,
): boolean {
  return (
    revealed(edge.at, step) &&
    nodes.get(edge.from)?.visible === true &&
    nodes.get(edge.to)?.visible === true
  );
}

/**
 * The trips that play at a step, with their legs.
 *
 * @param spec - The diagram.
 * @param step - The current step.
 */
function activeTrips(spec: FlowSpec, step: number): ActiveTrip[] {
  return spec.trips
    .filter((trip) => tripPlays(trip, step))
    .map((trip) => ({ trip, legs: tripLegs(spec, trip) }))
    .filter((active) => active.legs.length === active.trip.path.length - 1);
}

/**
 * Lights the edges a journey has already travelled: every leg of its trips before this step.
 *
 * @param spec - The diagram.
 * @param step - The current step.
 * @param edges - The edge frames, changed in place.
 */
function applyTrails(spec: FlowSpec, step: number, edges: Map<string, EdgeFrame>): void {
  for (const journey of spec.journeys) {
    if (journey.trail) {
      trailJourney(spec, journey.trips, step, edges);
    }
  }
}

/**
 * Marks the edges of one trailing journey's trips that the journey has already travelled.
 *
 * @param spec - The diagram.
 * @param tripIds - The journey's trip ids.
 * @param step - The current step.
 * @param edges - The edge frames, changed in place.
 */
function trailJourney(
  spec: FlowSpec,
  tripIds: readonly string[],
  step: number,
  edges: Map<string, EdgeFrame>,
): void {
  for (const trip of journeyTrips(spec, tripIds)) {
    if (trip.at === undefined || trip.at >= step) {
      continue;
    }

    for (const leg of tripLegs(spec, trip)) {
      const frame = edges.get(leg.edge);
      if (frame?.visible === true && frame.tone === 'default') {
        edges.set(leg.edge, { ...frame, tone: 'trail' });
      }
    }
  }
}

/**
 * Marks the edges playing trips run along as active, and the node each journey hop arrives at,
 * which lights up as the packet lands. Plain packets leave nodes as they are, so a burst of traffic
 * does not light up half the diagram.
 *
 * @param trips - The trips playing now.
 * @param nodes - The node frames, changed in place.
 * @param edges - The edge frames, changed in place.
 */
function applyTrips(
  trips: readonly ActiveTrip[],
  nodes: Map<string, NodeFrame>,
  edges: Map<string, EdgeFrame>,
): void {
  for (const { trip, legs } of trips) {
    for (const leg of legs) {
      const frame = edges.get(leg.edge);
      if (frame !== undefined && (frame.tone === 'default' || frame.tone === 'trail')) {
        edges.set(leg.edge, { ...frame, tone: 'active' });
      }
    }

    if (trip.at === undefined || trip.journey === undefined) {
      continue;
    }

    const target = trip.path[trip.path.length - 1];
    const frame = target === undefined ? undefined : nodes.get(target);
    if (target !== undefined && frame !== undefined) {
      const state = frame.state === 'default' ? 'highlighted' : frame.state;
      nodes.set(target, { ...frame, state, arrival: true });
    }
  }
}

/**
 * Applies every state change that holds at the step, in order of `at`, so a later change wins.
 *
 * @param spec - The diagram.
 * @param step - The current step.
 * @param nodes - The node frames, changed in place.
 * @param edges - The edge frames, changed in place.
 */
function applyStateChanges(
  spec: FlowSpec,
  step: number,
  nodes: Map<string, NodeFrame>,
  edges: Map<string, EdgeFrame>,
): void {
  const holding = spec.states
    .filter((change) => step >= change.at && (change.until === undefined || step < change.until))
    .sort((a, b) => a.at - b.at);
  for (const change of holding) {
    const node = change.node === undefined ? undefined : nodes.get(change.node);
    if (change.node !== undefined && node !== undefined) {
      nodes.set(change.node, {
        ...node,
        state: change.is,
        ...(change.badge === undefined ? {} : { badge: change.badge }),
      });
    }

    const edge = change.edge === undefined ? undefined : edges.get(change.edge);
    if (change.edge !== undefined && edge !== undefined) {
      edges.set(change.edge, { ...edge, tone: change.is });
    }
  }
}

/**
 * The nodes and edges a focus dims at a step: everything off the lit set of the latest focus or
 * focusing journey that holds.
 *
 * @param spec - The diagram.
 * @param step - The current step.
 */
function dimmedIds(spec: FlowSpec, step: number): ReadonlySet<string> {
  const lit = focusedNodes(spec, step);
  if (lit === undefined) {
    return new Set();
  }

  const dimmed = new Set<string>();
  for (const node of spec.nodes) {
    if (!lit.has(node.id)) {
      dimmed.add(node.id);
    }
  }

  for (const edge of spec.edges) {
    if (!lit.has(edge.from) || !lit.has(edge.to)) {
      dimmed.add(edge.id);
    }
  }

  return dimmed;
}

/**
 * The nodes the latest focus that holds keeps lit: a `<Focus>` range or a journey with `focus`
 * between its first and last step.
 *
 * @param spec - The diagram.
 * @param step - The current step.
 * @returns The lit nodes; `undefined` when nothing has the focus.
 */
function focusedNodes(spec: FlowSpec, step: number): ReadonlySet<string> | undefined {
  const ranges = [
    ...spec.focus.map((focus) => ({
      at: focus.at,
      until: focus.until,
      nodes: focus.nodes,
    })),
    ...spec.journeys
      .filter((journey) => journey.focus)
      .map((journey) => journeyRange(spec, journey.trips))
      .filter((range) => range !== undefined),
  ];
  const holding = ranges
    .filter((range) => step >= range.at && (range.until === undefined || step < range.until))
    .sort((a, b) => b.at - a.at);
  const latest = holding[0];
  return latest === undefined ? undefined : new Set(latest.nodes);
}

/**
 * The step range a journey plays over and every node it passes through.
 *
 * @param spec - The diagram.
 * @param tripIds - The journey's trips.
 * @returns The range; `undefined` for a journey whose trips have no steps.
 */
function journeyRange(
  spec: FlowSpec,
  tripIds: readonly string[],
): { at: number; until: number; nodes: readonly string[] } | undefined {
  const trips = journeyTrips(spec, tripIds);
  const steps = trips.map((trip) => trip.at).filter((at) => at !== undefined);
  if (steps.length === 0) {
    return undefined;
  }

  return {
    at: minOf(steps),
    until: maxOf(steps) + 1,
    nodes: trips.flatMap((trip) => trip.path),
  };
}

/**
 * A journey's trips, in its order.
 *
 * @param spec - The diagram.
 * @param tripIds - The journey's trip ids.
 */
function journeyTrips(spec: FlowSpec, tripIds: readonly string[]): FlowTripSpec[] {
  return tripIds
    .map((id) => spec.trips.find((trip) => trip.id === id))
    .filter((trip) => trip !== undefined);
}
