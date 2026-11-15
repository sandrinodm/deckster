import type { PacketSize, PacketSpeed, PlayMode } from '#diagrams/flow-spec.ts';

import { DIAGRAM_HARD_LIMITS } from '#diagrams/diagram-limits.ts';
import { containsPoint, inflate, round2, type Point, type Rect } from '#diagrams/geometry.ts';
import {
  pathLength,
  pointAlong,
  reversePath,
  samplePath,
  type PathSample,
  type PathSegment,
} from '#diagrams/path-geometry.ts';

/**
 * The brand's motion tokens, in milliseconds, with its standard easing curve.
 */
export type MotionTokens = {
  /**
   * The brand's fast duration.
   */
  fast: number;

  /**
   * The brand's base duration.
   */
  base: number;

  /**
   * The brand's slow duration.
   */
  slow: number;

  /**
   * The standard easing as cubic-bezier control points.
   */
  easing: readonly [number, number, number, number];
};

/**
 * One keyframe of a packet: where it is and how visible.
 */
export type PacketKeyframe = {
  /**
   * When, as a share of the period, 0 to 1.
   */
  offset: number;

  /**
   * The centre's x.
   */
  x: number;

  /**
   * The centre's y.
   */
  y: number;

  /**
   * Its opacity.
   */
  opacity: number;
};

/**
 * One leg of a trip, in travel direction, with the node it arrives at.
 */
export type MotionLeg = {
  /**
   * The path in travel direction.
   */
  segments: readonly PathSegment[];

  /**
   * The node the leg ends at.
   */
  arrives: string;
};

/**
 * Everything a trip's animation needs: the period, the keyframes of the packet on its way out and
 * on its way back, when each particle starts, and when it reaches each node.
 */
export type TripMotion = {
  /**
   * One loop, in milliseconds.
   */
  period: number;

  /**
   * The packet's keyframes on the way out.
   */
  out: PacketKeyframe[];

  /**
   * The reply's keyframes on the way back; empty without a reply.
   */
  back: PacketKeyframe[];

  /**
   * When each particle starts, in milliseconds.
   */
  delays: number[];

  /**
   * When the first particle reaches each node, in milliseconds.
   */
  arrivals: { node: string; time: number }[];

  /**
   * Whether it loops.
   */
  loop: boolean;
};

/**
 * What a trip is made of, for {@link planTrip}.
 */
export type TripPlan = {
  /**
   * The legs on the way out.
   */
  legs: readonly MotionLeg[];

  /**
   * The node the trip starts at, for a reply's arrival.
   */
  origin: string;

  /**
   * Whether a reply comes back.
   */
  reply: boolean;

  /**
   * Particles travelling together.
   */
  count: number;

  /**
   * How fast.
   */
  speed: PacketSpeed;

  /**
   * Loop or once.
   */
  play: PlayMode;
};

/**
 * The distance a packet crosses in the brand's slow duration at normal speed, in canvas pixels: a
 * quarter of the slide's width, so a slow brand moves its packets slowly too.
 */
const PIXELS_PER_SLOW_DURATION = 480;

/**
 * The shortest a leg takes, in the brand's slow durations, so a packet on a short edge is still
 * seen to travel.
 */
const MIN_LEG_SLOW_DURATIONS = 1.6;

/**
 * The shortest time continuous traffic takes to cross an edge, in the brand's slow durations, so
 * particles on a short edge drift rather than flicker.
 */
const MIN_FLOW_SLOW_DURATIONS = 3;

/**
 * Speed multipliers.
 */
const SPEED_FACTORS: Readonly<Record<PacketSpeed, number>> = {
  /**
   * A little over half the brand's pace.
   */
  slow: 0.6,

  /**
   * The brand's pace.
   */
  normal: 1,

  /**
   * Most of twice the brand's pace.
   */
  fast: 1.7,
};

/**
 * Packet radii in canvas pixels.
 */
export const PACKET_RADII: Readonly<Record<PacketSize, number>> = {
  /**
   * Small: edge traffic.
   */
  sm: 5,

  /**
   * Medium: the default for packets.
   */
  md: 7,

  /**
   * Large: one packet that is the point of the slide.
   */
  lg: 10,
};

