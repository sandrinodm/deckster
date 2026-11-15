import { describe, expect, it } from 'vite-plus/test';

import type { Point, Rect } from '#diagrams/geometry.ts';

import {
  collinearOverlaps,
  routeEdges as routeAll,
  withoutBacktracks,
  type RoutedEdge,
  type RouteOptions,
  type RouteRequest,
} from '#diagrams/flow-route.ts';
import { segmentCrossesRect } from '#diagrams/geometry.ts';

/**
 * Router settings for the tests.
 */
const OPTIONS = {
  margin: 24,
  radius: 20,
  portSpacing: 24,
  bounds: { x: 0, y: 0, width: 1600, height: 700 },
};

/**
 * A node box on a 320x200 grid.
 *
 * @param col - The column, from 1.
 * @param row - The row, from 1.
 */
function box(col: number, row: number): Rect {
  return { x: (col - 1) * 320 + 40, y: (row - 1) * 220 + 60, width: 240, height: 100 };
}

/**
 * An orthogonal edge request.
 *
 * @param from - The start node.
 * @param to - The end node.
 */
function request(from: string, to: string): RouteRequest {
  return { id: `${from}->${to}`, from, to, route: 'orthogonal', startGap: 0, endGap: 3 };
}

/**
 * Whether any run of a polyline passes through a box.
 *
 * @param points - The polyline.
 * @param rect - The box.
 */
function crosses(points: readonly Point[], rect: Rect): boolean {
  return points
    .slice(1)
    .some((point, index) => segmentCrossesRect(points[index] as Point, point, rect));
}

/**
 * Routes edges and checks the property every route keeps: no run doubles back along a line another
 * run of the same edge already took (a spur).
 *
 * @param requests - The edges.
 * @param nodes - The node boxes.
 * @param options - The router settings.
 */
function routeEdges(
  requests: readonly RouteRequest[],
  nodes: ReadonlyMap<string, Rect>,
  options: RouteOptions,
): RoutedEdge[] {
  const routed = routeAll(requests, nodes, options);
  for (const edge of routed) {
    expect(backtracks(edge.points), `${edge.id} doubles back`).toEqual([]);
  }

  return routed;
}

/**
 * The pairs of runs of a polyline that run opposite ways along (nearly) one line and overlap.
 *
 * @param points - The polyline.
 */
function backtracks(points: readonly Point[]): string[] {
  const runs = points.slice(1).map((point, index) => ({ a: points[index] as Point, b: point }));
  const found: string[] = [];
  runs.forEach((first, i) => {
    runs.slice(i + 1).forEach((second, offset) => {
      const j = i + 1 + offset;
      const horizontal = (run: typeof first): boolean => Math.abs(run.a.y - run.b.y) < 0.5;
      if (horizontal(first) !== horizontal(second)) {
        return;
      }

      const axis = horizontal(first) ? 'x' : 'y';
      const across = horizontal(first) ? 'y' : 'x';
      const d1 = first.b[axis] - first.a[axis];
      const d2 = second.b[axis] - second.a[axis];
      const overlap =
        Math.min(Math.max(first.a[axis], first.b[axis]), Math.max(second.a[axis], second.b[axis])) -
        Math.max(Math.min(first.a[axis], first.b[axis]), Math.min(second.a[axis], second.b[axis]));
      if (d1 * d2 < 0 && Math.abs(first.a[across] - second.a[across]) < 4 && overlap > 1) {
        found.push(`${i}/${j}`);
      }
    });
  });
  return found;
}

