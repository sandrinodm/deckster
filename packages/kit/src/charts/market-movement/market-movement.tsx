import type { ReactNode } from 'react';

import type { ChartSpecSeries } from '#charts/chart-spec.ts';
import type { DataProp, Rows } from '#charts/data/rows.ts';
import type { FormatProp, ResolvedFormat } from '#charts/format/number-format.ts';
import type { DrawInput, FrameProps } from '#charts/frame/chart-frame.tsx';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { SceneItem, SceneLayer } from '#charts/frame/scene.ts';
import type { Box } from '#charts/layout/label-placement.ts';

import { resolveRows, toLabel, toNumber } from '#charts/data/rows.ts';
import { resolveFormat, runFormatter } from '#charts/format/number-format.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { axisItems, tickLabels, tickLabelWidth, xLabelDrop } from '#charts/frame/plot-parts.ts';
import { drawScene } from '#charts/frame/scene-svg.tsx';
import { linePath } from '#charts/frame/scene.ts';
import { buildSpec } from '#charts/frame/spec-builder.ts';
import { placeLabels } from '#charts/layout/label-placement.ts';
import { EMPHASIS_WEIGHT, lineHeight, wrapLines, widestLine } from '#charts/layout/text-measure.ts';
import { pathObstacles } from '#charts/line/plan-line.ts';
import { linearScale, tickCountFor, valueAxis } from '#charts/scale/linear-scale.ts';
import { padded } from '#charts/scatter/scatter.tsx';

/**
 * Date inputs are calendar dates in UTC, independent of the viewer's time zone.
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Canvas pixels reserved per tick interval on each quantitative axis.
 */
const TICK_SPACING = {
  /**
   * Horizontal spacing leaves room for currency labels.
   */
  x: 180,

  /**
   * Vertical spacing separates labels within a presentation-sized plot.
   */
  y: 105,
};

/**
 * Multiples of the brand stroke width for history, peer and current observations.
 */
const DOT_SIZE = {
  /**
   * Earlier selected observations leave room for the trail between them.
   */
  history: 2,

  /**
   * Peers sit visibly behind the selected entity.
   */
  peer: 2.4,

  /**
   * The most recent selected observation is the largest mark.
   */
  current: 3.5,
};

/**
 * Extra distances, in label gaps, to try before allowing labels and marks to cross.
 */
const LABEL_REACHES = [1, 2, 4, 6];

/**
 * A calendar formatter per brand locale, reused as the plot is measured and redrawn.
 */
const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/**
 * Props for comparing one moving entity against its peers on two fixed quantitative axes.
 */
export type MarketMovementProps = FrameProps & {
  /**
   * Long rows with one observation per entity and ISO calendar date.
   */
  data: DataProp;

  /**
   * The entity name field, `entity` by default.
   */
  entity?: string;

  /**
   * The `YYYY-MM-DD` date field, `date` by default. Observations are sorted chronologically.
   */
  date?: string;

  /**
   * The x measure's field.
   */
  x: string;

  /**
   * The y measure's field.
   */
  y: string;

  /**
   * The x axis title, or the x field name when omitted.
   */
  xLabel?: string;

  /**
   * The y axis title, or the y field name when omitted.
   */
  yLabel?: string;

  /**
   * The number format for x.
   */
  xFormat?: FormatProp;

  /**
   * The number format for y.
   */
  format?: FormatProp;

  /**
   * The entity whose observed positions form the trail.
   */
  highlight: string;

  /**
   * Step of the second date. Each later date advances one step. Omit for the final view.
   */
  buildFrom?: number;
};

/**
 * Props checked against the component and chart catalog.
 */
export const MARKET_MOVEMENT_PROPS = propNames<MarketMovementProps>()([
  'at',
  'caption',
  'source',
  'label',
  'data',
  'entity',
  'date',
  'x',
  'y',
  'xLabel',
  'yLabel',
  'xFormat',
  'format',
  'highlight',
  'buildFrom',
]);

/**
 * Draws dated positions on fixed axes, keeping a single entity's trail and dated endpoints.
 */
