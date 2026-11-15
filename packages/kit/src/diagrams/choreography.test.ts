import { describe, expect, it } from 'vite-plus/test';

import { flowFrame, flowSteps, tripPlays } from '#diagrams/choreography.ts';
import { buildFlowSpec } from '#diagrams/flow-spec-builder.ts';
import { edge, node, part, webStack } from '#diagrams/flow.fixture.ts';

describe('flowFrame', () => {
  it('plays one hop per step along a journey and lights the node each hop reaches', () => {
    const spec = webStack();
    for (const [step, target] of [
      [1, 'cdn'],
      [2, 'gateway'],
      [3, 'orders'],
      [4, 'db'],
      [5, 'orders'],
      [8, 'browser'],
    ] as const) {
      const frame = flowFrame(spec, step);
      expect(frame.trips).toHaveLength(1);
      expect(frame.trips[0]?.trip.path.at(-1)).toBe(target);
      expect(frame.nodes.get(target)).toMatchObject({ state: 'highlighted', arrival: true });
    }
  });

  it('runs the way back against the edges and marks it as returning', () => {
    const frame = flowFrame(webStack(), 5);
    expect(frame.trips[0]?.legs).toEqual([{ edge: 'orders->db', reversed: true }]);
    expect(frame.trips[0]?.trip.returning).toBe(true);
  });

  it('keeps travelled edges lit and marks the edge in use as active', () => {
    const frame = flowFrame(webStack(), 3);
    expect(frame.edges.get('browser->cdn')?.tone).toBe('trail');
    expect(frame.edges.get('cdn->gateway')?.tone).toBe('trail');
    expect(frame.edges.get('gateway->orders')?.tone).toBe('active');
    expect(frame.edges.get('orders->db')?.tone).toBe('default');
  });

  it('dims everything off the path while a focusing journey plays, and not after', () => {
    expect([...flowFrame(webStack(), 2).dimmed].sort()).toEqual([
      'cache',
      'orders->cache',
      'orders->queue',
      'queue',
    ]);
    expect(flowFrame(webStack(), 0).dimmed.size).toBe(0);
    expect(flowFrame(webStack(), 9).dimmed.size).toBe(0);
  });

  it('applies state changes from their step until they stop, the latest winning', () => {
    const spec = buildFlowSpec([
      node('a', 1, 1),
      node('b', 2, 1),
      edge('a', 'b'),
      part('State', { node: 'b', at: 2, until: 4, is: 'error', badge: 'Timeout' }),
      part('State', { node: 'b', at: 3, is: 'success' }),
      part('State', { edge: 'a->b', at: 2, is: 'error' }),
    ]);
    expect(flowFrame(spec, 1).nodes.get('b')?.state).toBe('default');
    expect(flowFrame(spec, 2).nodes.get('b')).toMatchObject({ state: 'error', badge: 'Timeout' });
    expect(flowFrame(spec, 3).nodes.get('b')?.state).toBe('success');
    expect(flowFrame(spec, 2).edges.get('a->b')?.tone).toBe('error');
  });

  it('reveals nodes, groups and edges by step, an edge waiting for both its nodes', () => {
    const spec = buildFlowSpec([
      node('a', 1, 1),
      node('b', 2, 1, { at: 2 }),
      part('Group', { label: 'Later', at: 3 }, [node('c', 3, 1)]),
      edge('a', 'b', { at: 1 }),
    ]);
    expect(flowFrame(spec, 1).edges.get('a->b')?.visible).toBe(false);
    expect(flowFrame(spec, 2).edges.get('a->b')?.visible).toBe(true);
    expect(flowFrame(spec, 2).groups.get('group-later')).toBe(false);
    expect(flowFrame(spec, 3).groups.get('group-later')).toBe(true);
  });

  it('runs continuous edge traffic whenever the edge is shown, and lights no node for a plain packet', () => {
    const spec = buildFlowSpec([
      node('a', 1, 1),
      node('b', 2, 1),
      edge('a', 'b', { flow: true }),
      part('Packet', { from: 'a', to: 'b', at: 1 }),
    ]);
    expect(flowFrame(spec, 0).flows).toEqual(['a->b']);
    expect(flowFrame(spec, 1).nodes.get('b')?.state).toBe('default');
  });
});

describe('tripPlays and flowSteps', () => {
  it('plays a packet on its step, through `until` when given, or always without a step', () => {
    const [packet] = buildFlowSpec([
      node('a', 1, 1),
      node('b', 2, 1),
      edge('a', 'b'),
      part('Packet', { from: 'a', to: 'b', at: 2, until: 4 }),
    ]).trips;
    expect(packet && [1, 2, 3, 4].map((step) => tripPlays(packet, step))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    const [always] = buildFlowSpec([
      node('a', 1, 1),
      node('b', 2, 1),
      edge('a', 'b'),
      part('Packet', { from: 'a', to: 'b' }),
    ]).trips;
    expect(always && tripPlays(always, 0)).toBe(true);
  });

  it('lists every step a diagram uses, once, ascending', () => {
    expect(flowSteps(webStack())).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
