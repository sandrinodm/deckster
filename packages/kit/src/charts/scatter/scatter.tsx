import type { ReactNode } from 'react';

import type { ChartSpecSeries } from '#charts/chart-spec.ts';
import type { CategoricalData } from '#charts/data/rows.ts';
import type { ChartDrawing, ChartFacts, DrawInput } from '#charts/frame/chart-frame.tsx';
import type { ChartProps } from '#charts/frame/chart-props.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { Scene, SceneItem } from '#charts/frame/scene.ts';
import type { Box } from '#charts/layout/label-placement.ts';
import type { Measure } from '#charts/layout/text-measure.ts';

import { fieldKinds, resolveRows, toLabel, toNumber } from '#charts/data/rows.ts';
import { resolveFormat, runFormatter, type FormatProp } from '#charts/format/number-format.ts';
import { annotationLayers } from '#charts/frame/annotation-items.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { hasUnit } from '#charts/frame/chart-input.ts';
import { seriesColors } from '#charts/frame/chart-theme.ts';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { axisItems, tickLabels, tickLabelWidth, xLabelDrop } from '#charts/frame/plot-parts.ts';
import { drawScene } from '#charts/frame/scene-svg.tsx';
import { buildSpec, listNames } from '#charts/frame/spec-builder.ts';
import {
  annotationSpecs,
  requireAnnotationTypes,
  resolveAnnotations,
} from '#charts/insight/annotations.ts';
import { resolveHighlight, type ResolvedHighlight } from '#charts/insight/highlight.ts';
import { placeLabels } from '#charts/layout/label-placement.ts';
import { EMPHASIS_WEIGHT, lineHeight } from '#charts/layout/text-measure.ts';
import { pathObstacles } from '#charts/line/plan-line.ts';
import { linearScale, tickCountFor, valueAxis } from '#charts/scale/linear-scale.ts';
import { maxOf, minOf } from '#foundation/lists.ts';

/**
 * The least room each tick interval gets, on either axis.
 */
const TICK_SPACING = 160;

/**
 * A point's radius as a multiple of the theme's line width.
 */
const POINT_SCALE = 3.4;

/**
 * The least room each x tick interval gets: a little more than the y axis's, as the x labels run
 * wider.
 */
const X_TICK_SPACING = TICK_SPACING * 1.4;

/**
 * How many places a point's stagger cycles through when a chart builds in steps; later points wrap
 * back to the first place.
 */
const STAGGER_PLACES = 12;

/**
 * The share of each axis's data range added beyond its extremes, so no point sits on the plot's
 * edge.
 */
const DOMAIN_PAD = 0.05;

/**
 * How many gaps out a point's label may move to find room, with a leader back to its point.
 */
const LABEL_REACHES = [1, 2.5, 4, 6];

/**
 * Props of {@link Scatter}.
 */
export type ScatterProps = Omit<ChartProps, 'labels' | 'legend' | 'label'> & {
  /**
   * The field along x; the first number field when left out.
   */
  x?: string;

  /**
   * The field along y; the second number field when left out.
   */
  y?: string;

  /**
   * The field naming each point, for highlights, callouts and labels; the first text field.
   */
  label?: string;

  /**
   * The field grouping points into series, each in its own color.
   */
  series?: string;

  /**
   * What x measures, written at the end of the x axis ("Median resolution time, hours").
   */
  xLabel?: string;

  /**
   * What y measures, written at the top of the y axis.
   */
  yLabel?: string;

  /**
   * How x values are written; plain numbers when left out (`format` and `unit` are y's).
   */
  xFormat?: FormatProp;

  /**
   * The unit after x values, such as `h`.
   */
  xUnit?: string;

  /**
   * Draw the least-squares trend line through every point.
   */
  trend?: boolean;

  /**
   * Start both axes at zero.
   */
  zero?: boolean;
};

/**
 * One point, laid out.
 */
type Point = {
  /**
   * The point's name.
   */
  name: string;

  /**
   * Its group.
   */
  group: string;

  /**
   * Its x value.
   */
  x: number;

  /**
   * Its y value.
   */
  y: number;

  /**
   * Its pixel position.
   */
  at: { x: number; y: number };

  /**
   * Whether it is highlighted.
   */
  highlighted: boolean;
};

