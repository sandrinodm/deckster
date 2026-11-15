import type { ReactNode } from 'react';

import type { ChartDrawing, ChartFacts, DrawInput } from '#charts/frame/chart-frame.tsx';
import type { ChartProps } from '#charts/frame/chart-props.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { Scene, SceneItem } from '#charts/frame/scene.ts';
import type { Box } from '#charts/layout/label-placement.ts';
import type { Measure } from '#charts/layout/text-measure.ts';

import { categorical, fieldKinds, resolveRows } from '#charts/data/rows.ts';
import { resolveFormat, runFormatter } from '#charts/format/number-format.ts';
import { annotationLayers, toneColor } from '#charts/frame/annotation-items.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { hasUnit } from '#charts/frame/chart-input.ts';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { drawScene } from '#charts/frame/scene-svg.tsx';
import { buildSpec, listNames } from '#charts/frame/spec-builder.ts';
import {
  annotationSpecs,
  requireAnnotationTypes,
  resolveAnnotations,
  toneOf,
} from '#charts/insight/annotations.ts';
import { resolveHighlight, type ResolvedHighlight } from '#charts/insight/highlight.ts';
import { dodge } from '#charts/layout/label-placement.ts';
import { EMPHASIS_WEIGHT, lineHeight } from '#charts/layout/text-measure.ts';
import { pathObstacles } from '#charts/line/plan-line.ts';
import { linearScale, valueAxis } from '#charts/scale/linear-scale.ts';
import { maxOf, minOf, pushAll } from '#foundation/lists.ts';

/**
 * The widest a side's label column may be, as a share of the chart's width.
 */
const MAX_SIDE = 0.3;

/**
 * How far a label may sit from its point, in line heights, before a leader joins them.
 */
const LEADER_AFTER = 0.45;

/**
 * About how many ticks the value axis aims for.
 */
const VALUE_AXIS_TICKS = 4;

/**
 * The stroke multiplier for an emphasized slope and the radius of each endpoint relative to it.
 */
const HIGHLIGHT_STROKE_SCALE = 1.5;

/**
 * The endpoint radius as a share of the slope's stroke width.
 */
const POINT_RADIUS_SCALE = 1.6;

/**
 * Clearance around a slope when placing labels, in stroke widths.
 */
const LABEL_CLEARANCE_SCALE = 3;

/**
 * Props of {@link Slope}.
 */
export type SlopeProps = Omit<ChartProps, 'labels' | 'legend'> & {
  /**
   * The field naming each item (a team, a region); the first text field when left out.
   */
  x?: string;

  /**
   * The field with each item's first value; the first number field when left out.
   */
  from?: string;

  /**
   * The field with each item's second value; the second number field when left out.
   */
  to?: string;

  /**
   * The heading over the left column; the `from` field's name when left out.
   */
  fromLabel?: string;

  /**
   * The heading over the right column; the `to` field's name when left out.
   */
  toLabel?: string;

  /**
   * Which way is better, so rises and falls get the right tone: `up` (the default) or `down`.
   */
  better?: 'up' | 'down';

  /**
   * Color every item by whether it got better or worse, instead of muting the ones not highlighted.
   */
  tone?: boolean;

  /**
   * Start the value axis at zero.
   */
  zero?: boolean;
};

/**
 * One item of the slope, laid out.
 */
type Item = {
  /**
   * The item's name.
   */
  name: string;

  /**
   * Its first value.
   */
  from: number;

  /**
   * Its second value.
   */
  to: number;

  /**
   * Its color with the highlight on.
   */
  color: string;

  /**
   * Whether it is highlighted.
   */
  strong: boolean;
};

