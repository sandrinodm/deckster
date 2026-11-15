import type { ChartSpecSeries } from '#charts/chart-spec.ts';
import type { CategoricalData } from '#charts/data/rows.ts';
import type { ResolvedFormat } from '#charts/format/number-format.ts';
import type { ChartDrawing, ChartFacts } from '#charts/frame/chart-frame.tsx';
import type { LabelMode } from '#charts/frame/chart-props.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { Anim, Scene, SceneItem, SceneLayer } from '#charts/frame/scene.ts';
import type { AnnotationInput } from '#charts/insight/annotations.ts';
import type { HighlightProp, ResolvedHighlight } from '#charts/insight/highlight.ts';
import type { Box } from '#charts/layout/label-placement.ts';
import type { Measure } from '#charts/layout/text-measure.ts';
import type { ValueAxis } from '#charts/scale/linear-scale.ts';

import { formatValue, runFormatter } from '#charts/format/number-format.ts';
import { annotationLayers } from '#charts/frame/annotation-items.ts';
import { seriesColor, seriesColors } from '#charts/frame/chart-theme.ts';
import { legendItems, legendHeight, type LegendEntry } from '#charts/frame/legend-items.ts';
import { axisItems, textOn, tickLabelWidth, xLabelDrop } from '#charts/frame/plot-parts.ts';
import { revealLayers, type RevealOption } from '#charts/frame/reveal.ts';
import { barPath } from '#charts/frame/scene.ts';
import { buildSpec, listNames } from '#charts/frame/spec-builder.ts';
import { annotationSpecs, resolveAnnotations } from '#charts/insight/annotations.ts';
import { isHighlighted, isSeriesHighlighted, resolveHighlight } from '#charts/insight/highlight.ts';
import { EMPHASIS_WEIGHT, lineHeight, wrapLines, wrapText } from '#charts/layout/text-measure.ts';
import { bandScale, type BandScale } from '#charts/scale/band-scale.ts';
import { linearScale, tickCountFor, valueAxis } from '#charts/scale/linear-scale.ts';
import { maxOf, minOf } from '#foundation/lists.ts';

/**
 * The most categories that get a value label each under `labels="auto"`.
 */
const AUTO_LABEL_MAX = 12;

/**
 * The widest a single column or bar is drawn, in pixels: wider bands leave air around it.
 */
const MAX_BAR = 132;

/**
 * The widest group of grouped bars.
 */
const MAX_GROUP = 240;

/**
 * The share of each band left empty between bars.
 */
const BAND_PADDING = 0.32;

/**
 * The gap between touching marks (stacked segments, grouped bars), in the plate's color.
 */
const MARK_GAP = 2;

/**
 * The least room each tick interval gets along a value axis.
 */
const TICK_SPACING = 150;

/**
 * The widest the category column of horizontal bars may be, as a share of the plot width.
 */
const MAX_LABEL_COLUMN = 0.34;

/**
 * Categories that gather the rest ("Other", "All other", "Rest"), which a sort leaves last.
 */
const OTHER_PATTERN = /^(?:all )?(?:other|others|rest|the rest)$/iu;

/**
 * Splits a category label into its words, at runs of whitespace.
 */
const WORD_SEPARATOR = /\s+/u;

/**
 * The share of a band a category label may fill: its wrapping width, and the room a horizontal row
 * leaves a label before it runs into its neighbour.
 */
const LABEL_WIDTH_SHARE = 0.92;

/**
 * The most lines a category label takes under a column, or beside a bar when a row has room for
 * two.
 */
const CATEGORY_LINES = 2;

/**
 * The most lines a category label may wrap to while deciding whether bars can be columns.
 */
const ORIENTATION_WRAP_LINES = 3;

/**
 * The room below zero is at most this many parts of the plot: the plot size is divided by it.
 */
const NEGATIVE_ROOM_DIVISOR = 3;

/**
 * How far an axis break's slanted cut reaches past the bar on each side, in pixels.
 */
const BREAK_OVERSHOOT = 2;

/**
 * How the bars of a {@link planBar} chart are laid out and labeled.
 */
export type BarOptions = {
  /**
   * `vertical` columns, `horizontal` bars, or `auto`: horizontal when the category labels do not
   * fit under columns.
   */
  orientation: 'auto' | 'vertical' | 'horizontal';

  /**
   * Stack series on each other instead of grouping them side by side.
   */
  stacked: boolean;

  /**
   * Sort categories by value (the highlighted or first series, or stack totals).
   */
  sort: 'none' | 'ascending' | 'descending';

  /**
   * Which value labels to draw.
   */
  labels: LabelMode;

  /**
   * Force the legend on or off.
   */
  legend: boolean | undefined;

  /**
   * The value axis minimum; above zero only with `truncate`.
   */
  min: number | undefined;

  /**
   * The value axis maximum.
   */
  max: number | undefined;

  /**
   * Allow `min` above zero, drawn with an axis break.
   */
  truncate: boolean;

  /**
   * The highlight.
   */
  highlight: HighlightProp | undefined;

  /**
   * The annotations.
   */
  annotations: readonly AnnotationInput[] | undefined;

  /**
   * Build the bars in steps, by series or by category.
   */
  reveal: RevealOption | undefined;

  /**
   * Whether a unit, currency or percent format, or a caption names the values' unit.
   */
  hasUnit: boolean;
};

/**
 * Everything {@link planBar} lays out from.
 */
export type BarInput = {
  /**
   * The categories and series.
   */
  data: CategoricalData;

  /**
   * The category field's name, for the chart's name and summary.
   */
  xField: string;

  /**
   * The plot size.
   */
  size: { width: number; height: number };

  /**
   * The chart theme.
   */
  theme: ChartTheme;

  /**
   * Measures text.
   */
  measure: Measure;

  /**
   * The format values are written in.
   */
  format: ResolvedFormat;

  /**
   * Layout and insight options.
   */
  options: BarOptions;

  /**
   * The caption and source, for the spec.
   */
  frame: { caption: string | undefined; source: string | undefined };
};

/**
 * One drawn bar or segment.
 */