export function MarketMovement(props: MarketMovementProps): ReactNode {
  checkProps('MarketMovement', props);
  return (
    <ChartFrame
      kind="market-movement"
      {...frameProps(props)}
      draw={(input) => drawScene(planMarketMovement(props, input), input)}
    />
  );
}

/**
 * An observed pair of measures at a single date, before conversion to plot pixels.
 */
type Observation = {
  /**
   * The entity measured.
   */
  name: string;

  /**
   * The observation date in ISO calendar format.
   */
  date: string;

  /**
   * The horizontal measure in the data's units.
   */
  x: number;

  /**
   * The vertical measure in the data's units.
   */
  y: number;
};

/**
 * An observation placed in the plot, with its position in canvas pixels.
 */
type Point = Observation & { at: { x: number; y: number } };

/**
 * All known positions on one plotted date.
 */
type Snapshot = {
  /**
   * The observation date in ISO calendar format.
   */
  date: string;

  /**
   * The measured positions on this date, including the selected entity when present.
   */
  points: Point[];

  /**
   * The entity whose trail accumulates across snapshots, if measured on this date.
   */
  selected: Point | undefined;
};

/**
 * Plans the fixed axes, chronological scene layers and static summary from all observations.
 */
export function planMarketMovement(
  props: MarketMovementProps,
  input: DrawInput,
): Parameters<typeof drawScene>[0] {
  const { theme, size } = input;
  const observations = readObservations(resolveRows(props.data, input.datasets), props);
  const names = [...new Set(observations.map(({ name }) => name))];
  if (observations.length > 0 && !names.includes(props.highlight)) {
    throw new Error(`MarketMovement has no observed positions for ${props.highlight}.`);
  }

  const xFormat = resolveFormat(props.xFormat, undefined, theme.numbers);
  const yFormat = resolveFormat(props.format, undefined, theme.numbers);
  const geometry = positions(observations, { x: xFormat, y: yFormat }, input);
  const snapshots = groupSnapshots(geometry.points, props.highlight);
  const dateLabel = dateWriter(theme.numbers.locale);
  const xLabel = props.xLabel ?? props.x;
  const yLabel = props.yLabel ?? props.y;
  const layers = [
    {
      at: undefined,
      items: [...geometry.axes, ...axisTitles(xLabel, yLabel, geometry.plot, input)],
    },
    ...movementLayers(snapshots, { dateLabel, plot: geometry.plot, input, from: props.buildFrom }),
  ];
  const spec = buildSpec(
    {
      kind: 'market-movement',
      name: `${yLabel} and ${xLabel} across observation dates`,
      summary: movementSummary(snapshots, props.highlight, { x: xFormat, y: yFormat, dateLabel }),
      categories: snapshots.map(({ date }) => dateLabel(date)),
      series: names.map((name) => marketSeries(name, snapshots, props.highlight, theme)),
      axis: {
        min: geometry.yAxis.min,
        max: geometry.yAxis.max,
        ticks: geometry.yAxis.ticks,
        zeroBased: geometry.yAxis.min <= 0,
        truncated: false,
      },
      highlight: { series: [props.highlight], categories: [], points: [], range: null },
    },
    {
      theme,
      format: yFormat,
      largest: Math.max(Math.abs(geometry.yAxis.min), Math.abs(geometry.yAxis.max)),
      caption: props.caption,
      source: props.source,
    },
  );
  return {
    scene: { width: size.width, height: size.height, layers, highlightAt: undefined },
    spec,
    facts: {
      series: names.length,
      categories: snapshots.length,
      marks: observations.length,
      highlighted: names.includes(props.highlight),
      axis: geometry.yAxis.min > 0 ? 'zoomed' : 'zero',
      unit: true,
      colored: 1,
      legend: false,
      legendAvoidable: false,
    },
  };
}

/**
 * Writes an ISO calendar date in the brand's locale without shifting the day by time zone.
 */
function dateWriter(locale: string): (date: string) => string {
  let formatter = DATE_FORMATTERS.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    DATE_FORMATTERS.set(locale, formatter);
  }

  const resolved = formatter;
  return (date) => resolved.format(new Date(date));
}

