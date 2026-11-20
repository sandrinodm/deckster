/**
 * The attribute every kit chart, number figure and data table puts on its root element: a JSON
 * {@link ChartSpec} describing what it shows, so tools outside React (PPTX export, `deck lint`,
 * tests) can read the chart without parsing its SVG. The value is the end state of the chart, with
 * every step revealed, in the colors of the surface it is drawn on.
 *
 * ```ts
 * for (const element of document.querySelectorAll('[data-chart-spec]')) {
 *   const spec = parseChartSpec(element.getAttribute(CHART_SPEC_ATTRIBUTE));
 * }
 * ```
 */
export const CHART_SPEC_ATTRIBUTE = 'data-chart-spec';

/**
 * The version of the {@link ChartSpec} shape; a breaking change to it raises the number.
 */
export const CHART_SPEC_VERSION = 1;

/**
 * Every kind of figure the kit draws: the chart components and the number-first forms.
 */
export const CHART_KINDS = [
  'bar',
  'line',
  'area',
  'donut',
  'scatter',
  'market-movement',
  'slope',
  'waterfall',
  'funnel',
  'heatmap',
  'retention-cohorts',
  'profit-pool',
  'sparkline',
  'big-number',
  'stat-row',
  'comparison',
  'progress',
  'pictogram',
  'table',
] as const;

/**
 * One of {@link CHART_KINDS}.
 */
export type ChartKind = (typeof CHART_KINDS)[number];

/**
 * The native PowerPoint object a figure maps to, as PptxGenJS names its chart types, or `table` for
 * a native table. `null` in {@link ChartSpec.native} means the figure has no native equivalent (a
 * big number, a pictogram, a heatmap) and export should place a picture or text.
 */
export type NativeChartType = 'bar' | 'line' | 'area' | 'doughnut' | 'scatter' | 'table';

/**
 * How numbers in the figure are written, as `Intl.NumberFormat` options plus unit text.
 */
export type ChartSpecFormat = {
  /**
   * The BCP 47 locale, such as `en-US`.
   */
  locale: string;

  /**
   * `percent` values are already in percent (34 means 34%); `currency` adds the currency sign.
   */
  style: 'number' | 'currency' | 'percent';

  /**
   * `compact` writes 1.2M; values under 10,000 are always written in full.
   */
  notation: 'standard' | 'compact';

  /**
   * The ISO 4217 code for `currency`, such as `USD`.
   */
  currency: string;

  /**
   * The most fraction digits a value shows.
   */
  maximumFractionDigits: number;

  /**
   * Text after the number, such as ` ms` or ` °C`; empty for none.
   */
  suffix: string;

  /**
   * An Excel-style number format code equivalent to the above, for native charts and tables, such
   * as `$#,##0.0,,"M"` or `0"%"`.
   */
  excel: string;
};

/**
 * One series of values, in category order.
 */
export type ChartSpecSeries = {
  /**
   * The series name as the chart labels it.
   */
  name: string;

  /**
   * One value per category, `null` where the series has none. For a waterfall, the change each step
   * makes (totals are their running total); for a scatter, the y values.
   */
  values: readonly (number | null)[];

  /**
   * The x value of each point in a scatter or market movement chart. Missing positions use `null`
   * in market movement; series from other chart kinds set this field to `null`.
   */
  x: readonly (number | null)[] | null;

  /**
   * The series color as `#rrggbb`: its own palette color, or the context color when another series
   * is highlighted.
   */
  color: string;

  /**
   * One color per value when they differ (a highlighted bar among muted ones, a waterfall's rises
   * and falls), else `null`.
   */
  pointColors: readonly string[] | null;

  /**
   * Whether the chart highlights this series.
   */
  highlighted: boolean;

  /**
   * The value labels the chart draws, one per value: the formatted text, or `null` where it draws
   * none.
   */
  labels: readonly (string | null)[];
};

/**
 * What the chart highlights; everything else is drawn in the context color.
 */
export type ChartSpecHighlight = {
  /**
   * Highlighted series names.
   */
  series: readonly string[];

  /**
   * Highlighted categories (bars, slices, rows, stages).
   */
  categories: readonly string[];

  /**
   * Highlighted single points, as series name and category.
   */
  points: readonly { series: string; category: string }[];

  /**
   * A highlighted span of categories or x values, first and last included, or `null`.
   */
  range: { from: string; to: string } | null;
};

/**
 * One annotation the chart draws, with its label as shown.
 */
export type ChartSpecAnnotation =
  | {
      /**
       * A label pointing at one point.
       */
      type: 'callout';

      /**
       * The text.
       */
      label: string;

      /**
       * The category or x value of the point.
       */
      category: string;

      /**
       * The value the callout points at.
       */
      value: number | null;
    }
  | {
      /**
       * A line across the plot at a value (a target, an average, a break-even).
       */
      type: 'reference';

      /**
       * The text.
       */
      label: string;

      /**
       * The value on the value axis.
       */
      value: number;
    }
  | {
      /**
       * A shaded span of categories or x values.
       */
      type: 'range';

      /**
       * The text.
       */
      label: string;

      /**
       * The first category of the span.
       */
      from: string;

      /**
       * The last category of the span.
       */
      to: string;
    }
  | {
      /**
       * A bracket between two points with the difference between them.
       */
      type: 'bracket';

      /**
       * The difference as shown, such as `+38%`.
       */
      label: string;

      /**
       * The two points, as category and value.
       */
      from: { category: string; value: number };

      /**
       * The second point.
       */
      to: { category: string; value: number };
    };