describe('routeEdges', () => {
  it('runs a straight line between two nodes in one row', () => {
    const nodes = new Map([
      ['a', box(1, 1)],
      ['b', box(2, 1)],
    ]);
    const [edge] = routeEdges([request('a', 'b')], nodes, OPTIONS);
    expect(edge?.fromSide).toBe('right');
    expect(edge?.toSide).toBe('left');
    expect(new Set(edge?.points.map((point) => point.y)).size).toBe(1);
  });

  it('arches over a node that sits between two nodes of one row', () => {
    const nodes = new Map([
      ['a', box(1, 2)],
      ['middle', box(2, 2)],
      ['c', box(3, 2)],
    ]);
    const [edge] = routeEdges([request('a', 'c')], nodes, OPTIONS);
    expect(edge?.fromSide).toBe('top');
    expect(crosses(edge?.points ?? [], nodes.get('middle') as Rect)).toBe(false);
  });

  it('never crosses a node body on a grid, whatever the pair', () => {
    const nodes = new Map<string, Rect>();
    for (let col = 1; col <= 4; col += 1) {
      for (let row = 1; row <= 3; row += 1) {
        nodes.set(`n${col}${row}`, box(col, row));
      }
    }

    const requests = [
      request('n11', 'n43'),
      request('n13', 'n41'),
      request('n21', 'n23'),
      request('n12', 'n42'),
      request('n31', 'n13'),
    ];
    for (const edge of routeEdges(requests, nodes, OPTIONS)) {
      const [from, to] = edge.id.split('->');
      const crossed = [...nodes]
        .filter(([id, rect]) => id !== from && id !== to && crosses(edge.points, rect))
        .map(([id]) => id);
      expect(crossed, edge.id).toEqual([]);

      expect(
        edge.points.slice(1).every((point, index) => {
          const previous = edge.points[index] as Point;
          return Math.abs(previous.x - point.x) < 0.5 || Math.abs(previous.y - point.y) < 0.5;
        }),
      ).toBe(true);
    }
  });

  it('spreads two edges on one side into separate ports ordered by where they go', () => {
    const nodes = new Map([
      ['hub', box(1, 2)],
      ['up', box(3, 1)],
      ['down', box(3, 3)],
    ]);
    const [up, down] = routeEdges([request('hub', 'up'), request('hub', 'down')], nodes, OPTIONS);
    expect(up?.fromSide).toBe('right');
    expect(down?.fromSide).toBe('right');
    expect(up?.points[0]?.y).toBeLessThan(down?.points[0]?.y ?? 0);
  });

  it('rounds corners and ends at the gap before the target', () => {
    const nodes = new Map([
      ['a', box(1, 1)],
      ['b', box(2, 2)],
    ]);
    const [edge] = routeEdges([request('a', 'b')], nodes, OPTIONS);
    expect(edge?.segments.some((segment) => segment.kind === 'quad')).toBe(true);
    const last = edge?.points[edge.points.length - 1];
    const target = nodes.get('b') as Rect;
    expect(edge?.toSide).toBe('top');
    expect(last?.y).toBeCloseTo(target.y - 3);
  });

  it('draws a curved edge as one cubic and a straight one as a line', () => {
    const nodes = new Map([
      ['a', box(1, 1)],
      ['b', box(3, 2)],
    ]);
    const [curved, straight] = routeEdges(
      [
        { ...request('a', 'b'), route: 'curved' },
        { ...request('a', 'b'), id: 'straight', route: 'straight' },
      ],
      nodes,
      OPTIONS,
    );
    expect(curved?.segments.map((segment) => segment.kind)).toEqual(['cubic']);
    expect(straight?.segments.map((segment) => segment.kind)).toEqual(['line']);
  });

  it('joins facing ports closer than two stubs without a spur', () => {
    const nodes = new Map([
      ['model', { x: 800, y: 400, width: 320, height: 90 }],
      ['agent', { x: 800, y: 552, width: 320, height: 90 }],
    ]);
    const options = { ...OPTIONS, margin: 40 };
    const [edge] = routeEdges(
      [{ id: 'up', from: 'agent', to: 'model', route: 'orthogonal', startGap: 3, endGap: 3 }],
      nodes,
      options,
    );
    expect(edge?.fromSide).toBe('top');
    expect(edge?.toSide).toBe('bottom');
    expect(edge?.points).toHaveLength(2);
    expect(Math.max(...(edge?.points ?? []).map((point) => point.x))).toBeLessThan(1120);
  });

  it('joins facing ports that do not line up with a Z halfway across the gap', () => {
    const nodes = new Map([
      ['a', { x: 100, y: 100, width: 200, height: 80 }],
      ['b', { x: 290, y: 230, width: 300, height: 80 }],
    ]);
    const [edge] = routeEdges(
      [{ ...request('a', 'b'), toSide: 'top', fromSide: 'bottom' }],
      nodes,
      { ...OPTIONS, margin: 40 },
    );
    const ys = new Set(edge?.points.map((point) => Math.round(point.y)));
    expect(ys.size).toBe(3);
    expect(edge?.points).toHaveLength(4);
  });

  it('removes a spur that turns back along its own line', () => {
    expect(
      withoutBacktracks([
        { x: 960, y: 639.55 },
        { x: 960, y: 608.15 },
        { x: 1157.4, y: 608.15 },
        { x: 1157.4, y: 608.65 },
        { x: 960, y: 608.65 },
        { x: 960, y: 577.25 },
      ]),
    ).toEqual([
      { x: 960, y: 639.55 },
      { x: 960, y: 577.25 },
    ]);
  });

  it('sends crossing edges that share no node down separate corridors', () => {
    const nodes = new Map([
      ['a', box(1, 1)],
      ['b', box(3, 1)],
      ['c', box(1, 3)],
      ['d', box(3, 3)],
    ]);
    const routed = routeEdges([request('a', 'd'), request('b', 'c')], nodes, OPTIONS);
    const [ad, bc] = routed;
    const runs = (edge: RoutedEdge | undefined): { y: number; low: number; high: number }[] =>
      (edge?.points ?? []).slice(1).flatMap((point, index) => {
        const previous = edge?.points[index] as Point;
        return Math.abs(previous.y - point.y) < 0.5
          ? [
              {
                y: point.y,
                low: Math.min(previous.x, point.x),
                high: Math.max(previous.x, point.x),
              },
            ]
          : [];
      });
    const shared = runs(ad).some((first) =>
      runs(bc).some(
        (second) =>
          Math.abs(first.y - second.y) < 3 &&
          Math.min(first.high, second.high) - Math.max(first.low, second.low) > 8,
      ),
    );
    expect(shared).toBe(false);
  });

  it('routes the same sides for the same cells whatever the node sizes', () => {
    const cells = new Map([
      ['orders', { col: 4, row: 1 }],
      ['cache', { col: 3, row: 2 }],
    ]);
    const wide = new Map([
      ['orders', { x: 1000, y: 60, width: 300, height: 140 }],
      ['cache', { x: 640, y: 330, width: 300, height: 140 }],
    ]);
    const narrow = new Map([
      ['orders', { x: 1060, y: 60, width: 170, height: 170 }],
      ['cache', { x: 700, y: 330, width: 170, height: 170 }],
    ]);
    const [a] = routeEdges([request('orders', 'cache')], wide, { ...OPTIONS, cells });
    const [b] = routeEdges([request('orders', 'cache')], narrow, { ...OPTIONS, cells });
    expect([a?.fromSide, a?.toSide]).toEqual(['bottom', 'top']);
    expect([b?.fromSide, b?.toSide]).toEqual(['bottom', 'top']);
  });

  it('draws an edge from a node to itself as a small loop round a free corner', () => {
    const nodes = new Map([
      ['worker', box(1, 1)],
      ['right', box(2, 1)],
    ]);
    const [loop] = routeEdges([request('worker', 'worker')], nodes, OPTIONS);
    const worker = nodes.get('worker') as Rect;
    expect(loop?.points.length).toBe(5);
    expect(loop?.fromSide).toBe('top');
    expect(loop?.toSide).toBe('right');
    expect(loop?.points[0]?.y).toBeCloseTo(worker.y);
    expect(crosses(loop?.points ?? [], nodes.get('right') as Rect)).toBe(false);
    expect(loop?.segments.length).toBeGreaterThan(3);
  });

  it('sends a one-by-one diagonal out of the bottom unless an aligned edge holds that side', () => {
    const cells = new Map([
      ['model', { col: 2, row: 1 }],
      ['agent', { col: 2, row: 2 }],
      ['tracking', { col: 3, row: 1 }],
      ['kb', { col: 3, row: 3 }],
    ]);
    const nodes = new Map([
      ['model', box(2, 1)],
      ['agent', box(2, 2)],
      ['tracking', box(3, 1)],
      ['kb', box(3, 3)],
    ]);
    const [, up, down] = routeEdges(
      [request('agent', 'model'), request('agent', 'tracking'), request('agent', 'kb')],
      nodes,
      { ...OPTIONS, cells },
    );
    expect([up?.fromSide, up?.toSide]).toEqual(['right', 'left']);
    expect([down?.fromSide, down?.toSide]).toEqual(['bottom', 'top']);
  });

  it('lets two diagonals share the bottom of the node they leave', () => {
    const cells = new Map([
      ['orders', { col: 2, row: 1 }],
      ['cache', { col: 1, row: 2 }],
      ['queue', { col: 3, row: 2 }],
    ]);
    const nodes = new Map([
      ['orders', box(2, 1)],
      ['cache', box(1, 2)],
      ['queue', box(3, 2)],
    ]);
    const routed = routeEdges([request('orders', 'cache'), request('orders', 'queue')], nodes, {
      ...OPTIONS,
      cells,
    });
    expect(routed.map((edge) => edge.fromSide)).toEqual(['bottom', 'bottom']);
  });

  it('slides a port so an edge entering a node does not run down another edge leaving the node above', () => {
    const rect = (x: number, y: number, height = 80): Rect => ({ x, y, width: 310.62, height });
    const nodes = new Map([
      ['a', rect(0, 58.83)],
      ['b', rect(902.25, 58.83)],
      ['middle', rect(451.13, 256.5, 97)],
      ['archive', rect(1353.38, 256.5, 97)],
      ['c', rect(0, 471.17)],
      ['d', rect(902.25, 471.17)],
    ]);
    const cells = new Map([
      ['a', { col: 1, row: 1 }],
      ['b', { col: 3, row: 1 }],
      ['middle', { col: 2, row: 2 }],
      ['archive', { col: 4, row: 2 }],
      ['c', { col: 1, row: 3 }],
      ['d', { col: 3, row: 3 }],
    ]);
    const requests = [
      request('a', 'b'),
      request('b', 'a'),
      request('a', 'd'),
      request('b', 'c'),
      request('a', 'c'),
      { ...request('a', 'c'), id: 'again' },
      { ...request('c', 'd'), startGap: 3 },
    ];
    const routed = routeEdges(requests, nodes, {
      ...OPTIONS,
      bounds: { x: 0, y: 0, width: 1664, height: 610 },
      cells,
    });
    const ends = new Map(requests.map((candidate) => [candidate.id, candidate]));
    expect(collinearOverlaps(routed, ends)).toEqual([]);
  });
});
