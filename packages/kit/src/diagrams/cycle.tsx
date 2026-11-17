import { useMemo, type ReactNode } from 'react';

import type { DiagramTokens } from '#diagrams/diagram-tokens.ts';
import type { EdgeLayout } from '#diagrams/flow-layout.ts';
import type { RoutedEdge } from '#diagrams/flow-route.ts';
import type { FlowEdgeSpec, FlowSpec } from '#diagrams/flow-spec.ts';
import type { Point } from '#diagrams/geometry.ts';

import { ringArc, ringCentres, ringEllipse } from '#diagrams/cycle-layout.ts';
import { parseFlowChildren, type ParsedFlow } from '#diagrams/flow-children.ts';
import { optional } from '#diagrams/flow-spec-builder.ts';
import { FlowView } from '#diagrams/flow.tsx';

/**
 * The room left before each arrowhead's tip, as a multiple of the brand's regular line width, so an
 * arc stops short of the next stage's box by that much.
 */
const ARROW_GAP_IN_STROKES = 1.5;

/**
 * Props of {@link Cycle}.
 */
export type CycleProps = {
  /**
   * An id for the export description.
   */
  id?: string;

  /**
   * What the cycle shows, in a few words: its accessible name.
   */
  title: string;

  /**
   * Walk the loop one stage per step: a packet moves from each stage to the next and the stage it
   * reaches lights up.
   */
  steps?: boolean;

  /**
   * Keep a packet circling the loop while the slide is on screen.
   */
  spin?: boolean;

  /**
   * A fixed height in canvas pixels; without it the cycle fills its region.
   */
  height?: number;

  /**
   * The card (a node style the brand defines) for every node of the cycle: `default`, `outline`,
   * `solid`, `tint`, `raised` or one of the brand's own. A node's own `card` wins over it.
   */
  card?: string;

  /**
   * The stages as `<Node>`s, in order around the loop from the top, plus any `<State>`, `<Packet>`
   * or `<Focus>`.
   */
  children?: ReactNode;
};

/**
 * A loop of stages on a ring, joined by arcs in order: a feedback loop, an incident cycle, an
 * agent's think-act-observe. `steps` walks it one stage per slide step; `spin` keeps a packet
 * circling it.
 *
 * ```mdx
 * <Cycle title="The incident loop" steps>
 *   <Node id="detect" kind="service" title="Detect" />
 *   <Node id="respond" kind="user" title="Respond" />
 *   <Node id="learn" kind="document" title="Learn" />
 * </Cycle>
 * ```
 */
export function Cycle({
  id,
  title,
  steps = false,
  spin = false,
  height,
  card,
  children,
}: CycleProps): ReactNode {
  const parsed = useMemo(
    () => withRing(parseFlowChildren(children), { steps, spin }),
    [children, steps, spin],
  );
  const centres = useMemo(() => ringCentres(parsed.spec.nodes.map((node) => node.id)), [parsed]);
  const reshape = useMemo(
    () => (layout: EdgeLayout, tokens: DiagramTokens) =>
      arcEdges(layout, parsed.spec, centres, tokens.edge.stroke * ARROW_GAP_IN_STROKES),
    [parsed, centres],
  );
  return (
    <FlowView
      parsed={parsed}
      kind="cycle"
      title={title}
      algorithm="layered"
      direction="right"
      centres={centres}
      reshape={reshape}
      {...optional('id', id)}
      {...optional('height', height)}
      {...optional('card', card)}
    />
  );
}

/**
 * A stage and the stage after it on the ring.
 */
type RingPair = {
  /**
   * The stage the arc leaves.
   */
  from: string;

  /**
   * The stage the arc reaches.
   */
  to: string;
};

/**
 * Adds the ring's edges (each stage to the next, the last back to the first) and, with `steps`, a
 * journey round it, or with `spin`, traffic on every arc.
 *
 * @param parsed - The cycle's children.
 * @param options - Whether to walk or spin the loop.
 */