type BarMark = {
  /**
   * The series key.
   */
  series: string;

  /**
   * The category index.
   */
  index: number;

  /**
   * The value.
   */
  value: number;

  /**
   * The bar's box.
   */
  box: Box;

  /**
   * The side of its data end.
   */
  end: 'top' | 'bottom' | 'left' | 'right';

  /**
   * Whether its data end is rounded (the outer segment of a stack, or a lone bar).
   */
  rounded: boolean;

  /**
   * Its color with the highlight on.
   */
  fill: string;

  /**
   * Its color before a highlight that arrives at a step.
   */
  fillBefore: string;

  /**
   * Whether it is highlighted (always, without a highlight).
   */
  highlighted: boolean;
};

/**
 * Lays out a bar chart for a plot size: orientation, sorting, scales, bars, value and category
 * labels, axis, legend, highlight colors and annotations, and the chart's spec and lint facts. Bars
 * always grow from zero unless `truncate` lets `min` cut the axis, which draws a break on every
 * bar.
 *
 * @param input - The data, size, theme, format and options.
 * @returns The scene to draw, the spec and the facts.
 * @throws Error naming the fix when the highlight or an annotation names a missing series or
 *   category.
 */
export function planBar(input: BarInput): Omit<ChartDrawing, 'plot'> & { scene: Scene } {
  const { theme, measure, format, options, size } = input;
  const data = sortData(input.data, options);
  const highlight = resolveHighlight(options.highlight, data);
  const firstHighlighted = [...highlight.series][0];
  const annotations = resolveAnnotations(options.annotations, data, {
    format,
    series: firstHighlighted,
  });
  const legend = options.legend ?? data.series.length > 1;
  const legendRoom = legend ? legendHeight(theme) : 0;
  const orientation = chooseOrientation(data, size, theme, measure, options.orientation);
  const vertical = orientation === 'vertical';
  const refused = !options.truncate && options.min !== undefined && options.min > 0;
  const truncated = options.truncate && options.min !== undefined && options.min > 0;
  const axisValues = stackExtents(data, options.stacked);

  /**
   * Lays the chart out for one label mode.
   */
  const draft = (labelMode: LabelMode): ReturnType<typeof layoutBars> =>
    layoutBars({
      ...input,
      data,
      highlight,
      legendRoom,
      vertical,
      truncated,
      axisValues,
      labelMode,
      annotations: annotations.length,
    });
  let layout = draft(resolveLabelMode(options.labels, data, highlight, options.stacked));
  if (layout.labelMode === 'all' && labelsCollide(layout, data, input, vertical)) {
    layout = draft(highlight.active ? 'highlight' : 'none');
  }

  const { plot, axis, scale, bands } = layout;
  const at = scale.at;
  const baseValue = truncated ? axis.min : 0;
  const marks = barMarks({
    data,
    highlight,
    theme,
    bands,
    at,
    baseValue,
    vertical,
    stacked: options.stacked,
    plot,
  });
  const labelItems = valueLabels({
    marks,
    data,
    highlight,
    theme,
    measure,
    format,
    mode: layout.labelMode,
    vertical,
    stacked: options.stacked,
    baseValue,
  });
  const categoryItems = categoryLabels({
    data,
    highlight,
    bands,
    plot,
    vertical,
    theme,
    measure,
    labelWidth: layout.labelColumn,
  });
  const axisLayer = axisItems({
    axis,
    at,
    direction: vertical ? 'y' : 'x',
    plot,
    theme,
    format,
    ticks: layout.labelMode !== 'all' || truncated,
    baseline: baseValue,
    measure,
  });
  const palette = seriesColors(
    theme,
    data.series.map((series) => series.key),
    highlight.series,
  );
  const legendEntries = barLegend(data, highlight, palette, theme);
  const geometry = {
    orientation,
    plot,
    span: (index: number) => {
      const start = bands.at(data.categories[index] ?? '');
      return [start, start + bands.bandwidth] as const;
    },
    value: at,
    tip: (series: string, index: number) => tipOf(marks, series, index, vertical),
    bracket: 'over' as const,
  };
  const obstacles = [...labelItems.boxes, ...categoryItems.boxes, ...marks.map((mark) => mark.box)];
  const notes = annotationLayers(annotations, geometry, { theme, measure, obstacles });
  const markItems = marks.map((mark) => markItem(mark, theme));
  const breaks = truncated ? breakItems(marks, theme, vertical) : [];
  const zoomNote = axisStartNote({
    truncated,
    x: plot.x,
    y: layout.noteY,
    min: axis.min,
    format,
    theme,
  });
  const layers: SceneLayer[] = [
    { at: undefined, items: [...axisLayer, ...categoryItems.items, ...zoomNote] },
    ...notes.back,
    ...revealLayers({
      reveal: options.reveal,
      data,
      items: [...markItems, ...breaks, ...labelItems.items].map((item, position) => ({
        item,
        ...ownerOf(position, marks, breaks.length, labelItems.owners),
      })),
    }),
    ...(legend
      ? [
          {
            at: undefined,
            items: legendItems(legendEntries, { theme, measure, width: size.width }),
          },
        ]
      : []),
    ...notes.front,
  ];
  const facts: ChartFacts = {
    series: data.series.length,
    categories: data.categories.length,
    // Annotations direct the eye as a highlight does.
    highlighted: highlight.active || annotations.length > 0,
    axis: axisFact(refused, truncated),
    unit: options.hasUnit,
    legend,
    legendAvoidable: options.legend === true && data.series.length <= 1,
    marks: marks.length,
    colored: coloredCount(marks, theme),
  };
  const spec = buildSpec(
    {
      kind: 'bar',
      name: chartName(data, input.xField),
      summary: summarize(data, highlight, format, input.xField),
      orientation,
      stacked: options.stacked,
      categories: data.categories,
      series: specSeries(data, marks, highlight, theme, labelItems.texts),
      axis: { min: axis.min, max: axis.max, ticks: axis.ticks, zeroBased: !truncated, truncated },
      highlight: highlight.spec,
      annotations: annotationSpecs(annotations, data),
      legend,
    },
    {
      theme,
      format,
      largest: Math.max(Math.abs(axis.min), Math.abs(axis.max)),
      caption: input.frame.caption,
      source: input.frame.source,
    },
  );
  return {
    scene: { width: size.width, height: size.height, layers, highlightAt: highlight.at },
    spec,
    facts,
  };
}

