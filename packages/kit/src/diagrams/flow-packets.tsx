import type { ReactNode } from 'react';

import type { FlowFrame } from '#diagrams/choreography.ts';
import type { RoutedEdge } from '#diagrams/flow-route.ts';
import type { FlowSpec, PacketRole, PacketSize } from '#diagrams/flow-spec.ts';
import type { MotionPlan } from '#diagrams/use-motion-plans.ts';

import { flag } from '#diagrams/data-flags.ts';
import {
  inflate,
  intersects,
  round2,
  segmentCrossesRect,
  type Point,
  type Rect,
} from '#diagrams/geometry.ts';
import {
  PACKET_RADII,
  planFlow,
  STATIC_FRACTIONS,
  planTrip,
  staticFlowPositions,
  staticTripPositions,
  tailBehind,
  type MotionTokens,
  type PacketKeyframe,
} from '#diagrams/packet-motion.ts';
import { pointAlong, reversePath, type PathSegment } from '#diagrams/path-geometry.ts';

/**
 * A packet's halo radius as a multiple of its dot's.
 */
const HALO_RATIO = 2;

/**
 * Ghost dots in a packet's tail.
 */
const TAIL_GHOSTS = 3;

/**
 * How far each ghost dot lags behind the one before, in milliseconds.
 */
const TAIL_LAG_MS = 26;

/**
 * Keyframes on each side of one that a moving tag's fade spreads over, so it fades rather than
 * blinks as it passes a node (keyframes are ten pixels apart).
 */
const TAG_FADE_FRAMES = 3;

/**
 * The width of one character of a tag, in pixels, for keeping a still tag clear before it is
 * measured.
 */
const TAG_CHAR_PX = 15;

/**
 * A tag's padding and border across, in pixels.
 */
const TAG_PADDING_PX = 20;

/**
 * A tag's height, in pixels.
 */
const TAG_HEIGHT_PX = 38;

/**
 * The gap between a packet and its tag, in pixels.
 */
const TAG_GAP_PX = 16;

/**
 * How far a moving tag may run onto a node's edge, in pixels, before it fades: it may cross the
 * node's border and padding but never its text.
 */
const TAG_NODE_INSET = 12;

/**
 * The share of a packet's radius that each tail ghost loses compared with the one ahead of it.
 */
const GHOST_SHRINK = 0.2;

/**
 * The share of a keyframe's opacity a tail ghost keeps before the step back is taken off it.
 */
const GHOST_OPACITY_START = 0.5;

/**
 * The share of a keyframe's opacity each ghost further back loses, on top of its start.
 */
const GHOST_OPACITY_FALL = 0.12;

/**
 * How much longer than the slow motion token a node's ring lasts, so it fades out in full.
 */
const PULSE_DURATION_SCALE = 1.4;

/**
 * The ring peaks once this share of the fast motion token has passed.
 */
const PULSE_PEAK_FAST_SHARE = 0.5;

/**
 * The latest the ring's peak may come, as a share of its length.
 */
const PULSE_PEAK_MAX = 0.5;

/**
 * The ring's opacity at its peak when the trip loops, so a loop stays soft.
 */
const PULSE_OPACITY_LOOP = 0.28;

/**
 * The ring's opacity at its peak when the packet first lands.
 */
const PULSE_OPACITY_ONCE = 0.42;

/**
 * The sides a tag tries, best first: under the packet, above it, then beside it (for a vertical
 * edge between two close nodes, where there is no room above or below).
 */
const TAG_SIDES: readonly TagSide[] = ['below', 'above', 'right', 'left'];

/**
 * One dot to draw: a packet, a reply or a ghost in a tail.
 */
export type PacketDot = {
  /**
   * The `data-motion` id its animation finds it by.
   */
  motion: string;

  /**
   * The color role.
   */
  role: PacketRole;

  /**
   * The size.
   */
  size: PacketSize;

  /**
   * Whether it is a reply (a ring).
   */
  reply: boolean;

  /**
   * A tail ghost's place in the tail, 1 nearest; 0 for the packet itself.
   */
  ghost: number;

  /**
   * Where static mode draws it; `undefined` while animating.
   */
  at: (Point & { angle: number }) | undefined;
};

