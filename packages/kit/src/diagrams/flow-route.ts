import type { EdgeRoute } from '#diagrams/flow-spec.ts';

import {
  centerOf,
  EPSILON,
  inflate,
  isHorizontalSide,
  normalOf,
  pointOnSide,
  segmentCrossesRect,
  sideLength,
  type Point,
  type Rect,
  type Side,
} from '#diagrams/geometry.ts';
import { roundedPath, simplifyPolyline, type PathSegment } from '#diagrams/path-geometry.ts';
import { maxOf, minOf } from '#foundation/lists.ts';

/**
 * What a bend costs, in pixels of extra length: the router takes a detour of up to this much to
 * save a corner.
 */
const BEND_COST = 48;

/**
 * The extra cost per pixel of running along a node's clearance line rather than down the middle of
 * a gutter or straight from a port, which keeps edges centred between nodes.
 */
const HUGGING_COST = 0.12;

/**
 * How much shorter than the margin an obstacle's clearance is, in pixels, so a port's stub (one
 * margin out) always lands just outside its own node's clearance.
 */
const STUB_SLACK = 2;

/**
 * The clearance edges keep from other obstacles, such as group labels, in pixels.
 */
const LABEL_CLEARANCE = 4;

/**
 * Coordinates closer than this, in pixels, are one search line.
 */
const LINE_TOLERANCE = 0.05;

/**
 * Directions of travel: right, left, down, up.
 */
const DIRECTIONS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * How far apart two parallel edges that share a gutter line are pushed, as a share of the margin.
 */
const NUDGE_RATIO = 0.55;

/**
 * How much two nodes must overlap across an axis, as a share of the smaller one, for an edge
 * between them to run straight along the other axis.
 */
const STRAIGHT_OVERLAP_RATIO = 0.3;

/**
 * The least clearance, in pixels, however tight the nodes.
 */
const MIN_CLEARANCE = 6;

/**
 * Pixels kept back from half the gap between two nodes when that gap sets the clearance, so the
 * clearances of the two nodes never meet.
 */
const GAP_RESERVE_PX = 2;

/**
 * How far apart, in pixels, two ports across a gap may be and still count as lined up.
 */
const ALIGNED_PORT_TOLERANCE = LINE_TOLERANCE * 10;

/**
 * The share of a side's length that a port keeps away from the rounded corners of its side.
 */
const PORT_CORNER_SHARE = 0.15;

/**
 * The most pixels a port keeps away from the rounded corners of its side.
 */
const PORT_CORNER_PX = 16;

/**
 * The reach of a curved edge's handles, as a share of the distance between its ports.
 */
const CURVE_REACH_SHARE = 0.42;

/**
 * The least reach of a curved edge's handles, in pixels.
 */
const CURVE_REACH_MIN_PX = 24;

/**
 * How far a self loop reaches out from its node at least, in pixels.
 */
const MIN_LOOP_REACH = 40;

/**
 * How far from the corner a self loop leaves and enters its node at most, in pixels.
 */
const LOOP_INSET = 48;

/**
 * How far a self loop reaches out, as a multiple of the edge margin.
 */
const LOOP_REACH_PER_MARGIN = 1.6;

/**
 * The share of a node's width that a self loop's inset takes, at most {@link LOOP_INSET}.
 */
const LOOP_INSET_WIDTH_SHARE = 0.22;

/**
 * The share of a node's height that a self loop's inset takes, at most {@link LOOP_INSET}.
 */
const LOOP_INSET_HEIGHT_SHARE = 0.3;

/**
 * How far a self loop's box grows, in pixels, when it is checked against the other nodes.
 */
const LOOP_BOX_PAD_PX = 2;

/**
 * The longest step between two opposite runs that still counts as a spur, in pixels.
 */
const SPUR_STEP = 4;

/**
 * How many corners apart a spur's first and last corners are: a spur is four corners in a row.
 */
const SPUR_SPAN = 3;

/**
 * The corners a self loop can go round, best first: from the top or bottom side to the right or
 * left one.
 */
const LOOP_CORNERS: readonly (readonly ['top' | 'bottom', 'left' | 'right'])[] = [
  ['top', 'right'],
  ['bottom', 'right'],
  ['top', 'left'],
  ['bottom', 'left'],
];

/**
 * The number of directions a search step can take, which is also how many states a grid point has.
 */
const DIRECTION_COUNT = DIRECTIONS.length;

/**
 * The extra cost per pixel of running along a line another edge already uses, so edges that share
 * no node take their own corridors where there is one.
 */
const SHARED_RUN_COST = 2.5;

/**
 * How close two parallel runs may be, in pixels, before they read as one line.
 */
const SHARED_RUN_TOLERANCE = 3;

/**
 * The shortest stretch, in pixels, that two edges must share before {@link collinearOverlaps} calls
 * them one line.
 */
const COLLINEAR_MIN_PX = 12;

/**
 * How much two runs must overlap, in pixels, to be counted as sharing a stretch.
 */
const RANGE_OVERLAP_PX = 1;

/**
 * No runs.
 */
const NO_RUNS: OccupiedRuns = {
  /**
   * No horizontal runs.
   */
  horizontal: new Map(),

  /**
   * No vertical runs.
   */
  vertical: new Map(),
};

/**
 * One edge to route between two placed nodes.
 */
export type RouteRequest = {
  /**
   * The edge id.
   */
  id: string;

  /**
   * The node it starts at.
   */
  from: string;

  /**
   * The node it ends at.
   */
  to: string;

  /**
   * How it runs.
   */
  route: EdgeRoute;

  /**
   * A side of `from` the author picked.
   */
  fromSide?: Side;

  /**
   * A side of `to` the author picked.
   */
  toSide?: Side;

  /**
   * Pixels between the start and the node's border, room for an arrowhead's tip.
   */
  startGap: number;

  /**
   * Pixels between the end and the node's border.
   */
  endGap: number;
};

/**
 * A routed edge: the polyline it follows and the segments it is drawn with.
 */
export type RoutedEdge = {
  /**
   * The edge id.
   */
  id: string;

  /**
   * The corners of the path, from the start port to the end port; for a curve, its two ports.
   */
  points: Point[];

  /**
   * The path as drawn: rounded corners, or the curve.
   */
  segments: PathSegment[];

  /**
   * The side it leaves its start node by.
   */
  fromSide: Side;

  /**
   * The side it enters its end node by.
   */
  toSide: Side;
};

/**
 * Settings of the router, in diagram pixels.
 */
export type RouteOptions = {
  /**
   * The clearance edges keep from nodes they do not touch, and the length of the straight stub
   * every edge leaves and enters a node with.
   */
  margin: number;

  /**
   * The corner radius.
   */
  radius: number;

  /**
   * The most room between two ports on one side of a node.
   */
  portSpacing: number;

  /**
   * The area edges must stay inside.
   */
  bounds: Rect;

  /**
   * Sides of nodes that come to a point (a gateway's hexagon ends, a decision's corners), where
   * every edge meets the tip, by node id.
   */
  tips?: ReadonlyMap<string, ReadonlySet<Side>>;

  /**
   * Each node's grid cell, when the layout has one: diagonal edges then pick their sides from the
   * cells rather than from pixel gaps, so one diagram routes the same in every brand.
   */
  cells?: ReadonlyMap<string, { col: number; row: number }>;

  /**
   * Other boxes edges keep out of, such as group labels.
   */
  obstacles?: readonly Rect[];
};

/**
 * The end of an edge at a node: the side and the point on it.
 */
type Port = {
  /**
   * The side.
   */
  side: Side;

  /**
   * The point on the border.
   */
  point: Point;
};

/**
 * One end of an edge waiting for its port.
 */
type PortEnd = {
  /**
   * The edge id.
   */
  edge: string;

  /**
   * Which end.
   */
  end: 'from' | 'to';

  /**
   * The node it is on.
   */
  node: string;

  /**
   * The side it is on.
   */
  side: Side;

  /**
   * The node at the other end, for ordering.
   */
  other: Rect;

  /**
   * The coordinate along the side where the edge would run straight, if it can.
   */
  straight: number | undefined;
};

