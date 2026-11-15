import type { SceneRect } from '#scene/scene.ts';
import type { Point } from '#vector/svg-path.ts';

/**
 * Two coordinates closer than this, in canvas pixels, are the same.
 */
const SAME_PX = 0.75;

/**
 * DrawingML guide values are fractions of 100000.
 */
const GUIDE_UNIT = 100_000;

/**
 * The largest adjust value written; a route that needs more is drawn as a freeform.
 */
const MAX_ADJUST = 5_000_000;

/**
 * A quarter turn in degrees, the only rotation a connector takes besides none.
 */
const QUARTER_TURN_DEG = 90;

/**
 * The connector presets the writer uses, by the number of corners of the route.
 */
const BENT_PRESETS = ['bentConnector2', 'bentConnector3', 'bentConnector4', 'bentConnector5'];

/**
 * A preset connector that reproduces a routed edge: its geometry, its box before rotation and the
 * flips and rotation that turn the preset's path (which leaves its top-left corner horizontally and
 * ends at its bottom-right corner) into the route.
 */
export type ConnectorGeometry = {
  /**
   * `straightConnector1` or `bentConnector2` to `bentConnector5`.
   */
  preset: string;

  /**
   * The box before rotation, in canvas pixels: `a:off` and `a:ext`.
   */
  box: SceneRect;

  /**
   * The clockwise rotation in degrees: 0 or 90.
   */
  rotation: 0 | 90;

  /**
   * Whether the preset is mirrored left to right before rotating.
   */
  flipH: boolean;

  /**
   * Whether the preset is mirrored top to bottom before rotating.
   */
  flipV: boolean;

  /**
   * The adjust values (`adj1`, `adj2`, `adj3`) in 1/100000 of the box's side.
   */
  adjust: number[];
};

/**
 * The points of a route without repeated points and with the corners of straight runs removed.
 *
 * @param points - The route's points.
 */
export function simplifyRoute(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept.at(-1);
    if (last !== undefined && near(last.x, point.x) && near(last.y, point.y)) {
      continue;
    }

    const before = kept.at(-2);
    if (before !== undefined && last !== undefined && collinear(before, last, point)) {
      kept[kept.length - 1] = point;
      continue;
    }

    kept.push(point);
  }

  return kept;
}

/**
 * The preset connector that draws a route exactly: a straight connector for two points, a bent
 * connector with its adjust values for an orthogonal route with one to four corners. Each of the
 * eight orientations (a quarter turn or none, each mirrored or not) is tried: the one in which the
 * route leaves its start horizontally towards a bottom-right end gives the preset's path.
 *
 * @param route - The route's points, from start to end.
 * @returns The geometry, or `null` when no preset draws the route (a diagonal run with corners, a
 *   U-turn, more than four corners).
 */
export function connectorGeometry(route: readonly Point[]): ConnectorGeometry | null {
  const points = simplifyRoute(route);
  const start = points[0];
  const end = points.at(-1);
  if (start === undefined || end === undefined || points.length < 2) {
    return null;
  }

  if (points.length === 2) {
    return {
      preset: 'straightConnector1',
      box: {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      },
      rotation: 0,
      flipH: end.x < start.x,
      flipV: end.y < start.y,
      adjust: [],
    };
  }

  const preset = BENT_PRESETS[points.length - 3];
  if (preset === undefined || !isOrthogonal(points)) {
    return null;
  }

  for (const orientation of orientationsToTry()) {
    const fitted = fitOrientation(points, orientation);
    if (fitted !== null) {
      return { preset, ...orientation, ...fitted };
    }
  }

  return null;
}

/**
 * An orientation of a connector.
 */
type Orientation = Pick<ConnectorGeometry, 'rotation' | 'flipH' | 'flipV'>;

/**
 * The eight orientations a connector can take, in the order they are tried: no quarter turn or one,
 * each mirrored left to right or not, and each mirrored top to bottom or not.
 */
function orientationsToTry(): Orientation[] {
  return ([0, QUARTER_TURN_DEG] as const).flatMap((rotation) =>
    [false, true].flatMap((flipH) =>
      [false, true].map((flipV) => ({ rotation, flipH, flipV }) satisfies Orientation),
    ),
  );
}

/**
 * The box and adjust values of a bent connector in one orientation, if the route has the preset's
 * shape in it.
 *
 * @param points - The simplified route, at least three points.
 * @param orientation - The rotation and flips.
 */
function fitOrientation(
  points: readonly Point[],
  orientation: Orientation,
): { box: SceneRect; adjust: number[] } | null {
  const start = points[0];
  const end = points.at(-1);
  if (start === undefined || end === undefined) {
    return null;
  }

  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const size = toLocal({ x: end.x - start.x, y: end.y - start.y }, orientation);
  if (size.x < -SAME_PX || size.y < -SAME_PX) {
    return null;
  }

  const width = Math.max(0, size.x);
  const height = Math.max(0, size.y);
  const local = points.map((point) => {
    const offset = toLocal({ x: point.x - center.x, y: point.y - center.y }, orientation);
    return { x: offset.x + width / 2, y: offset.y + height / 2 };
  });
  const adjust = presetAdjust(local, width, height);
  if (adjust === null) {
    return null;
  }

  return {
    box: { x: center.x - width / 2, y: center.y - height / 2, width, height },
    adjust,
  };
}

/**
 * The adjust values that make a bent connector's path (horizontal first, alternating, from the
 * box's top-left to its bottom-right corner) pass through the local points.
 *
 * @param local - The route in the connector's own coordinates.
 * @param width - The box's width.
 * @param height - The box's height.
 * @returns `adj1`, `adj2`, ... or `null` when the points do not have that shape.
 */