/**
 * A tag that rides with a packet.
 */
export type PacketTag = {
  /**
   * The `data-motion` id.
   */
  motion: string;

  /**
   * The text.
   */
  text: string;

  /**
   * The color role of its packet.
   */
  role: PacketRole;

  /**
   * Where static mode draws it.
   */
  at: Point | undefined;

  /**
   * Whether it hangs under its packet (the default), sits above it, or rides beside it.
   */
  side?: TagSide;
};

/**
 * Where a tag rides next to its packet.
 */
export type TagSide = 'below' | 'above' | 'right' | 'left';

/**
 * Everything that moves at a step: the dots, their tags and the animations.
 */
export type PacketScene = {
  /**
   * Dots, drawn in order.
   */
  dots: PacketDot[];

  /**
   * Tags.
   */
  tags: PacketTag[];

  /**
   * Animations; none in static mode.
   */
  plans: MotionPlan[];

  /**
   * When the first packet lands on each node, in milliseconds, for its highlight.
   */
  arrivals: ReadonlyMap<string, number>;
};

/**
 * One trip of the frame, with the legs it travels at this step.
 */
type FrameTrip = FlowFrame['trips'][number];

/**
 * Works out what moves at a step: each playing trip's packets (and replies), the traffic on edges
 * with `flow`, their tags, and the animations that move them, timed by the brand's motion tokens.
 * In static mode every dot is placed where the still shows it instead (partway along, with its tail
 * behind it to show the direction).
 *
 * @param spec - The diagram.
 * @param frame - The step.
 * @param edges - Routed edges by id.
 * @param tokens - The brand's motion tokens.
 * @param still - Whether to place dots for a still instead of animating them.
 * @param labels - Edge label boxes, which still packets keep clear of.
 * @param nodes - Node boxes, which a packet's tag keeps clear of: a still's tag sits where it
 *   covers none, and a moving tag rides on the side of its packet away from them and fades as it
 *   passes over one.
 */
export function packetScene(
  spec: FlowSpec,
  frame: FlowFrame,
  edges: ReadonlyMap<string, RoutedEdge>,
  tokens: MotionTokens,
  still: boolean,
  labels: readonly Rect[] = [],
  nodes: readonly Rect[] = [],
): PacketScene {
  const scene: PacketScene = { dots: [], tags: [], plans: [], arrivals: new Map() };
  const arrivals = new Map<string, number>();
  for (const frameTrip of frame.trips) {
    if (still) {
      addStillTrip(scene, frameTrip, edges, labels, nodes);
    } else {
      addMovingTrip(scene, frameTrip, edges, tokens, nodes, arrivals);
    }
  }

  for (const edgeId of frame.flows) {
    addFlow(scene, spec, edgeId, edges, tokens, still);
  }

  return { ...scene, arrivals };
}

/**
 * The path each leg of a trip travels, in the direction it travels it.
 *
 * @param legs - The trip's legs at this step.
 * @param edges - Routed edges by id.
 */
function legPaths(legs: FrameTrip['legs'], edges: ReadonlyMap<string, RoutedEdge>) {
  return legs.map((leg) => {
    const segments = edges.get(leg.edge)?.segments ?? [];
    return leg.reversed ? reversePath(segments) : segments;
  });
}

/**
 * Adds a trip for a still: its packets placed along the way out, partway along with their tails,
 * and the tag of its first packet where the tag covers the least.
 *
 * @param scene - The scene, changed in place.
 * @param frameTrip - The trip and its legs at this step.
 * @param edges - Routed edges by id.
 * @param labels - Edge label boxes, which still packets keep clear of.
 * @param nodes - Node boxes the tag keeps off.
 */
