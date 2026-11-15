import { describe, expect, it } from 'vite-plus/test';

import {
  badgeBox,
  badgeSize,
  edgesThrough,
  placeBadge,
  segmentHitsBox,
  type BadgeEdge,
  type BadgeMetrics,
} from '#diagrams/badge-placement.ts';

/**
 * Sizes like the default brand's: 18 px label type in capitals, 16 px a character.
 */
const METRICS: BadgeMetrics = {
  labelSize: 18,
  measureLabel: (text) => text.length * 16,
  space: { xs: 8, sm: 16 },
  stroke: 2,
};

/**
 * A wide node (its badge sits on its border).
 */
const WIDE = { x: 400, y: 300, width: 400, height: 100 };

/**
 * A narrow node (its badge stands off its corner).
 */
const NARROW = { x: 400, y: 300, width: 240, height: 100 };

/**
 * An edge that runs straight down into a node's top at `x`, ending at its border.
 *
 * @param id - The edge id.
 * @param x - Where it arrives.
 */
function arrivingTop(id: string, x: number): BadgeEdge {
  return {
    id,
    points: [
      { x, y: 200 },
      { x, y: 298 },
    ],
  };
}

describe('badgeSize', () => {
  it('grows with the text and keeps a fixed height', () => {
    const short = badgeSize('503', METRICS);
    const long = badgeSize('Timeout', METRICS);
    expect(long.width).toBeGreaterThan(short.width);
    expect(long.height).toBe(short.height);
  });
});

describe('badgeBox', () => {
  const size = { width: 100, height: 30 };

  it('puts the top right badge on the border of a wide node, a step in from the corner', () => {
    expect(badgeBox('top-right', WIDE, size, METRICS.space)).toEqual({
      x: 800 - 16 - 100,
      y: 300 - 0.55 * 30,
      width: 100,
      height: 30,
    });
  });

  it('mirrors it to the other corners', () => {
    expect(badgeBox('top-left', WIDE, size, METRICS.space).x).toBe(416);
    expect(badgeBox('bottom-right', WIDE, size, METRICS.space).y).toBe(400 - 0.45 * 30);
    expect(badgeBox('bottom-left', WIDE, size, METRICS.space)).toMatchObject({ x: 416 });
  });

  it('stands a narrow node badge off the corner, above the top and below the bottom', () => {
    expect(badgeBox('top-right', NARROW, size, METRICS.space)).toMatchObject({
      x: 640 - 8 - 100,
      y: 300 - 8 - 30,
    });
    expect(badgeBox('bottom-left', NARROW, size, METRICS.space)).toMatchObject({
      x: 408,
      y: 408,
    });
  });
});

describe('segmentHitsBox', () => {
  const box = { x: 10, y: 10, width: 20, height: 20 };

  it('hits a segment through the box and a diagonal across a corner', () => {
    expect(segmentHitsBox({ x: 20, y: 0 }, { x: 20, y: 50 }, box)).toBe(true);
    expect(segmentHitsBox({ x: 0, y: 20 }, { x: 20, y: 0 }, box)).toBe(true);
  });

  it('misses a segment beside it, short of it, and a diagonal that clears its corner', () => {
    expect(segmentHitsBox({ x: 40, y: 0 }, { x: 40, y: 50 }, box)).toBe(false);
    expect(segmentHitsBox({ x: 20, y: 0 }, { x: 20, y: 5 }, box)).toBe(false);
    expect(segmentHitsBox({ x: 0, y: 12 }, { x: 12, y: 0 }, box)).toBe(false);
  });
});

describe('edgesThrough', () => {
  const box = { x: 100, y: 100, width: 60, height: 30 };

  it('names an edge within the clearance, such as an arrowhead beside the badge', () => {
    const near = {
      id: 'near',
      points: [
        { x: 95, y: 0 },
        { x: 95, y: 99 },
      ],
    };
    const far = {
      id: 'far',
      points: [
        { x: 60, y: 0 },
        { x: 60, y: 99 },
      ],
    };
    expect(edgesThrough(box, [near, far])).toEqual(['near']);
  });
});

describe('placeBadge', () => {
  it('keeps the top right corner when nothing runs there', () => {
    const placed = placeBadge(WIDE, '503', [arrivingTop('left', 450)], METRICS);
    expect(placed.corner).toBe('top-right');
    expect(placed.covered).toEqual([]);
  });

  it('moves to the top left when an edge arrives under the top right badge', () => {
    const placed = placeBadge(WIDE, 'Timeout', [arrivingTop('in', 720)], METRICS);
    expect(placed.corner).toBe('top-left');
    expect(placed.covered).toEqual([]);
  });

  it('goes to the bottom when edges arrive at both top corners', () => {
    const placed = placeBadge(
      WIDE,
      'Timeout',
      [arrivingTop('a', 440), arrivingTop('b', 720)],
      METRICS,
    );
    expect(placed.corner).toBe('bottom-right');
    expect(placed.covered).toEqual([]);
  });

  it('reports the edges it could not clear, at the corner with the fewest', () => {
    const along = (id: string, y: number): BadgeEdge => ({
      id,
      points: [
        { x: 300, y },
        { x: 900, y },
      ],
    });
    const edges = [arrivingTop('a', 440), arrivingTop('b', 720), along('c', 395), along('d', 399)];
    const placed = placeBadge(WIDE, 'Timeout', edges, METRICS);
    expect(placed.covered.length).toBeGreaterThan(0);
    expect(placed.covered.length).toBeLessThanOrEqual(2);
  });
});