/**
 * Pixels between keyframes along a path.
 */
const SAMPLE_SPACING = 10;

/**
 * How long a reply waits at the far end, in the brand's base durations.
 */
const REPLY_WAIT_BASES = 1.5;

/**
 * The share of the fast duration between the starts of a burst's particles.
 */
const BURST_DELAY_SHARE = 0.9;

/**
 * How many halvings the search for an easing's time or progress makes.
 */
const BISECTION_ITERATIONS = 30;

/**
 * How close a bezier's x must come to the target to stop searching.
 */
const BEZIER_TOLERANCE = 1e-5;

/**
 * The earliest share of a path where a frozen burst particle is drawn, so a burst that starts near
 * the origin keeps its trailing particles on the path.
 */
const MIN_STATIC_SHARE = 0.05;

/**
 * The share of a leg over which a packet fades in at the start and out at the end.
 */
const FADE_SHARE = 0.08;

/**
 * Where static mode freezes a packet, as shares of its way out, best first: partway along, or
 * elsewhere when a label sits there.
 */
export const STATIC_FRACTIONS = [0.62, 0.42, 0.78, 0.3, 0.88, 0.5, 0.2, 0.7, 0.12];

/**
 * Pixels between the ghost dots of a packet's tail.
 */
export const TAIL_SPACING = 9;

/**
 * Pixels a frozen packet keeps clear of a label.
 */
const AVOID_MARGIN = 12;

/**
 * Pixels between two particles of a burst when frozen.
 */
const BURST_SPACING = 46;

/**
 * A particle count as the renderer draws it: a whole number from none to the diagram limit.
 *
 * @param count - The count as written.
 */
function particles(count: number): number {
  return Number.isFinite(count)
    ? Math.min(DIAGRAM_HARD_LIMITS.maxParticles, Math.max(0, Math.floor(count)))
    : 0;
}

/**
 * Whether the brand's motion tokens let anything move: a brand whose slow duration is zero has no
 * animation, and its diagrams draw the still state.
 *
 * @param tokens - The brand's durations; `undefined` before they are read.
 */
export function movesAt(tokens: MotionTokens | undefined): boolean {
  return tokens === undefined || (tokens.slow > 0 && Number.isFinite(tokens.slow));
}

/**
 * Plans a trip's animation from the brand's motion tokens: each leg takes its length at the brand's
 * pace (never less than 1.6 slow durations) along the standard easing, the packet slips into each
 * node it passes and out again after the fast duration, a reply waits at the far end for one and a
 * half base durations and comes back the same way, and a loop rests for the slow duration before it
 * starts again. A burst sends its particles a little apart.
 *
 * @param plan - The legs and the look.
 * @param tokens - The brand's durations and easing.
 */
export function planTrip(plan: TripPlan, tokens: MotionTokens): TripMotion {
  const pace = (PIXELS_PER_SLOW_DURATION / tokens.slow) * SPEED_FACTORS[plan.speed];
  const durations = plan.legs.map((leg) =>
    Math.max(tokens.slow * MIN_LEG_SLOW_DURATIONS, pathLength(leg.segments) / pace),
  );
  const outTime =
    durations.reduce((sum, duration) => sum + duration, 0) +
    tokens.fast * Math.max(plan.legs.length - 1, 0);
  const wait = plan.reply ? tokens.base * REPLY_WAIT_BASES : 0;
  const backTime = plan.reply ? outTime : 0;
  const rest = plan.play === 'loop' ? tokens.slow : 0;
  const period = outTime + wait + backTime + rest;
  const out = legKeyframes(plan.legs, durations, 0, period, tokens);
  const back = plan.reply
    ? legKeyframes(
        reverseLegs(plan.legs, plan.origin),
        [...durations].reverse(),
        outTime + wait,
        period,
        tokens,
      )
    : [];
  const arrivals: { node: string; time: number }[] = [];
  let clock = 0;
  plan.legs.forEach((leg, index) => {
    clock += durations[index] ?? 0;
    arrivals.push({ node: leg.arrives, time: clock });
    clock += tokens.fast;
  });
  if (plan.reply) {
    arrivals.push({ node: plan.origin, time: outTime + wait + backTime });
  }

  return {
    period,
    out,
    back,
    delays: Array.from(
      { length: particles(plan.count) },
      (_, index) => index * tokens.fast * BURST_DELAY_SHARE,
    ),
    arrivals,
    loop: plan.play === 'loop',
  };
}