function addStillTrip(
  scene: PacketScene,
  { trip, legs }: FrameTrip,
  edges: ReadonlyMap<string, RoutedEdge>,
  labels: readonly Rect[],
  nodes: readonly Rect[],
): void {
  const id = `trip:${trip.id}`;
  const whole = legPaths(legs, edges).flat();
  const own = new Set(legs.map((leg) => leg.edge));
  const lines = [...edges.values()].filter((edge) => !own.has(edge.id)).map((edge) => edge.points);
  const tag =
    trip.label === undefined
      ? undefined
      : stillTag(whole, trip.label, [...labels, ...nodes], lines);
  staticTripPositions(whole, trip.count, labels, tag?.fraction).forEach((head, index) => {
    addStill(
      scene,
      `${id}:${index}`,
      { role: trip.role, size: trip.size, reply: trip.returning },
      whole,
      head,
    );
    if (index === 0 && trip.label !== undefined) {
      scene.tags.push({
        motion: `${id}:tag`,
        text: trip.label,
        role: trip.role,
        at: head,
        ...(tag === undefined ? {} : { side: tag.side }),
      });
    }
  });
}

/**
 * Adds a trip that animates: its packets and replies, the tags riding with them, and the rings that
 * its landings light up on each node.
 *
 * @param scene - The scene, changed in place.
 * @param frameTrip - The trip and its legs at this step.
 * @param edges - Routed edges by id.
 * @param tokens - The brand's motion tokens.
 * @param nodes - Node boxes the tag keeps off.
 * @param arrivals - The first landing on each node, changed in place.
 */
function addMovingTrip(
  scene: PacketScene,
  { trip, legs }: FrameTrip,
  edges: ReadonlyMap<string, RoutedEdge>,
  tokens: MotionTokens,
  nodes: readonly Rect[],
  arrivals: Map<string, number>,
): void {
  const id = `trip:${trip.id}`;
  const paths = legPaths(legs, edges);
  const look = { role: trip.role, size: trip.size };
  const motion = planTrip(
    {
      legs: paths.map((segments, index) => ({ segments, arrives: trip.path[index + 1] ?? '' })),
      origin: trip.path[0] ?? '',
      reply: trip.reply !== undefined,
      count: trip.count,
      speed: trip.speed,
      play: trip.play,
    },
    tokens,
  );
  motion.delays.forEach((delay, index) => {
    addMoving(scene, `${id}:${index}:out`, { ...look, reply: trip.returning }, motion.out, {
      period: motion.period,
      delay,
      loop: motion.loop,
    });
    if (motion.back.length > 0) {
      addMoving(scene, `${id}:${index}:back`, { ...look, reply: true }, motion.back, {
        period: motion.period,
        delay,
        loop: motion.loop,
      });
    }
  });
  addTags(scene, id, trip, motion, nodes);
  for (const arrival of motion.arrivals) {
    arrivals.set(arrival.node, Math.min(arrivals.get(arrival.node) ?? Infinity, arrival.time));
    scene.plans.push(pulsePlan(arrival.node, arrival.time, motion.loop, tokens));
  }
}

/**
 * Where a still packet with a tag goes: the first place along its way out where the tag, under the
 * packet or else above it, covers no node, no edge label and no other edge's line; failing that,
 * the first that covers no node or label.
 *
 * @param segments - The way out.
 * @param text - The tag's text.
 * @param obstacles - Nodes and edge labels.
 * @param lines - Other edges' corners.
 * @returns The fraction and the side; `undefined` when every place is covered.
 */
function stillTag(
  segments: readonly PathSegment[],
  text: string,
  obstacles: readonly Rect[],
  lines: readonly (readonly Point[])[] = [],
): { fraction: number; side: TagSide } | undefined {
  for (const strict of [true, false]) {
    for (const fraction of STATIC_FRACTIONS) {
      const head = pointAlong(segments, fraction);
      for (const side of TAG_SIDES) {
        const box = tagBox(head, text, side);
        const covered =
          obstacles.some((rect) => intersects(box, rect)) ||
          (strict && lines.some((line) => crossesLine(line, box)));
        if (!covered) {
          return { fraction, side };
        }
      }
    }
  }

  return undefined;
}

