import { distance, EPSILON, round2, type Point } from '#diagrams/geometry.ts';
import { pushAll } from '#foundation/lists.ts';

/**
 * One piece of an edge's path: a straight line, a rounded corner (a quadratic curve whose control
 * point is the corner) or a free curve (cubic).
 */
export type PathSegment =
  | {
      /**
       * A straight line.
       */
      kind: 'line';

      /**
       * Where it starts.
       */
      from: Point;

      /**
       * Where it ends.
       */
      to: Point;
    }
  | {
      /**
       * A rounded corner.
       */
      kind: 'quad';

      /**
       * Where it starts.
       */
      from: Point;

      /**
       * The corner it rounds.
       */
      control: Point;

      /**
       * Where it ends.
       */
      to: Point;
    }
  | {
      /**
       * A free curve.
       */
      kind: 'cubic';

      /**
       * Where it starts.
       */
      from: Point;

      /**
       * The first control point.
       */
      c1: Point;

      /**
       * The second control point.
       */
      c2: Point;

      /**
       * Where it ends.
       */
      to: Point;
    };

/**
 * A point on a path with the distance travelled to reach it and the direction of travel there.
 */
export type PathSample = Point & {
  /**
   * Pixels from the start of the path.
   */
  length: number;

  /**
   * The direction of travel, in degrees clockwise from the positive x axis.
   */
  angle: number;
};

/**
 * Points per curved segment when measuring a path; corners are short, so this is plenty.
 */
const CURVE_RESOLUTION = 24;

/**
 * How far along a path two lengths may differ and still count as the same point, in pixels: a tenth
 * of {@link EPSILON}.
 */
const LENGTH_TOLERANCE = EPSILON / 10;

/**
 * Degrees in a half turn, which converts an angle from radians.
 */
const DEGREES_PER_HALF_TURN = 180;

/**
 * Turns a polyline into segments with every inner corner rounded. A corner's radius shrinks to half
 * of the shorter segment beside it, so short jogs stay smooth instead of overshooting.
 *
 * @param points - The polyline, at least two points; repeated and collinear points are dropped.
 * @param radius - The corner radius in pixels; 0 keeps sharp corners.
 */
export function roundedPath(points: readonly Point[], radius: number): PathSegment[] {
  const clean = simplifyPolyline(points);
  if (clean.length < 2) {
    return [];
  }

  const segments: PathSegment[] = [];
  let cursor = clean[0] as Point;
  for (let index = 1; index < clean.length - 1; index += 1) {
    const previous = clean[index - 1] as Point;
    const corner = clean[index] as Point;
    const next = clean[index + 1] as Point;
    const r = Math.min(radius, distance(previous, corner) / 2, distance(corner, next) / 2);
    if (r < EPSILON) {
      segments.push({ kind: 'line', from: cursor, to: corner });
      cursor = corner;
      continue;
    }

    const enter = towards(corner, previous, r);
    const exit = towards(corner, next, r);
    segments.push({ kind: 'line', from: cursor, to: enter });
    segments.push({ kind: 'quad', from: enter, control: corner, to: exit });
    cursor = exit;
  }

  segments.push({ kind: 'line', from: cursor, to: clean[clean.length - 1] as Point });
  return segments.filter(
    (segment) => segment.kind !== 'line' || !samePoint(segment.from, segment.to),
  );
}

/**
 * Drops repeated points and the middle point of every three collinear ones.
 *
 * @param points - A polyline.
 */
export function simplifyPolyline(points: readonly Point[]): Point[] {
  const unique: Point[] = [];
  for (const point of points) {
    const last = unique[unique.length - 1];
    if (last === undefined || !samePoint(last, point)) {
      unique.push(point);
    }
  }

  const result: Point[] = [];
  for (const point of unique) {
    const a = result[result.length - 2];
    const b = result[result.length - 1];
    if (a !== undefined && b !== undefined && collinear(a, b, point)) {
      result[result.length - 1] = point;
    } else {
      result.push(point);
    }
  }

  return result;
}

/**
 * The SVG path data for segments, with coordinates rounded to two decimals.
 *
 * @param segments - The path.
 */
export function pathData(segments: readonly PathSegment[]): string {
  const first = segments[0];
  if (first === undefined) {
    return '';
  }

  const parts = [`M${format(first.from)}`];
  for (const segment of segments) {
    switch (segment.kind) {
      case 'line':
        parts.push(`L${format(segment.to)}`);
        break;
      case 'quad':
        parts.push(`Q${format(segment.control)} ${format(segment.to)}`);
        break;
      case 'cubic':
        parts.push(`C${format(segment.c1)} ${format(segment.c2)} ${format(segment.to)}`);
        break;
    }
  }

  return parts.join(' ');
}

/**
 * Points along a path every `spacing` pixels, from the start to the end (both included), each with
 * the distance travelled and the direction of travel.
 *
 * @param segments - The path.
 * @param spacing - Pixels between samples; the last gap may be shorter.
 */
export function samplePath(segments: readonly PathSegment[], spacing: number): PathSample[] {
  const dense = densePoints(segments);
  const total = dense[dense.length - 1]?.length ?? 0;
  if (dense.length < 2 || total < EPSILON) {
    return dense.slice(0, 1);
  }

  const count = Math.max(1, Math.ceil(total / spacing));
  return Array.from({ length: count + 1 }, (_, index) =>
    pointAtLength(dense, (total * index) / count),
  );
}

/**
 * The length of a path in pixels.
 *
 * @param segments - The path.
 */