/**
 * The search grid: candidate x and y lines, which points on them are free, and which lines are
 * preferred.
 */
type RoutingGrid = {
  /**
   * The x lines, ascending.
   */
  xs: readonly number[];

  /**
   * The y lines, ascending.
   */
  ys: readonly number[];

  /**
   * Whether a grid point is inside an obstacle or out of bounds, by index.
   */
  blocked: readonly boolean[];

  /**
   * Whether an x line is a preferred one (a gutter middle or a port line).
   */
  preferredX: readonly boolean[];

  /**
   * Whether a y line is preferred.
   */
  preferredY: readonly boolean[];

  /**
   * Whether the move from a grid point to the next x line, or to the next y line, passes through an
   * obstacle, by the point's index; the middle of the move decides.
   */
  moves: {
    /**
     * Moves to the next x line, indexed `i * ys.length + j`.
     */
    horizontal: Uint8Array;

    /**
     * Moves to the next y line, indexed `i * (ys.length - 1) + j`.
     */
    vertical: Uint8Array;
  };

  /**
   * The index of the grid point at a position, if one is there.
   */
  index: (point: Point) => number | undefined;

  /**
   * The position of a grid point.
   */
  point: (index: number) => Point;

  /**
   * Runs of earlier edges, which a move along them pays extra for.
   */
  occupied?: OccupiedRuns;
};

/**
 * Runs of earlier edges, horizontal ones by their rounded y and vertical ones by their rounded x.
 */
type OccupiedRuns = {
  /**
   * Horizontal runs: y, and the x range.
   */
  horizontal: ReadonlyMap<number, readonly { at: number; low: number; high: number }[]>;

  /**
   * Vertical runs: x, and the y range.
   */
  vertical: ReadonlyMap<number, readonly { at: number; low: number; high: number }[]>;
};

/**
 * An inner segment of an edge that runs along one axis.
 */
type Run = {
  /**
   * The edge id.
   */
  edge: string;

  /**
   * The index of the segment's first point in the polyline.
   */
  index: number;

  /**
   * The fixed coordinate: y for a horizontal run, x for a vertical one.
   */
  at: number;

  /**
   * Where it starts along its axis.
   */
  low: number;

  /**
   * Where it ends along its axis.
   */
  high: number;

  /**
   * Where the edge ends up across the axis, so pushed-apart runs keep their order.
   */
  order: number;
};

/**
 * A straight run of an edge, for finding edges that share a line.
 */
type StraightRun = {
  /**
   * Whether it runs across rather than up and down.
   */
  horizontal: boolean;

  /**
   * Its fixed coordinate.
   */
  at: number;

  /**
   * Where it starts along its axis.
   */
  low: number;

  /**
   * Where it ends along its axis.
   */
  high: number;
};

/**
 * Routes every edge between its nodes. Orthogonal edges pick the sides that face each other (an
 * arch over or under when a node sits in the way, a Z through the gutter for a diagonal), spread
 * several edges on one side into separate ports ordered so they do not cross, keep a straight line
 * where two nodes line up, and find their way around every other node with an A* search over the
 * lines that run along node clearances and down the middle of gutters, paying for each bend. Edges
 * that share a gutter line are then pushed apart, and corners are rounded. Straight edges run
 * centre to centre, clipped at the borders; curved ones leave and enter like orthogonal ones.
 *
 * @param requests - The edges.
 * @param nodes - Every node's box, by id.
 * @param options - Margin, radius, port spacing and bounds.
 * @returns One routed edge per request whose nodes exist, in request order.
 */
export function routeEdges(
  requests: readonly RouteRequest[],
  nodes: ReadonlyMap<string, Rect>,
  options: RouteOptions,
): RoutedEdge[] {
  const usable = requests.filter((request) => nodes.has(request.from) && nodes.has(request.to));
  const linking = usable.filter((request) => request.from !== request.to);
  const sides = sidesOf(linking, nodes, options.cells);
  const fitted = { ...options, margin: clearanceFor(nodes, options.margin) };
  const ports = assignPorts(linking, sides, nodes, fitted);
  const polylines = routeLinking(linking, ports, nodes, fitted);
  separateEnds(linking, polylines, ports, nodes, fitted);
  nudgeParallel(linking, polylines, fitted);
  separateEnds(linking, polylines, ports, nodes, fitted);
  return usable.flatMap((request): RoutedEdge[] => {
    if (request.from === request.to) {
      const loop = selfLoop(request, nodes, fitted);
      return [{ ...loop, segments: roundedPath(loop.points, options.radius / 2) }];
    }

    const points = polylines.get(request.id);
    const end = ports.get(request.id);
    if (points === undefined || end === undefined) {
      return [];
    }

    return [
      {
        id: request.id,
        points,
        segments: segmentsFor(request.route, points, end, options.radius),
        fromSide: end.from.side,
        toSide: end.to.side,
      },
    ];
  });
}

/**
 * The sides an edge leaves and enters by: the author's, else the pair that faces each other. Nodes
 * that line up get the straight pair, or an arch when another node sits between them; a diagonal
 * gets a Z along the axis it covers more of.
 *
 * @param request - The edge.
 * @param nodes - Every node's box.
 */
export function chooseSides(
  request: RouteRequest,
  nodes: ReadonlyMap<string, Rect>,
  cells?: ReadonlyMap<string, { col: number; row: number }>,
  used: ReadonlySet<string> = new Set(),
): { from: Side; to: Side } {
  const a = nodes.get(request.from) as Rect;
  const b = nodes.get(request.to) as Rect;
  const picked = facingSides(a, b, nodes, request, diagonalAxis(request, a, b, cells, used));
  return { from: request.fromSide ?? picked.from, to: request.toSide ?? picked.to };
}

/**
 * Removes spurs from an orthogonal polyline: a run that goes out and comes straight back along
 * (almost) the same line, joined by a step shorter than {@link SPUR_STEP}, becomes one short jog.
 *
 * @param points - The corners.
 */
export function withoutBacktracks(points: readonly Point[]): Point[] {
  let result = [...points];
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index + SPUR_SPAN < result.length; index += 1) {
      const a = result[index] as Point;
      const b = result[index + 1] as Point;
      const c = result[index + 2] as Point;
      const d = result[index + SPUR_SPAN] as Point;
      const first = { x: b.x - a.x, y: b.y - a.y };
      const step = Math.hypot(c.x - b.x, c.y - b.y);
      const third = { x: d.x - c.x, y: d.y - c.y };
      const opposite = first.x * third.x + first.y * third.y < 0;
      const parallel = Math.abs(first.x * third.y - first.y * third.x) < EPSILON;
      if (!opposite || !parallel || step >= SPUR_STEP) {
        continue;
      }

      const joint = Math.abs(first.x) > Math.abs(first.y) ? { x: d.x, y: a.y } : { x: a.x, y: d.y };
      result = simplifyPolyline([
        ...result.slice(0, index + 1),
        joint,
        ...result.slice(index + SPUR_SPAN),
      ]);
      changed = true;
      break;
    }
  }

  return result;
}

/**
 * Pairs of edges that share no node yet run along one line for a stretch, close enough to read as
 * one line: what the router could not keep apart, for `deck lint`.
 *
 * @param edges - The routed edges.
 * @param ends - Each edge's nodes, by id.
 * @param minimum - The shortest shared stretch that counts, in pixels.
 * @returns The pairs of edge ids, each once.
 */
