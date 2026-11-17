import { describe, expect, it } from 'vite-plus/test';

import { CHART_LIMITS } from '#charts/chart-catalog.ts';
import { comparisonBarScale } from '#charts/figures/comparison.tsx';
import { exactDigits } from '#charts/figures/data-table.tsx';
import { deltaFrom, figureFormat, figureText } from '#charts/figures/figure-format.ts';
import { bestColumns, figureOf, Pictogram, planPictogram } from '#charts/figures/pictogram.tsx';
import { StatRow } from '#charts/figures/stat-row.tsx';
import { defaultRelative } from '#charts/format/number-format.ts';
import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';

describe('deltaFrom', () => {
  it('writes the change of values in percent in points by default', () => {
    const format = figureFormat({ unit: '%' }, TEST_THEME);
    const delta = deltaFrom({
      value: 91,
      from: 84,
      format,
      better: 'up',
      relative: defaultRelative(format),
    });
    expect(delta).toEqual({ text: '+7 pts', tone: 'positive' });
  });

  it('writes other changes as a percentage of the first value by default', () => {
    const format = figureFormat({ unit: 'h' }, TEST_THEME);
    const delta = deltaFrom({
      value: 2.5,
      from: 14,
      format,
      better: 'down',
      relative: defaultRelative(format),
    });
    expect(delta).toEqual({ text: '−82%', tone: 'positive' });
  });

  it('has nothing to compare for text or without a value before', () => {
    const format = figureFormat({}, TEST_THEME);
    expect(
      deltaFrom({ value: '3 in 10', from: 2, format, better: 'up', relative: true }),
    ).toBeUndefined();
    expect(deltaFrom({ value: 3, from: undefined, format, better: 'up', relative: true })).toBe(
      undefined,
    );
  });
});

describe('figureText', () => {
  it('formats numbers and keeps text as written', () => {
    const format = figureFormat({ format: 'currency' }, TEST_THEME);
    expect(figureText(6.1, format)).toBe('$6.10');
    expect(figureText('3 in 10', format)).toBe('3 in 10');
  });
});

describe('bestColumns', () => {
  it('counts a hundred in tens in a square box and in twenties in a wide one', () => {
    expect(bestColumns(100, 600, 600)).toBe(10);
    expect(bestColumns(100, 1600, 400)).toBe(20);
  });

  it('keeps the best fit for totals that are not round', () => {
    expect(bestColumns(7, 700, 100)).toBe(7);
  });

  it('fills every row rather than leave a few units over, when that costs little size', () => {
    // Three to a row is the biggest fit for 10 in a tall box, but reads 3, 3, 3 and 1.
    expect(bestColumns(10, 518, 830)).toBe(2);
  });
});

describe('planPictogram', () => {
  const props = { value: 4, total: 10, label: 'of every 10 SRE hours go to cluster operations' };

  it('sets the text beside the grid in a wide room', () => {
    const plan = planPictogram(props, {
      size: { width: 1660, height: 700 },
      theme: TEST_THEME,
      measure: testMeasure,
    });
    expect(plan).toMatchObject({ arrangement: 'side', columns: 5, cut: false });
    expect(plan.stat.size).toBeGreaterThan(TEST_THEME.text.stat.size * 0.75);
  });

  it('sets the text under the grid in a narrow column, whole and inside the room', () => {
    for (const width of [926, 640]) {
      const size = { width, height: 860 };
      const plan = planPictogram(props, { size, theme: TEST_THEME, measure: testMeasure });
      expect(plan).toMatchObject({ arrangement: 'stacked', textX: 0, cut: false });
      const gridWidth = plan.columns * plan.unit + (plan.columns - 1) * plan.gap;
      expect(gridWidth).toBeLessThanOrEqual(width + 0.01);
      expect(testMeasure('4 in 10', plan.stat)).toBeLessThanOrEqual(width + 1);
      for (const line of plan.lines) {
        expect(testMeasure(line, TEST_THEME.text.heading)).toBeLessThanOrEqual(width);
      }

      expect(plan.lines.join(' ')).toBe(props.label);
      expect(10 % plan.columns).toBe(0);
    }
  });

  it('marks a label too long for any arrangement as cut', () => {
    const label = Array.from({ length: 60 }, () => 'cluster').join(' ');
    const plan = planPictogram(
      { ...props, label },
      { size: { width: 640, height: 860 }, theme: TEST_THEME, measure: testMeasure },
    );
    expect(plan.cut).toBe(true);
  });
});

describe('exactDigits', () => {
  it('keeps every digit the data has, at most four', () => {
    expect(exactDigits([8.25, 3.4, 12])).toBe(2);
    expect(exactDigits([310_000, 420_000])).toBe(0);
    expect(exactDigits([0.123_456])).toBe(4);
  });
});

describe('Pictogram total', () => {
  it('writes the ratio the data has', () => {
    expect(figureOf({ value: 3, total: 10, label: 'x' })).toBe('3 in 10');
  });

  it('refuses a total it cannot draw rather than show another ratio', () => {
    expect(() => Pictogram({ value: 1, total: 1000, label: 'x' })).toThrow(
      /Pictogram.*1000.*BigNumber/su,
    );
  });
});

describe('StatRow stats', () => {
  const stat = { value: 1, label: 'a' };

  it('names the limit instead of dropping the fifth stat', () => {
    const limit = CHART_LIMITS.categories['stat-row'] ?? 4;
    expect(() => StatRow({ stats: Array.from({ length: limit + 1 }, () => stat) })).toThrow(
      new RegExp(`StatRow.*${limit}`, 'su'),
    );
    expect(() => StatRow({ stats: Array.from({ length: limit }, () => stat) })).not.toThrow();
  });
});

describe('comparisonBarScale', () => {
  it('draws two positive values from zero at the start edge, to the larger', () => {
    const scale = comparisonBarScale(14, 2.5);
    expect(scale.zero).toBe(0);
    expect(scale.start(14)).toBe(0);
    expect(scale.length(14)).toBe(1);
    expect(scale.length(2.5)).toBeCloseTo(2.5 / 14);
  });

  it('draws a negative value from the zero line towards the start edge', () => {
    const scale = comparisonBarScale(-0.5, 0.76);
    const span = 1.26;
    expect(scale.zero).toBeCloseTo(0.5 / span);
    // The loss ends at zero and the gain starts there: they never overlap.
    expect(scale.start(-0.5)).toBe(0);
    expect(scale.start(-0.5) + scale.length(-0.5)).toBeCloseTo(scale.zero);
    expect(scale.start(0.76)).toBeCloseTo(scale.zero);
    expect(scale.start(0.76) + scale.length(0.76)).toBeCloseTo(1);
  });

  it('puts zero at the end edge when both values are negative', () => {
    const scale = comparisonBarScale(-4, -1);
    expect(scale.zero).toBe(1);
    expect(scale.start(-1) + scale.length(-1)).toBe(1);
    expect(scale.length(-4)).toBe(1);
  });
});