/**
 * Reads unique, valid observations. A row missing either measure has no position on the plot.
 */
function readObservations(rows: Rows, props: MarketMovementProps): Observation[] {
  const seen = new Set<string>();
  return rows
    .flatMap((row) => {
      const x = toNumber(row[props.x]);
      const y = toNumber(row[props.y]);
      if (x === null || y === null) {
        return [];
      }

      const name = toLabel(row[props.entity ?? 'entity']).trim();
      const date = toLabel(row[props.date ?? 'date']);
      if (name === '' || !validDate(date)) {
        throw new Error(
          'MarketMovement needs an entity name and a valid YYYY-MM-DD observation date.',
        );
      }

      const key = JSON.stringify([name, date]);
      if (seen.has(key)) {
        throw new Error(`MarketMovement has multiple observations of ${name} on ${date}.`);
      }

      seen.add(key);
      return [{ name, date, x, y }];
    })
    .toSorted((a, b) => a.date.localeCompare(b.date));
}

/**
 * Rejects dates JavaScript would otherwise roll into the following month.
 */
function validDate(date: string): boolean {
  if (!ISO_DAY.test(date)) {
    return false;
  }

  const time = new Date(date);
  return Number.isFinite(time.getTime()) && time.toISOString().startsWith(date);
}

/**
 * Fits both axes to all dates so stepping through snapshots cannot rescale the plot.
 */
function positions(
  observations: Observation[],
  formats: { x: ResolvedFormat; y: ResolvedFormat },
  input: DrawInput,
) {
  const { theme, size, measure } = input;
  const style = theme.text.axis;
  const top = lineHeight(style) + theme.space.md;
  const bottom = xLabelDrop(theme) + lineHeight(style) * 2 + theme.space.sm;
  const height = Math.max(0, size.height - top - bottom);
  const xAxis = valueAxis(
    padded(
      observations.map(({ x }) => x),
      false,
    ),
    {
      zero: false,
      count: tickCountFor(size.width, TICK_SPACING.x),
    },
  );
  const yAxis = valueAxis(
    padded(
      observations.map(({ y }) => y),
      false,
    ),
    {
      zero: false,
      count: tickCountFor(height, TICK_SPACING.y),
    },
  );
  const xTicks = tickLabels(xAxis, formats.x);
  const left = Math.max(
    tickLabelWidth(yAxis, formats.y, theme, measure) + theme.space.sm,
    measure(xTicks[0] ?? '', style) / 2 + theme.space.xs,
  );
  const right = measure(xTicks.at(-1) ?? '', style) / 2 + theme.space.xs;
  const plot: Box = { x: left, y: top, width: Math.max(0, size.width - left - right), height };
  const scaleX = linearScale([xAxis.min, xAxis.max], [left, left + plot.width]);
  const scaleY = linearScale([yAxis.min, yAxis.max], [top + height, top]);
  const axes = [
    ...axisItems({
      axis: xAxis,
      at: scaleX.at,
      direction: 'x',
      plot,
      theme,
      format: formats.x,
      ticks: true,
      baseline: xAxis.min,
      measure,
    }),
    ...axisItems({
      axis: yAxis,
      at: scaleY.at,
      direction: 'y',
      plot,
      theme,
      format: formats.y,
      ticks: true,
      baseline: yAxis.min,
    }),
  ];
  const points = observations.map((point): Point => ({
    ...point,
    at: { x: scaleX.at(point.x), y: scaleY.at(point.y) },
  }));
  return { plot, points, axes, yAxis };
}

/**
 * Groups same-day observations, without filling in data missing on a particular day.
 */
function groupSnapshots(points: Point[], selected: string): Snapshot[] {
  const byDate = new Map<string, Point[]>();
  for (const point of points) {
    const batch = byDate.get(point.date) ?? [];
    batch.push(point);
    byDate.set(point.date, batch);
  }

  return [...byDate].map(([date, points]) => ({
    date,
    points,
    selected: points.find(({ name }) => name === selected),
  }));
}

/**
 * Makes the active period replace its peer snapshot while retaining prior selected positions.
 */