export function collinearOverlaps(
  edges: readonly Pick<RoutedEdge, 'id' | 'points'>[],
  ends: ReadonlyMap<string, { from: string; to: string }>,
  minimum = COLLINEAR_MIN_PX,
): [string, string][] {
  /**
   * The straight runs of an edge.
   */
  const runsOf = (points: readonly Point[]): StraightRun[] =>
    points.slice(1).flatMap((b, index): StraightRun[] => {
      const a = points[index] as Point;
      if (Math.abs(a.y - b.y) < EPSILON && Math.abs(a.x - b.x) >= EPSILON) {
        return [{ horizontal: true, at: a.y, low: Math.min(a.x, b.x), high: Math.max(a.x, b.x) }];
      }

      if (Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) >= EPSILON) {
        return [{ horizontal: false, at: a.x, low: Math.min(a.y, b.y), high: Math.max(a.y, b.y) }];
      }

      return [];
    });
  const runs = edges.map((edge) => ({ id: edge.id, runs: runsOf(edge.points) }));
  const pairs: [string, string][] = [];
  runs.forEach((first, index) => {
    for (const second of runs.slice(index + 1)) {
      const a = ends.get(first.id);
      const b = ends.get(second.id);
      if (a === undefined || b === undefined || sharesAnEnd(a, b)) {
        continue;
      }

      const shared = first.runs.some((one) =>
        second.runs.some(
          (other) =>
            one.horizontal === other.horizontal &&
            Math.abs(one.at - other.at) < SHARED_RUN_TOLERANCE &&
            Math.min(one.high, other.high) - Math.max(one.low, other.low) >= minimum,
        ),
      );
      if (shared) {
        pairs.push([first.id, second.id]);
      }
    }
  });
  return pairs;
}

/**
 * Routes each edge that has ports, in request order, so every edge searches around the runs the
 * edges before it already took.
 *
 * @param linking - The edges that join two different nodes.
 * @param ports - Each edge's ports.
 * @param nodes - Every node's box.
 * @param options - The router settings, with the fitted clearance.
 * @returns The corners of each routed edge, by id.
 */
function routeLinking(
  linking: readonly RouteRequest[],
  ports: ReadonlyMap<string, { from: Port; to: Port }>,
  nodes: ReadonlyMap<string, Rect>,
  options: RouteOptions,
): Map<string, Point[]> {
  const polylines = new Map<string, Point[]>();
  const routed: RouteRequest[] = [];
  for (const request of linking) {
    const end = ports.get(request.id);
    if (end === undefined) {
      continue;
    }

    const occupied = occupiedRuns(request, routed, polylines);
    polylines.set(request.id, polylineFor(request, end, nodes, options, occupied));
    routed.push(request);
  }

  return polylines;
}

/**
 * The clearance edges keep from nodes: the margin asked for, or less where nodes sit closer than
 * twice that, so a port's stub never starts inside the clearance of the node facing it.
 *
 * @param nodes - Every node's box.
 * @param margin - The clearance asked for.
 */
function clearanceFor(nodes: ReadonlyMap<string, Rect>, margin: number): number {
  const rects = [...nodes.values()];
  let tightest = Infinity;
  rects.forEach((a, index) => {
    for (const b of rects.slice(index + 1)) {
      const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
      const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
      const gap = Math.max(gapX, gapY);
      if (gap > 0) {
        tightest = Math.min(tightest, gap);
      }
    }
  });
  return Math.max(Math.min(margin, tightest / 2 - GAP_RESERVE_PX), MIN_CLEARANCE);
}

/**
 * Every edge's sides: the edges whose sides are clear first (lined up, or more cells apart one way
 * than the other), then the diagonals that are as many columns as rows apart, which leave by the
 * top or bottom unless one of the first edges already uses that side (diagonals share a side with
 * each other, their ports spread along it).
 *
 * @param requests - The edges.
 * @param nodes - Every node's box.
 * @param cells - Every node's cell.
 */
function sidesOf(
  requests: readonly RouteRequest[],
  nodes: ReadonlyMap<string, Rect>,
  cells: ReadonlyMap<string, { col: number; row: number }> | undefined,
): Map<string, { from: Side; to: Side }> {
  const sides = new Map<string, { from: Side; to: Side }>();
  const used = new Set<string>();
  /**
   * Records an edge's sides as used.
   */
  const record = (request: RouteRequest, picked: { from: Side; to: Side }): void => {
    sides.set(request.id, picked);
    used.add(`${request.from}|${picked.from}`);
    used.add(`${request.to}|${picked.to}`);
  };
  const tied = requests.filter((request) => isTie(request, cells));
  for (const request of requests.filter((candidate) => !tied.includes(candidate))) {
    record(request, chooseSides(request, nodes, cells));
  }

  const settled = new Set(used);
  for (const request of tied) {
    record(request, chooseSides(request, nodes, cells, settled));
  }

  return new Map(
    requests.flatMap((request) => {
      const picked = sides.get(request.id);
      return picked === undefined ? [] : [[request.id, picked] as const];
    }),
  );
}

/**
 * How many columns and rows lie between an edge's two nodes, when both have a cell.
 *
 * @param request - The edge.
 * @param cells - Every node's cell.
 */
function cellGaps(
  request: RouteRequest,
  cells: ReadonlyMap<string, { col: number; row: number }> | undefined,
): { cols: number; rows: number } | undefined {
  const a = cells?.get(request.from);
  const b = cells?.get(request.to);
  return a === undefined || b === undefined
    ? undefined
    : { cols: Math.abs(b.col - a.col), rows: Math.abs(b.row - a.row) };
}

/**
 * Whether an edge joins two cells as many columns as rows apart, with no side given.
 *
 * @param request - The edge.
 * @param cells - Every node's cell.
 */
function isTie(
  request: RouteRequest,
  cells: ReadonlyMap<string, { col: number; row: number }> | undefined,
): boolean {
  const gaps = cellGaps(request, cells);
  return (
    gaps !== undefined &&
    gaps.cols === gaps.rows &&
    gaps.cols > 0 &&
    request.fromSide === undefined &&
    request.toSide === undefined
  );
}

/**
 * Which axis a diagonal edge's Z runs along first, when the nodes have cells: across when it spans
 * more columns than rows; down when more rows; for as many of each, down unless the side it would
 * leave by already carries another edge.
 *
 * @param request - The edge.
 * @param a - The start node.
 * @param b - The end node.
 * @param cells - Every node's cell.
 * @param used - Sides other edges use, as `node|side`.
 * @returns `true` across, `false` down; `undefined` without cells.
 */
function diagonalAxis(
  request: RouteRequest,
  a: Rect,
  b: Rect,
  cells: ReadonlyMap<string, { col: number; row: number }> | undefined,
  used: ReadonlySet<string>,
): boolean | undefined {
  const gaps = cellGaps(request, cells);
  if (gaps === undefined) {
    return undefined;
  }

  if (gaps.cols !== gaps.rows) {
    return gaps.cols > gaps.rows;
  }

  const below = centerOf(b).y >= centerOf(a).y;
  const right = centerOf(b).x >= centerOf(a).x;
  const verticalTaken =
    used.has(`${request.from}|${below ? 'bottom' : 'top'}`) ||
    used.has(`${request.to}|${below ? 'top' : 'bottom'}`);
  const horizontalTaken =
    used.has(`${request.from}|${right ? 'right' : 'left'}`) &&
    used.has(`${request.to}|${right ? 'left' : 'right'}`);
  return verticalTaken && !horizontalTaken;
}

/**
 * The facing sides of two nodes, with an arch when the straight line is blocked.
 *
 * @param a - The start node.
 * @param b - The end node.
 * @param nodes - Every node, for what sits between them.
 * @param request - The edge, for its own nodes.
 * @param across - For a diagonal, whether its Z runs across first (from the cells); `undefined`
 *   compares the pixel gaps.
 */