export function pathLength(segments: readonly PathSegment[]): number {
  const dense = densePoints(segments);
  return dense[dense.length - 1]?.length ?? 0;
}

/**
 * The point a fraction of the way along a path.
 *
 * @param segments - The path.
 * @param fraction - 0 for the start, 1 for the end; clamped to that range.
 * @returns The point; the origin for an empty path.
 */
export function pointAlong(segments: readonly PathSegment[], fraction: number): PathSample {
  const dense = densePoints(segments);
  const total = dense[dense.length - 1]?.length ?? 0;
  return pointAtLength(dense, total * Math.min(Math.max(fraction, 0), 1));
}

/**
 * The polyline the segments trace, with curves flattened: the shape packets follow and exports draw
 * as a connector.
 *
 * @param segments - The path.
 */
export function flattenPath(segments: readonly PathSegment[]): Point[] {
  return densePoints(segments).map(({ x, y }) => ({ x: round2(x), y: round2(y) }));
}

/**
 * The same path traced from its end back to its start.
 *
 * @param segments - The path.
 */
export function reversePath(segments: readonly PathSegment[]): PathSegment[] {
  return [...segments].reverse().map((segment) => {
    switch (segment.kind) {
      case 'line':
        return { kind: 'line', from: segment.to, to: segment.from };
      case 'quad':
        return { kind: 'quad', from: segment.to, control: segment.control, to: segment.from };
      case 'cubic':
        return {
          kind: 'cubic',
          from: segment.to,
          c1: segment.c2,
          c2: segment.c1,
          to: segment.from,
        };
    }
  });
}

/**
 * The point at a distance along a measured polyline.
 *
 * @param dense - The polyline with cumulative lengths.
 * @param length - Pixels from the start.
 */
function pointAtLength(dense: readonly PathSample[], length: number): PathSample {
  const first = dense[0];
  if (first === undefined) {
    return { x: 0, y: 0, length: 0, angle: 0 };
  }

  for (let index = 1; index < dense.length; index += 1) {
    const a = dense[index - 1] as PathSample;
    const b = dense[index] as PathSample;
    if (b.length >= length - LENGTH_TOLERANCE) {
      const span = b.length - a.length;
      const t = span < LENGTH_TOLERANCE ? 0 : (length - a.length) / span;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        length,
        angle: angleOf(a, b),
      };
    }
  }

  const last = dense[dense.length - 1] as PathSample;
  return { ...last, length };
}

/**
 * Every corner of the path with curves flattened, and the distance to each.
 *
 * @param segments - The path.
 */
function densePoints(segments: readonly PathSegment[]): PathSample[] {
  const points: Point[] = [];
  for (const segment of segments) {
    if (points.length === 0) {
      points.push(segment.from);
    }

    pushAll(points, segmentPoints(segment));
  }

  const samples: PathSample[] = [];
  let travelled = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] as Point;
    const previous = points[index - 1];
    const next = points[index + 1];
    travelled += previous === undefined ? 0 : distance(previous, point);
    const angle = next === undefined ? angleOf(previous ?? point, point) : angleOf(point, next);
    samples.push({ x: point.x, y: point.y, length: travelled, angle });
  }

  return samples;
}

/**
 * The points a segment passes through after its start.
 *
 * @param segment - One segment.
 */
function segmentPoints(segment: PathSegment): Point[] {
  switch (segment.kind) {
    case 'line':
      return [segment.to];
    case 'quad':
      return range(CURVE_RESOLUTION).map((t) =>
        quadPoint(segment.from, segment.control, segment.to, t),
      );
    case 'cubic':
      return range(CURVE_RESOLUTION).map((t) =>
        cubicPoint(segment.from, segment.c1, segment.c2, segment.to, t),
      );
  }
}

/**
 * The parameters 1/n, 2/n, ..., 1.
 *
 * @param n - How many.
 */
function range(n: number): number[] {
  return Array.from({ length: n }, (_, index) => (index + 1) / n);
}

/**
 * A point on a quadratic Bézier curve.
 *
 * @param a - Start.
 * @param c - Control.
 * @param b - End.
 * @param t - The parameter, 0 to 1.
 */
function quadPoint(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

/**
 * A point on a cubic Bézier curve.
 *
 * @param a - Start.
 * @param c1 - First control.
 * @param c2 - Second control.
 * @param b - End.
 * @param t - The parameter, 0 to 1.
 */
function cubicPoint(a: Point, c1: Point, c2: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

/**
 * The point `by` pixels from `from` towards `to`.
 *
 * @param from - The start.
 * @param to - The direction.
 * @param by - The distance.
 */
function towards(from: Point, to: Point, by: number): Point {
  const length = distance(from, to);
  if (length < EPSILON) {
    return from;
  }

  return {
    x: from.x + ((to.x - from.x) * by) / length,
    y: from.y + ((to.y - from.y) * by) / length,
  };
}

/**
 * The direction from one point to another in degrees.
 *
 * @param a - From.
 * @param b - To.
 */
function angleOf(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * DEGREES_PER_HALF_TURN) / Math.PI;
}

/**
 * Whether two points are the same within {@link EPSILON}.
 *
 * @param a - A point.
 * @param b - Another point.
 */
function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

/**
 * Whether three points lie on one line.
 *
 * @param a - First.
 * @param b - Middle.
 * @param c - Last.
 */
function collinear(a: Point, b: Point, c: Point): boolean {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < EPSILON;
}

/**
 * A point as SVG path coordinates.
 *
 * @param point - The point.
 */
function format(point: Point): string {
  return `${round2(point.x)} ${round2(point.y)}`;
}