/**
 * The value axis, when the figure has one.
 */
export type ChartSpecAxis = {
  /**
   * The lowest value on the axis.
   */
  min: number;

  /**
   * The highest value on the axis.
   */
  max: number;

  /**
   * The tick values the chart labels.
   */
  ticks: readonly number[];

  /**
   * Whether the axis starts at zero.
   */
  zeroBased: boolean;

  /**
   * Whether a bar axis starts above zero, which the chart marks with an axis break.
   */
  truncated: boolean;
};

/**
 * One big figure of a number-first form: a big number, a stat, one side of a comparison, a progress
 * bar or a pictogram's count.
 */
export type ChartSpecFigure = {
  /**
   * The value as shown, such as `$4.2M` or `3 in 10`.
   */
  value: string;

  /**
   * The raw number, when there is one.
   */
  number: number | null;

  /**
   * What the number counts.
   */
  label: string;

  /**
   * The change as shown, or `null`.
   */
  delta: string | null;

  /**
   * Whether the change is good news, bad news or neither.
   */
  tone: 'positive' | 'negative' | 'neutral' | null;

  /**
   * Whether the figure is the highlighted one.
   */
  highlighted: boolean;

  /**
   * The figure's color as `#rrggbb`.
   */
  color: string;
};

/**
 * A table as shown: header labels, formatted cells and what is emphasized.
 */
export type ChartSpecTable = {
  /**
   * The column headers.
   */
  columns: readonly { key: string; label: string; align: 'left' | 'right' }[];

  /**
   * The cells as shown, row by row.
   */
  rows: readonly (readonly string[])[];

  /**
   * Indexes of emphasized rows.
   */
  highlightRows: readonly number[];

  /**
   * Keys of emphasized columns.
   */
  highlightColumns: readonly string[];

  /**
   * Emphasized single cells, as row index and column key.
   */
  highlightCells: readonly { row: number; column: string }[];

  /**
   * How the brand marks emphasis: an accent fill, accent text or an accent bar.
   */
  emphasis: 'fill' | 'text' | 'bar';
};

/**
 * The colors the figure is drawn in, all `#rrggbb` (`#rrggbbaa` when the brand's grid is
 * translucent).
 */
export type ChartSpecColors = {
  /**
   * The plate the chart draws behind itself; equals the slide background on solid surfaces.
   */
  plate: string;

  /**
   * The color of data that is not highlighted.
   */
  context: string;

  /**
   * Axis and annotation text.
   */
  label: string;

  /**
   * Value labels.
   */
  value: string;

  /**
   * Gridlines.
   */
  grid: string;

  /**
   * The baseline and axis lines.
   */
  axis: string;

  /**
   * Increases and good news.
   */
  positive: string;

  /**
   * Decreases and bad news.
   */
  negative: string;
};

/**
 * A serialisable description of one kit figure: what it shows, in what colors, what it highlights
 * and annotates, and the native PowerPoint object it maps to. Every figure writes one as JSON in
 * its {@link CHART_SPEC_ATTRIBUTE} attribute.
 */
export type ChartSpec = {
  /**
   * The shape's version, {@link CHART_SPEC_VERSION}.
   */
  version: typeof CHART_SPEC_VERSION;

  /**
   * The kind of figure.
   */
  kind: ChartKind;

  /**
   * The native PowerPoint object to build, or `null` when there is none.
   */
  native: NativeChartType | null;

  /**
   * `vertical` columns or `horizontal` bars; `vertical` for every kind without bars.
   */
  orientation: 'vertical' | 'horizontal';

  /**
   * Whether series stack on each other (stacked bars and areas, a waterfall).
   */
  stacked: boolean;

  /**
   * The accessible name: what the figure shows.
   */
  name: string;

  /**
   * The text summary screen readers get: the figure in a few sentences, with its key values.
   */
  summary: string;

  /**
   * The caption above the plot (measure, unit, period), or `null`.
   */
  caption: string | null;

  /**
   * The source line under the plot, or `null`.
   */
  source: string | null;

  /**
   * The categories or x labels, in order.
   */
  categories: readonly string[];

  /**
   * The series, in drawing order.
   */
  series: readonly ChartSpecSeries[];

  /**
   * How numbers are written.
   */
  format: ChartSpecFormat;

  /**
   * The value axis, or `null` when the figure has none.
   */
  axis: ChartSpecAxis | null;

  /**
   * What is highlighted.
   */
  highlight: ChartSpecHighlight;

  /**
   * The annotations, in drawing order.
   */
  annotations: readonly ChartSpecAnnotation[];

  /**
   * Whether the figure shows a legend.
   */
  legend: boolean;

  /**
   * The big figures of a number-first form; empty for charts.
   */
  figures: readonly ChartSpecFigure[];

  /**
   * The table of a `table` figure, else `null`.
   */
  table: ChartSpecTable | null;

  /**
   * The colors the figure is drawn in.
   */
  colors: ChartSpecColors;
};

/**
 * Reads a {@link ChartSpec} from the attribute's text.
 *
 * @param text - The value of {@link CHART_SPEC_ATTRIBUTE}, or `null` when the element has none.
 * @returns The spec, or `undefined` when the text is missing, is not JSON, or is of another version
 *   or kind.
 */
export function parseChartSpec(text: string | null): ChartSpec | undefined {
  if (text === null) {
    return undefined;
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const { version, kind } = value as { version?: unknown; kind?: unknown };
  const known = CHART_KINDS.some((candidate) => candidate === kind);
  return version === CHART_SPEC_VERSION && known ? (value as ChartSpec) : undefined;
}