/**
 * The box a tag takes beside its packet.
 *
 * @param head - The packet's centre.
 * @param text - The tag's text.
 * @param side - Which side of the packet the tag sits on.
 */
function tagBox(head: Point, text: string, side: TagSide): Rect {
  const width = text.length * TAG_CHAR_PX + TAG_PADDING_PX;
  switch (side) {
    case 'below':
      return { x: head.x - width / 2, y: head.y + TAG_GAP_PX, width, height: TAG_HEIGHT_PX };
    case 'above':
      return {
        x: head.x - width / 2,
        y: head.y - TAG_GAP_PX - TAG_HEIGHT_PX,
        width,
        height: TAG_HEIGHT_PX,
      };
    case 'right':
      return {
        x: head.x + TAG_GAP_PX,
        y: head.y - TAG_HEIGHT_PX / 2,
        width,
        height: TAG_HEIGHT_PX,
      };
    case 'left':
      return {
        x: head.x - TAG_GAP_PX - width,
        y: head.y - TAG_HEIGHT_PX / 2,
        width,
        height: TAG_HEIGHT_PX,
      };
  }
}

/**
 * Whether any run of a polyline passes through a box.
 *
 * @param points - The polyline.
 * @param rect - The box.
 */
function crossesLine(points: readonly Point[], rect: Rect): boolean {
  return points
    .slice(1)
    .some((point, index) => segmentCrossesRect(points[index] as Point, point, rect));
}

/**
 * Props of {@link PacketDots}.
 */
type PacketDotsProps = {
  /**
   * The dots.
   */
  dots: readonly PacketDot[];
};

/**
 * The packets in the diagram's SVG: each a dot with a soft halo, a reply a ring, and a tail of
 * fading ghosts behind each.
 */
export function PacketDots({ dots }: PacketDotsProps): ReactNode {
  return dots.map((dot) => {
    const radius = PACKET_RADII[dot.size];
    const transform =
      dot.at === undefined ? undefined : `translate(${round2(dot.at.x)} ${round2(dot.at.y)})`;
    return (
      <g
        key={dot.motion}
        className="kit-packet"
        data-diagram-part={dot.ghost === 0 ? 'packet' : 'packet-tail'}
        data-motion={dot.motion}
        data-role={dot.role}
        data-reply={flag(dot.reply)}
        data-ghost={dot.ghost === 0 ? undefined : dot.ghost}
        data-angle={dot.at === undefined ? undefined : round2(dot.at.angle)}
        transform={transform}
        style={dot.at === undefined ? { opacity: 0 } : undefined}>
        {dot.ghost === 0 ? <circle className="kit-packet-halo" r={radius * HALO_RATIO} /> : null}
        <circle
          className="kit-packet-dot"
          r={dot.ghost === 0 ? radius : radius * (1 - dot.ghost * GHOST_SHRINK)}
        />
      </g>
    );
  });
}

/**
 * Props of {@link PacketTags}.
 */
type PacketTagsProps = {
  /**
   * The tags.
   */
  tags: readonly PacketTag[];
};

/**
 * Packet tags in the diagram's HTML layer, riding above their packets.
 */
export function PacketTags({ tags }: PacketTagsProps): ReactNode {
  return tags.map((tag) => (
    <span
      key={tag.motion}
      className="kit-packet-tag kit-type-caption"
      data-diagram-part="packet-tag"
      data-motion={tag.motion}
      data-role={tag.role}
      data-side={tag.side}
      style={
        tag.at === undefined
          ? { opacity: 0 }
          : { transform: `translate(${round2(tag.at.x)}px, ${round2(tag.at.y)}px)` }
      }>
      {tag.text}
    </span>
  ));
}

/**
 * Adds a still packet and its tail.
 *
 * @param scene - The scene, changed in place.
 * @param motion - The packet's id.
 * @param look - Its role, size and whether it is a reply.
 * @param segments - The path it travels.
 * @param head - Where it is.
 */