/**
 * The layout of one choice of labels: the plot box, the value axis and scale, the bands, and where
 * the note above a truncated axis sits.
 */
type BarLayout = {
  /**
   * The plot box.
   */
  plot: Box;

  /**
   * The value axis.
   */
  axis: ValueAxis;

  /**
   * The value scale, from the axis to the plot.
   */
  scale: ReturnType<typeof linearScale>;

  /**
   * The category bands.
   */
  bands: BandScale;

  /**
   * The label mode the layout was made for.
   */
  labelMode: LabelMode;

  /**
   * The width of the category label column beside horizontal bars, else 0.
   */
  labelColumn: number;

  /**
   * The height of the truncated axis note's baseline.
   */
  noteY: number;
};

/**
 * The layout input: the bar input with the highlight, the legend room and the derived flags.
 */
type LayoutInput = BarInput & {
  /**
   * The categories and series, sorted.
   */
  data: CategoricalData;

  /**
   * The highlight.
   */
  highlight: ResolvedHighlight;

  /**
   * The height the legend takes above the plot.
   */
  legendRoom: number;

  /**
   * Whether bars are columns.
   */
  vertical: boolean;

  /**
   * Whether the axis is truncated on purpose.
   */
  truncated: boolean;

  /**
   * Every value the axis must show.
   */
  axisValues: number[];

  /**
   * The label mode to lay out for.
   */
  labelMode: LabelMode;

  /**
   * How many annotations the chart draws.
   */
  annotations: number;
};

/**
 * The room that both orientations share: the value axis, the strips the value labels and the
 * truncated note take, the tick labels and whether labels below zero need room.
 */
type SharedRoom = {
  /**
   * The gap between a label and its mark or the axis.
   */
  gap: number;

  /**
   * The height of one value label.
   */
  valueHeight: number;

  /**
   * The height of one axis label line.
   */
  axisHeight: number;

  /**
   * Whether the value axis shows ticks.
   */
  showTicks: boolean;

  /**
   * The strip above the plot for value labels, or 0 without them.
   */
  labelRoom: number;

  /**
   * The strip above the plot for a truncated axis's note, or 0.
   */
  noteRoom: number;

  /**
   * The note's baseline.
   */
  noteY: number;

  /**
   * Whether a value is below zero, so its label needs room past the bar.
   */
  negative: boolean;

  /**
   * The value axis.
   */
  axis: ValueAxis;
};

/**
 * The plot box, axis, scale and bands for one choice of labels.
 */
function layoutBars(input: LayoutInput): BarLayout {
  const room = sharedRoom(input);
  return input.vertical ? columnLayout(input, room) : barLayout(input, room);
}

/**
 * The room both orientations share, for one choice of labels.
 *
 * @param input - The layout input.
 */
function sharedRoom(input: LayoutInput): SharedRoom {
  const { theme, options, size, labelMode } = input;
  const gap = theme.space.sm;
  const valueHeight = lineHeight(theme.text.value);
  const axisHeight = lineHeight(theme.text.axis);
  const showTicks = labelMode !== 'all' || input.truncated;
  const labelRoom = labelMode === 'none' ? 0 : valueHeight + gap;
  // A truncated axis says where it starts, above the plot, as a zoomed line does.
  const noteRoom = input.truncated ? lineHeight(theme.text.annotation) + gap : 0;
  const noteY = input.legendRoom + lineHeight(theme.text.annotation) / 2;
  // Labels of bars below zero go past their tips, away from the category labels: room for them.
  const negative = labelMode !== 'none' && input.axisValues.some((value) => value < 0);
  const length = input.vertical ? size.height : size.width;
  const axis = valueAxis(input.axisValues, {
    zero: !input.truncated,
    count: tickCountFor(length, TICK_SPACING),
    ...(input.truncated && options.min !== undefined ? { min: options.min } : {}),
    ...axisEnds(input.axisValues, options.max, showTicks),
  });
  return { gap, valueHeight, axisHeight, showTicks, labelRoom, noteRoom, noteY, negative, axis };
}

/**
 * The layout of columns: the plot above the category labels, with the value labels' strip above it
 * and a strip for the bracket annotations.
 *
 * @param input - The layout input.
 * @param room - The room both orientations share.
 */
function columnLayout(input: LayoutInput, room: SharedRoom): BarLayout {
  const { theme, measure, format, options, size, data, labelMode } = input;
  const { gap, valueHeight, axisHeight, showTicks, labelRoom, noteRoom, noteY, negative, axis } =
    room;
  const bracketRoom = (options.annotations ?? []).some((note) => note.type === 'bracket')
    ? valueHeight * 2 + theme.space.md
    : 0;
  const gutter = showTicks ? tickLabelWidth(axis, format, theme, measure) + gap : 0;
  const categoryLines = maxCategoryLines(
    data,
    (size.width - gutter) / Math.max(1, data.categories.length),
    theme,
    measure,
  );
  const top = input.legendRoom + noteRoom + labelRoom + bracketRoom;
  const bottom = categoryLines * axisHeight + gap;
  const plot = {
    x: gutter,
    y: top,
    width: Math.max(0, size.width - gutter),
    height: Math.max(0, size.height - top - bottom),
  };
  const below = negative ? Math.min(labelRoom, plot.height / NEGATIVE_ROOM_DIVISOR) : 0;
  const scale = linearScale([axis.min, axis.max], [plot.y + plot.height - below, plot.y]);
  const bands = bandScale(
    data.categories,
    [plot.x, plot.x + plot.width],
    bandOptions(data, options.stacked),
  );
  return { plot, axis, scale, bands, labelMode, labelColumn: 0, noteY };
}

/**
 * The layout of horizontal bars: the plot beside a category label column, with the value labels'
 * strip at its end.
 *
 * @param input - The layout input.
 * @param room - The room both orientations share.
 */
