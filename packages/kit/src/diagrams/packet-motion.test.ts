import { describe, expect, it } from 'vite-plus/test';

import {
  cubicBezier,
  movesAt,
  planFlow,
  planTrip,
  STATIC_FRACTIONS,
  staticFlowPositions,
  staticTripPositions,
  tailBehind,
} from '#diagrams/packet-motion.ts';
import { pathLength, roundedPath } from '#diagrams/path-geometry.ts';

/**
 * The default brand's motion tokens.
 */
const TOKENS = { fast: 160, base: 280, slow: 480, easing: [0.2, 0, 0, 1] as const };

/**
 * A 960-pixel horizontal path.
 */
const LINE = roundedPath(
  [
    { x: 0, y: 100 },
    { x: 960, y: 100 },
  ],
  0,
);

describe('planTrip', () => {
  it('times a leg by its length at the brand pace, plus a rest when it loops', () => {
    const motion = planTrip(
      {
        legs: [{ segments: LINE, arrives: 'b' }],
        origin: 'a',
        reply: false,
        count: 1,
        speed: 'normal',
        play: 'loop',
      },
      TOKENS,
    );
    expect(motion.period).toBeCloseTo(960 + TOKENS.slow);
    expect(motion.arrivals).toEqual([{ node: 'b', time: 960 }]);
    expect(motion.loop).toBe(true);
  });

  it('never runs a short leg faster than the brand floor', () => {
    const short = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      0,
    );
    const motion = planTrip(
      {
        legs: [{ segments: short, arrives: 'b' }],
        origin: 'a',
        reply: false,
        count: 1,
        speed: 'fast',
        play: 'once',
      },
      TOKENS,
    );
    expect(motion.period).toBeGreaterThanOrEqual(TOKENS.slow * 1.6);
  });

  it('comes back after a pause for a reply, arriving home last', () => {
    const motion = planTrip(
      {
        legs: [{ segments: LINE, arrives: 'b' }],
        origin: 'a',
        reply: true,
        count: 1,
        speed: 'normal',
        play: 'once',
      },
      TOKENS,
    );
    expect(motion.back.length).toBeGreaterThan(2);
    expect(motion.arrivals.map((arrival) => arrival.node)).toEqual(['b', 'a']);
    expect(motion.back.find((frame) => frame.opacity === 1)?.x ?? 0).toBeGreaterThan(
      motion.back.at(-2)?.x ?? 0,
    );
  });

  it('keeps keyframe offsets ascending from 0 to 1, hidden at both ends', () => {
    const { out } = planTrip(
      {
        legs: [{ segments: LINE, arrives: 'b' }],
        origin: 'a',
        reply: true,
        count: 2,
        speed: 'slow',
        play: 'loop',
      },
      TOKENS,
    );
    expect(out[0]).toMatchObject({ offset: 0, opacity: 0 });
    expect(out.at(-1)).toMatchObject({ offset: 1, opacity: 0 });
    expect(
      out.every((frame, index) => index === 0 || frame.offset >= (out[index - 1]?.offset ?? 0)),
    ).toBe(true);
  });
});

describe('planFlow', () => {
  it('spreads particles evenly over one period with negative delays', () => {
    const motion = planFlow(LINE, 4, 'normal', TOKENS);
    expect(motion.delays.map((delay) => Math.round((delay / motion.period) * 4) + 0)).toEqual([
      0, -1, -2, -3,
    ]);
  });
});

describe('static stills', () => {
  it('freezes a packet partway along with its tail behind it, showing the direction', () => {
    const [head] = staticTripPositions(LINE, 1);
    expect(head?.x).toBeCloseTo(960 * (STATIC_FRACTIONS[0] ?? 0));
    expect(head?.angle).toBe(0);
    const tail = head === undefined ? [] : tailBehind(LINE, head, 3);
    expect(tail.map((point) => Math.round(point.x))).toEqual([586, 577, 568]);
  });

  it('moves a frozen packet off a label that sits on its path', () => {
    const label = { x: 560, y: 80, width: 80, height: 40 };
    const [head] = staticTripPositions(LINE, 1, [label]);
    expect(head?.x).toBeCloseTo(960 * (STATIC_FRACTIONS[1] ?? 0));
  });

  it('spreads continuous traffic evenly along the edge', () => {
    expect(staticFlowPositions(LINE, 3).map((point) => Math.round(point.x))).toEqual([
      160, 480, 800,
    ]);
  });
});

describe('cubicBezier', () => {
  it('follows CSS easing at the ends and is linear for linear control points', () => {
    expect(cubicBezier([0.2, 0, 0, 1], 0)).toBe(0);
    expect(cubicBezier([0.2, 0, 0, 1], 1)).toBe(1);
    expect(cubicBezier([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 3);
    expect(cubicBezier([0.2, 0, 0, 1], 0.5)).toBeGreaterThan(0.5);
  });

  it('measures a path', () => {
    expect(pathLength(LINE)).toBe(960);
  });
});

describe('zero durations', () => {
  const ZERO = { fast: 0, base: 0, slow: 0, easing: [0.2, 0, 0, 1] as const };

  it('never writes a keyframe offset that is not a number', () => {
    const motion = planTrip(
      {
        legs: [{ segments: LINE, arrives: 'b' }],
        origin: 'a',
        reply: true,
        count: 2,
        speed: 'normal',
        play: 'loop',
      },
      ZERO,
    );
    expect([...motion.out, ...motion.back].every((frame) => Number.isFinite(frame.offset))).toBe(
      true,
    );
    expect(motion.delays.every((delay) => Number.isFinite(delay))).toBe(true);
    const flow = planFlow(LINE, 3, 'normal', ZERO);
    expect(flow.out.every((frame) => Number.isFinite(frame.offset))).toBe(true);
    expect(flow.delays.every((delay) => Number.isFinite(delay))).toBe(true);
  });

  it('says a brand without a slow duration has no motion, so the diagram draws its still', () => {
    expect(movesAt(ZERO)).toBe(false);
    expect(movesAt(TOKENS)).toBe(true);
    expect(movesAt(undefined)).toBe(true);
  });
});

describe('particle counts', () => {
  it('draws at most the diagram limit however many are asked for', () => {
    expect(staticFlowPositions(LINE, 1e9)).toHaveLength(24);
    expect(staticTripPositions(LINE, 1e9)).toHaveLength(24);
    expect(planFlow(LINE, 1e9, 'normal', TOKENS).delays).toHaveLength(24);
    expect(staticFlowPositions(LINE, Number.NaN)).toHaveLength(0);
  });
});
