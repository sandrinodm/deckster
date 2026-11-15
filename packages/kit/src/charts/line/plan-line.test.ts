import { describe, expect, it } from 'vite-plus/test';

import type { CategoricalData } from '#charts/data/rows.ts';
import type { LineOptions } from '#charts/line/plan-line.ts';

import { resolveFormat } from '#charts/format/number-format.ts';
import { TEST_THEME, testMeasure } from '#charts/frame/chart-theme.fixture.ts';
import { textBoxes } from '#charts/frame/scene.ts';
import { boxesOverlap, thinLabels } from '#charts/layout/label-placement.ts';
import { pathObstacles, planLine } from '#charts/line/plan-line.ts';

const QUEUES: CategoricalData = {
  x: 'week',
  categories: ['W1', 'W2', 'W3', 'W4'],
  series: ['Billing', 'Access', 'Export', 'Performance'].map((key, index) => ({
    key,
    label: key,
    values: [400 - index * 5, 410 - index * 5, 420 - index * 5, 430 - index * 4],
    at: index === 0 ? 2 : undefined,
  })),
};

const OPTIONS: LineOptions = {
  area: false,
  stacked: false,
  zero: false,
  min: undefined,
  max: undefined,
  labels: 'auto',
  legend: undefined,
  highlight: 'Billing',
  annotations: undefined,
  reveal: undefined,
  hasUnit: true,
};

/**
 * Plans a line chart at a slide-sized plot.
 */
function plan(options: Partial<LineOptions> = {}) {
  return planLine({
    data: QUEUES,
    size: { width: 1660, height: 560 },
    theme: TEST_THEME,
    measure: testMeasure,
    format: resolveFormat(undefined, undefined, TEST_THEME.numbers),
    options: { ...OPTIONS, ...options },
    frame: { caption: undefined, source: undefined },
  });
}

describe('planLine', () => {
  it('dodges end labels that would collide so none overlaps', () => {
    const { scene } = plan();
    const boxes = textBoxes(scene, testMeasure).map((entry) => entry.box);
    for (const [index, box] of boxes.entries()) {
      for (const other of boxes.slice(index + 1)) {
        expect(boxesOverlap(box, other)).toBe(false);
      }
    }
  });

  it('gives the single highlighted series the lead color and mutes the rest', () => {
    const { spec } = plan();
    expect(spec.series.map((series) => series.color)).toEqual([
      '#2d4ae0',
      '#c2c7d1',
      '#c2c7d1',
      '#c2c7d1',
    ]);
    expect(spec.series[0]?.labels.at(-1)).toBe('430');
  });

  it('zooms a line axis and says so, and starts areas at zero', () => {
    const zoomed = plan();
    expect(zoomed.facts.axis).toBe('zoomed');
    const note = zoomed.scene.layers[0]?.items.find(
      (item) => item.kind === 'text' && item.lines[0]?.startsWith('Axis starts at'),
    );
    expect(note).toBeDefined();
    expect(plan({ area: true }).spec.axis).toMatchObject({ min: 0, zeroBased: true });
  });

  it('reveals a series with its own step in a layer of that step', () => {
    expect(plan().scene.layers.map((layer) => layer.at)).toContain(2);
  });
});