function barLayout(input: LayoutInput, room: SharedRoom): BarLayout {
  const { theme, measure, format, options, size, data, labelMode } = input;
  const { gap, axisHeight, showTicks, noteRoom, noteY, negative, axis } = room;
  const widest = maxOf(
    data.categories.map((category) => measure(category, theme.text.axis)),
    0,
  );
  const labelColumn = Math.min(widest, size.width * MAX_LABEL_COLUMN);
  const valueWidth =
    labelMode === 'none' ? 0 : widestValue(data, format, theme, measure, options.stacked) + gap;
  // Tick labels hang under the plot by the drop that clears the lowest category label.
  const bottom = showTicks ? axisHeight + xLabelDrop(theme) : 0;
  const plot = {
    x: labelColumn + theme.space.md,
    y: input.legendRoom + noteRoom,
    width: Math.max(0, size.width - labelColumn - theme.space.md - valueWidth),
    height: Math.max(0, size.height - input.legendRoom - noteRoom - bottom),
  };
  const left = negative
    ? Math.min(
        widestValue(data, format, theme, measure, options.stacked, true) + gap,
        plot.width / NEGATIVE_ROOM_DIVISOR,
      )
    : 0;
  const scale = linearScale([axis.min, axis.max], [plot.x + left, plot.x + plot.width]);
  const bands = bandScale(
    data.categories,
    [plot.y, plot.y + plot.height],
    bandOptions(data, options.stacked),
  );
  return { plot, axis, scale, bands, labelMode, labelColumn, noteY };
}

/**
 * The ends of a value axis without ticks: the data's own extremes (from zero), so the longest bar
 * uses the whole length when every value is labeled. With ticks the axis rounds to whole ticks.
 *
 * @param values - The values on the axis.
 * @param max - The chart's own `max`, if set.
 * @param ticks - Whether the axis shows ticks.
 */
function axisEnds(
  values: readonly number[],
  max: number | undefined,
  ticks: boolean,
): { max?: number; min?: number } {
  if (max !== undefined) {
    return { max };
  }

  if (ticks || values.length === 0) {
    return {};
  }

  const low = minOf(values, 0);
  return { max: maxOf(values, 0), ...(low < 0 ? { min: low } : {}) };
}

/**
 * The band padding and cap for single, grouped or stacked bars.
 *
 * @param data - The chart's data.
 * @param stacked - Whether series stack.
 */
function bandOptions(
  data: CategoricalData,
  stacked: boolean,
): { padding: number; maxBandwidth: number } {
  const grouped = !stacked && data.series.length > 1;
  return { padding: BAND_PADDING, maxBandwidth: grouped ? MAX_GROUP : MAX_BAR };
}

/**
 * Categories in the order the chart sorts them, series values reordered with them; a category that
 * gathers the rest ("Other") stays last.
 *
 * @param data - The data in row order.
 * @param options - The sort, highlight and stacking.
 */
function sortData(data: CategoricalData, options: BarOptions): CategoricalData {
  if (options.sort === 'none') {
    return data;
  }

  /**
   * A category's sort key: its stack total, or its first series' value.
   */
  const keyOf = (index: number): number =>
    options.stacked
      ? data.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0)
      : (data.series[0]?.values[index] ?? Number.NEGATIVE_INFINITY);
  /**
   * Whether a category gathers the rest, which sorts last.
   */
  const rest = (index: number): number =>
    OTHER_PATTERN.test(data.categories[index] ?? '') ? 1 : 0;
  const order = data.categories
    .map((_, index) => index)
    .toSorted((a, b) => {
      const byValue = options.sort === 'descending' ? keyOf(b) - keyOf(a) : keyOf(a) - keyOf(b);
      return rest(a) - rest(b) || byValue;
    });
  return {
    x: data.x,
    categories: order.map((index) => data.categories[index] ?? ''),
    series: data.series.map((series) => ({
      ...series,
      values: order.map((index) => series.values[index] ?? null),
    })),
  };
}

/**
 * The orientation to draw: as asked, or for `auto` horizontal when a category label cannot be set
 * under its column in two lines.
 *
 * @param data - The chart's data.
 * @param size - The plot size.
 * @param theme - The chart theme.
 * @param measure - Measures text.
 * @param asked - The `orientation` prop.
 */
function chooseOrientation(
  data: CategoricalData,
  size: { width: number },
  theme: ChartTheme,
  measure: Measure,
  asked: BarOptions['orientation'],
): 'vertical' | 'horizontal' {
  if (asked !== 'auto') {
    return asked;
  }

  const step = size.width / Math.max(1, data.categories.length);
  const room = step * LABEL_WIDTH_SHARE;
  const style = theme.text.axis;
  const fits = data.categories.every((category) => {
    const words = category.split(WORD_SEPARATOR);
    const widest = maxOf(words.map((word) => measure(word, style)));
    return (
      widest <= room &&
      wrapText(category, room, { measure, style, maxLines: ORIENTATION_WRAP_LINES }).length <=
        CATEGORY_LINES
    );
  });
  return fits ? 'vertical' : 'horizontal';
}

/**
 * The label mode `auto` resolves to: every value for a single series (or stacks) of a dozen
 * categories or fewer, else the highlighted values, else none.
 *
 * @param asked - The `labels` prop.
 * @param data - The chart's data.
 * @param highlight - The highlight.
 * @param stacked - Whether series stack.
 */
function resolveLabelMode(
  asked: LabelMode,
  data: CategoricalData,
  highlight: ResolvedHighlight,
  stacked: boolean,
): LabelMode {
  if (asked !== 'auto') {
    return asked;
  }

  const few = data.categories.length <= AUTO_LABEL_MAX;
  if (few && (data.series.length === 1 || stacked)) {
    return 'all';
  }

  return highlight.active ? 'highlight' : 'none';
}

/**
 * Whether labeling every value would set labels over each other: a label wider than its column.
 *
 * @param layout - The layout with every value labeled.
 * @param data - The chart's data.
 * @param input - The chart input.
 * @param vertical - The orientation the chart resolved to, which `auto` leaves open in the options.
 */
function labelsCollide(
  layout: { bands: BandScale; plot: Box },
  data: CategoricalData,
  input: BarInput,
  vertical: boolean,
): boolean {
  if (
    !vertical &&
    layout.plot.height / Math.max(1, data.categories.length) >= lineHeight(input.theme.text.value)
  ) {
    return false;
  }

  const widest = widestValue(data, input.format, input.theme, input.measure, input.options.stacked);
  return widest > layout.bands.step - input.theme.space.sm;
}

