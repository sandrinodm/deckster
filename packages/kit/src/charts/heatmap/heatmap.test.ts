import { describe, expect, it } from 'vite-plus/test';

import type { DrawInput } from '#charts/frame/chart-frame.tsx';

import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';
import { drawHeatmap, stepColor } from '#charts/heatmap/heatmap.tsx';

const INPUT: DrawInput = {
  size: { width: 1200, height: 600 },
  theme: TEST_THEME,
  measure: testMeasure,
  datasets: undefined,
  summaryId: 'summary',
  label: undefined,
};

describe('stepColor', () => {
  const palette = ['#1', '#2', '#3', '#4'];

  it('spreads values over the palette from the lowest to the highest', () => {
    expect(stepColor(0, 0, 30, palette)).toBe('#1');
    expect(stepColor(11, 0, 30, palette)).toBe('#2');
    expect(stepColor(30, 0, 30, palette)).toBe('#4');
  });

  it('gives every cell one color when all values are equal', () => {
    const color = stepColor(5, 5, 5, palette);
    expect(palette).toContain(color);
  });
});

describe('drawHeatmap', () => {
  it('keeps cells apart whose names contain the old separator', () => {
    const { spec } = drawHeatmap(
      {
        x: 'col',
        y: 'row',
        value: 'n',
        data: [
          { col: 'a|b', row: 'c', n: 1 },
          { col: 'a', row: 'b|c', n: 9 },
        ],
      },
      INPUT,
    );
    const byRow = Object.fromEntries(spec.series.map((series) => [series.name, series.values]));
    expect(byRow['c']).toEqual([1, null]);
    expect(byRow['b|c']).toEqual([null, 9]);
    expect(spec.summary).toContain('Highest: a, b|c at 9');
  });
});