/**
 * Every prop {@link Scatter} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const SCATTER_PROPS = propNames<ScatterProps>()([
  'at',
  'caption',
  'source',
  'data',
  'highlight',
  'format',
  'unit',
  'annotations',
  'x',
  'y',
  'label',
  'series',
  'xLabel',
  'yLabel',
  'xFormat',
  'xUnit',
  'trend',
  'zero',
]);

/**
 * A scatter plot for the relationship between two measures: one dot per row, the highlighted points
 * (by name, or a whole group) in color and labeled directly where they cover nothing, the rest in
 * the context color, an optional trend line, and both axes named at their ends.
 *
 * ```mdx
 * <Scatter data={teams} x="hours" y="csat" label="team" trend highlight={['Billing', 'Payroll']}
 *   xLabel="Median hours to resolve" yLabel="Satisfaction, %" />
 * ```
 */
export function Scatter(props: ScatterProps): ReactNode {
  checkProps('Scatter', props);
  // `label` names the field that names each point here, not the chart's accessible name.
  const frame = frameProps(props);
  delete frame.label;
  return <ChartFrame kind="scatter" {...frame} draw={(input) => drawScatter(props, input)} />;
}

/**
 * Lays out and draws the scatter for the measured plot.
 *
 * @param props - The chart's props.
 * @param input - The plot size, theme and measurer.
 */