function movementLayers(
  snapshots: Snapshot[],
  context: {
    dateLabel: (date: string) => string;
    plot: Box;
    input: DrawInput;
    from: number | undefined;
  },
): SceneLayer[] {
  const trail: Point[] = [];
  const trailLayers: SceneLayer[] = [];
  const periodLayers: SceneLayer[] = [];
  const { from, input } = context;
  for (const [index, snapshot] of snapshots.entries()) {
    const at = from === undefined || index === 0 ? undefined : from + index - 1;
    if (snapshot.selected !== undefined) {
      const previous = trail.at(-1);
      trail.push(snapshot.selected);
      trailLayers.push({ at, items: trailSegment(snapshot.selected, previous, input.theme) });
    }

    const last = index === snapshots.length - 1;
    if (from === undefined && !last) {
      continue;
    }

    const items = snapshotItems(snapshot, trail, context);
    periodLayers.push(
      last || from === undefined ? { at, items } : { at, until: from + index, items },
    );
  }

  return [...trailLayers, ...periodLayers];
}

/**
 * Draws one observed point and the segment from its previous observed position, if any.
 */
function trailSegment(point: Point, previous: Point | undefined, theme: ChartTheme): SceneItem[] {
  const dot = observationDot(point, 'history', theme);
  if (previous === undefined) {
    return [dot];
  }

  return [
    {
      kind: 'path',
      d: linePath([previous.at, point.at]),
      fill: 'none',
      stroke: theme.colors.accent,
      strokeWidth: theme.lineWidth,
      drawable: true,
      anim: 'draw',
    },
    dot,
  ];
}

/**
 * Draws the active date and its measured peer positions, with labels for the trail's endpoints.
 */
function snapshotItems(
  snapshot: Snapshot,
  trail: Point[],
  context: {
    dateLabel: (date: string) => string;
    plot: Box;
    input: DrawInput;
  },
): SceneItem[] {
  const { dateLabel, plot, input } = context;
  const { theme, size } = input;
  const start = trail[0];
  const end = trail.at(-1);
  const peers = snapshot.points.filter((point) => point !== snapshot.selected);
  const points = peers.map((point) => observationDot(point, 'peer', theme));
  const labels = peers.map((point) => ({ point, text: point.name, emphasis: false }));
  if (end !== undefined) {
    points.push(observationDot(end, 'current', theme));
    labels.unshift({ point: end, text: `${end.name} · ${dateLabel(end.date)}`, emphasis: true });
  }

  if (start !== undefined && start !== end) {
    labels.splice(1, 0, { point: start, text: `Start · ${dateLabel(start.date)}`, emphasis: true });
  }

  const date = axisTitle(
    dateLabel(snapshot.date),
    size.width,
    lineHeight(theme.text.axis) / 2,
    'end',
    theme,
  );
  return [date, ...points, ...placeObservationLabels(labels, trail, plot, input)];
}

/**
 * Keeps peers muted and makes the latest position visually larger than the trail's history.
 */
function observationDot(point: Point, kind: keyof typeof DOT_SIZE, theme: ChartTheme): SceneItem {
  return {
    kind: 'circle',
    cx: point.at.x,
    cy: point.at.y,
    r: theme.lineWidth * DOT_SIZE[kind],
    fill: kind === 'peer' ? theme.context : theme.colors.accent,
    ring: theme.plate,
    ringWidth: theme.lineWidth / 2,
    anim: 'pop',
    mark: true,
  };
}

/**
 * Places labels around dots and routes a short leader for labels that need more space.
 */
