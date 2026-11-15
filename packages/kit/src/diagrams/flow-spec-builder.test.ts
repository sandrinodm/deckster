import { describe, expect, it } from 'vite-plus/test';

import { buildFlowSpec } from '#diagrams/flow-spec-builder.ts';
import { edge, node, part } from '#diagrams/flow.fixture.ts';

describe('buildFlowSpec', () => {
  it('expands a journey path into one hop per step, with the way back marked returning', () => {
    const spec = buildFlowSpec([
      node('a', 1, 1),
      node('b', 2, 1),
      node('c', 3, 1),
      edge('a', 'b'),
      edge('b', 'c'),
      part('Journey', { at: 2, path: 'a b c', back: true }),
    ]);
    expect(spec.trips.map((trip) => [trip.path.join('>'), trip.at, trip.returning])).toEqual([
      ['a>b', 2, false],
      ['b>c', 3, false],
      ['c>b', 4, true],
      ['b>a', 5, true],
    ]);
    expect(spec.journeys[0]).toMatchObject({ trail: true, focus: false });
  });

  it('plays a whole trip on one step with pace="trip"', () => {
    const spec = buildFlowSpec([
      node('a', 1, 1),
      node('b', 2, 1),
      edge('a', 'b'),
      part('Journey', { at: 1, path: 'a b', back: true, pace: 'trip' }),
    ]);
    expect(spec.trips).toHaveLength(1);
    expect(spec.trips[0]).toMatchObject({ at: 1, reply: true, path: ['a', 'b'] });
  });

  it('numbers hops that leave out their step after the one before', () => {
    const spec = buildFlowSpec([
      node('a', 1, 1),
      node('b', 2, 1),
      edge('a', 'b'),
      part('Journey', { at: 3 }, [
        part('Hop', { from: 'a', to: 'b' }),
        part('Hop', { from: 'b', to: 'a', at: 7 }),
        part('Hop', { from: 'a', to: 'b' }),
      ]),
    ]);
    expect(spec.trips.map((trip) => trip.at)).toEqual([3, 7, 8]);
  });

  it('puts nodes in their nested groups and names edges by their ends', () => {
    const spec = buildFlowSpec([
      part('Group', { label: 'Production VPC' }, [
        part('Group', { label: 'Private subnet' }, [node('db', 1, 1)]),
      ]),
      node('web', 2, 1),
      edge('web', 'db'),
      edge('web', 'db'),
    ]);
    expect(spec.groups.map((group) => [group.id, group.parent])).toEqual([
      ['group-production-vpc', undefined],
      ['group-private-subnet', 'group-production-vpc'],
    ]);
    expect(spec.nodes.find((candidate) => candidate.id === 'db')?.group).toBe(
      'group-private-subnet',
    );
    expect(spec.edges.map((candidate) => candidate.id)).toEqual(['web->db', 'web->db#2']);
  });

  it('reads aliases, async, bidirectional and flow shorthands', () => {
    const spec = buildFlowSpec([
      node('a', 1, 1, { kind: 'db' }),
      node('b', 2, 1, { kind: 'lb' }),
      edge('a', 'b', { async: true, bidirectional: true, flow: 5 }),
    ]);
    expect(spec.nodes.map((candidate) => candidate.kind)).toEqual(['database', 'loadbalancer']);
    expect(spec.edges[0]).toMatchObject({
      dashed: true,
      arrow: 'both',
      flow: { count: 5, speed: 'normal' },
    });
  });

  it('throws with the fix for an unknown kind and a stray hop', () => {
    expect(() => buildFlowSpec([node('a', 1, 1, { kind: 'mainframe' })])).toThrow(
      'pnpm deck diagrams',
    );
    expect(() => buildFlowSpec([part('Hop', { from: 'a', to: 'b' })])).toThrow(
      'Wrap the hops in <Journey',
    );
  });
});