function addStill(
  scene: PacketScene,
  motion: string,
  look: { role: PacketRole; size: PacketSize; reply: boolean },
  segments: readonly PathSegment[],
  head: Point & { angle: number; length: number },
): void {
  tailBehind(segments, head, TAIL_GHOSTS)
    .reverse()
    .forEach((point, index) => {
      scene.dots.push({
        motion: `${motion}:ghost:${TAIL_GHOSTS - index}`,
        ...look,
        ghost: TAIL_GHOSTS - index,
        at: { ...point, angle: head.angle },
      });
    });
  scene.dots.push({ motion, ...look, ghost: 0, at: head });
}

/**
 * Adds an animated packet and its tail, each ghost on the same keyframes a little later.
 *
 * @param scene - The scene, changed in place.
 * @param motion - The packet's id.
 * @param look - Its role, size and whether it is a reply.
 * @param keyframes - Where it is over the period.
 * @param timing - The period, its start and whether it loops.
 */
function addMoving(
  scene: PacketScene,
  motion: string,
  look: { role: PacketRole; size: PacketSize; reply: boolean },
  keyframes: readonly PacketKeyframe[],
  timing: { period: number; delay: number; loop: boolean },
): void {
  for (let ghost = TAIL_GHOSTS; ghost >= 0; ghost -= 1) {
    const target = ghost === 0 ? motion : `${motion}:ghost:${ghost}`;
    scene.dots.push({ motion: target, ...look, ghost, at: undefined });
    scene.plans.push({
      target,
      keyframes: keyframes.map((frame) => ({
        offset: frame.offset,
        transform: transformOf(frame),
        opacity: ghost === 0 ? frame.opacity : frame.opacity * ghostShare(ghost),
      })),
      timing: {
        duration: timing.period,
        delay: timing.delay + ghost * TAIL_LAG_MS,
        iterations: timing.loop ? Infinity : 1,
        fill: 'both',
        easing: 'linear',
      },
    });
  }
}

/**
 * The share of a keyframe's opacity that a tail ghost keeps.
 *
 * @param ghost - The ghost's place in the tail, 1 nearest.
 */
function ghostShare(ghost: number): number {
  return GHOST_OPACITY_START - ghost * GHOST_OPACITY_FALL;
}

/**
 * The CSS transform that moves an element to a keyframe's place.
 *
 * @param frame - The keyframe.
 */
function transformOf(frame: PacketKeyframe): string {
  return `translate(${frame.x}px, ${frame.y}px)`;
}

/**
 * Adds the tag of a trip's first packet, riding with it on the way out (and with the reply's own
 * text on the way back). Each way rides on the side of the packet (under, above or beside it) that
 * passes over fewer nodes, and fades out wherever it would still reach past a node's border into
 * its text.
 *
 * @param scene - The scene, changed in place.
 * @param id - The trip's motion id.
 * @param trip - The trip.
 * @param motion - Its planned motion.
 * @param nodes - Node boxes the tag keeps off.
 */
function addTags(
  scene: PacketScene,
  id: string,
  trip: FrameTrip['trip'],
  motion: ReturnType<typeof planTrip>,
  nodes: readonly Rect[],
): void {
  const legs: [string, string | undefined, readonly PacketKeyframe[]][] = [
    ['out', trip.label, motion.out],
    ['back', typeof trip.reply === 'string' ? trip.reply : undefined, motion.back],
  ];
  const blockers = nodes.map((rect) => inflate(rect, -TAG_NODE_INSET));
  for (const [direction, text, keyframes] of legs) {
    if (text === undefined || keyframes.length === 0) {
      continue;
    }

    const target = `${id}:tag:${direction}`;
    /**
     * Whether the tag covers a node at each keyframe, riding on one side.
     */
    const covered = (side: TagSide): boolean[] =>
      keyframes.map((frame) => {
        const box = tagBox(frame, text, side);
        return blockers.some((rect) => intersects(box, rect));
      });
    /**
     * How many shown keyframes a side covers a node at.
     */
    const shownCovered = (covers: readonly boolean[]): number =>
      covers.filter((isCovered, index) => isCovered && (keyframes[index]?.opacity ?? 0) > 0).length;
    const options = TAG_SIDES.map((side) => ({ side, covers: covered(side) }));
    const best = options.reduce((a, b) =>
      shownCovered(b.covers) < shownCovered(a.covers) ? b : a,
    );
    const { side, covers } = best;
    scene.tags.push({ motion: target, text, role: trip.role, at: undefined, side });
    scene.plans.push({
      target,
      keyframes: keyframes.map((frame, index) => ({
        offset: frame.offset,
        transform: transformOf(frame),
        opacity: round2(frame.opacity * clearShare(covers, index)),
      })),
      timing: {
        duration: motion.period,
        iterations: motion.loop ? Infinity : 1,
        fill: 'both',
        easing: 'linear',
      },
    });
  }
}