function drawScatter(props: ScatterProps, input: DrawInput): ChartDrawing {
  const { theme, measure, size } = input;
  const rows = resolveRows(props.data, input.datasets);
  const kinds = fieldKinds(rows);
  const xField = props.x ?? kinds.numbers[0] ?? '';
  const yField = props.y ?? kinds.numbers.find((field) => field !== xField) ?? '';
  const labelField = props.label ?? kinds.text.find((field) => field !== props.series) ?? '';
  const format = resolveFormat(props.format, props.unit, theme.numbers);
  const xFormat = resolveFormat(props.xFormat, props.xUnit, theme.numbers);
  /**
   * The group a row belongs to: its series field's value, or the y field's name when there is no
   * series field.
   */
  const groupOf = (row: (typeof rows)[number]): string =>
    props.series === undefined ? yField : toLabel(row[props.series]);
  const present = rows.filter(
    (row) => toNumber(row[xField]) !== null && toNumber(row[yField]) !== null,
  );
  const names = present.map((row) => toLabel(row[labelField]));
  const groups = [...new Set(present.map(groupOf))];
  const data: CategoricalData = {
    x: labelField,
    categories: names,
    series: groups.map((group) => ({
      key: group,
      label: group,
      values: present.map((row) => (groupOf(row) === group ? toNumber(row[yField]) : null)),
      at: undefined,
    })),
  };
  const highlight = resolveHighlight(props.highlight, data);
  requireAnnotationTypes(props.annotations, ['callout', 'reference'], '<Scatter>');
  const annotations = resolveAnnotations(props.annotations, data, { format, series: undefined });
  const xs = present.map((row) => toNumber(row[xField]) ?? 0);
  const ys = present.map((row) => toNumber(row[yField]) ?? 0);
  const axisStyle = theme.text.axis;
  const titleRoom = lineHeight(axisStyle) + theme.space.sm;
  const bottom = xLabelDrop(theme) + lineHeight(axisStyle) * 2 + theme.space.sm;
  const yAxis = valueAxis(padded(ys, props.zero === true), {
    zero: props.zero ?? false,
    count: tickCountFor(size.height - bottom - titleRoom, TICK_SPACING),
  });
  /**
   * The x axis for a plot width.
   */
  const xAxisFor = (width: number) =>
    valueAxis(padded(xs, props.zero === true), {
      zero: props.zero ?? false,
      count: tickCountFor(width, X_TICK_SPACING),
    });
  /**
   * Half a tick label's width and a little air: how far it reaches past the edge it is centred on.
   */
  const half = (text: string | undefined): number =>
    text === undefined ? 0 : measure(text, theme.text.axis) / 2 + theme.space.xs;
  // The first and last x tick labels are centred on the plot's edges: keep room for their halves,
  // beside the y tick labels on the left.
  const draft = tickLabels(xAxisFor(size.width), xFormat);
  const gutter = Math.max(
    tickLabelWidth(yAxis, format, theme, measure) + theme.space.sm,
    half(draft[0]),
  );
  const right = Math.max(theme.space.md, half(draft.at(-1)));
  const plot: Box = {
    x: gutter,
    y: titleRoom,
    width: Math.max(0, size.width - gutter - right),
    height: Math.max(0, size.height - titleRoom - bottom),
  };
  const xAxis = xAxisFor(plot.width);
  const xScale = linearScale([xAxis.min, xAxis.max], [plot.x, plot.x + plot.width]);
  const yScale = linearScale([yAxis.min, yAxis.max], [plot.y + plot.height, plot.y]);
  const points: Point[] = present.map((row, index) => {
    const group = groupOf(row);
    const name = names[index] ?? '';
    const highlighted =
      !highlight.active || highlight.series.has(group) || highlight.categories.has(index);
    return {
      name,
      group,
      x: xs[index] ?? 0,
      y: ys[index] ?? 0,
      at: { x: xScale.at(xs[index] ?? 0), y: yScale.at(ys[index] ?? 0) },
      highlighted,
    };
  });
  const palette = seriesColors(theme, groups, highlight.series);
  const radius = theme.lineWidth * POINT_SCALE;
  const marks = pointMarks(points, palette, radius, theme);
  const xAxisLayer = axisItems({
    axis: xAxis,
    at: xScale.at,
    direction: 'x',
    plot,
    theme,
    format: xFormat,
    ticks: true,
    baseline: xAxis.min,
    measure,
  });
  const yAxisLayer = axisItems({
    axis: yAxis,
    at: yScale.at,
    direction: 'y',
    plot,
    theme,
    format,
    ticks: true,
    baseline: yAxis.min,
  });
  const titles = axisTitles(props, plot, theme, size.height);
  const trend =
    props.trend === true ? trendItems(xs, ys, xScale.at, yScale.at, { xAxis, yAxis }, theme) : [];
  const trendBoxes = trend.flatMap((item) =>
    item.kind === 'line'
      ? pathObstacles(
          [
            { x: item.x1, y: item.y1 },
            { x: item.x2, y: item.y2 },
          ],
          theme.lineWidth * 3,
        )
      : [],
  );
  const labels = pointLabels(points, highlight, {
    theme,
    measure,
    plot,
    radius,
    titles: [...titles.boxes, ...trendBoxes, ...referenceBoxes(props, yScale.at, plot, theme)],
  });
  const notes = annotationLayers(
    annotations,
    {
      orientation: 'vertical',
      plot,
      span: (index) => {
        const x = points[index]?.at.x ?? plot.x;
        return [x, x];
      },
      value: yScale.at,
      tip: (_series, index) => points[index]?.at ?? null,
      bracket: 'side',
    },
    {
      theme,
      measure,
      obstacles: [
        ...titles.boxes,
        ...trendBoxes,
        ...labels.boxes,
        ...points.map((point) => ({
          x: point.at.x - radius,
          y: point.at.y - radius,
          width: radius * 2,
          height: radius * 2,
        })),
      ],
    },
  );
  const facts: ChartFacts = {
    series: groups.length,
    categories: points.length,
    highlighted: highlight.active || annotations.length > 0,
    axis: yAxis.min > 0 ? 'zoomed' : 'zero',
    unit: hasUnit(props, format) || props.yLabel !== undefined,
    legend: false,
    legendAvoidable: false,
    marks: points.length,
    colored: new Set(points.filter((point) => point.highlighted).map((point) => point.group)).size,
  };
  const write = runFormatter(ys, format);
  const writeX = runFormatter(xs, xFormat);
  const trendNote = trend.length > 0 ? ` ${trendWords(xs, ys)}` : '';
  /**
   * A highlighted point's name with its coordinates, as the summary writes them.
   */
  const pointLabel = (point: Point): string =>
    `${point.name} (${writeX(point.x)}, ${write(point.y)})`;
  const highlightNote = highlight.active
    ? ` Highlighted: ${listNames(points.filter((point) => point.highlighted).map(pointLabel))}.`
    : '';
  const spec = buildSpec(
    {
      kind: 'scatter',
      name: `Scatter of ${props.yLabel ?? yField} against ${props.xLabel ?? xField}`,
      summary: `${points.length} points.${trendNote}${highlightNote}`,
      categories: names,
      series: scatterSeries(groups, points, palette, theme, highlight),
      axis: {
        min: yAxis.min,
        max: yAxis.max,
        ticks: yAxis.ticks,
        zeroBased: yAxis.min <= 0,
        truncated: false,
      },
      highlight: highlight.spec,
      annotations: annotationSpecs(annotations, data),
    },
    {
      theme,
      format,
      largest: Math.max(Math.abs(yAxis.min), Math.abs(yAxis.max)),
      caption: props.caption,
      source: props.source,
    },
  );
  const scene: Scene = {
    width: size.width,
    height: size.height,
    layers: [
      { at: undefined, items: [...xAxisLayer, ...yAxisLayer, ...titles.items] },
      ...notes.back,
      { at: undefined, items: [...trend, ...marks, ...labels.items] },
      ...notes.front,
    ],
    highlightAt: highlight.at,
  };
  return drawScene({ scene, spec, facts }, input);
}

