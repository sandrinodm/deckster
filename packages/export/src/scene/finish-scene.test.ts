import { describe, expect, it } from 'vite-plus/test';

import type { CollectedScene, CollectedSpec } from '#scene/collected.ts';

import { finishScene } from '#scene/finish-scene.ts';
import { boxNode } from '#scene/scene.fixture.ts';

/**
 * A bar chart description in the kit's version 1 shape.
 */
const CHART = {
  version: 1,
  kind: 'bar',
  native: 'bar',
  orientation: 'vertical',
  stacked: false,
  name: 'Trees per year',
  caption: null,
  source: null,
  categories: ['2027', '2028'],
  series: [
    {
      name: 'Trees',
      values: [600, 700],
      x: null,
      color: '#c2c7d1',
      pointColors: ['#c2c7d1', '#2d4ae0'],
      highlighted: false,
      labels: [null, '700'],
    },
  ],
  format: { excel: '#,##0' },
  axis: { min: 0, max: 800, ticks: [0, 800], zeroBased: true, truncated: false },
  annotations: [],
  legend: false,
  table: null,
  colors: {
    plate: '#ffffff',
    context: '#c2c7d1',
    label: '#555c6a',
    value: '#161920',
    grid: '#d9dce4',
    axis: '#555c6a',
    positive: '#0a7a8a',
    negative: '#d23c28',
  },
};

/**
 * A collected scene holding one figure.
 *
 * @param spec - The figure.
 */
function collected(spec: CollectedSpec): CollectedScene {
  return {
    canvas: { width: 1920, height: 1080 },
    surface: 'default',
    layout: 'content',
    background: null,
    backgroundIsImage: false,
    nodes: [spec],
    links: [],
    warnings: [],
    tree: {},
  };
}

/**
 * A figure node with a description.
 *
 * @param kind - Chart or diagram.
 * @param spec - The attribute's text.
 */
function figure(kind: CollectedSpec['kind'], spec: string): CollectedSpec {
  const {
    kind: _kind,
    fill: _fill,
    borders: _borders,
    radii: _radii,
    shadows: _shadows,
    fullBleed: _fullBleed,
    ...base
  } = boxNode(1);
  return { ...base, kind, spec };
}

describe('finishScene', () => {
  it('decodes a published chart description', () => {
    const scene = finishScene(collected(figure('chart-spec', JSON.stringify(CHART))), {});
    expect(scene.nodes[0]).toMatchObject({
      kind: 'chart',
      chart: { native: 'bar', categories: ['2027', '2028'] },
    });
  });

  it('turns an unreadable description into a figure to rasterise, with a warning', () => {
    const scene = finishScene(collected(figure('diagram-spec', '{"version":2}')), { title: 'T' });
    expect(scene.nodes[0]).toMatchObject({
      kind: 'box',
      hints: [{ reason: 'figure', scope: 'subtree' }],
    });
    expect(scene.warnings[0]).toContain('data-diagram-description does not match version 1');
    expect(scene.fieldText).toEqual({ title: 'T' });
  });
});
