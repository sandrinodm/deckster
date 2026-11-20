import { isValidElement } from 'react';
import { describe, expect, it } from 'vite-plus/test';

import type { DrawInput } from '#charts/frame/chart-frame.tsx';
import type { Scene } from '#charts/frame/scene.ts';

import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';
import { drawRetentionCohorts } from '#charts/retention-cohorts/retention-cohorts.tsx';

const INPUT: DrawInput = {
  size: { width: 1000, height: 450 },
  theme: TEST_THEME,
  measure: testMeasure,
  datasets: undefined,
  summaryId: 'summary',
  label: undefined,
};

describe('RetentionCohorts', () => {
  it('keeps zero retention visible and leaves an unobserved age blank', () => {
    const { spec, plot } = drawRetentionCohorts(
      {
        data: [
          { cohort: 'April', size: 1250, age: 1, retained: 0 },
          { cohort: 'April', age: 0, retained: 100 },
          { cohort: 'May', size: 25, age: 0, retained: 100 },
          { cohort: 'May', age: 1, retained: null },
        ],
        focus: { cohort: 'April', age: 1, from: 3 },
      },
      INPUT,
    );
    expect(spec.categories).toEqual(['Month 0', 'Month 1']);
    expect(spec.series.map(({ values, labels }) => ({ values, labels }))).toEqual([
      { values: [100, 0], labels: ['100%', '0%'] },
      { values: [100, null], labels: ['100%', null] },
    ]);
    expect(spec.summary).toContain('April, 1,250 at signup');
    expect(spec.highlight.categories).toEqual(['Month 1']);
    if (!isValidElement<{ scene: Scene }>(plot)) {
      throw new Error('Expected a heatmap scene.');
    }

    const [base, row, column] = plot.props.scene.layers;
    expect(base?.items.filter(({ mark }) => mark)).toHaveLength(3);
    expect(row).toMatchObject({ at: 3, until: 4 });
    expect(row?.items).toHaveLength(2);
    expect(column?.at).toBe(4);
    expect(column?.items).toHaveLength(1);
  });

  it('reports inconsistent signup counts for the same cohort', () => {
    expect(() =>
      drawRetentionCohorts(
        {
          data: [
            { cohort: 'April', size: 11, age: 0, retained: 100 },
            { cohort: 'April', size: 10, age: 1, retained: 50 },
          ],
        },
        INPUT,
      ),
    ).toThrow('different signup counts for April');
  });
});