/**
 * One dot per point. Highlighted dots are drawn last, in their series' color; the rest sit back in
 * the context color.
 *
 * @param points - The points, in row order.
 * @param palette - Each series' color.
 * @param radius - The dot's radius.
 * @param theme - The chart theme.
 */
function pointMarks(
  points: readonly Point[],
  palette: ReadonlyMap<string, string>,
  radius: number,
  theme: ChartTheme,
): SceneItem[] {
  return points
    .map((point, index) => ({ point, index }))
    .toSorted((a, b) => Number(a.point.highlighted) - Number(b.point.highlighted))
    .map(({ point, index }): SceneItem => {
      const own = palette.get(point.group) ?? theme.categorical[0] ?? theme.context;
      return {
        kind: 'circle',
        cx: point.at.x,
        cy: point.at.y,
        r: radius,
        fill: point.highlighted ? own : theme.context,
        fillBefore: own,
        ring: theme.plate,
        ringWidth: theme.lineWidth * 0.75,
        anim: 'pop',
        order: index % STAGGER_PLACES,
        mark: true,
      };
    });
}

/**
 * The series as the spec lists them: each group's values and positions, its color, and the
 * highlighted points' names.
 *
 * @param groups - The series' keys, in order.
 * @param points - The points.
 * @param palette - Each series' color.
 * @param theme - The chart theme.
 * @param highlight - The highlight.
 */
function scatterSeries(
  groups: readonly string[],
  points: readonly Point[],
  palette: ReadonlyMap<string, string>,
  theme: ChartTheme,
  highlight: ResolvedHighlight,
): ChartSpecSeries[] {
  return groups.map((group) => {
    const own = points.filter((point) => point.group === group);
    return {
      name: group,
      values: own.map((point) => point.y),
      x: own.map((point) => point.x),
      color: palette.get(group) ?? theme.context,
      pointColors: own.map((point) =>
        point.highlighted ? (palette.get(group) ?? theme.context) : theme.context,
      ),
      highlighted: highlight.series.has(group),
      labels: own.map((point) => (highlight.active && point.highlighted ? point.name : null)),
    };
  });
}

/**
 * The axis titles: x at the right end under the tick labels, y above the plot at the left.
 *
 * @param props - The chart's props.
 * @param plot - The plot area.
 * @param theme - The chart theme.
 * @param height - The chart's height.
 */