/**
 * The widest value label, from every value (or every stack total).
 *
 * @param data - The chart's data.
 * @param format - The format.
 * @param theme - The chart theme.
 * @param measure - Measures text.
 * @param stacked - Whether series stack (labels are then totals).
 * @param negativeOnly - Measure only the labels of values below zero.
 */
function widestValue(
  data: CategoricalData,
  format: ResolvedFormat,
  theme: ChartTheme,
  measure: Measure,
  stacked: boolean,
  negativeOnly = false,
): number {
  const values = stacked
    ? data.categories.map((_, index) =>
        data.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0),
      )
    : data.series.flatMap((series) => series.values.filter((value) => value !== null));
  const style = { ...theme.text.value, weight: EMPHASIS_WEIGHT };
  const write = runFormatter(values, format);
  const measured = negativeOnly ? values.filter((value) => value < 0) : values;
  return maxOf(
    measured.map((value) => measure(write(value), style)),
    0,
  );
}

/**
 * The lines the tallest category label takes under its column, one or two.
 *
 * @param data - The chart's data.
 * @param step - The width of each column's band.
 * @param theme - The chart theme.
 * @param measure - Measures text.
 */
function maxCategoryLines(
  data: CategoricalData,
  step: number,
  theme: ChartTheme,
  measure: Measure,
): number {
  const style = theme.text.axis;
  return maxOf(
    data.categories.map(
      (category) =>
        wrapText(category, step * LABEL_WIDTH_SHARE, { measure, style, maxLines: CATEGORY_LINES })
          .length,
    ),
    1,
  );
}

/**
 * Every value the axis must show: each value, or each stack's positive and negative totals.
 *
 * @param data - The chart's data.
 * @param stacked - Whether series stack.
 */
function stackExtents(data: CategoricalData, stacked: boolean): number[] {
  if (!stacked) {
    return data.series.flatMap((series) => series.values.filter((value) => value !== null));
  }

  return data.categories.flatMap((_, index) => {
    const values = data.series.map((series) => series.values[index] ?? 0);
    const up = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const down = values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
    return [up, down];
  });
}

/**
 * The bars and segments, each with its box, end and colors.
 */
function barMarks(input: {
  data: CategoricalData;
  highlight: ResolvedHighlight;
  theme: ChartTheme;
  bands: BandScale;
  at: (value: number) => number;
  baseValue: number;
  vertical: boolean;
  stacked: boolean;
  plot: Box;
}): BarMark[] {
  const { data, highlight, theme, bands, at, baseValue, vertical, stacked } = input;
  const marks: BarMark[] = [];
  const count = data.series.length;
  const grouped = !stacked && count > 1;
  const sub = grouped ? (bands.bandwidth - MARK_GAP * (count - 1)) / count : bands.bandwidth;
  const palette = seriesColors(
    theme,
    data.series.map((series) => series.key),
    highlight.series,
  );
  for (const [index, category] of data.categories.entries()) {
    let up = baseValue;
    let down = baseValue;
    const stackTops = new Map<string, boolean>();
    if (stacked) {
      const last = { up: '', down: '' };
      for (const series of data.series) {
        const value = series.values[index] ?? null;
        if (value !== null && value > 0) {
          last.up = series.key;
        } else if (value !== null && value < 0) {
          last.down = series.key;
        }
      }

      stackTops.set(last.up, true);
      stackTops.set(last.down, true);
    }

    for (const [position, series] of data.series.entries()) {
      const value = series.values[index] ?? null;
      if (value === null) {
        continue;
      }

      const from = stackBase(stacked, value, { up, down, base: baseValue });
      const reach = stacked ? from + value : value;
      if (stacked && value >= 0) {
        up = reach;
      } else if (stacked) {
        down = reach;
      }

      const outer = !stacked || stackTops.get(series.key) === true;
      const offset = grouped ? position * (sub + MARK_GAP) : 0;
      const inset = stacked && !outer ? MARK_GAP : 0;
      const band = { x: bands.at(category) + offset, width: sub };
      const box = boxBetween(band, at(from), at(reach), inset, vertical ? 'y' : 'x');
      const color = palette.get(series.key) ?? seriesColor(theme, position);
      const highlighted = isHighlighted(highlight, series.key, index);
      marks.push({
        series: series.key,
        index,
        value,
        box,
        end: endOf(vertical, value >= baseValue),
        rounded: outer,
        fill: highlighted ? color : theme.context,
        fillBefore: color,
        highlighted,
      });
    }
  }

  return marks;
}

/**
 * Where a bar starts: the base for a lone bar, the top of the stack so far (or its bottom, for a
 * negative value) for a segment.
 *
 * @param stacked - Whether series stack.
 * @param value - The bar's value.
 * @param ends - The stack's positive and negative ends so far and the base.
 */
function stackBase(
  stacked: boolean,
  value: number,
  ends: { up: number; down: number; base: number },
): number {
  if (!stacked) {
    return ends.base;
  }

  return value >= 0 ? ends.up : ends.down;
}

/**
 * The box of a bar between two positions along the value axis, with an inset at its far end for the
 * gap between stacked segments.
 *
 * @param band - The bar's start and width across the category axis.
 * @param a - The position of its base along the value axis.
 * @param b - The position of its end.
 * @param inset - Pixels to leave at the end for the gap.
 * @param axis - The direction of the value axis.
 */
function boxBetween(
  band: { x: number; width: number },
  a: number,
  b: number,
  inset: number,
  axis: 'x' | 'y',
): Box {
  const low = Math.min(a, b);
  const length = Math.max(0, Math.abs(b - a) - inset);
  const start = b < a ? low + inset : low;
  return axis === 'y'
    ? { x: band.x, y: start, width: band.width, height: length }
    : { x: start, y: band.x, width: length, height: band.width };
}

/**
 * The side a bar's data end is on.
 *
 * @param vertical - Whether bars are columns.
 * @param positive - Whether the value is at or above the base.
 */
function endOf(vertical: boolean, positive: boolean): BarMark['end'] {
  if (vertical) {
    return positive ? 'top' : 'bottom';
  }

  return positive ? 'right' : 'left';
}

/**
 * The note that says where a truncated axis starts, drawn above the plot; none when the axis is not
 * truncated.
 *
 * @param input - Whether the axis is truncated, the note's position, the axis start and the format.
 */
