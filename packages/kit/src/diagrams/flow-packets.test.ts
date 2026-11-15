import { describe, expect, it } from 'vite-plus/test';

import type { Rect } from '#diagrams/geometry.ts';

import { flowFrame } from '#diagrams/choreography.ts';
import { packetScene } from '#diagrams/flow-packets.tsx';
import { routeEdges } from '#diagrams/flow-route.ts';
import { buildFlowSpec } from '#diagrams/flow-spec-builder.ts';
import { edge, node, part } from '#diagrams/flow.fixture.ts';
import { inflate, intersects } from '#diagrams/geometry.ts';

/**
 * The brand's motion, as the default brand sets it.
 */
const MOTION = {
  /**
   * The fast duration.
   */
  fast: 160,

  /**
   * The base duration.
   */
  base: 280,

  /**
   * The slow duration.
   */
  slow: 480,

  /**
   * The standard easing.
   */
  easing: [0.2, 0, 0, 1] as [number, number, number, number],
};

/**
 * A model right above an agent, with little room between them, and a request with a tag.
 */
function tightPair(): { scene: ReturnType<typeof packetScene>; boxes: Rect[] } {
  const spec = buildFlowSpec([
    node('model', 1, 1),
    node('agent', 1, 2),
    edge('agent', 'model'),
    part('Packet', { from: 'agent', to: 'model', at: 1, label: 'Plan', reply: 'Call: lookup' }),
  ]);
  const boxes = new Map([
    ['model', { x: 600, y: 300, width: 320, height: 90 }],
    ['agent', { x: 600, y: 452, width: 320, height: 90 }],
  ]);
  const routed = routeEdges(
    spec.edges.map((candidate) => ({
      id: candidate.id,
      from: candidate.from,
      to: candidate.to,
      route: candidate.route,
      startGap: 0,
      endGap: 3,
    })),
    boxes,
    { margin: 24, radius: 12, portSpacing: 24, bounds: { x: 0, y: 0, width: 1600, height: 900 } },
  );
  const edges = new Map(routed.map((candidate) => [candidate.id, candidate]));
  return {
    scene: packetScene(spec, flowFrame(spec, 1), edges, MOTION, false, [], [...boxes.values()]),
    boxes: [...boxes.values()],
  };
}

describe('packetScene tags', () => {
  it('rides beside a packet on a short vertical edge, where above and below hit the nodes', () => {
    const { scene } = tightPair();
    expect(scene.tags.map((tag) => tag.side)).toEqual(['right', 'right']);
  });

  it('is never visible while it would reach past a node’s border into its text', () => {
    const { scene, boxes } = tightPair();
    const plan = scene.plans.find((candidate) => candidate.target.endsWith(':tag:out'));
    const covering = (plan?.keyframes ?? []).filter((frame) => {
      const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(String(frame.transform));
      const x = Number(match?.[1]);
      const y = Number(match?.[2]);
      const box = { x: x + 16, y: y - 19, width: 4 * 15 + 20, height: 38 };
      return boxes.some((rect) => intersects(box, inflate(rect, -12)));
    });
    expect(covering.length).toBeGreaterThan(0);
    expect(covering.map((frame) => frame.opacity)).toEqual(covering.map(() => 0));
  });

  it('rings a node once on a packet’s first arrival, softly for a loop', () => {
    const { scene } = tightPair();
    const pulse = scene.plans.find((candidate) => candidate.target === 'pulse:model');
    expect(pulse?.timing.iterations).toBe(1);
    expect(
      Math.max(...(pulse?.keyframes ?? []).map((frame) => Number(frame.opacity))),
    ).toBeLessThan(0.3);
  });
});
