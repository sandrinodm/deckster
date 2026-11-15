import type { ChartSpecSeries } from '#charts/chart-spec.ts';
import type { CategoricalData, SeriesData } from '#charts/data/rows.ts';
import type { ResolvedFormat } from '#charts/format/number-format.ts';
import type { ChartDrawing, ChartFacts } from '#charts/frame/chart-frame.tsx';
import type { LabelMode } from '#charts/frame/chart-props.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { RevealOption } from '#charts/frame/reveal.ts';
import type { Scene, SceneItem, SceneLayer } from '#charts/frame/scene.ts';
import type { AnnotationInput, ResolvedAnnotation } from '#charts/insight/annotations.ts';
import type { HighlightProp, ResolvedHighlight } from '#charts/insight/highlight.ts';
import type { Box } from '#charts/layout/label-placement.ts';
import type { Measure } from '#charts/layout/text-measure.ts';

import { formatValue, runFormatter } from '#charts/format/number-format.ts';
import { annotationLayers } from '#charts/frame/annotation-items.ts';
import { seriesColor, seriesColors } from '#charts/frame/chart-theme.ts';
import { legendHeight, legendItems } from '#charts/frame/legend-items.ts';
import { axisItems, tickLabelWidth, xLabelDrop } from '#charts/frame/plot-parts.ts';
import { revealLayers } from '#charts/frame/reveal.ts';
import { linePath, round } from '#charts/frame/scene.ts';
import { buildSpec, listNames } from '#charts/frame/spec-builder.ts';
import { annotationSpecs, resolveAnnotations } from '#charts/insight/annotations.ts';
import { isHighlighted, isSeriesHighlighted, resolveHighlight } from '#charts/insight/highlight.ts';
import { dodge, thinLabels } from '#charts/layout/label-placement.ts';
import { EMPHASIS_WEIGHT, lineHeight } from '#charts/layout/text-measure.ts';
import { pointPositions } from '#charts/scale/band-scale.ts';
import { linearScale, tickCountFor, valueAxis } from '#charts/scale/linear-scale.ts';
import { maxOf } from '#foundation/lists.ts';

/**
 * The least room each tick interval gets on the value axis.
 */
const TICK_SPACING = 140;

/**
 * How far an end label may sit from its line's end, in line heights, before a leader connects them.
 */
const LEADER_AFTER = 0.45;

/**
 * The fill opacity of the wash under a single line of an area chart.
 */
const WASH_OPACITY = 0.14;

/**
 * Highlighted lines are drawn this much heavier than the theme's line width.
 */
const EMPHASIS_LINE = 1.5;

/**
 * Context lines are drawn at the theme's line width: their muted color sets them back, and a
 * thinner line on a dark surface all but disappears.
 */
const CONTEXT_LINE = 1;

/**
 * Most points that get a value label each under `labels="all"`.
 */
const ALL_LABELS_MAX = 16;

/**
 * The most boxes one segment of a line is sampled into.
 */
const MAX_OBSTACLE_STEPS = 400;

/**
 * How a line or area chart is drawn.
 */
export type LineOptions = {
  /**
   * Fill under the lines (an area chart); the value axis then starts at zero.
   */
  area: boolean;

  /**
   * Stack the areas.
   */
  stacked: boolean;

  /**
   * Start the value axis at zero; lines may zoom in when left `false`, with a note saying so.
   */
  zero: boolean;

  /**
   * A fixed value axis minimum.
   */
  min: number | undefined;

  /**
   * A fixed value axis maximum.
   */
  max: number | undefined;

  /**
   * Which value labels to draw: `auto` labels each line's end.
   */
  labels: LabelMode;

  /**
   * Force the legend on or off; lines are labeled at their ends instead.
   */
  legend: boolean | undefined;

  /**
   * The highlight.
   */
  highlight: HighlightProp | undefined;

  /**
   * The annotations.
   */
  annotations: readonly AnnotationInput[] | undefined;

  /**
   * Build the lines in steps.
   */
  reveal: RevealOption | undefined;

  /**
   * Whether the values' unit is named.
   */
  hasUnit: boolean;
};

/**
 * Everything {@link planLine} lays out from.
 */
export type LineInput = {
  /**
   * The categories (time, usually) and series.
   */
  data: CategoricalData;

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
   * The format.
   */
  format: ResolvedFormat;

  /**
   * The options.
   */
  options: LineOptions;

  /**
   * The caption and source, for the spec.
   */
  frame: { caption: string | undefined; source: string | undefined };
};

/**
 * One series laid out: its points, color and emphasis.
 */
type LaidSeries = {
  /**
   * The series.
   */
  series: SeriesData;

  /**
   * Its position in the data.
   */
  position: number;

  /**
   * Its points; `null` where it has no value.
   */
  points: ({ x: number; y: number } | null)[];

  /**
   * The baseline under each point, for stacked areas.
   */
  floor: number[];

  /**
   * Its own color.
   */
  color: string;

  /**
   * Whether it is highlighted (or nothing is).
   */
  emphasized: boolean;
};