function placeObservationLabels(
  labels: { point: Point; text: string; emphasis: boolean }[],
  trail: Point[],
  plot: Box,
  input: DrawInput,
): SceneItem[] {
  const { theme, measure } = input;
  const style = theme.text.annotation;
  const dotSize = theme.lineWidth * DOT_SIZE.current * 2;
  const obstacles = pathObstacles(
    trail.map(({ at }) => at),
    dotSize,
    plot,
  );
  const candidates = labels.map(({ point, text, emphasis }) => {
    const weight = emphasis ? EMPHASIS_WEIGHT : style.weight;
    const labelStyle = { ...style, weight };
    const wrapped = wrapLines(text, plot.width, { measure, style: labelStyle, maxLines: 2 });
    return {
      ...wrapped,
      text,
      emphasis,
      weight,
      anchor: point.at,
      width: widestLine(wrapped.lines, measure, labelStyle),
      height: lineHeight(style) * wrapped.lines.length,
    };
  });
  const marks = [
    ...obstacles,
    ...candidates.map(({ anchor }) => ({
      x: anchor.x - dotSize / 2,
      y: anchor.y - dotSize / 2,
      width: dotSize,
      height: dotSize,
    })),
  ];
  const placed = placeLabels(candidates, marks, plot, theme.space.sm, LABEL_REACHES);
  return placed.flatMap(({ box, reach }, index) => {
    const candidate = candidates[index];
    if (candidate === undefined) {
      return [];
    }

    const text: SceneItem = {
      kind: 'text',
      x: box.x,
      y: box.y + lineHeight(style) / 2,
      lines: candidate.lines,
      style,
      weight: candidate.weight,
      anchor: 'start',
      color: candidate.emphasis ? theme.colors.accentText : theme.colors.label,
      ...(candidate.cut ? { cut: candidate.text } : {}),
      anim: 'fade',
      lag: true,
    };
    if (reach === undefined || reach <= 1) {
      return [text];
    }

    const edge = {
      x: Math.min(Math.max(candidate.anchor.x, box.x), box.x + box.width),
      y: Math.min(Math.max(candidate.anchor.y, box.y), box.y + box.height),
    };
    return [
      {
        kind: 'line',
        x1: candidate.anchor.x,
        y1: candidate.anchor.y,
        x2: edge.x,
        y2: edge.y,
        stroke: theme.colors.axis,
        width: theme.axis.width,
      },
      text,
    ];
  });
}

/**
 * Names both axes and the direction in which each measure increases.
 */
function axisTitles(x: string, y: string, plot: Box, { size, theme }: DrawInput): SceneItem[] {
  const half = lineHeight(theme.text.axis) / 2;
  return [
    axisTitle(`↑ ${y}`, plot.x, half, 'start', theme),
    axisTitle(`${x} →`, plot.x + plot.width, size.height - half, 'end', theme),
  ];
}

/**
 * Draws an axis or current date title using brand chart typography.
 */
function axisTitle(
  text: string,
  x: number,
  y: number,
  anchor: 'start' | 'end',
  theme: ChartTheme,
): SceneItem {
  return {
    kind: 'text',
    x,
    y,
    lines: [text],
    style: theme.text.axis,
    anchor,
    color: theme.colors.value,
  };
}

/**
 * Serializes every entity's observed coordinates with dates in the chart summary.
 */
function movementSummary(
  snapshots: Snapshot[],
  selected: string,
  context: {
    x: ResolvedFormat;
    y: ResolvedFormat;
    dateLabel: (date: string) => string;
  },
): string {
  const points = snapshots.flatMap(({ points }) => points);
  const writeX = runFormatter(
    points.map(({ x }) => x),
    context.x,
  );
  const writeY = runFormatter(
    points.map(({ y }) => y),
    context.y,
  );
  const periods = snapshots.map(
    ({ date, points }) =>
      `${context.dateLabel(date)}: ${points.map(({ name, x, y }) => `${name} (${writeX(x)}, ${writeY(y)})`).join(', ')}.`,
  );
  return `Trail for ${selected}. ${periods.join(' ')}`;
}

/**
 * Stores y values by date and the corresponding x values in their observed order.
 */
function marketSeries(
  name: string,
  snapshots: Snapshot[],
  selected: string,
  theme: ChartTheme,
): ChartSpecSeries {
  const points = snapshots.map(({ points }) => points.find((point) => point.name === name));
  const highlighted = name === selected;
  return {
    name,
    values: points.map((point) => point?.y ?? null),
    x: points.map((point) => point?.x ?? null),
    color: highlighted ? theme.colors.accent : theme.context,
    pointColors: null,
    highlighted,
    labels: points.map((point) => point?.date ?? null),
  };
}
