import type { ChartSpecHighlight } from '#charts/chart-spec.ts';
import type { CategoricalData, SeriesData } from '#charts/data/rows.ts';

import { maxOf, minOf } from '#foundation/lists.ts';

/**
 * Words a highlight may use instead of a name: the category with the largest or smallest value of
 * the first series, or the first or last category.
 */
export const HIGHLIGHT_KEYWORDS = ['max', 'min', 'first', 'last'] as const;

/**
 * One name or several.
 */
export type HighlightTarget = string | readonly string[];

/**
 * A highlight spelled out: series, categories, single points or a span of categories, and the step
 * at which the rest drops to the context color.
 */
export type HighlightSpec = {
  /**
   * Series to keep in color, by field or label.
   */
  series?: HighlightTarget;

  /**
   * Categories to keep in color, by name or a keyword (`max`, `min`, `first`, `last`).
   */
  category?: HighlightTarget;

  /**
   * Single points to keep in color: a category of one series (the first series when left out).
   */
  point?: HighlightPoint | readonly HighlightPoint[];

  /**
   * A span of categories, first and last included, such as `['Jun', 'Aug']`.
   */
  range?: readonly [string, string];

  /**
   * The step at which everything else drops to the context color; from the start when left out.
   */
  at?: number;
};

/**
 * A single point of a highlight.
 */
export type HighlightPoint = {
  /**
   * The series, by field or label; the first series when left out.
   */
  series?: string;

  /**
   * The category.
   */
  category: string;
};

/**
 * What a chart's `highlight` prop takes: a name (a series, or else a category), a keyword, a list
 * of names, or a {@link HighlightSpec}.
 */
export type HighlightProp = string | readonly string[] | HighlightSpec;

/**
 * A highlight resolved against a chart's data.
 */
export type ResolvedHighlight = {
  /**
   * Whether anything is highlighted at all.
   */
  active: boolean;

  /**
   * Highlighted series keys.
   */
  series: ReadonlySet<string>;

  /**
   * Highlighted category indexes.
   */
  categories: ReadonlySet<number>;

  /**
   * Highlighted points, as `seriesKey|categoryIndex`.
   */
  points: ReadonlySet<string>;

  /**
   * The highlighted span as category indexes, first and last included, or `null`.
   */
  range: readonly [number, number] | null;

  /**
   * The step that turns the highlight on, if any.
   */
  at: number | undefined;

  /**
   * The highlight as the chart's spec describes it.
   */
  spec: ChartSpecHighlight;
};

/**
 * The highlight of a chart that highlights nothing.
 */
export const NO_HIGHLIGHT: ResolvedHighlight = {
  /**
   * Nothing is highlighted.
   */
  active: false,

  /**
   * No series.
   */
  series: new Set(),

  /**
   * No categories.
   */
  categories: new Set(),

  /**
   * No points.
   */
  points: new Set(),

  /**
   * No range.
   */
  range: null,

  /**
   * No step.
   */
  at: undefined,

  /**
   * An empty highlight in the spec.
   */
  spec: { series: [], categories: [], points: [], range: null },
};

/**
 * Resolves a chart's `highlight` against its data. A bare name is a series when one has that key or
 * label, else a category; `max`, `min`, `first` and `last` pick a category.
 *
 * @param prop - The chart's `highlight` prop, if any.
 * @param data - The chart's categories and series.
 * @returns The highlight; {@link NO_HIGHLIGHT} when the prop is left out.
 * @throws Error listing the chart's series and categories when a name matches neither.
 */
export function resolveHighlight(
  prop: HighlightProp | undefined,
  data: CategoricalData,
): ResolvedHighlight {
  if (prop === undefined) {
    return NO_HIGHLIGHT;
  }

  const spec = asSpec(prop, data);
  const series = new Set(names(spec.series).map((name) => seriesKey(name, data)));
  const categories = new Set(names(spec.category).map((name) => categoryIndex(name, data)));
  const pointList = spec.point === undefined ? [] : [spec.point].flat();
  const points = new Set(
    pointList.map((point) => {
      const key = point.series === undefined ? data.series[0]?.key : seriesKey(point.series, data);
      return `${key ?? ''}|${categoryIndex(point.category, data)}`;
    }),
  );
  const range =
    spec.range === undefined
      ? null
      : ([categoryIndex(spec.range[0], data), categoryIndex(spec.range[1], data)] as const);
  return {
    active: series.size + categories.size + points.size > 0 || range !== null,
    series,
    categories,
    points,
    range: range === null ? null : [minOf(range), maxOf(range)],
    at: spec.at,
    spec: {
      series: [...series].map((key) => labelOf(key, data)),
      categories: [...categories].map((index) => data.categories[index] ?? ''),
      points: [...points].map((point) => {
        const [key = '', index = '0'] = point.split('|');
        return { series: labelOf(key, data), category: data.categories[Number(index)] ?? '' };
      }),
      range:
        range === null
          ? null
          : { from: data.categories[range[0]] ?? '', to: data.categories[range[1]] ?? '' },
    },
  };
}

