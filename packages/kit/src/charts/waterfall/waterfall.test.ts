import { describe, expect, it } from 'vite-plus/test';

import type { CategoricalData } from '#charts/data/rows.ts';

import {
  changeOrder,
  runningSteps,
  waterfallLayers,
  type WaterfallMark,
} from '#charts/waterfall/waterfall.tsx';

describe('runningSteps', () => {
  it('takes the running total for a total with no value', () => {
    const steps = runningSteps(['Start', 'Up', 'End'], [10, 5, null], ['Start', 'End']);
    expect(steps.at(-1)).toMatchObject({ from: 0, to: 15, total: true, missing: false });
  });

  it('counts a change with no value as no change and marks it missing', () => {
    const steps = runningSteps(['Start', 'Gap', 'Down'], [10, null, -4], undefined);
    expect(steps.map((step) => [step.from, step.to, step.missing])).toEqual([
      [0, 10, false],
      [10, 10, true],
      [10, 6, false],
    ]);
  });

  it('makes the first step the total when no totals are named', () => {
    expect(runningSteps(['A', 'B'], [3, 2], undefined).map((step) => step.total)).toEqual([
      true,
      false,
    ]);
  });
});

describe('changeOrder', () => {
  it('numbers the changes one after another, skipping totals', () => {
    const steps = runningSteps(
      ['2025', 'A', 'B', 'Half', 'C', '2026'],
      [10, -1, -2, null, 1, null],
      ['2025', 'Half', '2026'],
    );
    expect(changeOrder(steps)).toEqual([undefined, 0, 1, undefined, 2, undefined]);
  });
});

describe('waterfallLayers', () => {
  const data: CategoricalData = {
    x: 'step',
    categories: ['2025', 'A', 'B', '2026'],
    series: [{ key: 'cost', label: 'cost', values: [10, -1, -2, null], at: undefined }],
  };

  /**
   * A mark named so a layer can be read back.
   */
  const mark = (name: string, change: number | undefined): WaterfallMark => ({
    item: { kind: 'path', d: name, fill: 'none' },
    change,
  });
  const marks = [
    mark('total 2025', undefined),
    mark('bar A', 0),
    mark('bar B', 1),
    mark('total 2026', undefined),
    mark('name A', undefined),
  ];

  /**
   * Each layer's step and the marks in it.
   */
  const read = (reveal: Parameters<typeof waterfallLayers>[0]): [number | undefined, string[]][] =>
    waterfallLayers(reveal, data, marks).map((layer) => [
      layer.at,
      layer.items.map((item) => (item.kind === 'path' ? item.d : '')),
    ]);

  it('keeps every mark in one layer without `reveal`', () => {
    expect(read(undefined)).toEqual([
      [undefined, marks.map((entry) => (entry.item.kind === 'path' ? entry.item.d : ''))],
    ]);
  });

  it('shows the totals and step names first, then one change per step', () => {
    expect(read('categories')).toEqual([
      [undefined, ['total 2025', 'total 2026', 'name A']],
      [1, ['bar A']],
      [2, ['bar B']],
    ]);
  });

  it('brings every change in at once by series, from `from`', () => {
    expect(read({ by: 'series', from: 2 })).toEqual([
      [undefined, ['total 2025', 'total 2026', 'name A']],
      [2, ['bar A', 'bar B']],
    ]);
  });
});