describe('planLine on imperfect data', () => {
  /**
   * Plans a chart of other data at a slide-sized plot.
   */
  function planData(data: CategoricalData, options: Partial<LineOptions> = {}) {
    return planLine({
      data,
      size: { width: 1660, height: 560 },
      theme: TEST_THEME,
      measure: testMeasure,
      format: resolveFormat(undefined, undefined, TEST_THEME.numbers),
      options: { ...OPTIONS, highlight: undefined, ...options },
      frame: { caption: undefined, source: undefined },
    });
  }

  it('breaks a stack where a series has no value instead of stacking on zero', () => {
    const signups: CategoricalData = {
      x: 'month',
      categories: ['Jan', 'Feb', 'Mar', 'Apr'],
      series: [
        { key: 'Mobile', label: 'Mobile', values: [40, 42, 45, 47], at: undefined },
        { key: 'Web', label: 'Web', values: [30, 31, null, 29], at: undefined },
        { key: 'Partner', label: 'Partner', values: [10, 11, 12, 12], at: undefined },
      ],
    };
    const { scene } = planData(signups, { area: true, stacked: true });
    const areas = scene.layers
      .flatMap((layer) => layer.items)
      .filter((item) => item.kind === 'path' && item.fillOpacity === 1)
      .map((item) => (item.kind === 'path' ? item.d : ''));
    const runs = areas.map((d) => d.split('M').length - 1);
    // Mobile is whole; Web and Partner (stacked on Web) both break at March.
    expect(runs).toEqual([1, 2, 2]);
  });

  it('stacks positives up and negatives down, so the axis holds both', () => {
    const flows: CategoricalData = {
      x: 'month',
      categories: ['Jan', 'Feb'],
      series: [
        { key: 'gain', label: 'gain', values: [100, 80], at: undefined },
        { key: 'loss', label: 'loss', values: [-90, -70], at: undefined },
      ],
    };
    const { spec, scene } = planData(flows, { area: true, stacked: true });
    expect(spec.axis?.min).toBeLessThanOrEqual(-90);
    expect(spec.axis?.max).toBeGreaterThanOrEqual(100);
    const ys = scene.layers
      .flatMap((layer) => layer.items)
      .flatMap((item) => (item.kind === 'path' ? (item.d.match(/,(-?[\d.]+)/gu) ?? []) : []))
      .map((match) => Number(match.slice(1)));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(560);
  });

  it('shows no future value before its category when revealed by categories', () => {
    const rising: CategoricalData = {
      x: 'week',
      categories: ['W1', 'W2', 'W3', 'W4'],
      series: [{ key: 'a', label: 'a', values: [1, 2, 3, 4], at: undefined }],
    };
    const { scene } = planData(rising, { reveal: 'categories' });
    const drawn = scene.layers.flatMap((layer) =>
      layer.items
        .filter((item) => item.kind === 'path' && item.drawable === true)
        .map(() => layer.at),
    );
    expect(drawn).toEqual([2, 3, 4]);
    const area = planData(rising, { area: true, reveal: 'categories' }).scene.layers.flatMap(
      (layer) =>
        layer.items
          .filter((item) => item.kind === 'path' && item.fill !== 'none')
          .map(() => layer.at),
    );
    expect(area).toEqual([2, 3, 4]);
  });

  it('draws a lone line as heavy as a highlighted one', () => {
    const cash: CategoricalData = {
      x: 'month',
      categories: ['Jan', 'Feb', 'Mar'],
      series: [{ key: 'cash', label: 'cash', values: [-4, -1, 2], at: undefined }],
    };
    const line = planData(cash)
      .scene.layers.flatMap((layer) => layer.items)
      .find((item) => item.kind === 'path' && item.fill === 'none');
    expect(line?.kind === 'path' ? (line.strokeWidth ?? 0) : 0).toBeGreaterThan(
      TEST_THEME.lineWidth,
    );
  });

  it('counts the points it draws and the series in their own color', () => {
    expect(plan().facts).toMatchObject({ marks: 16, colored: 1 });
    expect(plan({ highlight: undefined }).facts.colored).toBe(4);
  });
});

describe('thinLabels', () => {
  it('keeps every label that fits and thins the rest evenly, always ending on the last', () => {
    const positions = Array.from({ length: 12 }, (_, index) => index * 50);
    expect(
      thinLabels(
        positions,
        positions.map(() => 30),
        10,
      ),
    ).toHaveLength(12);
    const shown = thinLabels(
      positions,
      positions.map(() => 80),
      10,
    );
    expect(shown.at(-1)).toBe(11);
    expect(shown.length).toBeLessThan(12);
    const steps = new Set(shown.slice(1).map((index, position) => index - (shown[position] ?? 0)));
    expect(steps.size).toBe(1);
    const nine = Array.from({ length: 9 }, (_, index) => index * 50);
    expect(
      thinLabels(
        nine,
        nine.map(() => 80),
        10,
      ),
    ).toEqual([0, 2, 4, 6, 8]);
  });
});

describe('pathObstacles', () => {
  it('stays bounded for a segment far outside the plot', () => {
    const boxes = pathObstacles(
      [
        { x: 0, y: 100 },
        { x: 100, y: 1e100 },
      ],
      10,
      { x: 0, y: 0, width: 1000, height: 500 },
    );
    expect(boxes.length).toBeLessThan(500);
  });

  it('keeps the boxes of a segment inside the plot', () => {
    const boxes = pathObstacles(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      10,
      { x: 0, y: 0, width: 1000, height: 500 },
    );
    expect(boxes).toHaveLength(11);
  });
});