/**
 * Every prop {@link Slope} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const SLOPE_PROPS = propNames<SlopeProps>()([
  'at',
  'caption',
  'source',
  'label',
  'data',
  'highlight',
  'format',
  'unit',
  'annotations',
  'x',
  'from',
  'to',
  'fromLabel',
  'toLabel',
  'better',
  'tone',
  'zero',
]);

/**
 * A slope chart for change between two points across several items: each item a line from its first
 * value to its second, labeled at both ends with its name and values, so who rose and who fell
 * reads at a glance. Highlight the items the point is about; with `tone`, every item is colored by
 * whether it got better or worse.
 *
 * ```mdx
 * <Slope data={teams} x="team" from="2025" to="2026" better="down"
 *   highlight={['Billing', 'Payroll']} />
 * ```
 */
export function Slope(props: SlopeProps): ReactNode {
  checkProps('Slope', props);
  return (
    <ChartFrame kind="slope" {...frameProps(props)} draw={(input) => drawSlope(props, input)} />
  );
}

/**
 * Lays out and draws the slope for the measured plot.
 *
 * @param props - The chart's props.
 * @param input - The plot size, theme and measurer.
 */
export function drawSlope(props: SlopeProps, input: DrawInput): ChartDrawing {
  const { theme, measure, size } = input;
  const rows = resolveRows(props.data, input.datasets);
  const kinds = fieldKinds(rows);
  const fromField = props.from ?? kinds.numbers[0] ?? '';
  const toField = props.to ?? kinds.numbers.find((field) => field !== fromField) ?? '';
  const data = categorical(rows, { x: props.x, y: [fromField, toField] });
  const format = resolveFormat(props.format, props.unit, theme.numbers);
  const highlight = resolveHighlight(props.highlight, data);
  requireAnnotationTypes(props.annotations, ['callout', 'reference'], '<Slope>');
  const annotations = resolveAnnotations(props.annotations, data, { format, series: toField });
  const better = props.better ?? 'up';
  const fromHeading = props.fromLabel ?? fromField;
  const toHeading = props.toLabel ?? toField;
  const items: Item[] = data.categories.map((name, index) => {
    const from = data.series[0]?.values[index] ?? null;
    const to = data.series[1]?.values[index] ?? null;
    if (from === null || to === null) {
      throw new Error(
        `"${name}" has no ${from === null ? fromField : toField} value; a slope needs both ends ` +
          'for every item. Fill it, or leave the row out.',
      );
    }

    const strong = !highlight.active || highlight.categories.has(index);
    return {
      name,
      from,
      to,
      color: itemColor(
        { from, to, strong, better, tone: props.tone === true, active: highlight.active },
        theme,
      ),
      strong,
    };
  });
  const values = items.flatMap((item) => [item.from, item.to]);
  const write = runFormatter(values, format);
  const headStyle = theme.text.axis;
  const valueStyle = { ...theme.text.value, weight: EMPHASIS_WEIGHT };
  const nameStyle = theme.text.legend;
  /**
   * The widest label column of one side, capped.
   */
  const sideWidth = (side: 'from' | 'to'): number =>
    Math.min(
      size.width * MAX_SIDE,
      maxOf(
        items.map(
          (item) =>
            measure(write(item[side]), valueStyle) + theme.space.sm + measure(item.name, nameStyle),
        ),
        0,
      ),
    );
  // Each side keeps room for a leader between a point and a label that had to move.
  const left = sideWidth('from') + theme.space.md * 2;
  const right = sideWidth('to') + theme.space.md * 2;
  const top = lineHeight(headStyle) + theme.space.md;
  const height = lineHeight(valueStyle);
  const plot = {
    x: left,
    y: top + height / 2,
    width: Math.max(0, size.width - left - right),
    height: Math.max(0, size.height - top - height),
  };
  const axis = valueAxis(values, { zero: props.zero ?? false, count: VALUE_AXIS_TICKS });
  const low = props.zero === true ? axis.min : minOf(values);
  const high = props.zero === true ? axis.max : maxOf(values);
  const y = linearScale([low, high], [plot.y + plot.height, plot.y]).at;
  const x1 = plot.x;
  const x2 = plot.x + plot.width;
  const scene: SceneItem[] = columnFrame(plot, height, { from: fromHeading, to: toHeading }, theme);
  pushAll(
    scene,
    slopeMarks(items, {
      x1,
      x2,
      y,
      theme,
      better,
      highlighted: highlight.active,
      tone: props.tone === true,
    }),
  );

  const fromLabels = sideLabels(items, 'from', {
    x: x1,
    y,
    plot,
    theme,
    measure,
    write,
    highlight,
  });
  const toLabels = sideLabels(items, 'to', {
    x: x2,
    y,
    plot,
    theme,
    measure,
    write,
    highlight,
  });
  pushAll(scene, fromLabels.items);
  pushAll(scene, toLabels.items);
  const notes = annotationLayers(
    annotations,
    {
      orientation: 'vertical',
      // The plot runs to the labels' half line past the lowest point, so a callout there fits.
      plot: { x: x1, y: plot.y, width: x2 - x1, height: plot.height + height },
      span: () => [x1, x2],
      value: y,
      tip: (series, index) => {
        const item = items[index];
        if (item === undefined) {
          return null;
        }

        return series === fromField ? { x: x1, y: y(item.from) } : { x: x2, y: y(item.to) };
      },
      bracket: 'side',
    },
    {
      theme,
      measure,
      obstacles: [
        ...fromLabels.boxes,
        ...toLabels.boxes,
        ...items.flatMap((item) =>
          pathObstacles(
            [
              { x: x1, y: y(item.from) },
              { x: x2, y: y(item.to) },
            ],
            theme.lineWidth * LABEL_CLEARANCE_SCALE,
          ),
        ),
      ],
    },
  );
  const facts: ChartFacts = {
    series: 1,
    categories: items.length,
    highlighted: highlight.active || props.tone === true || annotations.length > 0,
    axis: 'zoomed',
    unit: hasUnit(props, format),
    legend: false,
    legendAvoidable: false,
    marks: items.length,
    colored: highlight.active ? items.filter((item) => item.strong).length : items.length,
  };
  const spec = buildSpec(
    {
      kind: 'slope',
      name: `Slope chart of ${data.x} from ${fromHeading} to ${toHeading}`,
      summary: slopeSummary(items, write, highlight),
      categories: [fromHeading, toHeading],
      series: items.map((item) => ({
        name: item.name,
        values: [item.from, item.to],
        x: null,
        color: item.color,
        pointColors: null,
        highlighted: highlight.active && item.strong,
        labels: [write(item.from), write(item.to)],
      })),
      highlight: highlight.spec,
      annotations: annotationSpecs(annotations, data),
    },
    {
      theme,
      format,
      largest: maxOf(values.map(Math.abs)),
      caption: props.caption,
      source: props.source,
    },
  );
  const planned: { scene: Scene; spec: typeof spec; facts: ChartFacts } = {
    scene: {
      width: size.width,
      height: size.height,
      layers: [{ at: undefined, items: scene }, ...notes.back, ...notes.front],
      highlightAt: highlight.at,
    },
    spec,
    facts,
  };
  return drawScene(planned, input);
}

