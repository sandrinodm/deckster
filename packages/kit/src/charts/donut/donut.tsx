import type { ReactNode } from 'react';

import type { CategoricalData } from '#charts/data/rows.ts';
import type { ChartDrawing, ChartFacts, DrawInput } from '#charts/frame/chart-frame.tsx';
import type { ChartProps } from '#charts/frame/chart-props.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { Scene, SceneItem } from '#charts/frame/scene.ts';
import type { ResolvedHighlight } from '#charts/insight/highlight.ts';
import type { Measure, TextStyle } from '#charts/layout/text-measure.ts';

import { formatValue, runFormatter, type ResolvedFormat } from '#charts/format/number-format.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { readCategorical } from '#charts/frame/chart-input.ts';
import { seriesColor } from '#charts/frame/chart-theme.ts';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { drawScene } from '#charts/frame/scene-svg.tsx';
import { buildSpec, listNames } from '#charts/frame/spec-builder.ts';
import { isHighlighted, resolveHighlight } from '#charts/insight/highlight.ts';
import { dodge } from '#charts/layout/label-placement.ts';
import { EMPHASIS_WEIGHT, lineHeight, widestLine, wrapLines } from '#charts/layout/text-measure.ts';
import { maxOf } from '#foundation/lists.ts';

/**
 * The ring's thickness as a share of its outer radius.
 */
const RING = 0.3;

/**
 * The gap between slices, in pixels along the ring's middle.
 */
const SLICE_GAP = 3;

/**
 * Where the first slice starts: the top of the ring.
 */
const START_ANGLE = -Math.PI / 2;

/**
 * The tallest the centre figure's type may be, as a share of the hole's diameter.
 */
const CENTRE_SCALE = 0.5;

/**
 * The share of the hole's diameter the centre value and its label may span.
 */
const CENTRE_WIDTH = 0.52;

/**
 * The share of the hole's diameter the centre's figure and caption may take down.
 */
const CENTRE_HEIGHT = 0.8;

/**
 * How much larger the ring must get for its labels to move from beside it to a column under it.
 */
const BELOW_GAIN = 1.3;

/**
 * The gap between the centre figure and its caption, as a share of the figure's type size.
 */
const CENTRE_GAP_SHARE = 0.22;

/**
 * The radius of a list's dot, as a share of the value type size.
 */
const LIST_DOT_SHARE = 0.3;

/**
 * How far a full circle's arc stops short of its start, in pixels, so the arc still draws.
 */
const FULL_ARC_GAP = 0.01;

/**
 * The angle, in radians, under which an arc counts as a full circle.
 */
const ARC_EPSILON = 1e-6;

/**
 * A share below this percentage, when above zero, is written with one decimal place.
 */
const DECIMAL_SHARE_LIMIT = 10;

/**
 * The most lines the centre caption may take, tried in order after the statistic label step.
 */
const CENTRE_CAPTION_LINES = [2, 3] as const;

/**
 * The whole of a percentage, for writing shares.
 */
const PERCENT_WHOLE = 100;

/**
 * How shares are written: whole percentages in the brand's locale is set per chart, so this is only
 * the shape; `percent` keeps the locale of the chart's format.
 */
const PERCENT: ResolvedFormat = {
  /**
   * The locale shares are written in.
   */
  locale: 'en-US',

  /**
   * Values already in percent.
   */
  style: 'percent',

  /**
   * Every digit.
   */
  notation: 'standard',

  /**
   * Unused for percentages.
   */
  currency: 'USD',

  /**
   * Whole percentages; small shares get one decimal where written.
   */
  digits: 0,

  /**
   * As many digits as `digits`.
   */
  minDigits: 0,

  /**
   * The digits are set per share.
   */
  fixed: true,

  /**
   * Shares carry no sign.
   */
  signed: false,

  /**
   * The percent sign.
   */
  suffix: '%',
};

/**
 * Props of {@link Donut}.
 */