function facingSides(
  a: Rect,
  b: Rect,
  nodes: ReadonlyMap<string, Rect>,
  request: RouteRequest,
  across: boolean | undefined,
): { from: Side; to: Side } {
  const ca = centerOf(a);
  const cb = centerOf(b);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const others = [...nodes.entries()]
    .filter(([id]) => id !== request.from && id !== request.to)
    .map(([, rect]) => rect);
  if (overlapY > STRAIGHT_OVERLAP_RATIO * Math.min(a.height, b.height)) {
    const y = (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2;
    const blocked = others.some((rect) => segmentCrossesRect({ x: ca.x, y }, { x: cb.x, y }, rect));
    if (blocked) {
      return { from: 'top', to: 'top' };
    }

    return cb.x >= ca.x ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
  }

  if (overlapX > STRAIGHT_OVERLAP_RATIO * Math.min(a.width, b.width)) {
    const x = (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2;
    const blocked = others.some((rect) => segmentCrossesRect({ x, y: ca.y }, { x, y: cb.y }, rect));
    if (blocked) {
      return { from: 'right', to: 'right' };
    }

    return cb.y >= ca.y ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
  }

  const gapX = Math.abs(cb.x - ca.x) - (a.width + b.width) / 2;
  const gapY = Math.abs(cb.y - ca.y) - (a.height + b.height) / 2;
  if (across ?? gapX >= gapY) {
    return cb.x >= ca.x ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
  }

  return cb.y >= ca.y ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
}

/**
 * The two ends of every edge that has sides, each with the node at its other end.
 *
 * @param requests - The edges.
 * @param sides - Each edge's sides.
 * @param nodes - Every node's box.
 */
function portEnds(
  requests: readonly RouteRequest[],
  sides: ReadonlyMap<string, { from: Side; to: Side }>,
  nodes: ReadonlyMap<string, Rect>,
): PortEnd[] {
  const ends: PortEnd[] = [];
  for (const request of requests) {
    const side = sides.get(request.id);
    if (side === undefined) {
      continue;
    }

    const a = nodes.get(request.from) as Rect;
    const b = nodes.get(request.to) as Rect;
    const straight = straightCoordinate(a, b, side.from, side.to);
    ends.push(
      { edge: request.id, end: 'from', node: request.from, side: side.from, other: b, straight },
      { edge: request.id, end: 'to', node: request.to, side: side.to, other: a, straight },
    );
  }

  return ends;
}

/**
 * The offset along its side of every port that has a side: the middle of the side where the node's
 * shape comes to a point, else the ports on that side spread along it.
 *
 * @param ends - Every edge end.
 * @param nodes - Every node's box.
 * @param options - The port spacing and the nodes' tips.
 * @returns The offset by `edge|end`.
 */
function spreadAllPorts(
  ends: readonly PortEnd[],
  nodes: ReadonlyMap<string, Rect>,
  options: RouteOptions,
): Map<string, number> {
  const offsets = new Map<string, number>();
  const bySide = groupBy(ends, (end) => `${end.node}|${end.side}`);
  for (const group of bySide.values()) {
    const first = group[0];
    if (first === undefined) {
      continue;
    }

    const rect = nodes.get(first.node) as Rect;
    if (options.tips?.get(first.node)?.has(first.side) === true) {
      for (const end of group) {
        offsets.set(`${end.edge}|${end.end}`, sideLength(rect, first.side) / 2);
      }

      continue;
    }

    for (const [key, offset] of spreadPorts(group, rect, options.portSpacing)) {
      offsets.set(key, offset);
    }
  }

  return offsets;
}

/**
 * Places every edge's two ports. On a side with one edge the port is centred, or lined up with the
 * node opposite so the edge runs straight; several edges on one side are spread apart, ordered by
 * where they are going, with a straight edge keeping its place.
 *
 * @param requests - The edges.
 * @param sides - Each edge's sides.
 * @param nodes - Every node's box.
 * @param options - The port spacing.
 */
function assignPorts(
  requests: readonly RouteRequest[],
  sides: ReadonlyMap<string, { from: Side; to: Side }>,
  nodes: ReadonlyMap<string, Rect>,
  options: RouteOptions,
): Map<string, { from: Port; to: Port }> {
  const offsets = spreadAllPorts(portEnds(requests, sides, nodes), nodes, options);
  const ports = new Map<string, { from: Port; to: Port }>();
  for (const request of requests) {
    const side = sides.get(request.id);
    if (side === undefined) {
      continue;
    }

    const a = nodes.get(request.from) as Rect;
    const b = nodes.get(request.to) as Rect;
    const fromOffset = offsets.get(`${request.id}|from`) ?? sideLength(a, side.from) / 2;
    const toOffset = offsets.get(`${request.id}|to`) ?? sideLength(b, side.to) / 2;
    ports.set(request.id, {
      from: { side: side.from, point: gapped(a, side.from, fromOffset, request.startGap) },
      to: { side: side.to, point: gapped(b, side.to, toOffset, request.endGap) },
    });
  }

  return ports;
}

/**
 * Where two facing sides overlap enough for a straight edge: the middle of the overlap, as a
 * coordinate along the sides' axis.
 *
 * @param a - The start node.
 * @param b - The end node.
 * @param from - The side of `a`.
 * @param to - The side of `b`.
 * @returns The x (for top and bottom sides) or y; `undefined` when the edge cannot run straight.
 */
function straightCoordinate(a: Rect, b: Rect, from: Side, to: Side): number | undefined {
  const facing =
    (from === 'right' && to === 'left') ||
    (from === 'left' && to === 'right') ||
    (from === 'top' && to === 'bottom') ||
    (from === 'bottom' && to === 'top');
  if (!facing) {
    return undefined;
  }

  const horizontal = isHorizontalSide(from);
  const start = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  const end = horizontal
    ? Math.min(a.x + a.width, b.x + b.width)
    : Math.min(a.y + a.height, b.y + b.height);
  const size = horizontal ? Math.min(a.width, b.width) : Math.min(a.height, b.height);
  return end - start > STRAIGHT_OVERLAP_RATIO * size ? (start + end) / 2 : undefined;
}

/**
 * Offsets along one side for the edges that use it.
 *
 * @param group - The edge ends on the side.
 * @param rect - The node.
 * @param spacing - The most room between two ports.
 * @returns The offset from the side's top or left end, by `edge|end`.
 */
function spreadPorts(group: readonly PortEnd[], rect: Rect, spacing: number): Map<string, number> {
  const first = group[0] as PortEnd;
  const horizontal = isHorizontalSide(first.side);
  const origin = horizontal ? rect.x : rect.y;
  const length = sideLength(rect, first.side);
  const gap = Math.min(spacing, length / (group.length + 1));
  /**
   * Where the node at the other end of an edge sits along this side's axis.
   */
  const along = (end: PortEnd): number => {
    const centre = centerOf(end.other);
    return horizontal ? centre.x : centre.y;
  };
  const sorted = [...group].sort((a, b) => along(a) - along(b));
  const result = new Map<string, number>();
  const anchorIndex = sorted.findIndex((end) => end.straight !== undefined);
  const anchor = anchorIndex === -1 ? undefined : sorted[anchorIndex];
  if (anchor?.straight !== undefined) {
    const base = anchor.straight - origin;
    sorted.forEach((end, index) => {
      result.set(`${end.edge}|${end.end}`, clampOffset(base + (index - anchorIndex) * gap, length));
    });
    return result;
  }

  sorted.forEach((end, index) => {
    const offset = length / 2 + (index - (sorted.length - 1) / 2) * gap;
    result.set(`${end.edge}|${end.end}`, clampOffset(offset, length));
  });
  return result;
}

/**
 * Keeps a port off the rounded corners of its side.
 *
 * @param offset - The offset along the side.
 * @param length - The side's length.
 */
function clampOffset(offset: number, length: number): number {
  const inset = Math.min(length * PORT_CORNER_SHARE, PORT_CORNER_PX);
  return Math.min(Math.max(offset, inset), length - inset);
}

/**
 * A port point, moved out from the border by a gap.
 *
 * @param rect - The node.
 * @param side - The side.
 * @param offset - Pixels along the side.
 * @param gap - Pixels out from the border.
 */
function gapped(rect: Rect, side: Side, offset: number, gap: number): Point {
  const point = pointOnSide(rect, side, offset);
  const normal = normalOf(side);
  return { x: point.x + normal.x * gap, y: point.y + normal.y * gap };
}

/**
 * The corners an edge passes through, from port to port.
 *
 * @param request - The edge.
 * @param end - Its ports.
 * @param nodes - Every node's box.
 * @param options - The router settings.
 */
function polylineFor(
  request: RouteRequest,
  end: { from: Port; to: Port },
  nodes: ReadonlyMap<string, Rect>,
  options: RouteOptions,
  occupied: OccupiedRuns = NO_RUNS,
): Point[] {
  if (request.route === 'straight') {
    return straightLine(nodes.get(request.from) as Rect, nodes.get(request.to) as Rect, request);
  }

  if (request.route === 'curved') {
    return [end.from.point, end.to.point];
  }

  const close = closeFacing(end.from, end.to, options.margin);
  if (close !== undefined) {
    return close;
  }

  const obstacles = [
    ...[...nodes.values()].map((rect) => inflate(rect, options.margin - STUB_SLACK)),
    ...(options.obstacles ?? []).map((rect) => inflate(rect, LABEL_CLEARANCE)),
  ];
  const found = searchRoute(end.from, end.to, obstacles, options, occupied);
  return withoutBacktracks(
    simplifyPolyline(found ?? fallbackRoute(end.from, end.to, options.margin)),
  );
}

/**
 * The route between two ports that face each other across a gap narrower than two stubs: straight
 * when they line up, else a Z whose cross run sits halfway across the gap. A full stub at each end
 * would overshoot the other's and send the search round a spur.
 *
 * @param from - The start port.
 * @param to - The end port.
 * @param margin - The stub length.
 * @returns The corners; `undefined` when the ports do not face each other closely.
 */
function closeFacing(from: Port, to: Port, margin: number): Point[] | undefined {
  const normal = normalOf(from.side);
  const back = normalOf(to.side);
  if (normal.x !== -back.x || normal.y !== -back.y) {
    return undefined;
  }

  const along = (to.point.x - from.point.x) * normal.x + (to.point.y - from.point.y) * normal.y;
  if (along <= 0 || along >= 2 * margin) {
    return undefined;
  }

  const horizontal = normal.x !== 0;
  const cross = horizontal ? to.point.y - from.point.y : to.point.x - from.point.x;
  if (Math.abs(cross) < ALIGNED_PORT_TOLERANCE) {
    return horizontal
      ? [from.point, { x: to.point.x, y: from.point.y }]
      : [from.point, { x: from.point.x, y: to.point.y }];
  }

  const middle = horizontal ? (from.point.x + to.point.x) / 2 : (from.point.y + to.point.y) / 2;
  return horizontal
    ? [from.point, { x: middle, y: from.point.y }, { x: middle, y: to.point.y }, to.point]
    : [from.point, { x: from.point.x, y: middle }, { x: to.point.x, y: middle }, to.point];
}

/**
 * A small loop on one node, for an edge from a node to itself (a retry, a poll): out of its top or
 * bottom side near a corner, round the corner and back into the side beside it, on the first corner
 * whose loop clears every other node and stays in bounds.
 *
 * @param request - The edge.
 * @param nodes - Every node's box.
 * @param options - The margin and bounds.
 */
function selfLoop(
  request: RouteRequest,
  nodes: ReadonlyMap<string, Rect>,
  options: RouteOptions,
): Omit<RoutedEdge, 'segments'> {
  const rect = nodes.get(request.from) as Rect;
  const reach = Math.max(options.margin * LOOP_REACH_PER_MARGIN, MIN_LOOP_REACH);
  const insetX = Math.min(rect.width * LOOP_INSET_WIDTH_SHARE, LOOP_INSET);
  const insetY = Math.min(rect.height * LOOP_INSET_HEIGHT_SHARE, LOOP_INSET);
  const others = [...nodes].filter(([id]) => id !== request.from).map(([, box]) => box);
  const loops = LOOP_CORNERS.map(([vertical, horizontal]) => {
    const down = vertical === 'bottom' ? 1 : -1;
    const right = horizontal === 'right' ? 1 : -1;
    const edgeY = vertical === 'bottom' ? rect.y + rect.height : rect.y;
    const edgeX = horizontal === 'right' ? rect.x + rect.width : rect.x;
    const startX = edgeX - right * insetX;
    const endY = edgeY - down * insetY;
    const points = [
      { x: startX, y: edgeY + down * request.startGap },
      { x: startX, y: edgeY + down * reach },
      { x: edgeX + right * reach, y: edgeY + down * reach },
      { x: edgeX + right * reach, y: endY },
      { x: edgeX + right * request.endGap, y: endY },
    ];
    return { points, fromSide: vertical, toSide: horizontal };
  });
  const clear = loops.find(({ points }) => {
    const box = inflate(boundsOf(points), LOOP_BOX_PAD_PX);
    return (
      !others.some((other) => intersectsRect(box, other)) &&
      box.x >= options.bounds.x &&
      box.y >= options.bounds.y &&
      box.x + box.width <= options.bounds.x + options.bounds.width &&
      box.y + box.height <= options.bounds.y + options.bounds.height
    );
  });
  const chosen = clear ?? (loops[0] as (typeof loops)[number]);
  return { id: request.id, ...chosen };
}

/**
 * The box around some points.
 *
 * @param points - Any points.
 */
function boundsOf(points: readonly Point[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = minOf(xs);
  const y = minOf(ys);
  return { x, y, width: maxOf(xs) - x, height: maxOf(ys) - y };
}

/**
 * Whether two boxes overlap by more than a hair.
 *
 * @param a - A box.
 * @param b - Another.
 */
function intersectsRect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - EPSILON &&
    b.x < a.x + a.width - EPSILON &&
    a.y < b.y + b.height - EPSILON &&
    b.y < a.y + a.height - EPSILON
  );
}

/**
 * A straight edge from centre to centre, clipped at both borders.
 *
 * @param a - The start node.
 * @param b - The end node.
 * @param request - The edge, for its gaps.
 */
function straightLine(a: Rect, b: Rect, request: RouteRequest): Point[] {
  const ca = centerOf(a);
  const cb = centerOf(b);
  return [clipToBorder(a, ca, cb, request.startGap), clipToBorder(b, cb, ca, request.endGap)];
}

/**
 * Where the line from a node's centre towards a point leaves the node, plus a gap.
 *
 * @param rect - The node.
 * @param centre - Its centre.
 * @param towards - The point the line runs to.
 * @param gap - Pixels beyond the border.
 */
function clipToBorder(rect: Rect, centre: Point, towards: Point, gap: number): Point {
  const dx = towards.x - centre.x;
  const dy = towards.y - centre.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) {
    return centre;
  }

  const scaleX = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return {
    x: centre.x + dx * scale + (dx / length) * gap,
    y: centre.y + dy * scale + (dy / length) * gap,
  };
}

