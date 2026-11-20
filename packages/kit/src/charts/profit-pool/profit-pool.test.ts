import { describe, expect, it } from 'vite-plus/test';

import type { DrawInput } from '#charts/frame/chart-frame.tsx';
import type { PathItem, SceneItem } from '#charts/frame/scene.ts';

import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';
import { planProfitPool } from '#charts/profit-pool/profit-pool.tsx';

const INPUT: DrawInput = {
  size: { width: 1000, height: 450 },
  theme: TEST_THEME,
  measure: testMeasure,
  datasets: undefined,
  summaryId: 'summary',
  label: undefined,
};

const DATA = [
  { segment: 'Grocers', revenue: 2000, margin: 20 },
  { segment: 'Pharmacies', revenue: 1000, margin: 50 },
  { segment: 'Returns', revenue: 500, margin: -10 },
];

const RECTANGLE = /^M[^,]+,(?<top>[^h]+)h(?<width>[^v]+)v(?<height>[^h]+)h.+Z$/u;

describe('ProfitPool', () => {
  it('keeps widths proportional to revenue and areas proportional to signed profit', () => {
    const { spec, scene } = planProfitPool({ data: DATA, buildFrom: 3 }, INPUT);
    const [, revenue, margin, profit] = scene.layers;
    const widths = rectangles(revenue?.items);
    const boxes = rectangles(margin?.items);
    const [grocers, pharmacies, returns] = boxes;
    if (grocers === undefined || pharmacies === undefined || returns === undefined) {
      throw new Error('Expected a rectangle for each segment.');
    }

    expect(widths.map(({ width }) => width)).toEqual(boxes.map(({ width }) => width));
    expect(grocers.width / pharmacies.width).toBeCloseTo(2);
    expect(pharmacies.height / grocers.height).toBeCloseTo(2.5);
    expect((pharmacies.height * pharmacies.width) / (grocers.height * grocers.width)).toBeCloseTo(
      1.25,
    );
    expect(returns.top).toBeCloseTo(grocers.top + grocers.height);
    expect(spec.series[2]?.values).toEqual([400, 500, -50]);
    expect(spec.highlight.categories).toEqual(['Pharmacies']);
    expect([revenue?.until, margin?.at, profit?.at, scene.highlightAt]).toEqual([3, 3, 4, 4]);
  });

  it('plans an immediately readable static chart when no build is requested', () => {
    const { spec, scene } = planProfitPool({ data: DATA }, INPUT);
    expect(scene.layers).toHaveLength(1);
    expect(scene.highlightAt).toBeUndefined();
    expect(spec.native).toBeNull();
    expect(spec.summary).toContain('Pharmacies: $1,000 revenue, 50% margin, $500 profit');
  });
});

/**
 * Reads the plotted pixel dimensions from rectangular scene marks.
 */
function rectangles(
  items: SceneItem[] | undefined,
): { width: number; height: number; top: number }[] {
  return (items ?? [])
    .filter((item): item is PathItem => item.kind === 'path')
    .map((item) => {
      const { width, height, top } = RECTANGLE.exec(item.d)?.groups ?? {};
      return { width: Number(width), height: Number(height), top: Number(top) };
    });
}
