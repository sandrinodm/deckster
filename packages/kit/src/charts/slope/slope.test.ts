import { describe, expect, it } from 'vite-plus/test';

import type { DrawInput } from '#charts/frame/chart-frame.tsx';

import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';
import { drawSlope } from '#charts/slope/slope.tsx';

const INPUT: DrawInput = {
  size: { width: 1600, height: 640 },
  theme: TEST_THEME,
  measure: testMeasure,
  datasets: undefined,
  summaryId: 'summary',
  label: undefined,
};

const TEAMS = [
  { team: 'Billing', before: 51, after: 19 },
  { team: 'Search', before: 51, after: 50 },
  { team: 'Data', before: 50, after: 18 },
];

describe('drawSlope', () => {
  it('throws naming an item that has no second value', () => {
    expect(() =>
      drawSlope({ data: [...TEAMS, { team: 'Docs', before: 49, after: null }], x: 'team' }, INPUT),
    ).toThrow('"Docs" has no after value');
  });

  it('draws a callout and a reference line, and refuses a range', () => {
    const { spec, facts } = drawSlope(
      {
        data: TEAMS,
        x: 'team',
        highlight: ['Billing', 'Data'],
        annotations: [
          { type: 'callout', x: 'Data', label: 'Lost its leads' },
          { type: 'reference', value: 40, label: 'Floor' },
        ],
      },
      INPUT,
    );
    expect(spec.annotations.map((note) => note.type)).toEqual(['callout', 'reference']);
    expect(facts).toMatchObject({ marks: 3, colored: 2, highlighted: true });
    expect(() =>
      drawSlope(
        { data: TEAMS, x: 'team', annotations: [{ type: 'range', from: 'Billing', to: 'Data' }] },
        INPUT,
      ),
    ).toThrow('A "range" annotation does not apply to <Slope>');
  });
});