function axisTitles(
  props: ScatterProps,
  plot: Box,
  theme: ChartTheme,
  height: number,
): { items: SceneItem[]; boxes: Box[] } {
  const style = theme.text.axis;
  const items: SceneItem[] = [];
  if (props.xLabel !== undefined) {
    items.push({
      kind: 'text',
      x: plot.x + plot.width,
      y: height - lineHeight(style) / 2,
      lines: [`${props.xLabel} →`],
      style,
      color: theme.colors.value,
      anchor: 'end',
    });
  }

  if (props.yLabel !== undefined) {
    items.push({
      kind: 'text',
      x: plot.x,
      y: lineHeight(style) / 2,
      lines: [`↑ ${props.yLabel}`],
      style,
      color: theme.colors.value,
      anchor: 'start',
    });
  }

  return { items, boxes: [{ x: plot.x, y: 0, width: plot.width, height: lineHeight(style) }] };
}

/**
 * The least-squares line through the points, dashed, across the plot and clipped to it.
 *
 * @param xs - The x values.
 * @param ys - The y values.
 * @param x - The pixel x of a value.
 * @param y - The pixel y of a value.
 * @param axes - The x and y axes, whose ends the line stays inside.
 * @param theme - The chart theme.
 */
function trendItems(
  xs: readonly number[],
  ys: readonly number[],
  x: (value: number) => number,
  y: (value: number) => number,
  axes: { xAxis: { min: number; max: number }; yAxis: { min: number; max: number } },
  theme: ChartTheme,
): SceneItem[] {
  const fit = leastSquares(xs, ys);
  const span = fit === undefined ? undefined : clipTrend(fit, axes.xAxis, axes.yAxis);
  if (fit === undefined || span === undefined) {
    return [];
  }

  const from = { x: x(span[0]), y: y(fit.intercept + fit.slope * span[0]) };
  const to = { x: x(span[1]), y: y(fit.intercept + fit.slope * span[1]) };
  return [
    {
      kind: 'line',
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      stroke: theme.colors.axis,
      width: theme.lineWidth * 0.75,
      dash: '10 8',
      anim: 'fade',
      lag: true,
    },
  ];
}

/**
 * Thin boxes along the chart's reference lines, which point labels keep off.
 *
 * @param props - The chart's props, for its annotations.
 * @param y - The pixel y of a value.
 * @param plot - The plot area.
 * @param theme - The chart theme.
 */
function referenceBoxes(
  props: ScatterProps,
  y: (value: number) => number,
  plot: Box,
  theme: ChartTheme,
): Box[] {
  const thickness = theme.lineWidth * 4;
  return (props.annotations ?? []).flatMap((note) =>
    note.type === 'reference'
      ? [{ x: plot.x, y: y(note.value) - thickness / 2, width: plot.width, height: thickness }]
      : [],
  );
}

/**
 * The x range over which a straight line stays inside both axes' domains.
 *
 * @param fit - The line's slope and intercept.
 * @param xAxis - The x domain.
 * @param yAxis - The y domain.
 * @returns The first and last x inside, or `undefined` when the line misses the plot.
 */
export function clipTrend(
  fit: { slope: number; intercept: number },
  xAxis: { min: number; max: number },
  yAxis: { min: number; max: number },
): readonly [number, number] | undefined {
  let low = xAxis.min;
  let high = xAxis.max;
  if (fit.slope === 0) {
    return fit.intercept >= yAxis.min && fit.intercept <= yAxis.max ? [low, high] : undefined;
  }

  const atMin = (yAxis.min - fit.intercept) / fit.slope;
  const atMax = (yAxis.max - fit.intercept) / fit.slope;
  low = Math.max(low, Math.min(atMin, atMax));
  high = Math.min(high, Math.max(atMin, atMax));
  return low < high ? [low, high] : undefined;
}

/**
 * Values with room added beyond their extremes, so the axis built from them leaves every point off
 * the plot's edge. The low end stays at zero for an axis that starts there.
 *
 * @param values - The values.
 * @param zero - Whether the axis starts at zero.
 */