/**
 * Draws context slopes first, then highlighted slopes, each followed by its two endpoint circles.
 *
 * @param items - The category values and their colors.
 * @param options - The two columns, value scale and emphasis settings.
 */
function slopeMarks(
  items: readonly Item[],
  options: {
    x1: number;
    x2: number;
    y: (value: number) => number;
    theme: ChartTheme;
    better: 'up' | 'down';
    highlighted: boolean;
    tone: boolean;
  },
): SceneItem[] {
  const { x1, x2, y, theme, better, highlighted, tone } = options;
  const scene: SceneItem[] = [];
  const ordered = items
    .map((item, index) => ({ item, index }))
    .toSorted((a, b) => Number(a.item.strong) - Number(b.item.strong));
  for (const { item, index } of ordered) {
    const weight =
      item.strong && highlighted ? theme.lineWidth * HIGHLIGHT_STROKE_SCALE : theme.lineWidth;
    scene.push(
      {
        kind: 'path',
        d: `M${x1},${y(item.from)}L${x2},${y(item.to)}`,
        fill: 'none',
        stroke: item.color,
        strokeBefore: itemColor({ ...item, better, tone: tone, active: false }, theme),
        strokeWidth: weight,
        anim: 'draw',
        drawable: true,
        order: index,
        mark: true,
      },
      {
        kind: 'circle',
        cx: x1,
        cy: y(item.from),
        r: weight * POINT_RADIUS_SCALE,
        fill: item.color,
        ring: theme.plate,
        ringWidth: theme.lineWidth,
        anim: 'pop',
        order: index,
        mark: true,
      },
      {
        kind: 'circle',
        cx: x2,
        cy: y(item.to),
        r: weight * POINT_RADIUS_SCALE,
        fill: item.color,
        ring: theme.plate,
        ringWidth: theme.lineWidth,
        anim: 'pop',
        order: index,
        mark: true,
      },
    );
  }

  return scene;
}