function presetAdjust(local: readonly Point[], width: number, height: number): number[] | null {
  const corners = local.slice(1, -1);
  const adjust: number[] = [];
  let previous = local[0] ?? { x: 0, y: 0 };
  for (const [index, corner] of corners.entries()) {
    const horizontal = index % 2 === 0;
    if (horizontal ? !near(corner.y, previous.y) : !near(corner.x, previous.x)) {
      return null;
    }

    const isLast = index === corners.length - 1;
    if (isLast) {
      const reachesEnd = horizontal ? near(corner.x, width) : near(corner.y, height);
      if (!reachesEnd) {
        return null;
      }
    } else {
      const side = horizontal ? width : height;
      const value = horizontal ? corner.x : corner.y;
      if (side < SAME_PX) {
        return null;
      }

      const ratio = Math.round((value / side) * GUIDE_UNIT);
      if (Math.abs(ratio) > MAX_ADJUST) {
        return null;
      }

      adjust.push(ratio);
    }

    previous = corner;
  }

  const last = local.at(-1) ?? { x: 0, y: 0 };
  const lastHorizontal = corners.length % 2 === 0;
  const lastRunOk = lastHorizontal ? near(previous.y, last.y) : near(previous.x, last.x);
  return lastRunOk && near(local[0]?.x ?? 0, 0) && near(local[0]?.y ?? 0, 0) ? adjust : null;
}

/**
 * A vector on the slide in the connector's own coordinates: the inverse rotation, then the flips
 * (DrawingML mirrors a shape in its box, then rotates it clockwise about the box's centre).
 *
 * @param vector - The vector in canvas pixels.
 * @param orientation - The rotation and flips.
 */
function toLocal(vector: Point, orientation: Orientation): Point {
  const unrotated =
    orientation.rotation === QUARTER_TURN_DEG
      ? { x: vector.y, y: -vector.x }
      : { x: vector.x, y: vector.y };
  return {
    x: orientation.flipH ? -unrotated.x : unrotated.x,
    y: orientation.flipV ? -unrotated.y : unrotated.y,
  };
}

/**
 * A connector's local point on the slide: flips, then the clockwise rotation about the box's
 * centre. The inverse of what {@link connectorGeometry} solves, for tests and checks.
 *
 * @param geometry - The connector.
 * @param point - A point in the box's own coordinates.
 */
export function connectorPointOnSlide(geometry: ConnectorGeometry, point: Point): Point {
  const { box } = geometry;
  const centered = { x: point.x - box.width / 2, y: point.y - box.height / 2 };
  const flipped = {
    x: geometry.flipH ? -centered.x : centered.x,
    y: geometry.flipV ? -centered.y : centered.y,
  };
  const rotated =
    geometry.rotation === QUARTER_TURN_DEG
      ? { x: -flipped.y, y: flipped.x }
      : { x: flipped.x, y: flipped.y };
  return { x: box.x + box.width / 2 + rotated.x, y: box.y + box.height / 2 + rotated.y };
}

/**
 * The corners of a preset connector's path in its own coordinates, from its definition in
 * `presetShapeDefinitions.xml` (ECMA-376 Part 1, §20.1.10.55, ST_ShapeType).
 *
 * @param geometry - The connector.
 */
export function connectorPathPoints(geometry: ConnectorGeometry): Point[] {
  const { width: w, height: h } = geometry.box;
  const [a1 = GUIDE_UNIT / 2, a2 = GUIDE_UNIT / 2, a3 = GUIDE_UNIT / 2] = geometry.adjust;
  const x1 = (w * a1) / GUIDE_UNIT;
  const y2 = (h * a2) / GUIDE_UNIT;
  const x3 = (w * a3) / GUIDE_UNIT;
  switch (geometry.preset) {
    case 'bentConnector2': {
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
      ];
    }

    case 'bentConnector3': {
      return [
        { x: 0, y: 0 },
        { x: x1, y: 0 },
        { x: x1, y: h },
        { x: w, y: h },
      ];
    }

    case 'bentConnector4': {
      return [
        { x: 0, y: 0 },
        { x: x1, y: 0 },
        { x: x1, y: y2 },
        { x: w, y: y2 },
        { x: w, y: h },
      ];
    }

    case 'bentConnector5': {
      return [
        { x: 0, y: 0 },
        { x: x1, y: 0 },
        { x: x1, y: y2 },
        { x: x3, y: y2 },
        { x: x3, y: h },
        { x: w, y: h },
      ];
    }

    default: {
      return [
        { x: 0, y: 0 },
        { x: w, y: h },
      ];
    }
  }
}

/**
 * Whether every run of a route is horizontal or vertical.
 *
 * @param points - The route.
 */
function isOrthogonal(points: readonly Point[]): boolean {
  return points.every((point, index) => {
    const previous = points[index - 1];
    return previous === undefined || near(previous.x, point.x) || near(previous.y, point.y);
  });
}

/**
 * Whether three points lie on one horizontal or vertical line, the middle one between the others.
 *
 * @param a - The first point.
 * @param b - The middle point.
 * @param c - The last point.
 */
function collinear(a: Point, b: Point, c: Point): boolean {
  const vertical = near(a.x, b.x) && near(b.x, c.x) && (b.y - a.y) * (c.y - b.y) >= 0;
  const horizontal = near(a.y, b.y) && near(b.y, c.y) && (b.x - a.x) * (c.x - b.x) >= 0;
  return vertical || horizontal;
}

/**
 * Whether two coordinates are the same within {@link SAME_PX}.
 *
 * @param a - A coordinate.
 * @param b - Another.
 */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= SAME_PX;
}