function withRing(parsed: ParsedFlow, options: { steps: boolean; spin: boolean }): ParsedFlow {
  const pairs = ringPairs(parsed.spec.nodes.map((node) => node.id));
  const edges = ringEdges(parsed, pairs, options.spin);
  const hops = options.steps ? ringHops(pairs) : [];
  return {
    ...parsed,
    spec: {
      ...parsed.spec,
      edges: [
        ...edges,
        ...parsed.spec.edges.filter(
          (edge) => !pairs.some((pair) => pair.from === edge.from && pair.to === edge.to),
        ),
      ],
      trips: [...hops, ...parsed.spec.trips],
      journeys: [
        ...(hops.length === 0
          ? []
          : [{ id: 'ring', trips: hops.map((hop) => hop.id), focus: false, trail: false }]),
        ...parsed.spec.journeys,
      ],
    },
  };
}

/**
 * Each stage paired with the next, the last with the first.
 *
 * @param ids - The stages, in order around the ring.
 */
function ringPairs(ids: readonly string[]): RingPair[] {
  return ids.map((from, index) => ({ from, to: ids[(index + 1) % ids.length] ?? from }));
}

/**
 * The ring's edges. An `<Edge>` the author wrote between two stages supplies its label and style;
 * with `spin`, every edge carries a packet.
 *
 * @param parsed - The cycle's children, for the edges the author wrote.
 * @param pairs - The ring's consecutive stages.
 * @param spin - Whether a packet circles every arc.
 */
function ringEdges(parsed: ParsedFlow, pairs: readonly RingPair[], spin: boolean): FlowEdgeSpec[] {
  /**
   * The `<Edge>` the author wrote between two consecutive stages, which labels or styles that arc.
   */
  const written = (from: string, to: string): FlowEdgeSpec | undefined =>
    parsed.spec.edges.find((edge) => edge.from === from && edge.to === to);
  return pairs.map(({ from, to }): FlowEdgeSpec => ({
    dashed: false,
    arrow: 'end' as const,
    state: 'default' as const,
    ...written(from, to),
    id: written(from, to)?.id ?? `${from}->${to}`,
    from,
    to,
    route: 'curved' as const,
    ...(spin
      ? {
          flow: {
            count: 1,
            speed: 'slow' as const,
            size: 'md' as const,
            role: 'accent' as const,
            reverse: false,
          },
        }
      : {}),
  }));
}

/**
 * One journey hop per arc, played in order, one per slide step.
 *
 * @param pairs - The ring's consecutive stages.
 */
function ringHops(pairs: readonly RingPair[]) {
  return pairs.map(({ from, to }, index) => ({
    id: `ring-hop-${index + 1}`,
    path: [from, to],
    at: index + 1,
    count: 1,
    speed: 'normal' as const,
    size: 'md' as const,
    role: 'accent' as const,
    play: 'once' as const,
    returning: false,
    journey: 'ring',
  }));
}

/**
 * Redraws the ring's edges as arcs of the ellipse the stages sit on, leaving each stage just
 * outside its box and ending an arrow's gap before the next.
 *
 * @param layout - The placed stages and routed edges.
 * @param spec - The cycle, for its edges.
 * @param unit - Each stage's place on the unit circle.
 * @param gap - Room before an arrowhead's tip.
 */
function arcEdges(
  layout: EdgeLayout,
  spec: FlowSpec,
  unit: ReadonlyMap<string, Point>,
  gap: number,
): Map<string, RoutedEdge> {
  const ellipse = ringEllipse(unit, layout.nodes);
  const edges = new Map<string, RoutedEdge>(layout.edges);
  if (ellipse === undefined) {
    return edges;
  }

  for (const edge of spec.edges) {
    const from = layout.nodes.get(edge.from);
    const to = layout.nodes.get(edge.to);
    const routed = layout.edges.get(edge.id);
    if (from === undefined || to === undefined || routed === undefined) {
      continue;
    }

    if (edge.route !== 'curved') {
      continue;
    }

    const arc = ringArc(ellipse, from, to, { start: gap, end: gap });
    if (arc !== undefined) {
      edges.set(edge.id, { ...routed, points: arc.points, segments: arc.segments });
    }
  }

  return edges;
}