export type DonutProps = Omit<ChartProps, 'annotations' | 'labels' | 'legend'> & {
  /**
   * The field naming each slice; the first text field when left out.
   */
  x?: string;

  /**
   * The field holding each slice's value; the first number field when left out.
   */
  y?: string;

  /**
   * The figure in the centre: `share` (the highlighted slices' share, the default with a
   * highlight), `total` (the default without one), `none`, or text of your own.
   */
  center?: 'share' | 'total' | 'none' | (string & {});

  /**
   * The line under the centre figure; the highlighted slices' names, or "total".
   */
  centerLabel?: string;
};

/**
 * Every prop {@link Donut} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const DONUT_PROPS = propNames<DonutProps>()([
  'at',
  'caption',
  'source',
  'label',
  'data',
  'highlight',
  'format',
  'unit',
  'x',
  'y',
  'center',
  'centerLabel',
]);

/**
 * A donut for part of a whole when one or two parts matter: five slices at most (lint warns past
 * that), each labeled directly beside the ring with its share, the highlighted slice in the brand's
 * lead data color and the rest in the context color, and the share or total in the centre.
 *
 * ```mdx
 * <Donut data={channels} x="channel" y="conversations" highlight="Chat" />
 * ```
 */
export function Donut(props: DonutProps): ReactNode {
  checkProps('Donut', props);
  return (
    <ChartFrame kind="donut" {...frameProps(props)} draw={(input) => drawDonut(props, input)} />
  );
}

/**
 * Lays out and draws the donut for the measured plot.
 *
 * @param props - The chart's props.
 * @param input - The plot size, theme and measurer.
 */
function drawDonut(props: DonutProps, input: DrawInput): ChartDrawing {
  const { data, format } = readCategorical(
    { ...props, ...(props.y === undefined ? {} : { y: props.y }) },
    input,
  );
  return drawScene(planDonut({ data, format, props, input }), input);
}

/**
 * One slice: its angles, value, share and colors.
 */
type Slice = {
  /**
   * The slice's name.
   */
  label: string;

  /**
   * Its value.
   */
  value: number;

  /**
   * Its share of the total, from 0 to 1.
   */
  share: number;

  /**
   * The angle it starts at, in radians.
   */
  start: number;

  /**
   * The angle it ends at.
   */
  end: number;

  /**
   * Its color with the highlight on.
   */
  fill: string;

  /**
   * Its color before a highlight that arrives at a step.
   */
  fillBefore: string;

  /**
   * Whether it is highlighted.
   */
  highlighted: boolean;
};

/**
 * Lays out a donut: the ring sized to leave room for labels on both sides, slices from the top
 * clockwise, labels beside the ring at each slice's height (dodged apart, with leaders), and the
 * centre figure. In a narrow room, where labels beside it would leave the ring small, the labels go
 * in a column under the ring instead.
 *
 * @param input - The data, format, props and the frame's input.
 * @returns The scene, spec and facts.
 */