function axisStartNote(input: {
  truncated: boolean;
  x: number;
  y: number;
  min: number;
  format: ResolvedFormat;
  theme: ChartTheme;
}): SceneItem[] {
  if (!input.truncated) {
    return [];
  }

  return [
    {
      kind: 'text',
      x: input.x,
      y: input.y,
      lines: [`Axis starts at ${formatValue(input.min, input.format)}`],
      style: input.theme.text.annotation,
      color: input.theme.colors.label,
      anchor: 'start',
    },
  ];
}

/**
 * How many series the chart draws in their own color: those with a bar that is not the context
 * color.
 *
 * @param marks - The bars.
 * @param theme - The chart theme.
 */
function coloredCount(marks: readonly BarMark[], theme: ChartTheme): number {
  return new Set(marks.filter((mark) => mark.fill !== theme.context).map((mark) => mark.series))
    .size;
}

/**
 * A bar as a scene path, building from its base, staggered by category.
 *
 * @param mark - The bar.
 * @param theme - The chart theme.
 */
function markItem(mark: BarMark, theme: ChartTheme): SceneItem {
  return {
    kind: 'path',
    d: barPath(mark.box, mark.end, mark.rounded ? theme.barRadius : 0),
    fill: mark.fill,
    fillBefore: mark.fillBefore,
    anim: animFor(mark.end),
    order: mark.index,
    mark: true,
  };
}

/**
 * The build of a bar by the side of its data end.
 *
 * @param end - The data end.
 */
function animFor(end: BarMark['end']): Anim {
  switch (end) {
    case 'top': {
      return 'rise';
    }

    case 'bottom': {
      return 'drop';
    }

    case 'right': {
      return 'grow-right';
    }

    case 'left': {
      return 'grow-left';
    }
  }
}

/**
 * The value labels: at each bar's tip (outside it, or inside its end when there is no room), or
 * each stack's total; the highlighted ones heavier and in the heading color.
 */
function valueLabels(input: {
  marks: readonly BarMark[];
  data: CategoricalData;
  highlight: ResolvedHighlight;
  theme: ChartTheme;
  measure: Measure;
  format: ResolvedFormat;
  mode: LabelMode;
  vertical: boolean;
  stacked: boolean;
  baseValue: number;
}): {
  items: SceneItem[];
  boxes: Box[];
  owners: { series: string; index: number }[];
  texts: Map<string, string>;
} {
  const { marks, data, highlight, theme, measure, format, mode, vertical, stacked, baseValue } =
    input;
  const items: SceneItem[] = [];
  const boxes: Box[] = [];
  const owners: { series: string; index: number }[] = [];
  const texts = new Map<string, string>();
  if (mode === 'none') {
    return { items, boxes, owners, texts };
  }

  const style = theme.text.value;
  const height = lineHeight(style);
  const gap = theme.space.xs + MARK_GAP;
  const targets = stacked
    ? stackTotals(marks, data)
    : marks.map((mark) => ({ mark, value: mark.value, tip: mark.box }));
  const last = data.categories.length - 1;
  const write = runFormatter(
    targets.map((target) => target.value),
    format,
  );
  for (const { mark, value, tip } of targets) {
    const wanted =
      mode === 'all' ||
      (mode === 'highlight' && highlight.active && mark.highlighted) ||
      (mode === 'ends' && (mark.index === 0 || mark.index === last));
    if (!wanted) {
      continue;
    }

    const emphasized = highlight.active && mark.highlighted;
    const text = write(value);
    const width = measure(text, { ...style, weight: emphasized ? EMPHASIS_WEIGHT : style.weight });
    texts.set(`${mark.series}|${mark.index}`, text);
    const color = labelColor(emphasized, highlight.active, theme);
    const common = {
      kind: 'text' as const,
      lines: [text],
      style,
      color,
      colorBefore: theme.colors.value,
      anim: 'fade' as const,
      lag: true,
      order: mark.index,
      ...(emphasized ? { weight: EMPHASIS_WEIGHT } : {}),
    };
    if (vertical) {
      const above = value >= baseValue;
      const y = above ? tip.y - gap - height / 2 : tip.y + tip.height + gap + height / 2;
      const x = tip.x + tip.width / 2;
      items.push({ ...common, x, y, anchor: 'middle' });
      boxes.push({ x: x - width / 2, y: y - height / 2, width, height });
    } else {
      const right = value >= baseValue;
      const x = right ? tip.x + tip.width + gap : tip.x - gap;
      const y = tip.y + tip.height / 2;
      items.push({ ...common, x, y, anchor: right ? 'start' : 'end' });
      boxes.push({ x: right ? x : x - width, y: y - height / 2, width, height });
    }

    owners.push({ series: mark.series, index: mark.index });
  }

  if (stacked && highlight.series.size > 0) {
    segmentLabels({ marks, highlight, theme, measure, format, items, owners, texts });
  }

  return { items, boxes, owners, texts };
}

/**
 * The values of a stack's highlighted segments, inside each segment where it has room, in the color
 * that reads on the segment: a stack's total alone does not say what the highlighted series
 * contributes.
 *
 * @param input - The segments, highlight, theme, measurer and format, and the lists to add to.
 */
function segmentLabels(input: {
  marks: readonly BarMark[];
  highlight: ResolvedHighlight;
  theme: ChartTheme;
  measure: Measure;
  format: ResolvedFormat;
  items: SceneItem[];
  owners: { series: string; index: number }[];
  texts: Map<string, string>;
}): void {
  const { marks, highlight, theme, measure, format, items, owners, texts } = input;
  const style = theme.text.value;
  const chosen = marks.filter((mark) => highlight.series.has(mark.series) && mark.highlighted);
  const write = runFormatter(
    chosen.map((mark) => mark.value),
    format,
  );
  for (const mark of chosen) {
    const text = write(mark.value);
    const width = measure(text, { ...style, weight: EMPHASIS_WEIGHT });
    const height = lineHeight(style);
    const room = theme.space.xs * 2;
    if (mark.box.width < width + room || mark.box.height < height + room / 2) {
      continue;
    }

    items.push({
      kind: 'text',
      x: mark.box.x + mark.box.width / 2,
      y: mark.box.y + mark.box.height / 2,
      lines: [text],
      style,
      weight: EMPHASIS_WEIGHT,
      color: textOn(mark.fill, theme),
      colorBefore: textOn(mark.fillBefore, theme),
      // The segment it sits on, for the contrast check: SVG text paints no background.
      background: mark.fill,
      anchor: 'middle',
      anim: 'fade',
      lag: true,
      order: mark.index,
    });
    owners.push({ series: mark.series, index: mark.index });
    texts.set(`${mark.series}|${mark.index}`, text);
  }
}

