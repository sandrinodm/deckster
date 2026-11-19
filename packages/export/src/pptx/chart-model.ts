import type { ChartSvgItem } from '#pptx/chart-svg.ts';

/**
 * The font, size and color of chart text.
 */
export type ChartFont = {
  /**
   * The family the web set the text in.
   */
  family: string;

  /**
   * The size in canvas pixels.
   */
  size: number;

  /**
   * The color as `#rrggbb` or `#rrggbbaa`.
   */
  color: string;

  /**
   * Whether the text is bold (weight 600 or more).
   */
  bold: boolean;
};

/**
 * A value label a native chart draws, with the exact text the web shows.
 */
export type NativeLabel = {
  /**
   * The text, such as `33%` or `$1.2M`.
   */
  text: string;

  /**
   * Its font.
   */
  font: ChartFont;
};

/**
 * A marker on a line or scatter point.
 */
export type NativeMarker = {
  /**
   * The diameter in canvas pixels.
   */
  size: number;

  /**
   * The fill.
   */
  fill: string;

  /**
   * The outline, or `null` for none.
   */
  line: string | null;

  /**
   * The outline width in canvas pixels.
   */
  lineWidth: number;
};

/**
 * One series of a native chart group.
 */
export type NativeSeries = {
  /**
   * The series name.
   */
  name: string;

  /**
   * The values in category order; `null` leaves a gap.
   */
  values: (number | null)[];

  /**
   * The x values of a scatter series, else `null`.
   */
  x: (number | null)[] | null;

  /**
   * The fill (bars, areas, slices) or line color, or `null` for an invisible series (a waterfall's
   * base).
   */
  color: string | null;

  /**
   * One color per point where they differ from `color`, else `null`.
   */
  pointColors: (string | null)[] | null;

  /**
   * The line width of a line or scatter series in canvas pixels; the slice border of a doughnut.
   */
  lineWidth: number;

  /**
   * The color of a doughnut's slice borders (the plate behind it), or `null`.
   */
  borderColor: string | null;

  /**
   * The marker on every point, or `null` for none.
   */
  marker: NativeMarker | null;

  /**
   * Markers on single points (a line's end dot), by point index.
   */
  pointMarkers: (NativeMarker | null)[] | null;

  /**
   * The value labels by point, `null` where none is drawn.
   */
  labels: (NativeLabel | null)[];
};

/**
 * One chart group of the plot area: bars, lines, an area, a doughnut or a scatter.
 */
export type NativeGroup = {
  /**
   * The chart type.
   */
  type: 'bar' | 'line' | 'area' | 'doughnut' | 'scatter';

  /**
   * How series combine: side by side, stacked, or drawn over each other.
   */
  grouping: 'clustered' | 'stacked' | 'standard';

  /**
   * The series.
   */
  series: NativeSeries[];

  /**
   * The gap between bar groups as a share of a bar's width, in percent.
   */
  gapWidth: number;

  /**
   * How bars of one category overlap, -100 to 100 percent.
   */
  overlap: number;

  /**
   * A doughnut's hole as a percentage of its diameter.
   */
  holeSize: number;

  /**
   * A doughnut's first slice angle in degrees clockwise from 12 o'clock.
   */
  firstSliceAngle: number;
};

/**
 * An axis of a native chart.
 */
export type NativeAxis = {
  /**
   * The lowest value (value axes).
   */
  min: number | null;

  /**
   * The highest value (value axes).
   */
  max: number | null;

  /**
   * The distance between gridlines and labels, or `null` for automatic.
   */
  majorUnit: number | null;

  /**
   * The tick labels' font and number format, or `null` when the axis shows no labels.
   */
  labels: { font: ChartFont; format: string } | null;

  /**
   * The axis line, or `null` for none.
   */
  line: { color: string; width: number } | null;

  /**
   * The major gridlines, or `null` for none.
   */
  gridlines: { color: string; width: number } | null;

  /**
   * Whether the axis runs from its maximum to its minimum (categories top to bottom in a bar
   * chart).
   */
  reversed: boolean;
};

/**
 * A native PowerPoint chart that draws a kit chart's marks in the same place: the plot area laid
 * out where the web drew the plot, axes, gridlines and value labels as the web shows them.
 */
export type NativeChartModel = {
  /**
   * The chart's accessible name.
   */
  name: string;

  /**
   * The chart groups, drawn in order (an area under its line).
   */
  groups: NativeGroup[];

  /**
   * The categories, in order.
   */
  categories: string[];

  /**
   * Whether bars run horizontally.
   */
  horizontal: boolean;

  /**
   * Where lines and areas put their first point: on the plot's edge (`midCat`) or in the middle of
   * the first category (`between`).
   */
  crossBetween: 'between' | 'midCat';

  /**
   * The inner plot area as fractions of the chart's frame, or `null` for automatic layout.
   */
  plot: { x: number; y: number; width: number; height: number } | null;

  /**
   * The category axis (the x axis of a scatter), or `null` for a doughnut.
   */
  categoryAxis: NativeAxis | null;

  /**
   * The value axis, or `null` for a doughnut.
   */
  valueAxis: NativeAxis | null;

  /**
   * Whether the chart shows a native legend.
   */
  legend: { font: ChartFont } | null;

  /**
   * The number format of the values in the embedded workbook.
   */
  format: string;

  /**
   * The font chart text defaults to.
   */
  font: ChartFont;
};

/**
 * Something drawn over (or under) a native chart because the chart cannot draw it exactly: a direct
 * label, the centre text of a doughnut, an annotation, a legend, a connector.
 */
export type ChartOverlay = {
  /**
   * The SVG element it reproduces.
   */
  item: ChartSvgItem;

  /**
   * Whether it is drawn under the chart (it comes before the marks in the web's paint order).
   */
  behind: boolean;
};

/**
 * How a chart is exported and why.
 */
export type ChartPlan = {
  /**
   * `native` (an equivalent native chart, possibly with overlays), `simplified` (a native chart
   * with a visible difference, listed in `changes`), `picture` (the plot as SVG with a PNG
   * fallback) or `parts` (a figure without a plot, such as a big number or a table, drawn from its
   * text, shapes and pictures).
   */
  outcome: 'native' | 'simplified' | 'picture' | 'parts';

  /**
   * The native chart, or `null` for a picture.
   */
  model: NativeChartModel | null;

  /**
   * What is drawn over or under the native chart.
   */
  overlays: ChartOverlay[];

  /**
   * The scene id of the SVG the chart replaces, or `null`.
   */
  plotId: number | null;

  /**
   * Why, as short phrases for the dry-run report.
   */
  reasons: string[];

  /**
   * What looks different from the web, as short phrases; empty when the chart is equivalent.
   */
  changes: string[];
};
