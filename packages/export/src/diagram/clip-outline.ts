import type { DescribedBox } from '@deckster/kit/diagram-description';

import type { PathCommand, Point } from '#vector/svg-path.ts';

/**
 * The straight steps each Bézier curve of an outline is flattened into before it is clipped: enough
 * that a node's rounded corner stays smooth at slide size.
 */
const CURVE_STEPS = 12;

/**
 * Points closer than this, in canvas pixels, are the same point.
 */
const SAME_POINT_PX = 0.01;

/**
 * One side of a box, as a test of whether a point is inside it and the crossing of a segment with
 * its edge.
 */
type ClipEdge = {
  /**
   * Whether a point lies on the inner side.
   */
  inside: (point: Point) => boolean;

  /**
   * Where the segment from one point to another crosses the edge.
   */
  cross: (from: Point, to: Point) => Point;
};

/**
 * The part of a closed outline that falls inside a box, as straight-sided path commands: each
 * subpath is flattened (curves into short lines) and clipped to the box, one side at a time
 * (Sutherland-Hodgman). Exact for convex outlines, which every node shape is; a box that misses the
 * outline gives no commands. Used for a card's accent stripe, which the page clips to the node.
 *
 * @param commands - The outline, absolute commands in canvas pixels.
 * @param box - The box to keep.
 * @returns The clipped outline, closed subpaths of `M`, `L` and `Z`.
 */
export function clipOutlineToBox(
  commands: readonly PathCommand[],
  box: DescribedBox,
): PathCommand[] {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const edges: ClipEdge[] = [
    { inside: (point) => point.x >= box.x, cross: (a, b) => atX(a, b, box.x) },
    { inside: (point) => point.x <= right, cross: (a, b) => atX(a, b, right) },
    { inside: (point) => point.y >= box.y, cross: (a, b) => atY(a, b, box.y) },
    { inside: (point) => point.y <= bottom, cross: (a, b) => atY(a, b, bottom) },
  ];
  return flatten(commands).flatMap((polygon) => {
    const clipped = edges.reduce(clipPolygon, polygon);
    if (clipped.length < 3) {
      return [];
    }

    const [first, ...rest] = clipped as [Point, ...Point[]];
    return [
      { type: 'M', points: [first] },
      ...rest.map((point): PathCommand => ({ type: 'L', points: [point] })),
      { type: 'Z', points: [] },
    ];
  });
}

/**
 * An outline's subpaths as polygons, each curve flattened into {@link CURVE_STEPS} lines.
 *
 * @param commands - Absolute commands.
 */
function flatten(commands: readonly PathCommand[]): Point[][] {
  const polygons: Point[][] = [];
  let current: Point[] = [];
  for (const command of commands) {
    switch (command.type) {
      case 'M': {
        if (current.length > 0) {
          polygons.push(current);
        }

        current = [command.points[0]];
        break;
      }

      case 'L': {
        current.push(command.points[0]);
        break;
      }

      case 'C': {
        const from = current.at(-1) ?? command.points[2];
        const [c1, c2, to] = command.points;
        for (let step = 1; step <= CURVE_STEPS; step += 1) {
          current.push(cubicAt(from, c1, c2, to, step / CURVE_STEPS));
        }

        break;
      }

      case 'Z': {
        if (current.length > 0) {
          polygons.push(current);
        }

        current = [];
        break;
      }
    }
  }

  if (current.length > 0) {
    polygons.push(current);
  }

  return polygons.map(withoutRepeats);
}

/**
 * A polygon clipped to the inner side of one edge.
 *
 * @param polygon - The polygon's corners.
 * @param edge - The edge.
 */
function clipPolygon(polygon: readonly Point[], edge: ClipEdge): Point[] {
  const kept: Point[] = [];
  polygon.forEach((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length] ?? point;
    const isIn = edge.inside(point);
    const wasIn = edge.inside(previous);
    if (isIn !== wasIn) {
      kept.push(edge.cross(previous, point));
    }

    if (isIn) {
      kept.push(point);
    }
  });
  return withoutRepeats(kept);
}

/**
 * A polygon without consecutive repeated corners, its closing repeat included.
 *
 * @param polygon - The corners.
 */
function withoutRepeats(polygon: readonly Point[]): Point[] {
  const kept = polygon.filter((point, index) => {
    const previous = index === 0 ? undefined : polygon[index - 1];
    return previous === undefined || !samePoint(previous, point);
  });
  const first = kept[0];
  const last = kept.at(-1);
  if (kept.length > 1 && first !== undefined && last !== undefined && samePoint(first, last)) {
    kept.pop();
  }

  return kept;
}

/**
 * Whether two points are the same, within {@link SAME_POINT_PX}.
 *
 * @param a - A point.
 * @param b - Another.
 */
function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= SAME_POINT_PX && Math.abs(a.y - b.y) <= SAME_POINT_PX;
}

/**
 * Where a segment crosses a vertical line.
 *
 * @param a - The segment's start.
 * @param b - Its end.
 * @param x - The line.
 */
function atX(a: Point, b: Point, x: number): Point {
  const share = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
  return { x, y: a.y + (b.y - a.y) * share };
}

/**
 * Where a segment crosses a horizontal line.
 *
 * @param a - The segment's start.
 * @param b - Its end.
 * @param y - The line.
 */
function atY(a: Point, b: Point, y: number): Point {
  const share = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
  return { x: a.x + (b.x - a.x) * share, y };
}

/**
 * A point on a cubic Bézier curve.
 *
 * @param p0 - The start.
 * @param p1 - The first control point.
 * @param p2 - The second control point.
 * @param p3 - The end.
 * @param t - How far along, 0 to 1.
 */
function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}
