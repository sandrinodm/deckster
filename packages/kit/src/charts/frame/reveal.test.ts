import { describe, expect, it } from 'vite-plus/test';

import type { CategoricalData } from '#charts/data/rows.ts';
import type { OwnedItem } from '#charts/frame/reveal.ts';
import type { SceneItem } from '#charts/frame/scene.ts';

import { revealLayers } from '#charts/frame/reveal.ts';

const DATA: CategoricalData = {
  x: 'month',
  categories: ['Jan', 'Feb'],
  series: [
    { key: 'a', label: 'a', values: [1, 2], at: undefined },
    { key: 'b', label: 'b', values: [3, 4], at: undefined },
    { key: 'c', label: 'c', values: [5, 6], at: 5 },
  ],
};

/**
 * A mark named for its series and category, so layers can be read back.
 */
function mark(series: string, index: number): OwnedItem {
  const item: SceneItem = { kind: 'path', d: `${series}${index}`, fill: 'none' };
  return { item, series, index };
}

const ITEMS = ['a', 'b', 'c'].flatMap((series) => [mark(series, 0), mark(series, 1)]);

/**
 * Each layer's step and the marks in it.
 */
function read(
  reveal: Parameters<typeof revealLayers>[0]['reveal'],
): [number | undefined, string[]][] {
  return revealLayers({ reveal, data: DATA, items: ITEMS }).map((layer) => [
    layer.at,
    layer.items.map((item) => (item.kind === 'path' ? item.d : '')),
  ]);
}

describe('revealLayers', () => {
  it('shows series without a step from the start and keeps a series step', () => {
    expect(read(undefined)).toEqual([
      [undefined, ['a0', 'a1', 'b0', 'b1']],
      [5, ['c0', 'c1']],
    ]);
  });

  it('builds one series per step from step 1, a series step winning', () => {
    expect(read('series')).toEqual([
      [1, ['a0', 'a1']],
      [2, ['b0', 'b1']],
      [5, ['c0', 'c1']],
    ]);
  });

  it('builds one category per step from the step it is given', () => {
    expect(read({ by: 'categories', from: 2 })).toEqual([
      [2, ['a0', 'b0']],
      [3, ['a1', 'b1']],
      [5, ['c0', 'c1']],
    ]);
  });
});