/**
 * The two column rules of a slope and the headings over them: one rule at each end of the plot.
 *
 * @param plot - The plot area the columns stand in.
 * @param height - The height of a value's line.
 * @param headings - The heading over each column.
 * @param theme - The chart theme.
 */
function columnFrame(
  plot: Box,
  height: number,
  headings: { from: string; to: string },
  theme: ChartTheme,
): SceneItem[] {
  const headStyle = theme.text.axis;
  const x1 = plot.x;
  const x2 = plot.x + plot.width;
  return [
    {
      kind: 'line',
      x1,
      y1: plot.y - height / 2,
      x2: x1,
      y2: plot.y + plot.height + height / 2,
      stroke: theme.colors.grid,
      width: theme.grid.width,
    },
    {
      kind: 'line',
      x1: x2,
      y1: plot.y - height / 2,
      x2,
      y2: plot.y + plot.height + height / 2,
      stroke: theme.colors.grid,
      width: theme.grid.width,
    },
    {
      kind: 'text',
      x: x1,
      y: lineHeight(headStyle) / 2,
      lines: [headings.from],
      style: headStyle,
      color: theme.colors.label,
      anchor: 'middle',
    },
    {
      kind: 'text',
      x: x2,
      y: lineHeight(headStyle) / 2,
      lines: [headings.to],
      style: headStyle,
      color: theme.colors.label,
      anchor: 'middle',
    },
  ];
}

/**
 * The text summary of a slope: each item's two values, and what is highlighted.
 *
 * @param items - The items, in order.
 * @param write - Writes a value.
 * @param highlight - The highlight.
 */
function slopeSummary(
  items: readonly Item[],
  write: (value: number) => string,
  highlight: ResolvedHighlight,
): string {
  const changes = items
    .map((item) => `${item.name} ${write(item.from)} to ${write(item.to)}`)
    .join('; ');
  const highlighted = highlight.active
    ? `. Highlighted: ${listNames(highlight.spec.categories)}.`
    : '.';
  return changes + highlighted;
}

/**
 * An item's color: by its change when toned, else the lead data color for highlighted items and the
 * context color for the rest.
 *
 * @param item - The item's values and emphasis, and how the chart colors.
 * @param theme - The chart theme.
 */
function itemColor(
  item: {
    from: number;
    to: number;
    strong: boolean;
    better: 'up' | 'down';
    tone: boolean;
    active: boolean;
  },
  theme: ChartTheme,
): string {
  const lead = theme.categorical[0] ?? theme.colors.accent;
  if (item.tone) {
    const tone = toneOf(item.to - item.from, item.better);
    if (item.active && !item.strong) {
      return theme.context;
    }

    return tone === 'neutral' ? lead : toneColor(tone, theme);
  }

  return item.active && !item.strong ? theme.context : lead;
}

/**
 * The leader joining a value's point to its label where the label had to move. It runs from just
 * beside the point, on the column's side, to just short of the label.
 *
 * @param side - Which end the point is on.
 * @param point - The point on the column.
 * @param label - The label's anchor on its column.
 * @param theme - The chart theme.
 */