/**
 * Lays out a line or area chart: the value axis (zoomed for lines unless `zero`, with a note when
 * it does not start at zero), thinned x labels, lines drawn back to front with the highlighted ones
 * on top and heavier, end labels dodged apart with leaders where they had to move, highlighted
 * points and ranges, annotations, the spec and the lint facts.
 *
 * @param input - The data, size, theme, format and options.
 * @returns The scene, spec and facts.
 * @throws Error naming the fix when the highlight or an annotation names a missing series or
 *   category.
 */
export function planLine(input: LineInput): Omit<ChartDrawing, 'plot'> & { scene: Scene } {
  const { data, theme, measure, format, options, size } = input;
  const highlight = resolveHighlight(options.highlight, data);
  const annotations = resolveAnnotations(options.annotations, data, {
    format,
    series: [...highlight.series][0],
  });
  const zero = options.area || options.zero;
  const values = axisValues(data, options);
  const write = runFormatter(values, format);
  const legend = options.legend ?? false;
  const endLabels = options.labels !== 'none' && !legend;
  const endWidth = endLabels ? endLabelWidth(data, write, theme, measure) : 0;
  const axisStyle = theme.text.axis;
  const top = (legend ? legendHeight(theme) : 0) + lineHeight(axisStyle) / 2 + theme.space.xs;
  const bottom = xLabelDrop(theme) + lineHeight(axisStyle);
  const axis = valueAxis(values, {
    zero,
    count: tickCountFor(size.height - top - bottom, TICK_SPACING),
    ...(options.min === undefined ? {} : { min: options.min }),
    ...(options.max === undefined ? {} : { max: options.max }),
  });
  const zoomed = axis.min > 0 || axis.max < 0;
  const noteRoom = zoomed ? lineHeight(theme.text.annotation) + theme.space.sm : 0;
  const gutter = tickLabelWidth(axis, format, theme, measure) + theme.space.sm;
  const plot: Box = {
    x: gutter,
    y: top + noteRoom,
    width: Math.max(0, size.width - gutter - endWidth),
    height: Math.max(0, size.height - top - noteRoom - bottom),
  };
  const scale = linearScale([axis.min, axis.max], [plot.y + plot.height, plot.y]);
  const xs = pointPositions(data.categories.length, [plot.x, plot.x + plot.width]);
  const laid = laySeries(data, xs, scale.at, highlight, theme, options.stacked && options.area);
  const baseline = zoomed ? axis.min : 0;
  const axisLayer = axisItems({
    axis,
    at: scale.at,
    direction: 'y',
    plot,
    theme,
    format,
    ticks: true,
    baseline,
  });
  const lineBoxes = laid.flatMap((line) => pathObstacles(line.points, theme.lineWidth * 3, plot));
  const xLabels = xAxisLabels(data, xs, { plot, width: size.width }, theme, measure, highlight);
  const ends = endLabels
    ? endLabelItems(laid, plot, theme, measure, write, highlight, bracketRooms(annotations, theme))
    : { owned: [], boxes: [], reserved: [], items: [] };
  const pointLabels = valueLabels(laid, options.labels, highlight, theme, write);
  const step = xs.length > 1 ? (xs[1] ?? 0) - (xs[0] ?? 0) : plot.width;
  const geometry = {
    orientation: 'vertical' as const,
    plot,
    span: (index: number) => {
      const center = xs[index] ?? plot.x;
      return [
        Math.max(plot.x, center - step / 2),
        Math.min(plot.x + plot.width, center + step / 2),
      ] as const;
    },
    value: scale.at,
    tip: (series: string, index: number) =>
      laid.find((line) => line.series.key === series)?.points[index] ?? null,
    bracket: 'side' as const,
  };
  const notes = annotationLayers(annotations, geometry, {
    theme,
    measure,
    // A bracket's own end label was placed to sit beside it: the bracket need not clear it.
    obstacles: [
      ...ends.boxes.filter((box) => !ends.reserved.includes(box)),
      ...xLabels.boxes,
      ...pointLabels.boxes,
      ...lineBoxes,
    ],
  });
  const owned = seriesItems(laid, theme, scale.at(baseline), options, highlight);
  const zoomNote: SceneItem[] = zoomed ? [axisZoomNote(axis.min, plot.x, top, format, theme)] : [];
  const layers: SceneLayer[] = [
    { at: undefined, items: [...axisLayer, ...xLabels.items, ...zoomNote] },
    ...notes.back,
    ...revealLayers({
      reveal: options.reveal,
      data,
      items: [...owned, ...ends.owned, ...pointLabels.owned],
    }),
    ...(legend
      ? [
          {
            at: undefined,
            items: legendItems(
              laid.map((line) => ({
                label: line.series.label,
                color: line.emphasized ? line.color : theme.context,
                at: line.series.at,
              })),
              { theme, measure, width: size.width },
            ),
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
    axis: zoomed ? 'zoomed' : 'zero',
    unit: options.hasUnit,
    legend,
    legendAvoidable: options.legend === true,
    marks: laid.reduce(
      (sum, line) => sum + line.points.filter((point) => point !== null).length,
      0,
    ),
    colored: coloredSeries(laid, highlight),
  };
  const seriesNames = listNames(data.series.map((series) => series.label));
  const spec = buildSpec(
    {
      kind: options.area ? 'area' : 'line',
      name: `${options.area ? 'Area' : 'Line'} chart of ${seriesNames} by ${data.x}`,
      summary: summarize(data, highlight, write),
      stacked: options.stacked && options.area,
      categories: data.categories,
      series: specSeries(laid, theme, write, endLabels),
      axis: {
        min: axis.min,
        max: axis.max,
        ticks: axis.ticks,
        zeroBased: !zoomed,
        truncated: false,
      },
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
 * Every value the axis must show: each value, or the tops of the positive stack and the bottoms of
 * the negative one of each category in stacked areas.
 *
 * @param data - The chart's data.
 * @param options - The options.
 */
function axisValues(data: CategoricalData, options: LineOptions): number[] {
  if (options.stacked && options.area) {
    return data.categories.flatMap((_, index) => {
      let positive = 0;
      let negative = 0;
      for (const series of data.series) {
        const value = series.values[index] ?? null;
        if (value === null) {
          break;
        }

        if (value < 0) {
          negative += value;
        } else {
          positive += value;
        }
      }

      return negative === 0 ? [positive] : [positive, negative];
    });
  }

  return data.series.flatMap((series) => series.values.filter((value) => value !== null));
}

/**
 * The series' points, colors and emphasis, context series first so highlighted ones draw on top.
 *
 * @param data - The chart's data.
 * @param xs - The x of each category.
 * @param y - The y of a value.
 * @param highlight - The highlight.
 * @param theme - The chart theme.
 * @param stacked - Whether areas stack.
 */
function laySeries(
  data: CategoricalData,
  xs: readonly number[],
  y: (value: number) => number,
  highlight: ResolvedHighlight,
  theme: ChartTheme,
  stacked: boolean,
): LaidSeries[] {
  const running = data.categories.map(() => 0);
  const below = data.categories.map(() => 0);
  // A stack breaks where a series has no value: the series above it have no floor there.
  const broken = data.categories.map(() => false);
  const palette = seriesColors(
    theme,
    data.series.map((series) => series.key),
    highlight.series,
  );
  const laid = data.series.map((series, position) => {
    const floor: number[] = [];
    const points = series.values.map((value, index) => {
      // Positives stack up from zero and negatives down, each from the last one on its side.
      const side = value !== null && value < 0 ? below : running;
      floor[index] = y(side[index] ?? 0);
      if (value === null || (stacked && broken[index] === true)) {
        broken[index] = true;
        return null;
      }

      const top = stacked ? (side[index] ?? 0) + value : value;
      if (stacked) {
        side[index] = top;
      }

      return { x: xs[index] ?? 0, y: y(top) };
    });
    return {
      series,
      position,
      points,
      floor: stacked ? floor : running.map(() => y(0)),
      color: palette.get(series.key) ?? seriesColor(theme, position),
      emphasized: isSeriesHighlighted(highlight, series.key),
    };
  });
  return stacked ? laid : laid.toSorted((a, b) => Number(a.emphasized) - Number(b.emphasized));
}

/**
 * The marks of each series, with its owner for step reveals: the area or wash, the line (context
 * lines lighter, highlighted ones heavier), a highlighted span drawn over it, highlighted points
 * and the end dot.
 *
 * @param laid - The laid-out series.
 * @param theme - The chart theme.
 * @param baseY - The y of the baseline.
 * @param options - The options.
 * @param highlight - The highlight.
 */
function seriesItems(
  laid: readonly LaidSeries[],
  theme: ChartTheme,
  baseY: number,
  options: LineOptions,
  highlight: ResolvedHighlight,
): { item: SceneItem; series: string; index: number }[] {
  const items: { item: SceneItem; series: string; index: number }[] = [];
  const seriesOnly = highlight.active && highlight.series.size > 0;
  const partial = highlight.active && !seriesOnly;
  for (const line of laid) {
    const key = line.series.key;
    /**
     * Adds an item owned by the series, at a category.
     */
    const own = (item: SceneItem, index = 0): void => {
      items.push({ item, series: key, index });
    };
    const color = line.emphasized && !partial ? line.color : theme.context;
    const width = lineWidthFor(line, highlight, theme, laid.length === 1);
    const split = revealsByCategory(options.reveal) && line.series.at === undefined;
    const stackedArea = options.area && options.stacked;
    const areaFill = {
      fill: options.stacked ? color : line.color,
      fillBefore: line.color,
      fillOpacity: options.stacked ? 1 : WASH_OPACITY,
      ...(options.stacked ? { stroke: theme.plate, strokeWidth: 2 } : {}),
      anim: 'fade',
      mark: true,
    } as const;
    const stroke = {
      fill: 'none',
      stroke: stackedArea ? theme.plate : color,
      strokeBefore: stackedArea ? theme.plate : line.color,
      strokeWidth: stackedArea ? 2 : width,
      anim: 'draw',
      drawable: true,
      mark: true,
    } as const;
    if (split) {
      // Each stretch of the line belongs to the category it runs into, so a value shows at its own
      // step and never before it.
      for (const [index, previous, point] of stretches(line.points)) {
        if (options.area) {
          own(
            { kind: 'path', d: areaStretch(line, index, baseY, options.stacked), ...areaFill },
            index,
          );
        }

        own({ kind: 'path', d: linePath([previous, point]), ...stroke }, index);
      }

      if (!stackedArea) {
        for (const [index, point] of line.points.entries()) {
          if (point !== null && line.points[index - 1] == null) {
            own(
              {
                kind: 'circle',
                cx: point.x,
                cy: point.y,
                r: width * 1.6,
                fill: line.emphasized ? line.color : theme.context,
                fillBefore: line.color,
                ring: theme.plate,
                ringWidth: theme.lineWidth,
                anim: 'pop',
                lag: true,
                mark: true,
              },
              index,
            );
          }
        }
      }
    } else {
      if (options.area) {
        own({ kind: 'path', d: areaPath(line, baseY, options.stacked), ...areaFill });
      }

      own({ kind: 'path', d: linePath(line.points), ...stroke });
    }

    if (partial) {
      for (const mark of highlightedMarks(line, highlight, theme, split)) {
        items.push(mark);
      }
    }

    const lastIndex = lastPointIndex(line.points);
    const last = line.points[lastIndex];
    if (last !== null && last !== undefined && !stackedArea) {
      own(
        {
          kind: 'circle',
          cx: last.x,
          cy: last.y,
          r: width * 1.6,
          fill: line.emphasized ? line.color : theme.context,
          fillBefore: line.color,
          ring: theme.plate,
          ringWidth: theme.lineWidth,
          anim: 'pop',
          lag: true,
          mark: true,
        },
        lastIndex,
      );
    }
  }

  return items;
}

/**
 * Whether a reveal option builds the chart one category at a time.
 *
 * @param reveal - The reveal option.
 */
function revealsByCategory(reveal: RevealOption | undefined): boolean {
  if (reveal === undefined) {
    return false;
  }

  return (typeof reveal === 'string' ? reveal : reveal.by) === 'categories';
}

/**
 * The stretches of a line between consecutive points that both have a value, each with the index of
 * the point it runs into.
 *
 * @param points - The line's points.
 */
function stretches(
  points: readonly ({ x: number; y: number } | null)[],
): [number, { x: number; y: number }, { x: number; y: number }][] {
  const found: [number, { x: number; y: number }, { x: number; y: number }][] = [];
  for (const [index, point] of points.entries()) {
    const previous = points[index - 1];
    if (point !== null && previous !== null && previous !== undefined) {
      found.push([index, previous, point]);
    }
  }

  return found;
}

/**
 * The closed path of one stretch of an area: from the point before a category to its point and back
 * along the floor.
 *
 * @param line - The series.
 * @param index - The category the stretch runs into.
 * @param baseY - The baseline's y.
 * @param stacked - Whether the floor is the series below.
 */
function areaStretch(line: LaidSeries, index: number, baseY: number, stacked: boolean): string {
  const from = line.points[index - 1];
  const to = line.points[index];
  if (from === null || from === undefined || to === null || to === undefined) {
    return '';
  }

  const fromFloor = stacked ? (line.floor[index - 1] ?? baseY) : baseY;
  const toFloor = stacked ? (line.floor[index] ?? baseY) : baseY;
  return (
    `M${round(from.x)},${round(from.y)}L${round(to.x)},${round(to.y)}` +
    `L${round(to.x)},${round(toFloor)}L${round(from.x)},${round(fromFloor)}Z`
  );
}

/**
 * Small boxes along a line, every few pixels, so labels placed on the plot keep clear of it.
 *
 * @param points - The line's points.
 * @param size - The side of each box.
 * @param within - The plot: only the part of a segment inside it is sampled, so a value far off the
 *   axis costs no more than one at its edge.
 */
export function pathObstacles(
  points: readonly ({ x: number; y: number } | null)[],
  size: number,
  within?: Box,
): Box[] {
  const boxes: Box[] = [];
  for (const [index, point] of points.entries()) {
    const next = points[index + 1];
    if (point === null || !isFinitePoint(point)) {
      continue;
    }

    boxes.push({ x: point.x - size / 2, y: point.y - size / 2, width: size, height: size });
    if (next === null || next === undefined || !isFinitePoint(next)) {
      continue;
    }

    const stretch = within === undefined ? [point, next] : clipToBox(point, next, within, size);
    const [from, to] = stretch ?? [];
    if (from === undefined || to === undefined) {
      continue;
    }

    const steps = Math.min(
      MAX_OBSTACLE_STEPS,
      Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / size),
    );
    for (let step = 1; step < steps; step += 1) {
      const x = from.x + ((to.x - from.x) * step) / steps;
      const y = from.y + ((to.y - from.y) * step) / steps;
      boxes.push({ x: x - size / 2, y: y - size / 2, width: size, height: size });
    }
  }

  return boxes;
}

/**
 * Whether a point has finite coordinates.
 *
 * @param point - The point.
 */
function isFinitePoint(point: { x: number; y: number }): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

/**
 * The part of a segment inside a box grown by a margin (Liang-Barsky), or nothing when the segment
 * misses it. A segment already inside is returned as it is.
 *
 * @param from - The start.
 * @param to - The end.
 * @param box - The box.
 * @param margin - How far past the box edges still counts as inside.
 */
function clipToBox(
  from: { x: number; y: number },
  to: { x: number; y: number },
  box: Box,
  margin: number,
): [{ x: number; y: number }, { x: number; y: number }] | undefined {
  const left = box.x - margin;
  const right = box.x + box.width + margin;
  const top = box.y - margin;
  const bottom = box.y + box.height + margin;
  /**
   * Whether a point is inside the grown box.
   */
  const inside = (p: { x: number; y: number }): boolean =>
    p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (inside(from) && inside(to)) {
    return [from, to];
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let start = 0;
  let end = 1;
  const limits: [number, number][] = [
    [-dx, from.x - left],
    [dx, right - from.x],
    [-dy, from.y - top],
    [dy, bottom - from.y],
  ];
  for (const [direction, distance] of limits) {
    if (direction === 0) {
      if (distance < 0) {
        return undefined;
      }

      continue;
    }

    const at = distance / direction;
    if (direction < 0) {
      start = Math.max(start, at);
    } else {
      end = Math.min(end, at);
    }
  }

  if (start > end) {
    return undefined;
  }

  return [
    { x: from.x + dx * start, y: from.y + dy * start },
    { x: from.x + dx * end, y: from.y + dy * end },
  ];
}

/**
 * The marks drawn over a series when only some of its points are highlighted: the highlighted
 * stretch of its line, heavier, and a dot on each highlighted point.
 *
 * @param line - The series.
 * @param highlight - The highlight.
 * @param theme - The chart theme.
 * @param split - Whether the line is revealed a category at a time, so each stretch is its own
 *   mark.
 */
function highlightedMarks(
  line: LaidSeries,
  highlight: ResolvedHighlight,
  theme: ChartTheme,
  split: boolean,
): { item: SceneItem; series: string; index: number }[] {
  const key = line.series.key;
  /**
   * A highlighted stretch of the line, heavier, from its path.
   */
  const stretch = (d: string): SceneItem => ({
    kind: 'path',
    d,
    fill: 'none',
    stroke: line.color,
    strokeBefore: 'none',
    strokeWidth: theme.lineWidth * EMPHASIS_LINE,
    anim: 'draw',
    drawable: true,
    mark: true,
  });
  const lit = line.points.map((point, index) =>
    isHighlighted(highlight, key, index) ? point : null,
  );
  const marks: { item: SceneItem; series: string; index: number }[] = split
    ? stretches(lit).map(([index, previous, point]) => ({
        item: stretch(linePath([previous, point])),
        series: key,
        index,
      }))
    : [{ item: stretch(linePath(lit)), series: key, index: 0 }];
  for (const [index, point] of line.points.entries()) {
    if (
      point !== null &&
      (highlight.points.has(`${key}|${index}`) || highlight.categories.has(index))
    ) {
      marks.push({
        item: {
          kind: 'circle',
          cx: point.x,
          cy: point.y,
          r: theme.lineWidth * 2,
          fill: line.color,
          ring: theme.plate,
          ringWidth: theme.lineWidth,
          anim: 'pop',
          lag: true,
          mark: true,
        },
        series: key,
        index,
      });
    }
  }

  return marks;
}

/**
 * The note that a line chart's value axis does not start at zero, written above the plot.
 *
 * @param axisMin - The axis's lowest value, which the note names.
 * @param x - The note's left edge.
 * @param top - The top of the plot's band; the note sits half a line below it.
 * @param format - The value format.
 * @param theme - The chart theme.
 */
function axisZoomNote(
  axisMin: number,
  x: number,
  top: number,
  format: ResolvedFormat,
  theme: ChartTheme,
): SceneItem {
  return {
    kind: 'text',
    x,
    y: top + lineHeight(theme.text.annotation) / 2,
    lines: [`Axis starts at ${formatValue(axisMin, format)}`],
    style: theme.text.annotation,
    color: theme.colors.label,
    anchor: 'start',
  };
}

/**
 * The stroke width of a series: heavier when it is the highlighted one among others, lighter when
 * it is context.
 *
 * @param line - The series.
 * @param highlight - The highlight.
 * @param theme - The chart theme.
 * @param lone - Whether it is the chart's only series.
 */
function lineWidthFor(
  line: LaidSeries,
  highlight: ResolvedHighlight,
  theme: ChartTheme,
  lone: boolean,
): number {
  // A lone line is what the chart is about: as heavy as a highlighted one.
  if (lone) {
    return theme.lineWidth * EMPHASIS_LINE;
  }

  if (!highlight.active || highlight.series.size === 0) {
    return theme.lineWidth;
  }

  return line.emphasized ? theme.lineWidth * EMPHASIS_LINE : theme.lineWidth * CONTEXT_LINE;
}

/**
 * The closed path of an area: along the line, then back along its floor.
 *
 * @param line - The series.
 * @param baseY - The baseline's y.
 * @param stacked - Whether the floor is the series below.
 */
function areaPath(line: LaidSeries, baseY: number, stacked: boolean): string {
  const runs: { point: { x: number; y: number }; floor: number }[][] = [[]];
  for (const [index, point] of line.points.entries()) {
    if (point === null) {
      runs.push([]);
      continue;
    }

    runs.at(-1)?.push({ point, floor: stacked ? (line.floor[index] ?? baseY) : baseY });
  }

  // Each run of points with values is its own area; a missing value leaves a gap, never a zero.
  return runs
    .filter((run) => run.length > 0)
    .map((run) => {
      const top = run
        .map(({ point }, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)},${round(point.y)}`)
        .join('');
      const back = run
        .toReversed()
        .map(({ point, floor }) => `L${round(point.x)},${round(floor)}`)
        .join('');
      return `${top}${back}Z`;
    })
    .join('');
}

/**
 * How many series are drawn in their own color: the highlighted ones, the ones with a highlighted
 * stretch, or every one without a highlight.
 *
 * @param laid - The laid-out series.
 * @param highlight - The highlight.
 */
function coloredSeries(laid: readonly LaidSeries[], highlight: ResolvedHighlight): number {
  if (!highlight.active) {
    return laid.length;
  }

  if (highlight.series.size > 0) {
    return laid.filter((line) => line.emphasized).length;
  }

  return laid.filter((line) =>
    line.points.some(
      (point, index) => point !== null && isHighlighted(highlight, line.series.key, index),
    ),
  ).length;
}

/**
 * The index of a series' last point with a value.
 *
 * @param points - The points.
 */
function lastPointIndex(points: readonly ({ x: number; y: number } | null)[]): number {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index] !== null) {
      return index;
    }
  }

  return -1;
}

/**
 * The widest end label: the widest last value, and the widest series name when there are several
 * series.
 *
 * @param data - The chart's data.
 * @param write - Writes a value.
 * @param theme - The chart theme.
 * @param measure - Measures text.
 */
function endLabelWidth(
  data: CategoricalData,
  write: (value: number) => string,
  theme: ChartTheme,
  measure: Measure,
): number {
  const valueStyle = { ...theme.text.value, weight: EMPHASIS_WEIGHT };
  // The values are set in one column and the names after it, so the widest value and the widest
  // name add up even when they belong to different lines.
  const values = data.series.map((series) =>
    measure(write(series.values.findLast((value) => value !== null) ?? 0), valueStyle),
  );
  const names =
    data.series.length > 1
      ? data.series.map((series) => measure(series.label, theme.text.legend) + theme.space.sm)
      : [];
  return maxOf(values, 0) + maxOf(names, 0) + theme.space.md * 2;
}

/**
 * The end labels: each line's last value (heavier, in the heading color when highlighted) and, with
 * several lines, its name, dodged so no two overlap, with a leader where a label had to move away
 * from its line.
 *
 * @param laid - The laid-out series.
 * @param plot - The plot area.
 * @param theme - The chart theme.
 * @param measure - Measures text.
 * @param write - Writes a value.
 * @param highlight - The highlight.
 * @param rooms - Room to leave beside a series' early end for a bracket that ends there, by
 *   `series|index`.
 */
function endLabelItems(
  laid: readonly LaidSeries[],
  plot: Box,
  theme: ChartTheme,
  measure: Measure,
  write: (value: number) => string,
  highlight: ResolvedHighlight,
  rooms: ReadonlyMap<string, number>,
): {
  owned: { item: SceneItem; series: string; index: number }[];
  boxes: Box[];
  reserved: Box[];
  items: SceneItem[];
} {
  const valueStyle = theme.text.value;
  const height = lineHeight(valueStyle);
  const reserved: Box[] = [];
  const all = laid
    .map((line) => {
      const index = lastPointIndex(line.points);
      const point = line.points[index];
      const value = line.series.values[index];
      return point === null || point === undefined || value === null || value === undefined
        ? null
        : { line, point, value, index };
    })
    .filter((end) => end !== null);
  // A line that stops before the last category is labeled where it stops, not at the axis end.
  const lastCategory = maxOf(
    laid.map((line) => line.points.length - 1),
    0,
  );
  const ends = all.filter((end) => end.index === lastCategory);
  const early = all.filter((end) => end.index < lastCategory);
  const centres = dodge(
    ends.map((end) => ({ target: end.point.y, size: height })),
    plot.y - height / 2,
    plot.y + plot.height + height / 2,
  );
  const owned: { item: SceneItem; series: string; index: number }[] = [];
  const boxes: Box[] = [];
  const several = laid.length > 1;
  const strongStyle = { ...valueStyle, weight: EMPHASIS_WEIGHT };
  const texts = ends.map((end) => write(end.value));
  const column = maxOf(
    texts.map((text) => measure(text, strongStyle)),
    0,
  );
  const anyMoved = ends.some(
    (end, position) =>
      Math.abs((centres[position] ?? end.point.y) - end.point.y) > height * LEADER_AFTER,
  );
  for (const [position, end] of ends.entries()) {
    const y = centres[position] ?? end.point.y;
    const moved = Math.abs(y - end.point.y) > height * LEADER_AFTER;
    const x = plot.x + plot.width + theme.space.md + (anyMoved ? theme.space.md : 0);
    const emphasized = highlight.active && end.line.emphasized;
    const key = end.line.series.key;
    const strong = !highlight.active || emphasized;
    /**
     * Adds an item owned by the series.
     */
    const own = (item: SceneItem): void => {
      owned.push({ item, series: key, index: end.index });
    };
    if (moved) {
      const start = end.point.x + theme.lineWidth * 3;
      own({
        kind: 'path',
        d: `M${start},${end.point.y}L${x - theme.space.xs},${y}`,
        fill: 'none',
        stroke: theme.colors.axis,
        strokeWidth: theme.axis.width,
        anim: 'fade',
        lag: true,
      });
    }

    own({
      kind: 'text',
      x: x + column,
      y,
      lines: [texts[position] ?? ''],
      style: valueStyle,
      weight: EMPHASIS_WEIGHT,
      color: strong ? theme.colors.heading : theme.colors.label,
      colorBefore: theme.colors.heading,
      anchor: 'end',
      anim: 'fade',
      lag: true,
    });
    let width = column;
    if (several) {
      const nameX = x + column + theme.space.sm;
      own({
        kind: 'text',
        x: nameX,
        y,
        lines: [end.line.series.label],
        style: theme.text.legend,
        color: strong ? theme.colors.value : theme.colors.label,
        colorBefore: theme.colors.value,
        anchor: 'start',
        anim: 'fade',
        lag: true,
      });
      width += theme.space.sm + measure(end.line.series.label, theme.text.legend);
    }

    boxes.push({ x, y: y - height / 2, width, height });
  }

  for (const end of early) {
    const emphasized = highlight.active && end.line.emphasized;
    const strong = !highlight.active || emphasized;
    const key = end.line.series.key;
    const text = write(end.value);
    const x = end.point.x + theme.space.md + (rooms.get(`${key}|${end.index}`) ?? 0);
    const y = end.point.y;
    const valueWidth = measure(text, strongStyle);
    owned.push({
      item: {
        kind: 'text',
        x,
        y,
        lines: [text],
        style: valueStyle,
        weight: EMPHASIS_WEIGHT,
        color: strong ? theme.colors.heading : theme.colors.label,
        colorBefore: theme.colors.heading,
        anchor: 'start',
        anim: 'fade',
        lag: true,
      },
      series: key,
      index: end.index,
    });
    let width = valueWidth;
    if (several) {
      owned.push({
        item: {
          kind: 'text',
          x: x + valueWidth + theme.space.sm,
          y,
          lines: [end.line.series.label],
          style: theme.text.legend,
          color: strong ? theme.colors.value : theme.colors.label,
          colorBefore: theme.colors.value,
          anchor: 'start',
          anim: 'fade',
          lag: true,
        },
        series: key,
        index: end.index,
      });
      width += theme.space.sm + measure(end.line.series.label, theme.text.legend);
    }

    const box = { x, y: y - height / 2, width, height };
    boxes.push(box);
    if (rooms.has(`${key}|${end.index}`)) {
      reserved.push(box);
    }
  }

  return { owned, boxes, reserved, items: owned.map((entry) => entry.item) };
}

/**
 * The room a side bracket takes beside the point it ends at, its tick and the gaps, by
 * `series|index` of that point, so a line's end label there steps past it.
 *
 * @param annotations - The resolved annotations.
 * @param theme - The chart theme.
 */
function bracketRooms(
  annotations: readonly ResolvedAnnotation[],
  theme: ChartTheme,
): Map<string, number> {
  const rooms = new Map<string, number>();
  for (const note of annotations) {
    // The end label sits on the bracket's lower or upper end, past its tick; the bracket's own
    // label sits between the two ends.
    if (note.type === 'bracket') {
      rooms.set(`${note.series}|${note.to.index}`, theme.space.sm * 3);
    }
  }

  return rooms;
}

/**
 * Value labels on points: every point with `all` (when there are few), the highlighted points with
 * `highlight` and `auto`, above each point.
 *
 * @param laid - The laid-out series.
 * @param mode - The label mode.
 * @param highlight - The highlight.
 * @param theme - The chart theme.
 * @param write - Writes a value.
 */
function valueLabels(
  laid: readonly LaidSeries[],
  mode: LabelMode,
  highlight: ResolvedHighlight,
  theme: ChartTheme,
  write: (value: number) => string,
): { owned: { item: SceneItem; series: string; index: number }[]; boxes: Box[] } {
  const owned: { item: SceneItem; series: string; index: number }[] = [];
  const boxes: Box[] = [];
  const style = theme.text.value;
  const height = lineHeight(style);
  for (const line of laid) {
    const last = lastPointIndex(line.points);
    for (const [index, point] of line.points.entries()) {
      const value = line.series.values[index];
      if (point === null || value === null || value === undefined || index === last) {
        continue;
      }

      const pointed =
        highlight.points.has(`${line.series.key}|${index}`) ||
        (highlight.categories.has(index) && line.emphasized);
      const wanted =
        (mode === 'all' && line.points.length <= ALL_LABELS_MAX) ||
        ((mode === 'auto' || mode === 'highlight') && pointed);
      if (!wanted) {
        continue;
      }

      const y = point.y - theme.space.md - height / 2;
      owned.push({
        item: {
          kind: 'text',
          x: point.x,
          y,
          lines: [write(value)],
          style,
          color: theme.colors.heading,
          anchor: 'middle',
          weight: EMPHASIS_WEIGHT,
          tabular: true,
          anim: 'fade',
          lag: true,
        },
        series: line.series.key,
        index,
      });
      boxes.push({ x: point.x - height, y: y - height / 2, width: height * 2, height });
    }
  }

  return { owned, boxes };
}

/**
 * The x labels: every category when they fit side by side, else every n-th, always the first and
 * the last.
 *
 * @param data - The chart's data.
 * @param xs - The x of each category.
 * @param area - The plot area and the width of the whole chart, which labels stay inside.
 * @param theme - The chart theme.
 * @param measure - Measures text.
 * @param highlight - The highlight, whose categories are labeled heavier.
 */
function xAxisLabels(
  data: CategoricalData,
  xs: readonly number[],
  area: { plot: Box; width: number },
  theme: ChartTheme,
  measure: Measure,
  highlight: ResolvedHighlight,
): { items: SceneItem[]; boxes: Box[] } {
  const { plot } = area;
  const style = theme.text.axis;
  const widths = data.categories.map((category) => measure(category, style));
  const shown = thinLabels(xs, widths, theme.space.md);
  const y = plot.y + plot.height + xLabelDrop(theme) + lineHeight(style) / 2;
  const items: SceneItem[] = [];
  const boxes: Box[] = [];
  for (const index of shown) {
    const category = data.categories[index] ?? '';
    const width = widths[index] ?? 0;
    const x = clampLabel(xs[index] ?? 0, width, area.width);
    const emphasized = highlight.active && highlight.categories.has(index);
    items.push({
      kind: 'text',
      x,
      y,
      lines: [category],
      style,
      color: emphasized ? theme.colors.value : theme.colors.label,
      anchor: 'middle',
      ...(emphasized ? { weight: EMPHASIS_WEIGHT } : {}),
    });
    boxes.push({
      x: x - width / 2,
      y: y - lineHeight(style) / 2,
      width,
      height: lineHeight(style),
    });
  }

  return { items, boxes };
}

/**
 * A centred label's x moved inward so it stays inside the chart.
 *
 * @param x - The wanted centre.
 * @param width - The label's width.
 * @param chartWidth - The chart's width.
 */
function clampLabel(x: number, width: number, chartWidth: number): number {
  return Math.min(Math.max(x, width / 2), chartWidth - width / 2);
}

/**
 * The series as the spec lists them.
 *
 * @param laid - The laid-out series.
 * @param theme - The chart theme.
 * @param write - Writes a value.
 * @param endLabels - Whether each line's last value is labeled.
 */
function specSeries(
  laid: readonly LaidSeries[],
  theme: ChartTheme,
  write: (value: number) => string,
  endLabels: boolean,
): ChartSpecSeries[] {
  return laid
    .toSorted((a, b) => a.position - b.position)
    .map((line) => {
      const last = lastPointIndex(line.points);
      return {
        name: line.series.label,
        values: line.series.values,
        x: null,
        color: line.emphasized ? line.color : theme.context,
        pointColors: null,
        highlighted: line.emphasized,
        labels: line.series.values.map((value, index) =>
          endLabels && index === last && value !== null ? write(value) : null,
        ),
      };
    });
}

/**
 * A text summary: each series' first and last values and the change, and what is highlighted.
 *
 * @param data - The chart's data.
 * @param highlight - The highlight.
 * @param write - Writes a value.
 */
function summarize(
  data: CategoricalData,
  highlight: ResolvedHighlight,
  write: (value: number) => string,
): string {
  const first = data.categories[0] ?? '';
  const last = data.categories.at(-1) ?? '';
  const parts = [`From ${first} to ${last}.`];
  for (const series of data.series) {
    const start = series.values.find((value) => value !== null);
    const end = series.values.findLast((value) => value !== null);
    if (start !== undefined && start !== null && end !== undefined && end !== null) {
      parts.push(`${series.label} goes from ${write(start)} to ${write(end)}.`);
    }
  }

  if (highlight.active) {
    parts.push(
      `Highlighted: ${listNames([...highlight.spec.series, ...highlight.spec.categories])}.`,
    );
  }

  return parts.join(' ');
}
