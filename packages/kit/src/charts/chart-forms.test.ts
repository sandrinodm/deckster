import { describe, expect, it } from 'vite-plus/test';

import { CHART_MESSAGES, chartCatalog } from '#charts/chart-catalog.ts';
import { CHART_COMPONENTS } from '#charts/chart-components.ts';
import { CHART_KINDS, parseChartSpec } from '#charts/chart-spec.ts';
import { bestColumns } from '#charts/figures/pictogram.tsx';
import { worstStep } from '#charts/funnel/funnel.tsx';
import { stepColor } from '#charts/heatmap/heatmap.tsx';
import { leastSquares } from '#charts/scatter/scatter.tsx';
import { markedIndex } from '#charts/sparkline/sparkline.tsx';
import { runningSteps } from '#charts/waterfall/waterfall.tsx';

describe('runningSteps', () => {
  it('floats changes from the running total and stands totals on zero', () => {
    const steps = runningSteps(
      ['2025', 'Tooling', 'Automation', '2026'],
      [4.1, 0.45, -0.9, null],
      ['2025', '2026'],
    );
    expect(steps.map((step) => [step.from, step.to, step.total])).toEqual([
      [0, 4.1, true],
      [4.1, 4.55, false],
      [4.55, 3.65, false],
      [0, 3.65, true],
    ]);
  });
});

describe('worstStep', () => {
  it('finds the step that loses the most, or the one into the highlighted stage', () => {
    expect(worstStep([1, 0.65, 0.3, 0.6], undefined)).toBe(2);
    expect(worstStep([1, 0.65, 0.3, 0.6], 3)).toBe(3);
  });
});

describe('stepColor', () => {
  it('maps the smallest value to the first step and the largest to the last', () => {
    const palette = ['#1', '#2', '#3'];
    expect(stepColor(0, 0, 9, palette)).toBe('#1');
    expect(stepColor(9, 0, 9, palette)).toBe('#3');
  });
});

describe('leastSquares', () => {
  it('fits a line, and none through a single x', () => {
    expect(leastSquares([1, 2, 3], [2, 4, 6])).toEqual({ slope: 2, intercept: 0 });
    expect(leastSquares([1, 1], [2, 3])).toBeUndefined();
  });
});

describe('figure helpers', () => {
  it('chooses pictogram columns for the largest units and marks sparkline points', () => {
    expect(bestColumns(10, 1000, 400)).toBe(5);
    expect(markedIndex([3, 9, 1], 'max')).toBe(1);
    expect(markedIndex([3, 9, 1], 'last')).toBe(2);
  });
});

describe('chartCatalog', () => {
  it('describes exactly the components the kit registers, with every message covered', () => {
    const catalog = chartCatalog();
    expect(catalog.charts.map((chart) => chart.name).toSorted()).toEqual(
      Object.keys(CHART_COMPONENTS).toSorted(),
    );
    expect(new Set(catalog.charts.map((chart) => chart.kind))).toEqual(new Set(CHART_KINDS));
    for (const message of CHART_MESSAGES) {
      expect(catalog.messages[message].length, message).toBeGreaterThan(0);
    }

    for (const chart of catalog.charts) {
      expect(chart.example.startsWith(`<${chart.name}`), chart.name).toBe(true);
      expect(chart.useWhen.length).toBeGreaterThan(20);
    }
  });
});

describe('parseChartSpec', () => {
  it('rejects text that is not a spec of this version', () => {
    expect(parseChartSpec(null)).toBeUndefined();
    expect(parseChartSpec('{')).toBeUndefined();
    expect(parseChartSpec('{"version":2,"kind":"bar"}')).toBeUndefined();
    expect(parseChartSpec('{"version":1,"kind":"pie"}')).toBeUndefined();
  });
});