/**
 * The simplest orthogonal route, used only when the search finds none (the nodes are packed too
 * tightly): out of the start, across, and into the end.
 *
 * @param from - The start port.
 * @param to - The end port.
 * @param margin - The stub length.
 */
function fallbackRoute(from: Port, to: Port, margin: number): Point[] {
  const a = stub(from, margin);
  const b = stub(to, margin);
  const corner = isHorizontalSide(from.side) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return [from.point, a, corner, b, to.point];
}

/**
 * The point a margin out from a port, where the routed part of an edge begins.
 *
 * @param port - The port.
 * @param margin - The distance.
 */
function stub(port: Port, margin: number): Point {
  const normal = normalOf(port.side);
  return { x: port.point.x + normal.x * margin, y: port.point.y + normal.y * margin };
}

/**
 * Finds the cheapest orthogonal route between two ports around the obstacles: an A* search over the
 * grid of lines that run along every obstacle's clearance, down the middle between them, and
 * straight out of both ports, where a step costs its length (a little more along a clearance line)
 * and a bend costs {@link BEND_COST}.
 *
 * @param from - The start port.
 * @param to - The end port.
 * @param obstacles - Node boxes grown by the margin.
 * @param options - The margin and bounds.
 * @param occupied - Runs of edges routed earlier that this one should not share.
 * @returns The corners from port to port; `undefined` when no route exists.
 */