export function planDonut(input: {
  data: CategoricalData;
  format: ResolvedFormat;
  props: DonutProps;
  input: Pick<DrawInput, 'size' | 'theme' | 'measure'>;
}): Omit<ChartDrawing, 'plot'> & { scene: Scene } {
  const { data, format, props } = input;
  const { size, theme, measure } = input.input;
  const highlight = resolveHighlight(props.highlight, data);
  const values = (data.series[0]?.values ?? []).map((value) => Math.max(0, value ?? 0));
  /**
   * A share written in the brand's locale.
   */
  const percent = (share: number): string => sharePercent(share, format.locale);
  const mode = props.center ?? (highlight.active ? 'share' : 'total');
  const total = values.reduce((sum, value) => sum + value, 0);
  const write = runFormatter(values, format);
  const slices = sliceAngles(data, values, total, highlight, theme);
  const labelSide = { percent, measure, theme };
  const left = sideWidth('left', slices, labelSide);
  const right = sideWidth('right', slices, labelSide);
  const geometry = ringLayout({ size, theme, slices, left, right });
  const { below, outer, inner, cx, cy } = geometry;
  const ring = {
    cx,
    cy,
    outer,
    height: size.height,
    theme,
    measure,
    highlight,
    percent,
    shareInCentre: mode === 'share',
  };
  const labels = below
    ? listedLabels(slices, {
        ...ring,
        top: cy + outer + theme.space.lg,
        rowHeight: geometry.rowHeight,
      })
    : sliceLabels(slices, ring);
  const items = ringItems(slices, { cx, cy, outer, inner });
  // The centre already states the highlighted share; its slice's label then names it only.
  const centre = centreItems({
    props,
    mode,
    highlight,
    slices,
    total,
    write,
    percent,
    theme,
    measure,
    cx,
    cy,
    inner,
  });
  const facts: ChartFacts = {
    series: 1,
    categories: slices.length,
    slices: slices.length,
    highlighted: highlight.active,
    axis: 'none',
    unit: true,
    legend: false,
    legendAvoidable: false,
    marks: slices.filter((slice) => slice.value > 0).length,
    colored: 1,
  };
  const spec = buildSpec(
    {
      kind: 'donut',
      name: `Donut of ${data.series[0]?.label ?? 'values'} by ${data.x}`,
      summary: donutSummary({ total, write, slices, percent, highlight }),
      categories: data.categories,
      series: [
        {
          name: data.series[0]?.label ?? '',
          values,
          x: null,
          color: slices[0]?.fill ?? theme.context,
          pointColors: slices.map((slice) => slice.fill),
          highlighted: highlight.active,
          labels: slices.map((slice) => percent(slice.share)),
        },
      ],
      highlight: highlight.spec,
    },
    { theme, format, largest: total, caption: props.caption, source: props.source },
  );
  return {
    scene: {
      width: size.width,
      height: size.height,
      layers: [{ at: undefined, items: [...items, ...labels, ...centre] }],
      highlightAt: highlight.at,
    },
    spec,
    facts,
  };
}

/**
 * The width the labels on one side of the ring take: the widest of a share, its gap and its name.
 * Each side keeps room for its own widest label, so a ring with short labels on one side (a narrow
 * column) grows and moves off centre instead of shrinking to leave room for both.
 *
 * @param side - The side of the ring.
 * @param slices - The slices.
 * @param input - The share writer, the measurer and the theme.
 */
function sideWidth(
  side: 'left' | 'right',
  slices: readonly Slice[],
  input: { percent: (share: number) => string; measure: Measure; theme: ChartTheme },
): number {
  const { percent, measure, theme } = input;
  const valueStyle = { ...theme.text.value, weight: EMPHASIS_WEIGHT };
  return maxOf(
    slices
      .filter((slice) => sideOf(slice) === side)
      .map(
        (slice) =>
          measure(percent(slice.share), valueStyle) +
          theme.space.sm +
          measure(slice.label, theme.text.legend),
      ),
    0,
  );
}

/**
 * Where the ring and its label column go: beside the labels in a wide room, or above a column of
 * labels in a narrow one, when that makes the ring clearly larger.
 */
type RingLayout = {
  /**
   * Whether the labels go in a column under the ring.
   */
  below: boolean;

  /**
   * The ring's outer radius.
   */
  outer: number;

  /**
   * The ring's inner radius, the hole's.
   */
  inner: number;

  /**
   * The ring's centre x.
   */
  cx: number;

  /**
   * The ring's centre y.
   */
  cy: number;

  /**
   * The height of one row of the label column.
   */
  rowHeight: number;
};

/**
 * Sizes and places the ring for the room, the labels beside it on each side, and the slices.
 *
 * @param input - The room, theme, slices and the width of the labels on each side.
 */