/**
 * The legend of a bar chart: every series in its color, or, when a highlight drops some series to
 * the context color, the highlighted series and one "everything else" entry instead of a row of
 * identical grey swatches.
 *
 * @param data - The chart's data.
 * @param highlight - The highlight.
 * @param palette - Each series' own color.
 * @param theme - The chart theme.
 */
function barLegend(
  data: CategoricalData,
  highlight: ResolvedHighlight,
  palette: ReadonlyMap<string, string>,
  theme: ChartTheme,
): LegendEntry[] {
  /**
   * A series' own color.
   */
  const own = (index: number, key: string): string => palette.get(key) ?? seriesColor(theme, index);
  if (highlight.series.size === 0) {
    return data.series.map((series, index) => ({
      label: series.label,
      color: own(index, series.key),
      at: series.at,
    }));
  }

  const chosen = data.series
    .map((series, index) => ({ series, index }))
    .filter(({ series }) => highlight.series.has(series.key));
  const rest = data.series.filter((series) => !highlight.series.has(series.key));
  const entries: LegendEntry[] = chosen.map(({ series, index }) => ({
    label: series.label,
    color: own(index, series.key),
    at: series.at,
  }));
  if (rest.length === 0) {
    return entries;
  }

  return [...entries, { label: restLabel(rest), color: theme.context, at: undefined }];
}

/**
 * The name of the series a highlight drops: the series' own name when it is the only one, else
 * "Everything else".
 *
 * @param rest - The series the highlight drops.
 */
function restLabel(rest: readonly { label: string }[]): string {
  return rest.length === 1 ? (rest[0]?.label ?? '') : 'Everything else';
}

/**
 * A value label's color: the heading color on a highlighted bar, the label color on the bars it
 * mutes, the value color when nothing is highlighted.
 *
 * @param emphasized - Whether the bar is highlighted.
 * @param active - Whether the chart highlights anything.
 * @param theme - The chart theme.
 */
function labelColor(emphasized: boolean, active: boolean, theme: ChartTheme): string {
  if (emphasized) {
    return theme.colors.heading;
  }

  return active ? theme.colors.label : theme.colors.value;
}

/**
 * Each stack's total and the box at its outer end, labeled at the stack's last positive segment.
 *
 * @param marks - The segments.
 * @param data - The chart's data.
 */
function stackTotals(
  marks: readonly BarMark[],
  data: CategoricalData,
): { mark: BarMark; value: number; tip: Box }[] {
  return data.categories.flatMap((_, index) => {
    const segments = marks.filter((mark) => mark.index === index && mark.value >= 0);
    const outer = segments.find((mark) => mark.rounded) ?? segments.at(-1);
    if (outer === undefined) {
      return [];
    }

    const value = segments.reduce((sum, mark) => sum + mark.value, 0);
    const union = segments.reduce((box, mark) => unionBox(box, mark.box), outer.box);
    return [
      {
        mark: { ...outer, highlighted: segments.some((mark) => mark.highlighted) },
        value,
        tip: union,
      },
    ];
  });
}

/**
 * The smallest box holding two boxes.
 *
 * @param a - One box.
 * @param b - The other.
 */
function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * The category labels: under each column (wrapped to two lines), or right-aligned beside each bar;
 * a highlighted category's label in the value color and heavier.
 */
function categoryLabels(input: {
  data: CategoricalData;
  highlight: ResolvedHighlight;
  bands: BandScale;
  plot: Box;
  vertical: boolean;
  theme: ChartTheme;
  measure: Measure;
  labelWidth: number;
}): { items: SceneItem[]; boxes: Box[] } {
  const { data, highlight, bands, plot, vertical, theme, measure, labelWidth } = input;
  const style = theme.text.axis;
  const height = lineHeight(style);
  const items: SceneItem[] = [];
  const boxes: Box[] = [];
  for (const [index, category] of data.categories.entries()) {
    const emphasized =
      highlight.active && (highlight.categories.has(index) || inRange(highlight, index));
    const color = emphasized ? theme.colors.value : theme.colors.label;
    const weight = emphasized ? { weight: EMPHASIS_WEIGHT } : {};
    // Measured in the weight it is drawn in: a highlighted label is bolder and wider.
    const drawn = { ...style, ...weight };
    if (vertical) {
      const { lines, cut } = wrapLines(category, bands.step * LABEL_WIDTH_SHARE, {
        measure,
        style: drawn,
        maxLines: CATEGORY_LINES,
      });
      const x = bands.center(category);
      const y = plot.y + plot.height + theme.space.sm + height / 2;
      items.push({
        kind: 'text',
        x,
        y,
        lines,
        ...(cut ? { cut: category } : {}),
        style,
        color,
        colorBefore: theme.colors.label,
        anchor: 'middle',
        ...weight,
      });
      const width = maxOf(lines.map((line) => measure(line, drawn)));
      boxes.push({ x: x - width / 2, y: y - height / 2, width, height: height * lines.length });
    } else {
      // Two lines only where the row has room for them; else one, cut with an ellipsis and marked.
      const maxLines = bands.step >= height * 2 ? 2 : 1;
      const { lines, cut } = wrapLines(category, labelWidth, { measure, style: drawn, maxLines });
      const y = bands.at(category) + bands.bandwidth / 2 - ((lines.length - 1) * height) / 2;
      items.push({
        kind: 'text',
        x: labelWidth,
        y,
        lines,
        ...(cut ? { cut: category } : {}),
        style,
        color,
        colorBefore: theme.colors.label,
        anchor: 'end',
        ...weight,
      });
      boxes.push({ x: 0, y: y - height / 2, width: labelWidth, height: height * lines.length });
    }
  }

  return { items, boxes };
}

/**
 * Whether a category is inside the highlighted range.
 *
 * @param highlight - The highlight.
 * @param index - The category index.
 */