function leaderLine(
  side: 'from' | 'to',
  point: { x: number; y: number },
  label: { x: number; y: number },
  theme: ChartTheme,
): SceneItem {
  const fromSide = side === 'from';
  return {
    kind: 'line',
    x1: fromSide ? point.x - theme.space.sm : point.x + theme.space.sm,
    y1: point.y,
    x2: fromSide ? label.x + theme.space.xs : label.x - theme.space.xs,
    y2: label.y,
    stroke: theme.colors.axis,
    width: theme.axis.width,
    anim: 'fade',
    lag: true,
  };
}

/**
 * One side's labels: the value (heavier) and the name, beside each end, dodged apart.
 *
 * @param items - The items.
 * @param side - Which end.
 * @param context - Where the column sits, the scale, plot, theme, measurer, formatter and
 *   highlight.
 */
function sideLabels(
  items: readonly Item[],
  side: 'from' | 'to',
  context: {
    x: number;
    y: (value: number) => number;
    plot: { y: number; height: number };
    theme: ChartTheme;
    measure: Measure;
    write: (value: number) => string;
    highlight: ResolvedHighlight;
  },
): { items: SceneItem[]; boxes: Box[] } {
  const { y, plot, theme, measure, write, highlight } = context;
  const valueStyle = theme.text.value;
  const nameStyle = theme.text.legend;
  const height = lineHeight(valueStyle);
  const centres = dodge(
    items.map((item) => ({ target: y(item[side]), size: height })),
    plot.y - height / 2,
    plot.y + plot.height + height / 2,
  );
  const moved = items.map(
    (item, index) =>
      Math.abs((centres[index] ?? y(item[side])) - y(item[side])) > height * LEADER_AFTER,
  );
  // When any label had to move, the column steps out to leave room for leaders.
  const offset = moved.some(Boolean) ? theme.space.md * 2 : theme.space.md;
  const x = side === 'from' ? context.x - offset : context.x + offset;
  const boxes: Box[] = [];
  const drawn = items.flatMap((item, index): SceneItem[] => {
    const centre = centres[index] ?? y(item[side]);
    const text = write(item[side]);
    const strong = !highlight.active || item.strong;
    const valueColor = strong ? theme.colors.heading : theme.colors.label;
    const nameColor = strong ? theme.colors.value : theme.colors.label;
    const valueWidth = measure(text, { ...valueStyle, weight: EMPHASIS_WEIGHT });
    const width = valueWidth + theme.space.sm + measure(item.name, nameStyle);
    boxes.push({
      x: side === 'from' ? x - width : x,
      y: centre - height / 2,
      width,
      height,
    });
    const leader: SceneItem[] =
      moved[index] === true
        ? [leaderLine(side, { x: context.x, y: y(item[side]) }, { x, y: centre }, theme)]
        : [];
    if (side === 'from') {
      return [
        ...leader,
        {
          kind: 'text',
          x,
          y: centre,
          lines: [text],
          style: valueStyle,
          weight: EMPHASIS_WEIGHT,
          color: valueColor,
          colorBefore: theme.colors.heading,
          anchor: 'end',
          anim: 'fade',
          lag: true,
        },
        {
          kind: 'text',
          x: x - valueWidth - theme.space.sm,
          y: centre,
          lines: [item.name],
          style: nameStyle,
          color: nameColor,
          colorBefore: theme.colors.value,
          anchor: 'end',
          anim: 'fade',
          lag: true,
        },
      ];
    }

    return [
      ...leader,
      {
        kind: 'text',
        x,
        y: centre,
        lines: [text],
        style: valueStyle,
        weight: EMPHASIS_WEIGHT,
        color: valueColor,
        colorBefore: theme.colors.heading,
        anchor: 'start',
        anim: 'fade',
        lag: true,
      },
      {
        kind: 'text',
        x: x + valueWidth + theme.space.sm,
        y: centre,
        lines: [item.name],
        style: nameStyle,
        color: nameColor,
        colorBefore: theme.colors.value,
        anchor: 'start',
        anim: 'fade',
        lag: true,
      },
    ];
  });
  return { items: drawn, boxes };
}