function ringLayout(input: {
  size: { width: number; height: number };
  theme: ChartTheme;
  slices: readonly Slice[];
  left: number;
  right: number;
}): RingLayout {
  const { size, theme, slices, left, right } = input;
  const room = theme.space.lg + theme.space.md;
  const besideOuter = Math.max(
    0,
    Math.min(size.height / 2 - theme.space.sm, (size.width - left - right - 2 * room) / 2),
  );
  // In a narrow room labels beside the ring leave it too small to read (or to hold its centre),
  // so they go in a column under it when that makes the ring clearly larger.
  const rowHeight = lineHeight(theme.text.value) + theme.space.xs;
  const listHeight = slices.length * rowHeight + theme.space.lg;
  const belowOuter = Math.max(
    0,
    Math.min(size.width / 2 - theme.space.sm, (size.height - listHeight) / 2 - theme.space.sm),
  );
  const below = belowOuter > besideOuter * BELOW_GAIN;
  const outer = below ? belowOuter : besideOuter;
  const block = left + right + 2 * room + 2 * outer;
  return {
    below,
    outer,
    inner: outer * (1 - RING),
    cx: below ? size.width / 2 : (size.width - block) / 2 + left + room + outer,
    cy: below ? (size.height - (2 * outer + listHeight)) / 2 + outer : size.height / 2,
    rowHeight,
  };
}

/**
 * The ring's slice paths: each an arc across the ring's middle, with a small gap between slices.
 *
 * @param slices - The slices.
 * @param ring - The ring's centre and radii.
 */
function ringItems(
  slices: readonly Slice[],
  ring: { cx: number; cy: number; outer: number; inner: number },
): SceneItem[] {
  const { cx, cy, outer, inner } = ring;
  const middle = (outer + inner) / 2;
  const gap = SLICE_GAP / Math.max(middle, 1);
  return slices.map((slice, index) => ({
    kind: 'path',
    d: arcPath(
      cx,
      cy,
      middle,
      slice.start + gap / 2,
      Math.max(slice.start + gap / 2, slice.end - gap / 2),
    ),
    fill: 'none',
    stroke: slice.fill,
    strokeBefore: slice.fillBefore,
    strokeWidth: outer - inner,
    cap: 'butt',
    drawable: true,
    anim: 'draw',
    order: index,
    mark: true,
  }));
}

/**
 * The spec's summary sentence: the total, each slice's share, and the highlighted names.
 *
 * @param input - The total, its writer, the slices, the share writer and the highlight.
 */
function donutSummary(input: {
  total: number;
  write: (value: number) => string;
  slices: readonly Slice[];
  percent: (share: number) => string;
  highlight: ResolvedHighlight;
}): string {
  const { total, write, slices, percent, highlight } = input;
  const shares = slices.map((slice) => `${slice.label} ${percent(slice.share)}`).join(', ');
  const highlighted = highlight.active
    ? ` Highlighted: ${listNames(highlight.spec.categories)}.`
    : '';
  return `Total ${write(total)}. ${shares}.${highlighted}`;
}

/**
 * The slices' angles and colors, clockwise from the top.
 *
 * @param data - The chart's data.
 * @param values - Each slice's value, negatives as zero.
 * @param total - The sum.
 * @param highlight - The highlight.
 * @param theme - The chart theme.
 */
function sliceAngles(
  data: CategoricalData,
  values: readonly number[],
  total: number,
  highlight: ResolvedHighlight,
  theme: ChartTheme,
): Slice[] {
  let angle = START_ANGLE;
  const key = data.series[0]?.key ?? '';
  return data.categories.map((label, index) => {
    const value = values[index] ?? 0;
    const share = total === 0 ? 0 : value / total;
    const start = angle;
    angle += share * Math.PI * 2;
    const highlighted = highlight.active && isHighlighted(highlight, key, index);
    const own = seriesColor(theme, index);
    const fill = sliceFill(highlight.active, highlighted, own, theme);
    return { label, value, share, start, end: angle, fill, fillBefore: own, highlighted };
  });
}

/**
 * A slice's color: its own without a highlight; the lead data color when highlighted; the context
 * color otherwise.
 *
 * @param active - Whether the chart highlights anything.
 * @param highlighted - Whether the slice is highlighted.
 * @param own - The slice's own categorical color.
 * @param theme - The chart theme.
 */
function sliceFill(active: boolean, highlighted: boolean, own: string, theme: ChartTheme): string {
  if (!active) {
    return own;
  }

  return highlighted ? (theme.categorical[0] ?? own) : theme.context;
}