/**
 * Plans continuous traffic along one edge: particles evenly spaced in time, each crossing at the
 * brand's pace without easing, fading in and out at the ends.
 *
 * @param segments - The path in travel direction.
 * @param count - Particles on the edge at once.
 * @param speed - How fast.
 * @param tokens - The brand's durations.
 */
export function planFlow(
  segments: readonly PathSegment[],
  count: number,
  speed: PacketSpeed,
  tokens: MotionTokens,
): TripMotion {
  const pace = (PIXELS_PER_SLOW_DURATION / tokens.slow) * SPEED_FACTORS[speed];
  const period = Math.max(tokens.slow * MIN_FLOW_SLOW_DURATIONS, pathLength(segments) / pace);
  const samples = samplePath(segments, SAMPLE_SPACING);
  const total = samples[samples.length - 1]?.length ?? 1;
  const out = samples.map((sample) => {
    const share = sample.length / (total || 1);
    return {
      offset: round4(share),
      x: round2(sample.x),
      y: round2(sample.y),
      opacity: fadeAt(share),
    };
  });
  return {
    period,
    out,
    back: [],
    delays: Array.from({ length: particles(count) }, (_, index) => -(index * period) / count),
    arrivals: [],
    loop: true,
  };
}

/**
 * Where static mode draws a trip's particles: partway along the way out, clear of the labels on the
 * path, each burst particle a little behind the one before, with the direction of travel.
 *
 * @param segments - The whole way out, in travel direction.
 * @param count - Particles.
 * @param avoid - Boxes to keep the packet out of, such as edge labels.
 * @param fraction - Where to put the first packet, when the caller has chosen.
 */
export function staticTripPositions(
  segments: readonly PathSegment[],
  count: number,
  avoid: readonly Rect[] = [],
  fraction?: number,
): PathSample[] {
  const total = pathLength(segments);
  /**
   * Whether the point a fraction along the path is clear of every box to avoid.
   */
  const clear = (share: number): boolean => {
    const point = pointAlong(segments, share);
    return !avoid.some((rect) => containsPoint(inflate(rect, AVOID_MARGIN), point));
  };
  const start = fraction ?? STATIC_FRACTIONS.find(clear) ?? STATIC_FRACTIONS[0] ?? 0.5;
  return Array.from({ length: particles(count) }, (_, index) =>
    pointAlong(
      segments,
      Math.max(start - (index * BURST_SPACING) / (total || 1), MIN_STATIC_SHARE),
    ),
  );
}

/**
 * Where static mode draws continuous traffic: particles evenly spread along the edge.
 *
 * @param segments - The path in travel direction.
 * @param count - Particles.
 */
export function staticFlowPositions(segments: readonly PathSegment[], count: number): PathSample[] {
  return Array.from({ length: particles(count) }, (_, index) =>
    pointAlong(segments, (index + 0.5) / count),
  );
}

/**
 * The points of a packet's tail behind it, nearest first, for static mode.
 *
 * @param segments - The path in travel direction.
 * @param head - Where the packet is.
 * @param ghosts - How many tail dots.
 */
export function tailBehind(
  segments: readonly PathSegment[],
  head: PathSample,
  ghosts: number,
): Point[] {
  const total = pathLength(segments) || 1;
  return Array.from({ length: ghosts }, (_, index) =>
    pointAlong(segments, Math.max(head.length - (index + 1) * TAIL_SPACING, 0) / total),
  );
}

/**
 * Evaluates a cubic-bezier easing curve, as CSS does: the progress at a share of the time.
 *
 * @param curve - The control points `[x1, y1, x2, y2]`.
 * @param t - The share of the time, 0 to 1.
 */
