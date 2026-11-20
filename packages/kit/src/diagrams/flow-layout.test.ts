import { describe, expect, it } from 'vite-plus/test';

import { type DiagramAlign, preferredNodeWidths } from '#diagrams/diagram-design.ts';
import { FALLBACK } from '#diagrams/diagram-tokens.ts';
import { layoutFlow, tipsOf } from '#diagrams/flow-layout.ts';
import { buildFlowSpec } from '#diagrams/flow-spec-builder.ts';
import { part } from '#diagrams/flow.fixture.ts';
import { flowMetrics } from '#diagrams/flow.tsx';

/**
 * A gateway (a hexagon) and a decision (a diamond).
 */
const SPEC = buildFlowSpec([
  part('Node', { id: 'gw', kind: 'gateway', col: 1, row: 1 }),
  part('Node', { id: 'pick', kind: 'decision', col: 2, row: 1 }),
]);

describe('tipsOf', () => {
  it("routes edges to the points of a kind's pointed shape", () => {
    expect(tipsOf(SPEC)).toEqual(
      new Map([
        ['gw', new Set(['left', 'right'])],
        ['pick', new Set(['top', 'right', 'bottom', 'left'])],
      ]),
    );
  });

  it('routes a node whose card draws it as a box or a pill like any box', () => {
    const shapes = new Map([
      ['gw', 'card'],
      ['pick', 'pill'],
    ] as const);
    expect(tipsOf(SPEC, shapes)).toEqual(new Map());
  });
});

describe('flow design geometry', () => {
  it('keeps the intrinsic width of a sibling when only one node chooses a size', () => {
    const widths = preferredNodeWidths(
      [{ id: 'wide', width: 600 }, { id: 'usual' }, { id: 'spanning', cell: { colSpan: 2 } }],
      0,
      336,
    );
    expect(widths).toEqual(
      new Map([
        ['wide', 600],
        ['usual', 336],
      ]),
    );
  });

  it('positions different preferred widths and moves the label and routed connector with the nodes', () => {
    const spec = buildFlowSpec([
      part('Node', { id: 'booking', col: 1, row: 1 }),
      part('Node', { id: 'dispatch', width: 240, height: 120, col: 2, row: 1 }),
      part('Edge', { id: 'parcel', from: 'booking', to: 'dispatch', label: 'Parcel ready' }),
    ]);
    const tokens = { ...FALLBACK, node: { width: 200, height: 80 } };
    const place = (align: DiagramAlign) =>
      layoutFlow({
        spec,
        size: { width: 1600, height: 600 },
        metrics: flowMetrics(tokens, spec, undefined, align),
        route: { margin: 24, radius: 12, portSpacing: 24, arrowGap: 3 },
        nodeWidths: preferredNodeWidths(spec.nodes, tokens.node.width, 336),
        nodeHeights: new Map([
          ['booking', 80],
          ['dispatch', 120],
        ]),
        labels: new Map([['parcel', { width: 120, height: 25 }]]),
        groupLabels: new Map(),
      });
    const left = place('left');
    const center = place('center');
    const right = place('right');
    expect(left.nodes.get('booking')).toMatchObject({ x: 0, width: 200, height: 120 });
    expect(left.nodes.get('dispatch')).toMatchObject({ width: 240, height: 120 });
    const shift = right.nodes.get('booking')?.x ?? 0;
    expect(shift).toBeGreaterThan(900);
    expect(center.nodes.get('booking')?.x).toBeCloseTo(shift / 2);
    expect(right.edges.get('parcel')?.points[0]?.x).toBeCloseTo(shift + 200);
    expect(right.labels.get('parcel')?.rect.x).toBeCloseTo(
      shift + (left.labels.get('parcel')?.rect.x ?? 0),
    );
  });
});
