import type { CategoricalData } from '#charts/data/rows.ts';
import type { SceneItem, SceneLayer } from '#charts/frame/scene.ts';

/**
 * What each step of a chart's `reveal` adds: one series, or one category. The props type, the prop
 * check and the catalog all read this list, so they name the same values.
 */
export const REVEAL_BY = ['series', 'categories'] as const;

/**
 * One of {@link REVEAL_BY}.
 */
export type RevealBy = (typeof REVEAL_BY)[number];

/**
 * How a chart builds its marks in steps: one series per step, or one category per step, starting at
 * step 1 or at `from`. Series with their own `at` keep it.
 */
export type RevealOption =
  | RevealBy
  | {
      /**
       * What each step adds.
       */
      by: RevealBy;

      /**
       * The step the first one appears at: a whole number of 1 or more, since step 0 is the slide
       * before any step.
       */
      from: number;
    };

/**
 * A mark or label and the series and category it belongs to.
 */
export type OwnedItem = {
  /**
   * The scene item.
   */
  item: SceneItem;

  /**
   * Its series key.
   */
  series: string;

  /**
   * Its category index.
   */
  index: number;
};

/**
 * Groups a chart's marks and labels into step layers: by the `reveal` option when given, else by
 * each series' own `at` (series without one are shown from the start). Layers keep the items' order
 * inside them and come out in step order, the always-shown layer first.
 *
 * @param input - The reveal option, the chart's data and the owned items.
 */
export function revealLayers(input: {
  reveal: RevealOption | undefined;
  data: CategoricalData;
  items: readonly OwnedItem[];
}): SceneLayer[] {
  const { reveal, data, items } = input;
  const stepOf = stepFunction(reveal, data);
  const layers = new Map<number | undefined, SceneItem[]>();
  for (const owned of items) {
    const at = stepOf(owned);
    const layer = layers.get(at) ?? [];
    layer.push(owned.item);
    layers.set(at, layer);
  }

  return [...layers.entries()]
    .toSorted(([a], [b]) => (a ?? 0) - (b ?? 0))
    .map(([at, layerItems]) => ({ at, items: layerItems }));
}

/**
 * The step of an item under a reveal option.
 *
 * @param reveal - The option.
 * @param data - The chart's data.
 */
function stepFunction(
  reveal: RevealOption | undefined,
  data: CategoricalData,
): (owned: OwnedItem) => number | undefined {
  const own = new Map(data.series.map((series) => [series.key, series.at]));
  const order = new Map(data.series.map((series, index) => [series.key, index]));
  if (reveal === undefined) {
    return (owned) => own.get(owned.series);
  }

  const by = typeof reveal === 'string' ? reveal : reveal.by;
  const from = typeof reveal === 'string' ? 1 : reveal.from;
  if (by === 'series') {
    return (owned) => own.get(owned.series) ?? from + (order.get(owned.series) ?? 0);
  }

  return (owned) => own.get(owned.series) ?? from + owned.index;
}
