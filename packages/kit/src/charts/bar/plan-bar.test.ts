import { describe, expect, it } from 'vite-plus/test';

import type { BarOptions } from '#charts/bar/plan-bar.ts';
import type { CategoricalData } from '#charts/data/rows.ts';

import { planBar } from '#charts/bar/plan-bar.ts';
import { parseChartSpec } from '#charts/chart-spec.ts';
import { resolveFormat } from '#charts/format/number-format.ts';
import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';
import { textBoxes } from '#charts/frame/scene.ts';
import { boxesOverlap } from '#charts/layout/label-placement.ts';

const REASONS: CategoricalData = {
  x: 'reason',
  categories: ['Login', 'Other', 'Billing', 'Export'],
  series: [
    { key: 'tickets', label: 'tickets', values: [9310, 10_900, 18_420, 5240], at: undefined },
  ],
};

const OPTIONS: BarOptions = {
  orientation: 'auto',
  stacked: false,
  sort: 'none',
  labels: 'auto',
  legend: undefined,
  min: undefined,
  max: undefined,
  truncate: false,
  highlight: undefined,
  annotations: undefined,
  reveal: undefined,
  hasUnit: true,
};

/**
 * Plans a bar chart at a slide-sized plot.
 */
function plan(data: CategoricalData, options: Partial<BarOptions> = {}, width = 1660) {
  return planBar({
    data,
    xField: data.x,
    size: { width, height: 560 },
    theme: TEST_THEME,
    measure: testMeasure,
    format: resolveFormat(undefined, undefined, TEST_THEME.numbers),
    options: { ...OPTIONS, ...options },
    frame: { caption: 'Tickets by reason', source: undefined },
  });
}

