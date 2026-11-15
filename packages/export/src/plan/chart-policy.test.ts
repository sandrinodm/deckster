import { describe, expect, it } from 'vite-plus/test';

import {
  arcCenter,
  deriveFormat,
  expectedBars,
  fitLinear,
  formatWith,
  planChart,
} from '#plan/chart-policy.ts';
import { barMarkup, chartScene, chartSpec, PLOT_RECT } from '#pptx/chart.fixture.ts';

describe('planChart', () => {
  it('makes a column chart native with its plot where the web drew it and exact labels', () => {
    const { node, scene } = chartScene(chartSpec(), barMarkup());
    const plan = planChart(node, scene, 'hybrid');
    expect(plan.outcome).toBe('simplified');
    expect(plan.changes[0]).toContain('square');
    expect(plan.plotId).toBe(2);
    const model = plan.model;
    expect(model?.groups[0]).toMatchObject({ type: 'bar', grouping: 'clustered', gapWidth: 150 });
    expect(model?.plot?.x).toBeCloseTo(0, 5);
    expect(model?.plot?.width).toBeCloseTo(1, 5);
    expect(model?.plot?.y).toBeCloseTo(100 / PLOT_RECT.height, 5);
    expect(model?.plot?.height).toBeCloseTo(150 / PLOT_RECT.height, 5);
    const series = model?.groups[0]?.series[0];
    expect(series?.labels.map((label) => label?.text)).toEqual(['10%', '20%', '30%']);
    expect(series?.pointColors).toEqual(['#61666f', '#61666f', '#2f4de4']);
    expect(model?.categoryAxis?.line).toEqual({ color: '#9aa1ae', width: 1 });
    expect(model?.valueAxis?.labels).toBeNull();
    const overlays = plan.overlays.map((overlay) => overlay.item.text?.lines[0]);
    expect(overlays).toEqual(['Access', 'Export', 'Billing']);
    expect(plan.overlays.every((overlay) => overlay.behind)).toBe(true);
  });

  it('makes a chart whose bars do not match the data a picture, saying why', () => {
    const spec = chartSpec({
      series: [{ ...chartSpec().series[0]!, values: [10, 25, 30] }],
    });
    const { node, scene } = chartScene(spec, barMarkup());
    const plan = planChart(node, scene, 'hybrid');
    expect(plan).toMatchObject({ outcome: 'picture', model: null, plotId: null });
    expect(plan.reasons[0]).toContain('one value scale');
  });

  it('keeps kinds without a native chart as pictures, and forces a basic chart in native mode', () => {
    const { node, scene } = chartScene(chartSpec({ kind: 'funnel' }), barMarkup());
    expect(planChart(node, scene, 'hybrid')).toMatchObject({ outcome: 'picture' });
    const forced = planChart(node, scene, 'native');
    expect(forced.outcome).toBe('simplified');
    expect(forced.changes).toContain('funnel drawn as a plain bar chart');
  });

  it('leaves figures without a plot to their parts', () => {
    const { node, scene } = chartScene(chartSpec({ kind: 'table', native: 'table' }), '');
    expect(planChart(node, scene, 'hybrid')).toMatchObject({ outcome: 'parts', model: null });
  });
});

describe('planChart waterfalls', () => {
  it('draws a waterfall whose running total goes below zero as a picture, saying why', () => {
    const spec = chartSpec({
      kind: 'waterfall',
      stacked: true,
      categories: ['Start', 'Up', 'Down', 'Up again'],
      series: [{ ...chartSpec().series[0]!, values: [10, -15, 2, 1] }],
    });
    const { node, scene } = chartScene(spec, barMarkup());
    const plan = planChart(node, scene, 'hybrid');
    expect(plan).toMatchObject({ outcome: 'picture', model: null });
    expect(plan.reasons[0]).toContain('below zero');
  });
});

describe('expectedBars', () => {
  it('stacks a waterfall on its running total, with totals from zero', () => {
    const spec = chartSpec({
      kind: 'waterfall',
      stacked: true,
      categories: ['Start', 'Up', 'Down', 'End'],
      series: [{ ...chartSpec().series[0]!, values: [100, 20, -50, 70] }],
    });
    expect(expectedBars(spec).map((bar) => [bar.lo, bar.hi])).toEqual([
      [0, 100],
      [100, 120],
      [70, 120],
      [0, 70],
    ]);
  });
});

describe('deriveFormat', () => {
  it('finds a format code that writes the ticks as shown', () => {
    expect(deriveFormat(['0', '200', '400'], [0, 200, 400])).toBe('0');
    expect(deriveFormat(['0', '2,000', '4,000'], [0, 2000, 4000])).toBe('#,##0');
    expect(deriveFormat(['0 h', '10 h'], [0, 10])).toBe('0" h"');
    expect(deriveFormat(['$1M', '$2M', '$3M'], [1e6, 2e6, 3e6])).toBe('"$"0,,"M"');
    expect(deriveFormat(['80%', '90%', '100%'], [80, 90, 100])).toBe('0"%"');
  });

  it('gives up on texts one format cannot write', () => {
    expect(deriveFormat(['0', '2.5', '5'], [0, 2.5, 5])).toBeNull();
    expect(deriveFormat(['500K', '1M'], [5e5, 1e6])).toBeNull();
    expect(deriveFormat(['$0', '$1M', '$2M'], [0, 1e6, 2e6])).toBeNull();
    expect(deriveFormat(['1,5', '2,5'], [1.5, 2.5])).toBeNull();
  });

  it('formats as a spreadsheet would', () => {
    expect(formatWith('"$"#,##0.0,,"M"', 4_100_000)).toBe('$4.1M');
    expect(formatWith('0"%"', -3)).toBe('-3%');
  });
});

describe('geometry helpers', () => {
  it('fits a line and reports its largest error', () => {
    expect(
      fitLinear([
        [0, 250],
        [10, 200],
        [20, 150],
      ]),
    ).toEqual({ a: 250, b: -5, error: 0 });
    expect(
      fitLinear([
        [1, 1],
        [1, 2],
      ]),
    ).toBeNull();
  });

  it('finds the centre of a circular arc from its endpoints', () => {
    const center = arcCenter(0, -10, 10, 0, 10, false, true);
    expect(center?.x).toBeCloseTo(0, 6);
    expect(center?.y).toBeCloseTo(0, 6);
  });
});
