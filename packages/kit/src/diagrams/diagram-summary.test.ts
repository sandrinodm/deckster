import { describe, expect, it } from 'vite-plus/test';

import { flowFrame } from '#diagrams/choreography.ts';
import { flowSummary } from '#diagrams/diagram-summary.ts';
import { webStack } from '#diagrams/flow.fixture.ts';

describe('flowSummary', () => {
  it('lists the nodes in reading order with kind and group, the connections and what moves', () => {
    const spec = webStack();
    const boxes = new Map(
      spec.nodes.map((node) => [
        node.id,
        { x: (node.cell?.col ?? 0) * 300, y: (node.cell?.row ?? 0) * 200, width: 240, height: 100 },
      ]),
    );
    const summary = flowSummary(spec, flowFrame(spec, 1), boxes);
    expect(summary).toMatch(/^7 nodes and 6 connections\./);
    expect(summary).toContain(
      'Nodes: browser (client); cdn (cloud, highlighted); gateway (gateway, in VPC)',
    );
    expect(summary).toContain('browser to cdn (HTTPS)');
    expect(summary).toContain('Moving now: browser to cdn.');
  });
});