/**
 * The share of the keyframes around one where a tag is clear of every node: 1 well clear, 0 over a
 * node, in between as it nears one.
 *
 * @param covered - Whether the tag covers a node at each keyframe.
 * @param index - The keyframe.
 */
function clearShare(covered: readonly boolean[], index: number): number {
  if (covered[index] === true) {
    return 0;
  }

  let clear = 0;
  let total = 0;
  for (let offset = -TAG_FADE_FRAMES; offset <= TAG_FADE_FRAMES; offset += 1) {
    const isCovered = covered[index + offset];
    if (isCovered !== undefined) {
      total += 1;
      clear += isCovered ? 0 : 1;
    }
  }

  return total === 0 ? 1 : clear / total;
}

/**
 * Adds the continuous traffic of one edge.
 *
 * @param scene - The scene, changed in place.
 * @param spec - The diagram.
 * @param edgeId - The edge.
 * @param edges - Routed edges.
 * @param tokens - The brand's motion tokens.
 * @param still - Whether to place dots for a still.
 */
function addFlow(
  scene: PacketScene,
  spec: FlowSpec,
  edgeId: string,
  edges: ReadonlyMap<string, RoutedEdge>,
  tokens: MotionTokens,
  still: boolean,
): void {
  const edge = spec.edges.find((candidate) => candidate.id === edgeId);
  const routed = edges.get(edgeId);
  const flow = edge?.flow;
  if (flow === undefined || routed === undefined) {
    return;
  }

  const segments = flow.reverse ? reversePath(routed.segments) : routed.segments;
  const look = { role: flow.role, size: flow.size, reply: false };
  const id = `flow:${edgeId}`;
  if (still) {
    staticFlowPositions(segments, flow.count).forEach((head, index) => {
      addStill(scene, `${id}:${index}`, look, segments, head);
    });
    return;
  }

  const motion = planFlow(segments, flow.count, flow.speed, tokens);
  motion.delays.forEach((delay, index) => {
    addMoving(scene, `${id}:${index}`, look, motion.out, {
      period: motion.period,
      delay,
      loop: true,
    });
  });
}

/**
 * The animation that rings a node when a packet lands on it: once, on the packet's first pass, and
 * softer for a looping trip, so a loop does not flash the node every time round.
 *
 * @param node - The node.
 * @param time - When the packet lands, in milliseconds.
 * @param loop - Whether the trip loops.
 * @param tokens - The brand's motion tokens.
 */
function pulsePlan(node: string, time: number, loop: boolean, tokens: MotionTokens): MotionPlan {
  const duration = tokens.slow * PULSE_DURATION_SCALE;
  const peak = Math.min((tokens.fast * PULSE_PEAK_FAST_SHARE) / duration, PULSE_PEAK_MAX);
  return {
    target: `pulse:${node}`,
    keyframes: [
      { offset: 0, opacity: 0, strokeWidth: '0px' },
      {
        offset: peak,
        opacity: loop ? PULSE_OPACITY_LOOP : PULSE_OPACITY_ONCE,
        strokeWidth: loop ? '3px' : '5px',
      },
      { offset: 1, opacity: 0, strokeWidth: loop ? '12px' : '16px' },
    ],
    timing: { duration, delay: time, iterations: 1, fill: 'both', easing: 'linear' },
  };
}