export function padded(values: readonly number[], zero: boolean): number[] {
  if (values.length === 0) {
    return [];
  }

  const low = minOf(values);
  const high = maxOf(values);
  const pad = (high - low || Math.abs(high) || 1) * DOMAIN_PAD;
  const floor = zero && low >= 0 ? Math.max(0, low - pad) : low - pad;
  return [...values, floor, high + pad];
}

/**
 * The least-squares line through points.
 *
 * @param xs - The x values.
 * @param ys - The y values.
 * @returns The slope and intercept, or `undefined` for fewer than two distinct x values.
 */
export function leastSquares(
  xs: readonly number[],
  ys: readonly number[],
): { slope: number; intercept: number } | undefined {
  const count = Math.min(xs.length, ys.length);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / count;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    const dx = (xs[index] ?? 0) - meanX;
    numerator += dx * ((ys[index] ?? 0) - meanY);
    denominator += dx * dx;
  }

  if (count < 2 || denominator === 0) {
    return undefined;
  }

  const slope = numerator / denominator;
  return { slope, intercept: meanY - slope * meanX };
}

/**
 * The trend in words, for the summary.
 *
 * @param xs - The x values.
 * @param ys - The y values.
 */
function trendWords(xs: readonly number[], ys: readonly number[]): string {
  const fit = leastSquares(xs, ys);
  if (fit === undefined) {
    return '';
  }

  return fit.slope < 0 ? 'The trend falls as x grows.' : 'The trend rises as x grows.';
}

/**
 * Labels for the highlighted points, placed around each where they cover no point, no other label
 * and no axis title.
 *
 * @param points - The points.
 * @param highlight - The highlight.
 * @param context - The theme, measurer, plot area, point radius and title boxes.
 */
function pointLabels(
  points: readonly Point[],
  highlight: ResolvedHighlight,
  context: {
    theme: ChartTheme;
    measure: Measure;
    plot: Box;
    radius: number;
    titles: readonly Box[];
  },
): { items: SceneItem[]; boxes: Box[] } {
  if (!highlight.active) {
    return { items: [], boxes: [] };
  }

  const { theme, measure, plot, radius, titles } = context;
  const style = theme.text.legend;
  const height = lineHeight(style);
  const chosen = points.filter((point) => point.highlighted);
  const obstacles = [
    ...titles,
    ...points.map((point) => ({
      x: point.at.x - radius,
      y: point.at.y - radius,
      width: radius * 2,
      height: radius * 2,
    })),
  ];
  const placed = placeLabels(
    chosen.map((point) => ({
      anchor: point.at,
      width: measure(point.name, { ...style, weight: EMPHASIS_WEIGHT }),
      height,
    })),
    obstacles,
    plot,
    radius + theme.space.xs,
    LABEL_REACHES,
  );
  const items = chosen.flatMap((point, index): SceneItem[] => {
    const spot = placed[index];
    const box = spot?.box ?? { x: point.at.x, y: point.at.y, width: 0, height };
    const text: SceneItem = {
      kind: 'text',
      x: box.x,
      y: box.y + height / 2,
      lines: [point.name],
      style,
      weight: EMPHASIS_WEIGHT,
      color: theme.colors.value,
      anchor: 'start',
      anim: 'fade',
      lag: true,
    };
    if ((spot?.reach ?? 1) <= 1) {
      return [text];
    }

    // A label that moved out to find room is joined to its point by a leader.
    const edge = {
      x: Math.min(Math.max(point.at.x, box.x), box.x + box.width),
      y: Math.min(Math.max(point.at.y, box.y), box.y + box.height),
    };
    const length = Math.hypot(edge.x - point.at.x, edge.y - point.at.y) || 1;
    const start = {
      x: point.at.x + ((edge.x - point.at.x) / length) * (radius + 2),
      y: point.at.y + ((edge.y - point.at.y) / length) * (radius + 2),
    };
    return [
      {
        kind: 'line',
        x1: start.x,
        y1: start.y,
        x2: edge.x,
        y2: edge.y,
        stroke: theme.colors.axis,
        width: theme.axis.width,
        anim: 'fade',
        lag: true,
      },
      text,
    ];
  });
  return { items, boxes: placed.map((spot) => spot.box) };
}
