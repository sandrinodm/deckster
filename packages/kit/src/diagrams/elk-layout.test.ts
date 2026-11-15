import { describe, expect, it } from 'vite-plus/test';

import { autoLayoutPositions, backEdges } from '#diagrams/elk-layout.ts';
import { buildFlowSpec } from '#diagrams/flow-spec-builder.ts';
import { edge, part } from '#diagrams/flow.fixture.ts';

/**
 * A node without a cell.
 *
 * @param id - Its id.
 */
function free(id: string): ReturnType<typeof part> {
  return part('Node', { id, title: id });
}

/**
 * A user who calls a CDN through to a database that answers back, the user declared first, the
 * services in two groups.
 */
function roundTrip(): ReturnType<typeof buildFlowSpec> {
  return buildFlowSpec([
    free('user'),
    part('Group', { label: 'Edge' }, [free('cdn'), free('waf')]),
    part('Group', { label: 'Core' }, [free('api'), free('db')]),
    edge('user', 'cdn'),
    edge('cdn', 'waf'),
    edge('waf', 'api'),
    edge('api', 'db'),
    edge('db', 'user'),
  ]);
}

describe('backEdges', () => {
  it('breaks a cycle where declaration order loops back', () => {
    expect([...backEdges(roundTrip())]).toEqual(['db->user']);
  });

  it('leaves an acyclic diagram alone, whatever order its nodes are declared in', () => {
    const spec = buildFlowSpec([free('c'), free('a'), free('b'), edge('a', 'b'), edge('b', 'c')]);
    expect(backEdges(spec).size).toBe(0);
  });
});

describe('autoLayoutPositions', () => {
  it('keeps the node declared first first, inside groups too, and is deterministic', async () => {
    const input = {
      spec: roundTrip(),
      size: { width: 336, height: 96 },
      algorithm: 'layered' as const,
      direction: 'right' as const,
      spacing: 64,
    };
    const first = await autoLayoutPositions(input);
    const again = await autoLayoutPositions(input);
    expect(again).toEqual(first);
    const right = first.right ?? {};
    const xs = Object.entries(right).sort((a, b) => a[1][0] - b[1][0]);
    expect(xs[0]?.[0]).toBe('user');
    expect(Object.keys(first)).toEqual(['right', 'down']);
  });
});
