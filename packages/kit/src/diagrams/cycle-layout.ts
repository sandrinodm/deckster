import type { PathSegment } from '#diagrams/path-geometry.ts';

import { centerOf, containsPoint, inflate, type Point, type Rect } from '#diagrams/geometry.ts';

/**
 * Clearance between an arc's ends and the stages it joins, in pixels, when none is given.
 */
const ARC_CLEARANCE = 4;

/**
 * The span, in unit-circle units, below which an axis counts as flat: all stages sit on one line
 * along it, so its scale cannot be measured.
 */
const MIN_UNIT_SPAN = 1e-6;

/**
 * The across radius, as a share of the down radius, when the stages sit on one line and only the
 * down radius can be measured.
 */
const FLAT_ACROSS_SHARE = 0.6;

/**
 * Points sampled along the ring to find where an arc first leaves and last reenters a stage's box.
 */
const BOUNDARY_SAMPLES = 200;

/**
 * Halvings of the bracket around a boundary: each one halves the bracket, so 24 places it to a
 * fraction of a degree.
 */
const BOUNDARY_HALVINGS = 24;

/**
 * The longest a cubic piece of an arc may span, in radians: a quarter turn.
 */
const MAX_PIECE_ANGLE = Math.PI / 2;

/**
 * Where stages sit on a ring: evenly spaced, the first at the top, going clockwise, on a unit
 * circle that the layout stretches to fill the diagram's box (an ellipse in a wide box).
 *
 * @param ids - The stages, in order.
 * @returns Each stage's centre on the unit circle.
 */
export function ringCentres(ids: readonly string[]): Map<string, Point> {
  return new Map(
    ids.map((id, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(ids.length, 1);
      return [id, { x: Math.cos(angle), y: Math.sin(angle) }] as const;
    }),
  );
}

/**
 * An ellipse: its centre and radii.
 */
export type Ellipse = {
  /**
   * The centre.
   */
  centre: Point;

  /**
   * The radius across.
   */
  rx: number;

  /**
   * The radius down.
   */
  ry: number;
};

/**
 * The ellipse the stages were placed on: the unit circle of {@link ringCentres} as the layout
 * stretched it, found from where the stages landed, so arcs run through every stage's centre.
 *
 * @param unit - Each stage's centre on the unit circle.
 * @param placed - Each stage's laid-out box.
 * @returns The ellipse; `undefined` with fewer than two stages.
 */
export function ringEllipse(
  unit: ReadonlyMap<string, Point>,
  placed: ReadonlyMap<string, Rect>,
): Ellipse | undefined {
  const pairs = [...unit].flatMap(([id, point]) => {
    const rect = placed.get(id);
    return rect === undefined ? [] : [{ unit: point, at: centerOf(rect) }];
  });
  if (pairs.length < 2) {
    return undefined;
  }

  /**
   * The scale and offset that map one unit axis onto the layout's.
   */
  const fit = (axis: 'x' | 'y'): { scale: number; offset: number } | undefined => {
    const sorted = [...pairs].sort((a, b) => a.unit[axis] - b.unit[axis]);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    if (
      low === undefined ||
      high === undefined ||
      high.unit[axis] - low.unit[axis] < MIN_UNIT_SPAN
    ) {
      return undefined;
    }

    const scale = (high.at[axis] - low.at[axis]) / (high.unit[axis] - low.unit[axis]);
    return { scale, offset: low.at[axis] - low.unit[axis] * scale };
  };
  const x = fit('x');
  const y = fit('y');
  if (y === undefined) {
    return undefined;
  }

  const across = x ?? { scale: y.scale * FLAT_ACROSS_SHARE, offset: pairs[0]?.at.x ?? 0 };
  return { centre: { x: across.offset, y: y.offset }, rx: across.scale, ry: y.scale };
}

/**
 * The arc of the ring from one stage to the next, along the ellipse through every stage's centre:
 * it leaves the first stage's box and ends a gap before the next one's, drawn as true elliptical
 * arcs (one cubic per quarter turn at most).
 *
 * @param ellipse - The ring.
 * @param from - The stage the arc leaves.
 * @param to - The stage it reaches.
 * @param gaps - Room after the first box and before the second (the arrowhead's tip).
 * @returns The arc's ends and segments; `undefined` when the stages overlap.
 */