/**
 * An arc along a circle from one angle to another, clockwise.
 *
 * @param cx - The centre's x.
 * @param cy - The centre's y.
 * @param r - The radius.
 * @param from - The start angle, in radians.
 * @param to - The end angle.
 */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const sweep = to - from;
  if (sweep >= Math.PI * 2 - ARC_EPSILON) {
    return `M${cx},${cy - r}A${r},${r} 0 1 1 ${cx - FULL_ARC_GAP},${cy - r}`;
  }

  const x1 = cx + r * Math.cos(from);
  const y1 = cy + r * Math.sin(from);
  const x2 = cx + r * Math.cos(to);
  const y2 = cy + r * Math.sin(to);
  const large = sweep > Math.PI ? 1 : 0;
  return `M${x1},${y1}A${r},${r} 0 ${large} 1 ${x2},${y2}`;
}

/**
 * The labels beside the ring: each slice's share (heavier) and name, on the side its middle faces,
 * at its height, dodged apart, with a leader from the ring's edge.
 *
 * @param slices - The slices.
 * @param ring - The ring's geometry, the theme, the measurer and the highlight.
 */
function sliceLabels(
  slices: readonly Slice[],
  ring: {
    cx: number;
    cy: number;
    outer: number;
    height: number;
    theme: ChartTheme;
    measure: Measure;
    highlight: ResolvedHighlight;
    percent: (share: number) => string;
    shareInCentre: boolean;
  },
): SceneItem[] {
  const { cx, cy, outer, theme, measure, highlight, percent } = ring;
  const valueStyle = theme.text.value;
  const height = lineHeight(valueStyle);
  const items: SceneItem[] = [];
  for (const side of ['right', 'left'] as const) {
    const onSide = slices.filter((slice) => sideOf(slice) === side);
    const anchors = onSide.map((slice) => {
      const mid = (slice.start + slice.end) / 2;
      return {
        slice,
        x: cx + (outer + theme.space.xs) * Math.cos(mid),
        y: cy + (outer + theme.space.xs) * Math.sin(mid),
      };
    });
    // Labels may stand a line above and below the ring, but never past the plot's edges.
    const centres = dodge(
      anchors.map((anchor) => ({ target: anchor.y, size: height + theme.space.xs })),
      Math.max(height / 2, cy - outer - height),
      Math.min(ring.height - height / 2, cy + outer + height),
    );
    for (const [index, anchor] of anchors.entries()) {
      const y = centres[index] ?? anchor.y;
      // Labels hug the ring at their height, so a slice near the top or bottom keeps a short
      // leader instead of one running out to a column beside the ring.
      const half = Math.abs(y - cy) < outer ? Math.sqrt(outer ** 2 - (y - cy) ** 2) : 0;
      const x = side === 'right' ? cx + half + theme.space.lg : cx - half - theme.space.lg;
      const strong = !highlight.active || anchor.slice.highlighted;
      const shareText =
        ring.shareInCentre && anchor.slice.highlighted ? '' : percent(anchor.slice.share);
      const shareWidth =
        shareText === ''
          ? -theme.space.sm
          : measure(shareText, { ...valueStyle, weight: EMPHASIS_WEIGHT });
      const elbow = side === 'right' ? x - theme.space.sm : x + theme.space.sm;
      const tail = side === 'right' ? x - theme.space.xs : x + theme.space.xs;
      items.push({
        kind: 'path',
        d: `M${anchor.x},${anchor.y}L${elbow},${y}L${tail},${y}`,
        fill: 'none',
        stroke: theme.colors.axis,
        strokeWidth: theme.axis.width,
        anim: 'fade',
        lag: true,
      });
      const first =
        side === 'right'
          ? x
          : x - measure(anchor.slice.label, theme.text.legend) - theme.space.sm - shareWidth;
      items.push(
        {
          kind: 'text',
          x: first,
          y,
          lines: shareText === '' ? [] : [shareText],
          style: valueStyle,
          weight: EMPHASIS_WEIGHT,
          color: strong ? theme.colors.heading : theme.colors.label,
          colorBefore: theme.colors.heading,
          anchor: 'start',
          anim: 'fade',
          lag: true,
        },
        {
          kind: 'text',
          x: first + shareWidth + theme.space.sm,
          y,
          lines: [anchor.slice.label],
          style: theme.text.legend,
          color: strong ? theme.colors.value : theme.colors.label,
          colorBefore: theme.colors.value,
          anchor: 'start',
          anim: 'fade',
          lag: true,
        },
      );
    }
  }

  return items;
}