function inRange(highlight: ResolvedHighlight, index: number): boolean {
  return highlight.range !== null && index >= highlight.range[0] && index <= highlight.range[1];
}

/**
 * The tip of a series' bar at a category, where callouts and brackets point.
 *
 * @param marks - The bars.
 * @param series - The series key.
 * @param index - The category index.
 * @param vertical - Whether bars are columns.
 */
function tipOf(
  marks: readonly BarMark[],
  series: string,
  index: number,
  vertical: boolean,
): { x: number; y: number } | null {
  const mark = marks.find((candidate) => candidate.series === series && candidate.index === index);
  if (mark === undefined) {
    return null;
  }

  const { box } = mark;
  if (vertical) {
    return { x: box.x + box.width / 2, y: mark.end === 'top' ? box.y : box.y + box.height };
  }

  return { x: mark.end === 'right' ? box.x + box.width : box.x, y: box.y + box.height / 2 };
}

/**
 * The axis break drawn across every bar of a truncated axis: a slanted cut in the plate's color
 * just above the baseline, so no bar reads as starting at zero.
 *
 * @param marks - The bars.
 * @param theme - The chart theme.
 * @param vertical - Whether bars are columns.
 */
function breakItems(marks: readonly BarMark[], theme: ChartTheme, vertical: boolean): SceneItem[] {
  const cut = theme.space.sm;
  return marks.map((mark) => {
    const { box } = mark;
    const d = vertical
      ? `M${box.x - BREAK_OVERSHOOT},${box.y + box.height - cut}l${box.width + 2 * BREAK_OVERSHOOT},${-cut / 2}v${cut / 2}l${-box.width - 2 * BREAK_OVERSHOOT},${cut / 2}Z`
      : `M${box.x + cut},${box.y - BREAK_OVERSHOOT}l${cut / 2},${box.height + 2 * BREAK_OVERSHOOT}h${cut / 2}l${-cut / 2},${-box.height - 2 * BREAK_OVERSHOOT}Z`;
    return { kind: 'path', d, fill: theme.plate, anim: 'fade', lag: true } satisfies SceneItem;
  });
}

/**
 * Which series and category each layered item belongs to, for step reveals by series or category.
 *
 * @param position - The item's position in marks, breaks and labels.
 * @param marks - The bars.
 * @param breakCount - How many break items follow the marks.
 * @param labelOwners - The series and category of each label.
 */
function ownerOf(
  position: number,
  marks: readonly BarMark[],
  breakCount: number,
  labelOwners: readonly { series: string; index: number }[],
): { series: string; index: number } {
  if (position < marks.length) {
    const mark = marks[position];
    return { series: mark?.series ?? '', index: mark?.index ?? 0 };
  }

  if (position < marks.length + breakCount) {
    const mark = marks[position - marks.length];
    return { series: mark?.series ?? '', index: mark?.index ?? 0 };
  }

  return labelOwners[position - marks.length - breakCount] ?? { series: '', index: 0 };
}

/**
 * The axis fact for lint.
 *
 * @param refused - Whether `min` above zero was asked for without `truncate`.
 * @param truncated - Whether the axis is truncated on purpose.
 */
function axisFact(refused: boolean, truncated: boolean): ChartFacts['axis'] {
  if (refused) {
    return 'refused';
  }

  return truncated ? 'truncated' : 'zero';
}

/**
 * The series as the spec lists them, with per-bar colors when they differ.
 *
 * @param data - The chart's data.
 * @param marks - The bars.
 * @param highlight - The highlight.
 * @param theme - The chart theme.
 * @param texts - The value labels drawn, by `series|index`.
 */
function specSeries(
  data: CategoricalData,
  marks: readonly BarMark[],
  highlight: ResolvedHighlight,
  theme: ChartTheme,
  texts: ReadonlyMap<string, string>,
): ChartSpecSeries[] {
  const palette = seriesColors(
    theme,
    data.series.map((entry) => entry.key),
    highlight.series,
  );
  return data.series.map((series, position) => {
    const own = marks.filter((mark) => mark.series === series.key);
    const colors = data.categories.map(
      (_, index) => own.find((mark) => mark.index === index)?.fill ?? theme.context,
    );
    const uniform = colors.every((color) => color === colors[0]);
    return {
      name: series.label,
      values: series.values,
      x: null,
      color: isSeriesHighlighted(highlight, series.key)
        ? (palette.get(series.key) ?? seriesColor(theme, position))
        : theme.context,
      pointColors: uniform ? null : colors,
      highlighted: highlight.active && own.some((mark) => mark.highlighted),
      labels: data.categories.map((_, index) => texts.get(`${series.key}|${index}`) ?? null),
    };
  });
}

/**
 * The chart's accessible name.
 *
 * @param data - The chart's data.
 * @param xField - The category field.
 */
function chartName(data: CategoricalData, xField: string): string {
  return `Bar chart of ${listNames(data.series.map((series) => series.label))} by ${xField}`;
}

/**
 * A text summary: the extremes of each series and what is highlighted, with values.
 *
 * @param data - The chart's data.
 * @param highlight - The highlight.
 * @param format - The format.
 * @param xField - The category field.
 */
function summarize(
  data: CategoricalData,
  highlight: ResolvedHighlight,
  format: ResolvedFormat,
  xField: string,
): string {
  const parts = [`${data.categories.length} ${xField} values.`];
  const write = runFormatter(
    data.series.flatMap((series) => series.values.filter((value) => value !== null)),
    format,
  );
  for (const series of data.series) {
    const pairs = data.categories
      .map((category, index) => ({ category, value: series.values[index] ?? null }))
      .filter((pair): pair is { category: string; value: number } => pair.value !== null);
    const sorted = pairs.toSorted((a, b) => b.value - a.value);
    const top = sorted[0];
    const bottom = sorted.at(-1);
    if (top !== undefined && bottom !== undefined) {
      parts.push(
        `${series.label}: highest ${top.category} at ${write(top.value)}, lowest ` +
          `${bottom.category} at ${write(bottom.value)}.`,
      );
    }
  }

  if (highlight.active) {
    const names = [...highlight.spec.series, ...highlight.spec.categories];
    parts.push(`Highlighted: ${listNames(names)}.`);
  }

  return parts.join(' ');
}