export function ringArc(
  ellipse: Ellipse,
  from: Rect,
  to: Rect,
  gaps: { start: number; end: number } = { start: ARC_CLEARANCE, end: ARC_CLEARANCE },
): { points: Point[]; segments: PathSegment[] } | undefined {
  const { centre, rx, ry } = ellipse;
  /**
   * The angle at which a point sits on the ellipse.
   */
  const angleOf = (point: Point): number =>
    Math.atan2((point.y - centre.y) / ry, (point.x - centre.x) / rx);
  const start = angleOf(centerOf(from));
  let end = angleOf(centerOf(to));
  while (end <= start) {
    end += 2 * Math.PI;
  }

  /**
   * The point on the ellipse at an angle.
   */
  const at = (angle: number): Point => ({
    x: centre.x + rx * Math.cos(angle),
    y: centre.y + ry * Math.sin(angle),
  });
  /**
   * A test for angles whose point lies outside a stage's box and a gap around it.
   */
  const outside = (rect: Rect, gap: number) => (angle: number) =>
    !containsPoint(inflate(rect, gap), at(angle));
  const first = boundaryAngle(start, end, outside(from, gaps.start));
  const last = boundaryAngle(end, start, outside(to, gaps.end));
  if (first === undefined || last === undefined || last <= first) {
    return undefined;
  }

  return {
    points: [at(first), at(last)],
    segments: cubicArcSegments(ellipse, first, last),
  };
}

/**
 * The cubic segments that draw an ellipse's arc between two angles, one per quarter turn at most.
 * Each cubic's handles sit along the tangent, at the distance that makes it a true elliptical arc.
 *
 * @param ellipse - The ring.
 * @param first - The angle the arc starts at.
 * @param last - The angle the arc ends at, after `first`.
 */
function cubicArcSegments(ellipse: Ellipse, first: number, last: number): PathSegment[] {
  const { centre, rx, ry } = ellipse;
  /**
   * The point on the ellipse at an angle.
   */
  const at = (angle: number): Point => ({
    x: centre.x + rx * Math.cos(angle),
    y: centre.y + ry * Math.sin(angle),
  });
  const pieces = Math.max(1, Math.ceil((last - first) / MAX_PIECE_ANGLE));
  const step = (last - first) / pieces;
  return Array.from({ length: pieces }, (_, index) => {
    const a = first + step * index;
    const b = a + step;
    const handle = (4 / 3) * Math.tan(step / 4);
    const p0 = at(a);
    const p3 = at(b);
    return {
      kind: 'cubic',
      from: p0,
      c1: { x: p0.x - handle * rx * Math.sin(a), y: p0.y + handle * ry * Math.cos(a) },
      c2: { x: p3.x + handle * rx * Math.sin(b), y: p3.y - handle * ry * Math.cos(b) },
      to: p3,
    };
  });
}

/**
 * The angle where a test first passes going from `from` towards `to`, found to a fraction of a
 * degree: a coarse scan for the first passing step, then halving between it and the one before.
 *
 * @param from - Where to start.
 * @param to - Where to stop.
 * @param passes - The test.
 */
function boundaryAngle(
  from: number,
  to: number,
  passes: (angle: number) => boolean,
): number | undefined {
  for (let index = 0; index <= BOUNDARY_SAMPLES; index += 1) {
    const angle = from + ((to - from) * index) / BOUNDARY_SAMPLES;
    if (!passes(angle)) {
      continue;
    }

    if (index === 0) {
      return angle;
    }

    let low = from + ((to - from) * (index - 1)) / BOUNDARY_SAMPLES;
    let high = angle;
    for (let round = 0; round < BOUNDARY_HALVINGS; round += 1) {
      const middle = (low + high) / 2;
      if (passes(middle)) {
        high = middle;
      } else {
        low = middle;
      }
    }

    return high;
  }

  return undefined;
}