/**
 * The figure in the ring's centre and the line under it.
 *
 * @param input - The props, highlight, slices, total, formatter, theme and ring geometry.
 */
function centreItems(input: {
  props: DonutProps;
  mode: string;
  highlight: ResolvedHighlight;
  slices: readonly Slice[];
  total: number;
  write: (value: number) => string;
  percent: (share: number) => string;
  theme: ChartTheme;
  measure: Measure;
  cx: number;
  cy: number;
  inner: number;
}): SceneItem[] {
  const { props, mode, slices, total, write, percent, theme, measure, cx, cy, inner } = input;
  if (mode === 'none') {
    return [];
  }

  const chosen = slices.filter((slice) => slice.highlighted);
  const share = chosen.reduce((sum, slice) => sum + slice.share, 0);
  const figure = centreFigure(mode, share, total, write, percent);
  const caption =
    props.centerLabel ??
    (mode === 'share' ? listNames(chosen.map((slice) => slice.label)) : 'total');
  // Text is drawn in its brand type step, so the figure takes the largest step that fits the hole
  // with room to spare, never a size of its own.
  const room = inner * 2 * CENTRE_WIDTH;
  const steps = [theme.text.stat, theme.text.heading, theme.text.value];
  const stat =
    steps.find(
      (style) => measure(figure, style) <= room && style.size <= inner * 2 * CENTRE_SCALE,
    ) ?? theme.text.value;
  const gap = stat.size * CENTRE_GAP_SHARE;
  const { label, lines, cut } = centreCaption(caption, {
    width: inner * 2 * CENTRE_WIDTH,
    height: inner * 2 * CENTRE_HEIGHT - stat.size - gap,
    theme,
    measure,
  });
  const block = stat.size + gap + lineHeight(label) * lines.length;
  const top = cy - block / 2;
  return [
    {
      kind: 'text',
      x: cx,
      y: top + stat.size / 2,
      lines: [figure],
      style: stat,
      color: theme.colors.stat,
      anchor: 'middle',
      anim: 'fade',
      lag: true,
    },
    {
      kind: 'text',
      x: cx,
      y: top + stat.size + gap + lineHeight(label) / 2,
      lines,
      style: label,
      color: theme.colors.label,
      anchor: 'middle',
      anim: 'fade',
      lag: true,
      ...(cut ? { cut: caption } : {}),
    },
  ];
}

/**
 * The slices' labels in a column under the ring, for a narrow room: each row a dot in the slice's
 * color, its share and its name, the column centred under the ring and the rows in slice order.
 *
 * @param slices - The slices.
 * @param ring - The ring's centre, the top of the column, the row height, the theme, measurer,
 *   highlight and share formatter.
 */