export function cubicBezier(curve: readonly [number, number, number, number], t: number): number {
  const [x1, y1, x2, y2] = curve;
  if (t <= 0 || t >= 1) {
    return Math.min(Math.max(t, 0), 1);
  }

  let low = 0;
  let high = 1;
  let u = t;
  for (let iteration = 0; iteration < BISECTION_ITERATIONS; iteration += 1) {
    u = (low + high) / 2;
    const x = bezierAxis(x1, x2, u);
    if (Math.abs(x - t) < BEZIER_TOLERANCE) {
      break;
    }

    if (x < t) {
      low = u;
    } else {
      high = u;
    }
  }

  return bezierAxis(y1, y2, u);
}

/**
 * Keyframes for a run of legs starting at a time within the period.
 *
 * @param legs - The legs, in travel order.
 * @param durations - Each leg's duration.
 * @param start - When the first leg starts, in milliseconds.
 * @param period - The loop's period.
 * @param tokens - The brand's tokens, for the easing and the pause between legs.
 */
function legKeyframes(
  legs: readonly MotionLeg[],
  durations: readonly number[],
  start: number,
  period: number,
  tokens: MotionTokens,
): PacketKeyframe[] {
  const frames: PacketKeyframe[] = [];
  let clock = start;
  legs.forEach((leg, index) => {
    const duration = durations[index] ?? tokens.base;
    const samples = samplePath(leg.segments, SAMPLE_SPACING);
    const total = samples[samples.length - 1]?.length ?? 1;
    for (const sample of samples) {
      const progress = sample.length / (total || 1);
      const time = clock + inverseEase(tokens.easing, progress) * duration;
      frames.push({
        offset: period > 0 ? round4(time / period) : 0,
        x: round2(sample.x),
        y: round2(sample.y),
        opacity: fadeAt(progress),
      });
    }

    clock += duration + tokens.fast;
  });
  return withEnds(frames);
}

/**
 * Legs run backwards, each arriving at the node the original left from.
 *
 * @param legs - The way out.
 * @param origin - The node the way out started at.
 */
function reverseLegs(legs: readonly MotionLeg[], origin: string): MotionLeg[] {
  const starts = [origin, ...legs.map((leg) => leg.arrives)];
  return legs
    .map((leg, index) => ({
      segments: reversePath(leg.segments),
      arrives: starts[index] as string,
    }))
    .reverse();
}

/**
 * Pads keyframes so they start at offset 0 and end at offset 1, hidden outside the frames given.
 *
 * @param frames - Keyframes in time order.
 */
function withEnds(frames: PacketKeyframe[]): PacketKeyframe[] {
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (first === undefined || last === undefined) {
    return frames;
  }

  const head = first.offset > 0 ? [{ ...first, offset: 0, opacity: 0 }] : [];
  const tail = last.offset < 1 ? [{ ...last, offset: 1, opacity: 0 }] : [];
  return [...head, ...frames, ...tail];
}

/**
 * The opacity at a share of a leg: fading in at the start and out at the end.
 *
 * @param share - 0 to 1.
 */
function fadeAt(share: number): number {
  const edge = Math.min(share, 1 - share);
  return round4(Math.min(edge / FADE_SHARE, 1));
}

/**
 * The share of time at which an eased motion reaches a share of the distance.
 *
 * @param curve - The easing.
 * @param progress - The share of the distance.
 */
function inverseEase(curve: readonly [number, number, number, number], progress: number): number {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < BISECTION_ITERATIONS; iteration += 1) {
    const middle = (low + high) / 2;
    if (cubicBezier(curve, middle) < progress) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
}

/**
 * One axis of a cubic Bézier from (0,0) to (1,1).
 *
 * @param p1 - The first control point's coordinate.
 * @param p2 - The second control point's coordinate.
 * @param u - The curve parameter.
 */
function bezierAxis(p1: number, p2: number, u: number): number {
  const v = 1 - u;
  return 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u;
}

/**
 * The factor that moves four decimal places into the integer part and back.
 */
const FOUR_DECIMAL_FACTOR = 10_000;

/**
 * Rounds to four decimals.
 *
 * @param value - Any number.
 */
function round4(value: number): number {
  return Math.round(value * FOUR_DECIMAL_FACTOR) / FOUR_DECIMAL_FACTOR;
}
