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