describe('planBar', () => {
  it('sorts largest first with "Other" last and mutes everything but the highlight', () => {
    const { spec, facts } = plan(REASONS, { sort: 'descending', highlight: 'Billing' });
    expect(spec.categories).toEqual(['Billing', 'Login', 'Export', 'Other']);
    expect(spec.series[0]?.pointColors).toEqual(['#2d4ae0', '#c2c7d1', '#c2c7d1', '#c2c7d1']);
    expect(spec.highlight.categories).toEqual(['Billing']);
    expect(facts).toMatchObject({ highlighted: true, axis: 'zero', categories: 4, series: 1 });
  });

  it('labels every bar with consistent compact numbers and drops the value axis', () => {
    const { spec } = plan(REASONS);
    expect(spec.series[0]?.labels).toEqual(['9.3K', '10.9K', '18.4K', '5.2K']);
    expect(spec.axis?.max).toBe(18_420);
  });

  it('turns horizontal when labels do not fit under columns', () => {
    const long: CategoricalData = {
      ...REASONS,
      categories: REASONS.categories.map((name) => `${name} questions from customers`),
    };
    expect(plan(long, {}, 600).spec.orientation).toBe('horizontal');
    expect(plan(REASONS).spec.orientation).toBe('vertical');
  });

  it('keeps the value labels of an auto chart that resolved to horizontal rows with room', () => {
    const many: CategoricalData = {
      x: 'reason',
      categories: Array.from({ length: 12 }, (_, index) => `Reason ${index} from customers`),
      series: [
        {
          key: 'tickets',
          label: 'tickets',
          values: Array.from({ length: 12 }, (_, index) => 1000 + index * 1111),
          at: undefined,
        },
      ],
    };
    const drawn = plan(many, {}, 600);
    expect(drawn.spec.orientation).toBe('horizontal');
    expect(drawn.spec.series[0]?.labels.every((label) => label !== null)).toBe(true);
    const forced = plan(many, { orientation: 'horizontal' }, 600);
    expect(drawn.spec.series[0]?.labels).toEqual(forced.spec.series[0]?.labels);
  });

  it('refuses a minimum above zero without truncate and draws a break with it', () => {
    expect(plan(REASONS, { min: 4000 }).facts.axis).toBe('refused');
    expect(plan(REASONS, { min: 4000 }).spec.axis?.min).toBe(0);
    const cut = plan(REASONS, { min: 4000, truncate: true });
    expect(cut.facts.axis).toBe('truncated');
    expect(cut.spec.axis).toMatchObject({ min: 4000, truncated: true, zeroBased: false });
  });

  it('shows a legend only for several series, and reveals series at their steps', () => {
    const grouped: CategoricalData = {
      x: 'team',
      categories: ['A', 'B'],
      series: [
        { key: '2025', label: '2025', values: [1, 2], at: undefined },
        { key: '2026', label: '2026', values: [3, 4], at: 2 },
      ],
    };
    const { spec, facts, scene } = plan(grouped);
    expect(facts.legend).toBe(true);
    expect(spec.legend).toBe(true);
    expect(scene.layers.some((layer) => layer.at === 2)).toBe(true);
    expect(plan(REASONS, { legend: true }).facts.legendAvoidable).toBe(true);
  });

  it('sets no two labels over each other', () => {
    const { scene } = plan(REASONS, {
      highlight: 'Billing',
      annotations: [{ type: 'callout', x: 'Export', label: 'Fewest' }],
    });
    const boxes = textBoxes(scene, testMeasure).map((entry) => entry.box);
    for (const [index, box] of boxes.entries()) {
      for (const other of boxes.slice(index + 1)) {
        expect(boxesOverlap(box, other)).toBe(false);
      }
    }
  });

  it('writes a spec that reads back', () => {
    const { spec } = plan(REASONS, { highlight: 'max' });
    expect(parseChartSpec(JSON.stringify(spec))).toEqual(spec);
    expect(spec).toMatchObject({
      version: 1,
      kind: 'bar',
      native: 'bar',
      caption: 'Tickets by reason',
    });
    expect(spec.summary).toContain('highest Billing at 18.4K');
  });

  it('sets a negative column label under its bar and above the category labels', () => {
    const profit: CategoricalData = {
      x: 'quarter',
      categories: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [{ key: 'profit', label: 'profit', values: [1.2, 0.4, -2.1, 0.9], at: undefined }],
    };
    const { scene } = plan(profit, { orientation: 'vertical', labels: 'all' });
    const texts = textBoxes(scene, testMeasure);
    const value = texts.find((entry) => entry.item.lines[0] === '−2.1')?.box;
    const category = texts.find((entry) => entry.item.lines[0] === 'Q3')?.box;
    expect(value).toBeDefined();
    expect(category).toBeDefined();
    expect((value?.y ?? 0) + (value?.height ?? 0)).toBeLessThanOrEqual(category?.y ?? 0);
  });

  it('sets a negative bar label past its tip, clear of the category column', () => {
    const margin: CategoricalData = {
      x: 'segment',
      categories: ['Subscriptions', 'Training', 'Enterprise onboarding'],
      series: [{ key: 'margin', label: 'margin', values: [3400, -90, -1240], at: undefined }],
    };
    const { scene } = plan(margin, { orientation: 'horizontal', labels: 'all' });
    const texts = textBoxes(scene, testMeasure);
    const column = Math.max(
      ...texts
        .filter((entry) => margin.categories.includes(entry.item.lines[0] ?? ''))
        .map((entry) => entry.box.x + entry.box.width),
    );
    const negative = texts.find((entry) => entry.item.lines[0] === '−1,240')?.box;
    expect(negative).toBeDefined();
    expect(negative?.x ?? 0).toBeGreaterThan(column);
    for (const [index, entry] of texts.entries()) {
      for (const other of texts.slice(index + 1)) {
        expect(boxesOverlap(entry.box, other.box)).toBe(false);
      }
    }
  });

  it('keeps the value axis of a truncated chart and says where it starts', () => {
    const uptime: CategoricalData = {
      x: 'region',
      categories: ['us-east', 'us-west', 'eu-central'],
      series: [{ key: 'uptime', label: 'uptime', values: [99.2, 99.7, 98.4], at: undefined }],
    };
    const { scene } = plan(uptime, { min: 98, truncate: true });
    const texts = textBoxes(scene, testMeasure).map((entry) => entry.item);
    expect(texts.some((item) => item.lines[0] === 'Axis starts at 98')).toBe(true);
    expect(texts.filter((item) => item.tabular === true).length).toBeGreaterThanOrEqual(2);
  });

  it('labels the highlighted segments of a stack and names the rest "Everything else"', () => {
    const signups: CategoricalData = {
      x: 'region',
      categories: ['North', 'South'],
      series: [
        { key: 'Mobile', label: 'Mobile', values: [420, 370], at: undefined },
        { key: 'Web', label: 'Web', values: [360, 290], at: undefined },
        { key: 'Partner', label: 'Partner', values: [120, 140], at: undefined },
      ],
    };
    const { scene, facts } = plan(signups, { stacked: true, highlight: 'Mobile' });
    const texts = textBoxes(scene, testMeasure).map((entry) => entry.item.lines[0]);
    expect(texts).toContain('Everything else');
    expect(texts).not.toContain('Web');
    expect(texts).toEqual(expect.arrayContaining(['420', '370']));
    expect(facts).toMatchObject({ legend: true, marks: 6, colored: 1 });
  });

  it('counts its marks and the series drawn in their own color', () => {
    expect(plan(REASONS, { highlight: 'Billing' }).facts).toMatchObject({ marks: 4, colored: 1 });
    const grouped: CategoricalData = {
      x: 'team',
      categories: ['A', 'B'],
      series: [
        { key: '2025', label: '2025', values: [1, null], at: undefined },
        { key: '2026', label: '2026', values: [3, 4], at: undefined },
      ],
    };
    expect(plan(grouped).facts).toMatchObject({ marks: 3, colored: 2 });
  });
});