/**
 * Whether one mark (a series' value at a category) is in the highlight. With no highlight every
 * mark counts as highlighted. A series highlight takes the whole series; a category highlight that
 * name no series takes the category in every series.
 *
 * @param highlight - The resolved highlight.
 * @param series - The mark's series key.
 * @param index - The mark's category index.
 */
export function isHighlighted(
  highlight: ResolvedHighlight,
  series: string,
  index: number,
): boolean {
  if (!highlight.active) {
    return true;
  }

  if (highlight.series.has(series) || highlight.points.has(`${series}|${index}`)) {
    return true;
  }

  const inRange =
    highlight.range !== null && index >= highlight.range[0] && index <= highlight.range[1];
  const inCategories = highlight.categories.has(index) || inRange;
  return inCategories && (highlight.series.size === 0 || highlight.series.has(series));
}

/**
 * Whether a whole series is highlighted (or nothing is highlighted, so every series is).
 *
 * @param highlight - The resolved highlight.
 * @param series - The series key.
 */
export function isSeriesHighlighted(highlight: ResolvedHighlight, series: string): boolean {
  return !highlight.active || highlight.series.has(series);
}

/**
 * The key of the series a name means, by key or label.
 *
 * @param name - A series key or label.
 * @param data - The chart's data.
 * @throws Error listing the series when none matches.
 */
export function seriesKey(name: string, data: CategoricalData): string {
  const found = findSeries(name, data.series);
  if (found === undefined) {
    const known = data.series.map((series) => series.label).join(', ');
    throw new Error(`"${name}" is not a series of the chart. Its series are: ${known}.`);
  }

  return found.key;
}

/**
 * The index of the category a name or keyword means.
 *
 * @param name - A category, or `max`, `min`, `first` or `last`.
 * @param data - The chart's data.
 * @throws Error listing the categories when none matches.
 */
export function categoryIndex(name: string, data: CategoricalData): number {
  const keyword = keywordIndex(name, data);
  if (keyword !== undefined) {
    return keyword;
  }

  const index = data.categories.indexOf(String(name));
  if (index === -1) {
    const known = data.categories.join(', ');
    throw new Error(`"${name}" is not a category of the chart. Its categories are: ${known}.`);
  }

  return index;
}

/**
 * The highlight prop as a spec: a bare name or list becomes series or categories.
 *
 * @param prop - The prop.
 * @param data - The chart's data.
 */
function asSpec(prop: HighlightProp, data: CategoricalData): HighlightSpec {
  if (isHighlightSpec(prop)) {
    return prop;
  }

  const list = names(prop);
  const allSeries = list.every((name) => findSeries(name, data.series) !== undefined);
  const multiSeries = data.series.length > 1;
  return allSeries && multiSeries ? { series: list } : { category: list };
}

/**
 * Whether a highlight prop is a spelled-out spec, rather than a name or a list of names.
 *
 * @param prop - The prop.
 */
function isHighlightSpec(prop: HighlightProp): prop is HighlightSpec {
  return typeof prop === 'object' && !Array.isArray(prop);
}

/**
 * A target as a list of names.
 *
 * @param target - One name, several or none.
 */
function names(target: HighlightTarget | undefined): string[] {
  if (target === undefined) {
    return [];
  }

  return typeof target === 'string' ? [target] : [...target].map(String);
}

/**
 * The series a name means, by key or label.
 *
 * @param name - A key or label.
 * @param series - The chart's series.
 */
function findSeries(name: string, series: readonly SeriesData[]): SeriesData | undefined {
  return series.find((candidate) => candidate.key === name || candidate.label === name);
}

/**
 * The label of a series key.
 *
 * @param key - The key.
 * @param data - The chart's data.
 */
function labelOf(key: string, data: CategoricalData): string {
  return data.series.find((series) => series.key === key)?.label ?? key;
}

/**
 * The category a keyword picks, or `undefined` for a name that is not a keyword.
 *
 * @param name - The name.
 * @param data - The chart's data.
 */
function keywordIndex(name: string, data: CategoricalData): number | undefined {
  const values = data.series[0]?.values ?? [];
  switch (name) {
    case 'first': {
      return 0;
    }

    case 'last': {
      return Math.max(0, data.categories.length - 1);
    }

    case 'max':
    case 'min': {
      return extremeIndex(values, name);
    }

    default: {
      return undefined;
    }
  }
}

/**
 * The index of the largest or smallest value; the first one on a tie.
 *
 * @param values - The values.
 * @param which - `max` or `min`.
 */
function extremeIndex(values: readonly (number | null)[], which: 'max' | 'min'): number {
  let best = 0;
  for (const [index, value] of values.entries()) {
    const current = values[best] ?? null;
    if (value === null) {
      continue;
    }

    const better = current === null || (which === 'max' ? value > current : value < current);
    if (better) {
      best = index;
    }
  }

  return best;
}