function searchRoute(
  from: Port,
  to: Port,
  obstacles: readonly Rect[],
  options: RouteOptions,
  occupied: OccupiedRuns,
): Point[] | undefined {
  const start = stub(from, options.margin);
  const goal = stub(to, options.margin);
  const grid = { ...routingGrid(start, goal, obstacles, options.bounds), occupied };
  const startIndex = grid.index(start);
  const goalIndex = grid.index(goal);
  if (startIndex === undefined || goalIndex === undefined) {
    return undefined;
  }

  const startDirection = directionOf(normalOf(from.side));
  const goalDirection = directionOf(negate(normalOf(to.side)));
  const path = aStar(grid, startIndex, goalIndex, startDirection, goalDirection);
  if (path === undefined) {
    return undefined;
  }

  return [from.point, ...path.map((cell) => grid.point(cell)), to.point];
}

/**
 * Builds the search grid for one edge.
 *
 * @param start - Where the routed part starts.
 * @param goal - Where it ends.
 * @param obstacles - Node boxes grown by the margin.
 * @param bounds - The area routes stay inside.
 */
function routingGrid(
  start: Point,
  goal: Point,
  obstacles: readonly Rect[],
  bounds: Rect,
): RoutingGrid {
  /**
   * The search lines on one axis, and which of them are preferred.
   */
  const lines = (axis: 'x' | 'y'): { values: number[]; preferred: boolean[] } => {
    const low = axis === 'x' ? bounds.x : bounds.y;
    const high = axis === 'x' ? bounds.x + bounds.width : bounds.y + bounds.height;
    const edges = obstacles.flatMap((rect) =>
      axis === 'x' ? [rect.x, rect.x + rect.width] : [rect.y, rect.y + rect.height],
    );
    const sorted = unique([low, high, ...edges]);
    const middles = sorted.slice(1).map((value, index) => (value + (sorted[index] as number)) / 2);
    const ports = [start[axis], goal[axis]];
    const values = unique([...sorted, ...middles, ...ports]).filter(
      (value) => value >= low - EPSILON && value <= high + EPSILON,
    );
    const preferred = values.map(
      (value) =>
        middles.some((middle) => Math.abs(middle - value) <= LINE_TOLERANCE) ||
        ports.some((port) => Math.abs(port - value) <= LINE_TOLERANCE),
    );
    return { values, preferred };
  };
  const x = lines('x');
  const y = lines('y');
  const xs = x.values;
  const ys = y.values;
  const { blocked, moves } = blockedByObstacles(xs, ys, obstacles);
  return {
    xs,
    ys,
    blocked,
    preferredX: x.preferred,
    preferredY: y.preferred,
    moves,
    index: (point) => {
      const i = xs.findIndex((value) => Math.abs(value - point.x) <= LINE_TOLERANCE);
      const j = ys.findIndex((value) => Math.abs(value - point.y) <= LINE_TOLERANCE);
      return i === -1 || j === -1 ? undefined : i * ys.length + j;
    },
    point: (index) => ({
      x: xs[Math.floor(index / ys.length)] as number,
      y: ys[index % ys.length] as number,
    }),
  };
}

/**
 * Which grid points, and which moves between neighbouring ones, lie strictly inside an obstacle.
 * Each obstacle marks the run of lines it covers on each axis, found by binary search, so the work
 * follows the cells an obstacle covers, not every cell against every obstacle.
 *
 * @param xs - The x lines, ascending.
 * @param ys - The y lines, ascending.
 * @param obstacles - Node boxes grown by the margin.
 */
function blockedByObstacles(
  xs: readonly number[],
  ys: readonly number[],
  obstacles: readonly Rect[],
): { blocked: boolean[]; moves: RoutingGrid['moves'] } {
  const height = ys.length;
  const blocked = Array.from({ length: xs.length * height }, () => false);
  const horizontal = new Uint8Array(Math.max(xs.length - 1, 0) * height);
  const vertical = new Uint8Array(xs.length * Math.max(height - 1, 0));
  const middlesX = xs.slice(1).map((value, index) => (value + (xs[index] as number)) / 2);
  const middlesY = ys.slice(1).map((value, index) => (value + (ys[index] as number)) / 2);
  for (const rect of obstacles) {
    const insideX = coveredBy(xs, rect.x, rect.x + rect.width);
    const insideY = coveredBy(ys, rect.y, rect.y + rect.height);
    for (let i = insideX[0]; i < insideX[1]; i += 1) {
      for (let j = insideY[0]; j < insideY[1]; j += 1) {
        blocked[i * height + j] = true;
      }
    }

    const betweenX = coveredBy(middlesX, rect.x, rect.x + rect.width);
    for (let i = betweenX[0]; i < betweenX[1]; i += 1) {
      for (let j = insideY[0]; j < insideY[1]; j += 1) {
        horizontal[i * height + j] = 1;
      }
    }

    const betweenY = coveredBy(middlesY, rect.y, rect.y + rect.height);
    for (let i = insideX[0]; i < insideX[1]; i += 1) {
      for (let j = betweenY[0]; j < betweenY[1]; j += 1) {
        vertical[i * (height - 1) + j] = 1;
      }
    }
  }

  return { blocked, moves: { horizontal, vertical } };
}

/**
 * The run of ascending values strictly inside an open range, as the first index and the one after
 * the last: the values `containsPoint` calls inside along one axis.
 *
 * @param values - Ascending values.
 * @param start - Where the range starts.
 * @param end - Where it ends.
 * @returns The half-open range of indexes.
 */
function coveredBy(values: readonly number[], start: number, end: number): [number, number] {
  return [
    firstIndexWhere(values, (value) => value > start + EPSILON),
    firstIndexWhere(values, (value) => value >= end - EPSILON),
  ];
}

/**
 * The first index of ascending values where a test that turns true and stays true holds, or the
 * length when it never does.
 *
 * @param values - Ascending values.
 * @param holds - The test.
 */
function firstIndexWhere(values: readonly number[], holds: (value: number) => boolean): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (holds(values[middle] as number)) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return low;
}

/**
 * The A* search proper, over states of grid point and direction of travel.
 *
 * @param grid - The search grid.
 * @param start - The start point's index.
 * @param goal - The goal point's index.
 * @param startDirection - The direction the edge leaves its port in.
 * @param goalDirection - The direction it must enter its end port in.
 * @returns The grid points from start to goal; `undefined` when the goal cannot be reached.
 */
function aStar(
  grid: RoutingGrid,
  start: number,
  goal: number,
  startDirection: number,
  goalDirection: number,
): number[] | undefined {
  const height = grid.ys.length;
  const goalPoint = grid.point(goal);
  const cost = new Map<number, number>();
  const parent = new Map<number, number>();
  const heap = new MinHeap();
  const startState = start * DIRECTION_COUNT + startDirection;
  cost.set(startState, 0);
  heap.push(startState, manhattan(grid.point(start), goalPoint));
  while (heap.size > 0) {
    const state = heap.pop() as number;
    const point = Math.floor(state / DIRECTION_COUNT);
    const direction = state % DIRECTION_COUNT;
    const spent = cost.get(state) ?? Infinity;
    if (point === goal) {
      return unwind(parent, state).map((visited) => Math.floor(visited / DIRECTION_COUNT));
    }

    for (let next = 0; next < DIRECTIONS.length; next += 1) {
      if (isReverse(direction, next)) {
        continue;
      }

      const neighbour = step(grid, point, next, height);
      if (neighbour === undefined) {
        continue;
      }

      const bend = next === direction ? 0 : BEND_COST;
      const arrival = neighbour === goal && next !== goalDirection ? BEND_COST : 0;
      const total = spent + moveCost(grid, point, neighbour, next) + bend + arrival;
      const nextState = neighbour * DIRECTION_COUNT + next;
      if (total < (cost.get(nextState) ?? Infinity)) {
        cost.set(nextState, total);
        parent.set(nextState, state);
        heap.push(nextState, total + manhattan(grid.point(neighbour), goalPoint));
      }
    }
  }

  return undefined;
}