function listedLabels(
  slices: readonly Slice[],
  ring: {
    cx: number;
    top: number;
    rowHeight: number;
    theme: ChartTheme;
    measure: Measure;
    highlight: ResolvedHighlight;
    percent: (share: number) => string;
  },
): SceneItem[] {
  const { cx, top, rowHeight, theme, measure, highlight, percent } = ring;
  const valueStyle = theme.text.value;
  const strongStyle = { ...valueStyle, weight: EMPHASIS_WEIGHT };
  const dot = valueStyle.size * LIST_DOT_SHARE;
  // Every row states its share, the highlighted one too: a column with a gap reads as a missing
  // value.
  const rows = slices.map((slice) => {
    const share = percent(slice.share);
    const shareWidth = measure(share, strongStyle) + theme.space.sm;
    return {
      slice,
      share,
      shareWidth,
      width: shareWidth + measure(slice.label, theme.text.legend),
    };
  });
  const lead = dot * 2 + theme.space.sm;
  const shareColumn = maxOf(
    rows.map((row) => row.shareWidth),
    0,
  );
  const widest =
    maxOf(
      rows.map((row) => row.width - row.shareWidth),
      0,
    ) + shareColumn;
  const x = cx - (lead + widest) / 2;
  return rows.flatMap((row, index): SceneItem[] => {
    const y = top + rowHeight * index + rowHeight / 2;
    const strong = !highlight.active || row.slice.highlighted;
    return [
      {
        kind: 'circle',
        cx: x + dot,
        cy: y,
        r: dot,
        fill: row.slice.fill,
        fillBefore: row.slice.fillBefore,
        anim: 'pop',
        lag: true,
      },
      {
        kind: 'text',
        x: x + lead,
        y,
        lines: [row.share],
        style: valueStyle,
        weight: EMPHASIS_WEIGHT,
        color: strong ? theme.colors.heading : theme.colors.label,
        colorBefore: theme.colors.heading,
        anchor: 'start',
        anim: 'fade',
        lag: true,
      },
      {
        kind: 'text',
        x: x + lead + shareColumn,
        y,
        lines: [row.slice.label],
        style: theme.text.legend,
        color: strong ? theme.colors.value : theme.colors.label,
        colorBefore: theme.colors.value,
        anchor: 'start',
        anim: 'fade',
        lag: true,
      },
    ];
  });
}

/**
 * The centre's caption set to fit the hole: in the stat label step on two lines, then three, then
 * in the smaller axis step, so it is never cut while a smaller setting would hold it. A caption too
 * long for all of them is cut and marked, which `deckster lint` reports.
 *
 * @param caption - The caption.
 * @param room - The width and height the hole leaves it, the theme and the measurer.
 */
function centreCaption(
  caption: string,
  room: { width: number; height: number; theme: ChartTheme; measure: Measure },
): { label: TextStyle; lines: string[]; cut: boolean } {
  const { width, height, theme, measure } = room;
  const tries = [theme.text.statLabel, theme.text.axis].flatMap((label) =>
    CENTRE_CAPTION_LINES.map((maxLines) => ({ label, maxLines })),
  );
  let last = { label: theme.text.axis, lines: [caption], cut: true };
  for (const { label, maxLines } of tries) {
    const wrapped = wrapLines(caption, width, { measure, style: label, maxLines });
    last = { label, lines: wrapped.lines, cut: wrapped.cut };
    const fits = widestLine(wrapped.lines, measure, label) <= width + 1;
    if (!wrapped.cut && fits && wrapped.lines.length * lineHeight(label) <= height) {
      return last;
    }
  }

  return { ...last, cut: true };
}

/**
 * The side of the ring a slice's label goes on, from the angle of its middle.
 *
 * @param slice - The slice.
 */
function sideOf(slice: Slice): 'left' | 'right' {
  return Math.cos((slice.start + slice.end) / 2) >= 0 ? 'right' : 'left';
}

/**
 * The centre figure's text.
 *
 * @param mode - The `center` prop or its default.
 * @param share - The highlighted slices' share.
 * @param total - The total.
 * @param write - Writes a value.
 * @param percent - Writes a share.
 */
function centreFigure(
  mode: string,
  share: number,
  total: number,
  write: (value: number) => string,
  percent: (share: number) => string,
): string {
  switch (mode) {
    case 'share': {
      return percent(share);
    }

    case 'total': {
      return write(total);
    }

    default: {
      return mode;
    }
  }
}

/**
 * A share as a whole percentage, with a decimal under 10%, in a locale.
 *
 * @param share - The share, from 0 to 1.
 * @param locale - The BCP 47 locale, the brand's.
 */
export function sharePercent(share: number, locale: string): string {
  const value = share * PERCENT_WHOLE;
  const digits = value < DECIMAL_SHARE_LIMIT && value > 0 ? 1 : 0;
  return formatValue(value, { ...PERCENT, locale, digits });
}
