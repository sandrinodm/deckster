import { describe, expect, it } from 'vite-plus/test';

import { DIAGRAM_HARD_LIMITS } from '#diagrams/diagram-limits.ts';
import { buildFlowSpec } from '#diagrams/flow-spec-builder.ts';
import { validateFlow } from '#diagrams/flow-validate.ts';
import { edge, node, part, webStack } from '#diagrams/flow.fixture.ts';

/**
 * The messages of the errors a declaration has.
 *
 * @param parts - The flow's parts.
 */
function errors(parts: Parameters<typeof buildFlowSpec>[0]): string[] {
  return validateFlow(buildFlowSpec(parts))
    .filter((problem) => problem.severity === 'error')
    .map((problem) => `${problem.message} ${problem.fix}`);
}

describe('validateFlow size', () => {
  it('refuses a diagram too big to route, naming the limit', () => {
    const nodes = Array.from({ length: DIAGRAM_HARD_LIMITS.maxNodes + 1 }, (_, index) =>
      node(`n${index}`, (index % 7) + 1, Math.floor(index / 7) + 1),
    );
    expect(errors(nodes)[0]).toContain(`${DIAGRAM_HARD_LIMITS.maxNodes} nodes`);
    const few = [node('a', 1, 1), node('b', 2, 1)];
    const edges = Array.from({ length: DIAGRAM_HARD_LIMITS.maxEdges + 1 }, (_, index) =>
      edge('a', 'b', { id: `e${index}` }),
    );
    expect(errors([...few, ...edges]).join('\n')).toContain(
      `${DIAGRAM_HARD_LIMITS.maxEdges} edges`,
    );
  });
});

describe('validateFlow', () => {
  it('accepts a sound diagram', () => {
    expect(validateFlow(webStack())).toEqual([]);
  });

  it('names an unknown node id in an edge, with close matches', () => {
    const [message] = errors([node('orders', 1, 1), node('db', 2, 1), edge('order', 'db')]);
    expect(message).toContain('<Edge from="order"> names "order"');
    expect(message).toContain('"orders"');
  });

  it('reports a packet between nodes no edge joins, with the edge to add', () => {
    const [message] = errors([
      node('a', 1, 1),
      node('b', 2, 1),
      node('c', 3, 1),
      edge('a', 'b'),
      part('Packet', { path: 'a b c', at: 1 }),
    ]);
    expect(message).toContain('from "b" to "c", but no edge joins them');
    expect(message).toContain('<Edge from="b" to="c" />');
  });

  it('names a node, group or edge id that is used twice', () => {
    expect(errors([node('a', 1, 1), node('a', 2, 1)])[0]).toContain('"a"');
    expect(
      errors([
        node('a', 1, 1),
        part('Group', { id: 'g', label: 'G' }, [node('b', 2, 1)]),
        part('Group', { id: 'g', label: 'H' }, [node('c', 3, 1)]),
      ])[0],
    ).toContain('"g"');
    const [message] = errors([
      node('a', 1, 1),
      node('b', 2, 1),
      node('c', 3, 1),
      edge('a', 'b', { id: 'link' }),
      edge('b', 'c', { id: 'link' }),
    ]);
    expect(message).toContain('<Edge id="link">');
  });

  it('reports two nodes in one cell', () => {
    const [message] = errors([node('a', 2, 1), node('b', 2, 1)]);
    expect(message).toContain('Nodes "a" and "b" share a grid cell (col 2, row 1).');
  });

  it('reports a node that spans into another', () => {
    expect(errors([node('wide', 1, 1, { colSpan: 3 }), node('b', 2, 1)])[0]).toContain(
      'share a grid cell',
    );
  });

  it('reports a node inside a group it is not in', () => {
    const [message] = errors([
      part('Group', { label: 'VPC' }, [node('a', 1, 1), node('b', 3, 1)]),
      node('intruder', 2, 1),
    ]);
    expect(message).toContain('Node "intruder" sits inside group "VPC" but is not in it.');
  });

  it('reports a member outside its group’s explicit area', () => {
    const [message] = errors([
      part('Group', { label: 'Zone', col: 1, row: 1, colSpan: 2 }, [node('a', 4, 1)]),
    ]);
    expect(message).toContain('Node "a" is in group "Zone" but sits outside its area.');
  });

  it('reports a grid that places only some nodes', () => {
    expect(errors([node('a', 1, 1), part('Node', { id: 'b' })])[0]).toContain('"b" have none');
  });

  it('reports unknown ids in states and focus, and accepts a self loop with its packet', () => {
    const messages = errors([
      node('a', 1, 1),
      edge('a', 'a'),
      part('State', { node: 'ghost', at: 1, is: 'error' }),
      part('Focus', { nodes: 'a zombie', at: 2 }),
      part('Packet', { from: 'a', to: 'a', at: 1 }),
    ]);
    expect(messages).toHaveLength(2);
    expect(messages.some((message) => message.includes('<State node="ghost">'))).toBe(true);
    expect(messages.some((message) => message.includes('"zombie"'))).toBe(true);
  });

  it('reports a diagram with no nodes', () => {
    expect(errors([])[0]).toContain('has no <Node>s');
  });
});