/**
 * The neighbouring grid point in a direction, if the move stays clear of every obstacle.
 *
 * @param grid - The search grid.
 * @param point - The current point's index.
 * @param direction - The direction.
 * @param height - The number of y lines.
 */
function step(
  grid: RoutingGrid,
  point: number,
  direction: number,
  height: number,
): number | undefined {
  const i = Math.floor(point / height);
  const j = point % height;
  const delta = DIRECTIONS[direction] as Point;
  const ni = i + delta.x;
  const nj = j + delta.y;
  const outside = ni < 0 || nj < 0 || ni >= grid.xs.length || nj >= height;
  if (outside) {
    return undefined;
  }

  const neighbour = ni * height + nj;
  if (grid.blocked[neighbour] === true) {
    return undefined;
  }

  const crossing =
    ni === i
      ? grid.moves.vertical[i * (height - 1) + Math.min(j, nj)]
      : grid.moves.horizontal[Math.min(i, ni) * height + j];
  return crossing === 1 ? undefined : neighbour;
}

/**
 * What a move between two neighbouring grid points costs: its length, a little more when it runs
 * along a clearance line instead of a preferred one.
 *
 * @param grid - The search grid.
 * @param from - The start index.
 * @param to - The end index.
 * @param direction - The direction of the move.
 */
function moveCost(grid: RoutingGrid, from: number, to: number, direction: number): number {
  const a = grid.point(from);
  const b = grid.point(to);
  const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const height = grid.ys.length;
  // Directions 0 and 1 (right and left) run along x; 2 and 3 run along y.
  const horizontal = direction < 2;
  const preferred = horizontal
    ? grid.preferredY[from % height]
    : grid.preferredX[Math.floor(from / height)];
  const shared = grid.occupied === undefined ? 0 : sharedLength(grid.occupied, a, b, horizontal);
  return length * (preferred === true ? 1 : 1 + HUGGING_COST) + shared * SHARED_RUN_COST;
}

/**
 * The runs of the edges routed so far that share no node with an edge, for its search.
 *
 * @param request - The edge about to be routed.
 * @param routed - The edges routed so far.
 * @param polylines - Their corners.
 */
function occupiedRuns(
  request: RouteRequest,
  routed: readonly RouteRequest[],
  polylines: ReadonlyMap<string, Point[]>,
): OccupiedRuns {
  const horizontal = new Map<number, { at: number; low: number; high: number }[]>();
  const vertical = new Map<number, { at: number; low: number; high: number }[]>();
  for (const other of routed) {
    if (other.from === request.from || other.to === request.to) {
      continue;
    }

    const points = polylines.get(other.id) ?? [];
    points.slice(1).forEach((b, index) => {
      const a = points[index] as Point;
      const isHorizontal = Math.abs(a.y - b.y) < EPSILON;
      const isVertical = Math.abs(a.x - b.x) < EPSILON;
      if (isHorizontal === isVertical) {
        return;
      }

      const run = isHorizontal
        ? { at: a.y, low: Math.min(a.x, b.x), high: Math.max(a.x, b.x) }
        : { at: a.x, low: Math.min(a.y, b.y), high: Math.max(a.y, b.y) };
      const target = isHorizontal ? horizontal : vertical;
      const key = Math.round(run.at);
      const bucket = target.get(key);
      if (bucket === undefined) {
        target.set(key, [run]);
      } else {
        bucket.push(run);
      }
    });
  }

  return { horizontal, vertical };
}

/**
 * How much of a move runs along (or within a few pixels of) an occupied run.
 *
 * @param occupied - The runs of other edges.
 * @param a - The move's start.
 * @param b - Its end.
 * @param horizontal - Whether it is horizontal.
 */
function sharedLength(occupied: OccupiedRuns, a: Point, b: Point, horizontal: boolean): number {
  const at = horizontal ? a.y : a.x;
  const low = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
  const high = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  const runs = horizontal ? occupied.horizontal : occupied.vertical;
  let shared = 0;
  for (
    let key = Math.round(at) - SHARED_RUN_TOLERANCE;
    key <= Math.round(at) + SHARED_RUN_TOLERANCE;
    key += 1
  ) {
    for (const run of runs.get(key) ?? []) {
      if (Math.abs(run.at - at) <= SHARED_RUN_TOLERANCE) {
        shared += Math.max(Math.min(high, run.high) - Math.max(low, run.low), 0);
      }
    }
  }

  return shared;
}

/**
 * Moves a port where an edge's first or last run lies on another edge's line (two nodes in one
 * column, an edge leaving the upper one and another entering the lower one at the same place): the
 * later edge's port slides along its side by half the port spacing, and the edge is routed again,
 * when that clears the overlap.
 *
 * @param requests - The edges, in routing order.
 * @param polylines - Their corners, changed in place.
 * @param ports - Their ports, changed in place.
 * @param nodes - Every node's box.
 * @param options - The router settings.
 */
function separateEnds(
  requests: readonly RouteRequest[],
  polylines: Map<string, Point[]>,
  ports: Map<string, { from: Port; to: Port }>,
  nodes: ReadonlyMap<string, Rect>,
  options: RouteOptions,
): void {
  const ends = new Map(requests.map((request) => [request.id, request]));
  /**
   * The pairs of edges that still share a line.
   */
  const overlapping = (): [string, string][] =>
    collinearOverlaps(
      requests.flatMap((request) => {
        const points = polylines.get(request.id);
        return points === undefined || request.route !== 'orthogonal'
          ? []
          : [{ id: request.id, points }];
      }),
      ends,
    );
  for (const [first, second] of overlapping()) {
    const request = ends.get(second);
    const end = ports.get(second);
    const other = polylines.get(first);
    if (request === undefined || end === undefined || other === undefined) {
      continue;
    }

    const occupied = occupiedRuns(
      request,
      requests.filter((candidate) => candidate.id !== second),
      polylines,
    );
    const moved = shiftedPorts(request, end, nodes, options.portSpacing / 2).find((candidate) => {
      const points = polylineFor(request, candidate, nodes, options, occupied);
      const clear =
        collinearOverlaps(
          [
            { id: first, points: other },
            { id: second, points },
          ],
          ends,
        ).length === 0;
      if (clear) {
        polylines.set(second, points);
      }

      return clear;
    });
    if (moved !== undefined) {
      ports.set(second, moved);
    }
  }
}

/**
 * An edge's ports with one end slid along its side, each way, for {@link separateEnds}.
 *
 * @param request - The edge.
 * @param end - Its ports.
 * @param nodes - Every node's box.
 * @param by - How far to slide, in pixels.
 */
function shiftedPorts(
  request: RouteRequest,
  end: { from: Port; to: Port },
  nodes: ReadonlyMap<string, Rect>,
  by: number,
): { from: Port; to: Port }[] {
  const candidates: { from: Port; to: Port }[] = [];
  for (const which of ['to', 'from'] as const) {
    const port = end[which];
    const rect = nodes.get(which === 'to' ? request.to : request.from);
    if (rect === undefined) {
      continue;
    }

    for (const sign of [1, -1]) {
      const horizontal = isHorizontalSide(port.side);
      const point = horizontal
        ? { x: port.point.x + sign * by, y: port.point.y }
        : { x: port.point.x, y: port.point.y + sign * by };
      const along = horizontal ? point.x - rect.x : point.y - rect.y;
      const length = sideLength(rect, port.side);
      if (along !== clampOffset(along, length)) {
        continue;
      }

      candidates.push({ ...end, [which]: { side: port.side, point } });
    }
  }

  return candidates;
}

/**
 * Pushes apart edges that run along the same gutter line for a stretch, so each stays readable.
 * Only inner segments move; the stubs at the ports stay where they are.
 *
 * @param requests - The edges, in order.
 * @param polylines - Their corners, changed in place.
 * @param options - The margin, which sets the spacing.
 */
