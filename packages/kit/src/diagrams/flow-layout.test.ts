import { describe, expect, it } from 'vite-plus/test';

import { tipsOf } from '#diagrams/flow-layout.ts';
import { buildFlowSpec } from '#diagrams/flow-spec-builder.ts';
import { part } from '#diagrams/flow.fixture.ts';

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
