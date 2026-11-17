import { describe, expect, it } from 'vite-plus/test';

import type { DrawInput } from '#charts/frame/chart-frame.tsx';

import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';
import { carryShares, drawFunnel, worstStep } from '#charts/funnel/funnel.tsx';

const INPUT: DrawInput = {
  size: { width: 1600, height: 600 },
  theme: TEST_THEME,
  measure: testMeasure,
  datasets: undefined,
  summaryId: 'summary',
  label: undefined,
};

describe('carryShares', () => {
  it('gives the share of each stage that carried on, 1 for the first', () => {
    expect(carryShares([1000, 400, 100])).toEqual([1, 0.4, 0.25]);
  });

  it('has no share into or out of a stage with no count', () => {
    expect(carryShares([1000, null, 100])).toEqual([1, null, null]);
    expect(carryShares([0, 10])).toEqual([1, null]);
  });

  it('shows a stage that grows as a share above 1', () => {
    expect(carryShares([400, 520])[1]).toBeCloseTo(1.3);
  });
});

describe('worstStep', () => {
  it('skips stages with no share', () => {
    expect(worstStep([1, null, 0.5, 0.2], undefined)).toBe(3);
  });
});

describe('drawFunnel', () => {
  it('reports growing stages and counts only stages with a count as marks', () => {
    const { facts, spec } = drawFunnel(
      {
        data: [
          { stage: 'Signed up', people: 1000 },
          { stage: 'Created', people: 400 },
          { stage: 'Invited', people: null },
          { stage: 'Upgraded', people: 520 },
          { stage: 'Paid', people: 600 },
        ],
        x: 'stage',
        y: 'people',
      },
      INPUT,
    );
    expect(facts.growth).toEqual(['Paid']);
    expect(facts.marks).toBe(4);
    expect(spec.summary).toContain('Invited no data');
  });

  it('writes every count inside its bar or every count beside it', () => {
    const { spec } = drawFunnel(
      {
        data: [
          { stage: 'Visited', people: 48000 },
          { stage: 'Searched', people: 31200 },
          { stage: 'Stayed', people: 900 },
        ],
        x: 'stage',
        y: 'people',
      },
      INPUT,
    );
    expect(spec.series[0]?.labels).toEqual(['48K', '31.2K', '900']);
  });
});

/**
 * The scene a drawing's plot draws, read from the props of its SVG element.
 */
function sceneOf(plot: unknown): { layers: { at: number | undefined; items: unknown[] }[] } {
  return (plot as { props: { scene: { layers: { at: number | undefined; items: unknown[] }[] } } })
    .props.scene;
}

describe('drawFunnel with reveal', () => {
  const rows = [
    { stage: 'Signed up', merchants: 1480 },
    { stage: 'Connected', merchants: 910 },
    { stage: 'First drop', merchants: 640 },
  ];

  it('draws every stage from the start without `reveal`', () => {
    const { plot } = drawFunnel({ data: rows, x: 'stage', y: 'merchants' }, INPUT);
    expect(sceneOf(plot).layers.map((layer) => layer.at)).toEqual([undefined]);
  });

  it('brings in one stage per step, from `from`, with the share into it', () => {
    const { plot } = drawFunnel(
      { data: rows, x: 'stage', y: 'merchants', reveal: { by: 'categories', from: 2 } },
      INPUT,
    );
    const layers = sceneOf(plot).layers;
    expect(layers.map((layer) => layer.at)).toEqual([2, 3, 4]);
    // A later stage carries its share text beside its own name, bar and count.
    expect(layers[1]?.items.length).toBeGreaterThan(layers[0]?.items.length ?? 0);
  });

  it('brings in the whole funnel at once by series', () => {
    const { plot } = drawFunnel(
      { data: rows, x: 'stage', y: 'merchants', reveal: 'series' },
      INPUT,
    );
    expect(sceneOf(plot).layers.map((layer) => layer.at)).toEqual([1]);
  });
});