function nudgeParallel(
  requests: readonly RouteRequest[],
  polylines: Map<string, Point[]>,
  options: RouteOptions,
): void {
  const spacing = options.margin * NUDGE_RATIO;
  const ends = new Map(requests.map((request) => [request.id, request]));
  for (const axis of ['x', 'y'] as const) {
    const runs = innerRuns(requests, polylines, axis);
    const groups = groupBy(runs, (run) => String(Math.round(run.at)));
    for (const group of groups.values()) {
      const overlapping = group.filter((run) =>
        group.some((other) => sharesNoEnd(run, other, ends) && rangesOverlap(run, other)),
      );
      if (overlapping.length < 2) {
        continue;
      }

      const sorted = [...overlapping].sort((a, b) => a.order - b.order);
      sorted.forEach((run, index) => {
        const shift = (index - (sorted.length - 1) / 2) * spacing;
        const points = polylines.get(run.edge);
        const a = points?.[run.index];
        const b = points?.[run.index + 1];
        if (points === undefined || a === undefined || b === undefined) {
          return;
        }

        points[run.index] = axis === 'y' ? { x: a.x, y: a.y + shift } : { x: a.x + shift, y: a.y };
        points[run.index + 1] =
          axis === 'y' ? { x: b.x, y: b.y + shift } : { x: b.x + shift, y: b.y };
      });
    }
  }
}

/**
 * The inner horizontal (`y`) or vertical (`x`) segments of every edge.
 *
 * @param requests - The edges.
 * @param polylines - Their corners.
 * @param axis - `y` for horizontal runs, `x` for vertical ones.
 */
function innerRuns(
  requests: readonly RouteRequest[],
  polylines: ReadonlyMap<string, Point[]>,
  axis: 'x' | 'y',
): Run[] {
  const runs: Run[] = [];
  for (const request of requests) {
    const points = polylines.get(request.id) ?? [];
    const last = points[points.length - 1];
    for (let index = 1; index < points.length - 2; index += 1) {
      const a = points[index] as Point;
      const b = points[index + 1] as Point;
      const along = axis === 'y' ? 'x' : 'y';
      if (Math.abs(a[axis] - b[axis]) > EPSILON || last === undefined) {
        continue;
      }

      runs.push({
        edge: request.id,
        index,
        at: a[axis],
        low: Math.min(a[along], b[along]),
        high: Math.max(a[along], b[along]),
        order: last[axis],
      });
    }
  }

  return runs;
}

/**
 * Whether two runs belong to edges with no node in common at the same end. Edges that leave one
 * node (or reach one node) may share a line: that is a bus, drawn as one trunk.
 *
 * @param a - A run.
 * @param b - Another run.
 * @param ends - Every edge's ends, by id.
 */
function sharesNoEnd(a: Run, b: Run, ends: ReadonlyMap<string, RouteRequest>): boolean {
  const first = ends.get(a.edge);
  const second = ends.get(b.edge);
  return (
    a.edge !== b.edge &&
    first !== undefined &&
    second !== undefined &&
    first.from !== second.from &&
    first.to !== second.to
  );
}

/**
 * Whether two runs on one line share a stretch longer than a pixel.
 *
 * @param a - A run.
 * @param b - Another run.
 */
function rangesOverlap(a: Run, b: Run): boolean {
  return Math.min(a.high, b.high) - Math.max(a.low, b.low) > RANGE_OVERLAP_PX;
}

/**
 * The segments an edge is drawn with: rounded corners for an orthogonal or straight edge, a cubic
 * curve that leaves and enters along the side normals for a curved one.
 *
 * @param route - The edge's route.
 * @param points - Its corners.
 * @param end - Its ports.
 * @param radius - The corner radius.
 */
function segmentsFor(
  route: EdgeRoute,
  points: readonly Point[],
  end: { from: Port; to: Port },
  radius: number,
): PathSegment[] {
  if (route !== 'curved') {
    return roundedPath(points, route === 'straight' ? 0 : radius);
  }

  const a = end.from.point;
  const b = end.to.point;
  const reach = Math.max(Math.hypot(b.x - a.x, b.y - a.y) * CURVE_REACH_SHARE, CURVE_REACH_MIN_PX);
  const na = normalOf(end.from.side);
  const nb = normalOf(end.to.side);
  return [
    {
      kind: 'cubic',
      from: a,
      c1: { x: a.x + na.x * reach, y: a.y + na.y * reach },
      c2: { x: b.x + nb.x * reach, y: b.y + nb.y * reach },
      to: b,
    },
  ];
}

/**
 * The index of a direction in {@link DIRECTIONS}.
 *
 * @param vector - A unit vector along an axis.
 */
function directionOf(vector: Point): number {
  return DIRECTIONS.findIndex((direction) => direction.x === vector.x && direction.y === vector.y);
}

/**
 * A vector pointing the other way. A zero component comes out as plain zero, not negative zero.
 *
 * @param vector - Any vector.
 */
function negate(vector: Point): Point {
  return { x: -vector.x || 0, y: -vector.y || 0 };
}

/**
 * Whether two directions are opposite.
 *
 * @param a - A direction index.
 * @param b - Another.
 */
function isReverse(a: number, b: number): boolean {
  return (a ^ 1) === b;
}

/**
 * The taxicab distance between two points, the search's estimate of what is left.
 *
 * @param a - A point.
 * @param b - Another point.
 */
function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * The states from the start to a state, following the parents back.
 *
 * @param parent - Each state's predecessor.
 * @param state - The last state.
 */
function unwind(parent: ReadonlyMap<number, number>, state: number): number[] {
  const states = [state];
  let current = parent.get(state);
  while (current !== undefined) {
    states.push(current);
    current = parent.get(current);
  }

  return states.reverse();
}

/**
 * Items grouped by a key, in first-seen order.
 *
 * @param items - Any items.
 * @param key - The group of an item.
 */
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item);
    const group = groups.get(name);
    if (group === undefined) {
      groups.set(name, [item]);
    } else {
      group.push(item);
    }
  }

  return groups;
}

/**
 * Sorted values with near-duplicates removed.
 *
 * @param values - Any numbers.
 */
function unique(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter(
    (value, index) => index === 0 || value - (sorted[index - 1] as number) > LINE_TOLERANCE,
  );
}

/**
 * A binary min-heap of numbers by priority, for the search's open set.
 */
class MinHeap {
  /**
   * The entries as `[priority, value]`, heap-ordered.
   */
  private readonly items: [number, number][] = [];

  /**
   * How many entries the heap holds.
   */
  get size(): number {
    return this.items.length;
  }

  /**
   * Adds a value with a priority.
   *
   * @param value - The value.
   * @param priority - Lower comes out first.
   */
  push(value: number, priority: number): void {
    const items = this.items;
    items.push([priority, value]);
    let index = items.length - 1;
    while (index > 0) {
      const up = (index - 1) >> 1;
      if ((items[up] as [number, number])[0] <= priority) {
        break;
      }

      [items[up], items[index]] = [items[index] as [number, number], items[up] as [number, number]];
      index = up;
    }
  }

  /**
   * Removes and returns the value with the lowest priority.
   *
   * @returns The value; `undefined` when the heap is empty.
   */
  pop(): number | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (top === undefined || last === undefined) {
      return undefined;
    }

    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (
          left < items.length &&
          (items[left] as [number, number])[0] < (items[smallest] as [number, number])[0]
        ) {
          smallest = left;
        }

        if (
          right < items.length &&
          (items[right] as [number, number])[0] < (items[smallest] as [number, number])[0]
        ) {
          smallest = right;
        }

        if (smallest === index) {
          break;
        }

        [items[smallest], items[index]] = [
          items[index] as [number, number],
          items[smallest] as [number, number],
        ];
        index = smallest;
      }
    }

    return top[1];
  }
}

/**
 * Whether two edges run between the same nodes at one end: they start at the same node, end at the
 * same node, or one runs back the way the other does.
 *
 * @param a - An edge's ends.
 * @param b - Another edge's ends.
 */
function sharesAnEnd(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
  return a.from === b.from || a.to === b.to || (a.from === b.to && a.to === b.from);
}
