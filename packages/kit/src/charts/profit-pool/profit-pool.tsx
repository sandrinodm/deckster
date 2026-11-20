import type { ReactNode } from 'react';

import type { ChartSpecSeries } from '#charts/chart-spec.ts';
import type { DataProp, Rows } from '#charts/data/rows.ts';
import type { FormatProp } from '#charts/format/number-format.ts';
import type { DrawInput, FrameProps } from '#charts/frame/chart-frame.tsx';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { SceneItem, SceneLayer } from '#charts/frame/scene.ts';
import type { Box } from '#charts/layout/label-placement.ts';

import { resolveRows, toLabel, toNumber } from '#charts/data/rows.ts';
import { resolveFormat, runFormatter } from '#charts/format/number-format.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { axisItems, textOn, tickLabelWidth } from '#charts/frame/plot-parts.ts';
import { drawScene } from '#charts/frame/scene-svg.tsx';
import { buildSpec } from '#charts/frame/spec-builder.ts';
import { EMPHASIS_WEIGHT, lineHeight, wrapLines } from '#charts/layout/text-measure.ts';
import {
  linearScale,
  tickCountFor,
  valueAxis,
  type LinearScale,
} from '#charts/scale/linear-scale.ts';

/**
 * The percentage point value of a margin equal to revenue.
 */
const FULL_MARGIN = 100;

/**
 * Minimum spacing between margin ticks in canvas pixels.
 */
const TICK_SPACING = 96;

/**
 * Props for a chart of each segment's revenue, margin and resulting profit.
 */
export type ProfitPoolProps = FrameProps & {
  /**
   * Rows with a unique segment, positive revenue and finite margin.
   */
  data: DataProp;

  /**
   * The segment name field, `segment` by default.
   */
  segment?: string;

  /**
   * The revenue field, `revenue` by default. All values must use the same currency and scale.
   */
  revenue?: string;

  /**
   * The margin field, `margin` by default. Pass `25` for 25% or `-5` for a 5% loss.
   */
  margin?: string;

  /**
   * The segment to emphasize. Defaults to the largest contributor to profit.
   */
  highlight?: string;

  /**
   * How revenue and profit are written. Defaults to the brand's currency format.
   */
  format?: FormatProp;

  /**
   * An optional unit after revenue and profit, such as `€M` when values are in millions.
   */
  unit?: string;

  /**
   * Show revenue before this step, margin at this step, and profit one step later.
   */
  buildFrom?: number;
};

/**
 * Props checked against the component and chart catalog.
 */
export const PROFIT_POOL_PROPS = propNames<ProfitPoolProps>()([
  'at',
  'caption',
  'source',
  'label',
  'data',
  'segment',
  'revenue',
  'margin',
  'highlight',
  'format',
  'unit',
  'buildFrom',
]);

/**
 * Draws revenue as width and margin as height, so each rectangle's signed area represents profit.
 */
export function ProfitPool(props: ProfitPoolProps): ReactNode {
  checkProps('ProfitPool', props);
  return (
    <ChartFrame
      kind="profit-pool"
      {...frameProps(props)}
      draw={(input) => drawScene(planProfitPool(props, input), input)}
    />
  );
}

/**
 * The dimensions and result for one labeled segment.
 */
type Segment = {
  /**
   * The segment label.
   */
  name: string;

  /**
   * Revenue in the currency and scale chosen for the chart.
   */
  revenue: number;

  /**
   * Contribution margin in percentage points.
   */
  margin: number;

  /**
   * Contribution profit, in the same units as revenue.
   */
  profit: number;
};

/**
 * A segment's horizontal position in canvas pixels, shared by all build stages.
 */
type SegmentBox = Segment & { left: number; width: number; selected: boolean };

/**
 * Plans the chart for a measured plot. Rejects incomplete or duplicate segments.
 */
export function planProfitPool(
  props: ProfitPoolProps,
  input: DrawInput,
): Parameters<typeof drawScene>[0] {
  const { size, theme, measure } = input;
  const segments = readSegments(resolveRows(props.data, input.datasets), props);
  const focus = selectedSegment(segments, props.highlight);
  const format = resolveFormat(props.format ?? 'currency', props.unit, theme.numbers);
  const marginFormat = resolveFormat('percent', undefined, theme.numbers);
  const money = runFormatter(
    segments.flatMap(({ revenue, profit }) => [revenue, profit]),
    format,
  );
  const percent = runFormatter(
    segments.map(({ margin }) => margin),
    marginFormat,
  );
  const style = theme.text.axis;
  const profitText = focus === undefined ? '' : `${focus.name} · ${money(focus.profit)} profit`;
  const splitHeading =
    measure('Contribution margin', style) + measure(profitText, style) + theme.space.lg >
    size.width;
  const top = lineHeight(style) * (splitHeading ? 2 : 1) + theme.space.md;
  const bottom = lineHeight(style) * 4 + theme.space.md;
  const height = Math.max(0, size.height - top - bottom);
  const axis = valueAxis(
    segments.map(({ margin }) => margin),
    {
      zero: true,
      count: tickCountFor(height, TICK_SPACING),
    },
  );
  const gutter = tickLabelWidth(axis, marginFormat, theme, measure) + theme.space.sm;
  const plot: Box = { x: gutter, y: top, width: Math.max(0, size.width - gutter), height };
  const marginScale = linearScale([axis.min, axis.max], [top + height, top]);
  const boxes = layOutSegments(segments, focus, plot);
  const axes = axisItems({
    axis,
    at: marginScale.at,
    direction: 'y',
    plot,
    theme,
    format: marginFormat,
    ticks: true,
    baseline: 0,
  });
  const amounts = boxes.flatMap((box) => segmentLabel(box, plot, money(box.revenue), input));
  const profits = boxes.flatMap((box) => profitLabel(box, plot, money(box.profit), input));
  const widths = boxes.flatMap((box) => revenueMark(box, plot, theme));
  const margins = boxes.flatMap((box) => marginMarks(box, marginScale, percent(box.margin), input));
  const marginHeading = heading('Contribution margin', theme);
  const profitHeading = heading(profitText, theme, {
    x: splitHeading ? 0 : size.width,
    y: lineHeight(style) * (splitHeading ? 1.5 : 0.5),
    align: splitHeading ? 'start' : 'end',
  });
  const layers = profitLayers({
    amounts,
    profits,
    widths,
    margins,
    axes,
    marginHeading,
    profitHeading,
    theme,
    first: props.buildFrom,
  });
  const categories = segments.map(({ name }) => name);
  const spec = buildSpec(
    {
      kind: 'profit-pool',
      name: 'Revenue, contribution margin and profit by segment',
      summary: segments
        .map(
          ({ name, revenue, margin, profit }) =>
            `${name}: ${money(revenue)} revenue, ${percent(margin)} margin, ${money(profit)} profit.`,
        )
        .join(' '),
      categories,
      series: [
        specSeries(
          'Revenue',
          segments.map(({ revenue }) => revenue),
          theme.context,
        ),
        specSeries(
          'Margin',
          segments.map(({ margin }) => margin),
          theme.context,
        ),
        specSeries(
          'Profit',
          segments.map(({ profit }) => profit),
          theme.colors.accent,
        ),
      ],
      axis: {
        min: axis.min,
        max: axis.max,
        ticks: axis.ticks,
        zeroBased: axis.min === 0,
        truncated: false,
      },
      highlight: {
        series: [],
        categories: focus === undefined ? [] : [focus.name],
        points: [],
        range: null,
      },
    },
    {
      theme,
      format,
      largest: Math.max(0, ...segments.map(({ revenue }) => revenue)),
      caption: props.caption,
      source: props.source,
    },
  );
  return {
    scene: {
      width: size.width,
      height: size.height,
      layers,
      highlightAt: props.buildFrom === undefined ? undefined : props.buildFrom + 1,
    },
    spec,
    facts: {
      series: 1,
      categories: segments.length,
      marks: segments.length,
      highlighted: focus !== undefined,
      axis: 'zero',
      unit: true,
      legend: false,
      legendAvoidable: false,
    },
  };
}

/**
 * Reads finite revenue and margin values. Unknown amounts cannot determine an area.
 */
function readSegments(rows: Rows, props: ProfitPoolProps): Segment[] {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const name = toLabel(row[props.segment ?? 'segment']).trim();
    const revenue = toNumber(row[props.revenue ?? 'revenue']);
    const margin = toNumber(row[props.margin ?? 'margin']);
    if (name === '' || revenue === null || revenue <= 0 || margin === null) {
      throw new Error(
        `ProfitPool row ${index + 1} needs a segment name, positive revenue and a finite margin.`,
      );
    }

    if (seen.has(name)) {
      throw new Error(
        `ProfitPool has two rows for ${name}. Combine them into one revenue and margin.`,
      );
    }

    seen.add(name);
    return { name, revenue, margin, profit: revenue * (margin / FULL_MARGIN) };
  });
}

/**
 * Chooses the explicitly named segment, or the one with the largest signed profit.
 */
function selectedSegment(segments: Segment[], name: string | undefined): Segment | undefined {
  if (name === undefined) {
    return segments.reduce<Segment | undefined>(
      (best, segment) => (best === undefined || segment.profit > best.profit ? segment : best),
      undefined,
    );
  }

  const found = segments.find((segment) => segment.name === name);
  if (found === undefined) {
    throw new Error(`ProfitPool has no segment named ${name}.`);
  }

  return found;
}

/**
 * Maps cumulative revenue to x. Segment widths share one scale and have no inter-bar gaps.
 */
function layOutSegments(segments: Segment[], focus: Segment | undefined, plot: Box): SegmentBox[] {
  const total = segments.reduce((sum, segment) => sum + segment.revenue, 0);
  let left = plot.x;
  return segments.map((segment) => {
    const width = plot.width * (segment.revenue / total);
    const box = { ...segment, left, width, selected: segment === focus };
    left += width;
    return box;
  });
}

/**
 * Draws the revenue band at the bottom edge of the plotting region.
 */
function revenueMark(box: SegmentBox, plot: Box, theme: ChartTheme): SceneItem[] {
  const height = Math.min(theme.space.lg, plot.height);
  return rectangle(box, plot.y + plot.height - height, height, theme, 'grow-right', false);
}

/**
 * Draws a margin rectangle and its rate if it fits inside the mark.
 */
function marginMarks(
  box: SegmentBox,
  scale: LinearScale,
  rate: string,
  input: DrawInput,
): SceneItem[] {
  const { theme, measure } = input;
  const baseline = scale.at(0);
  const edge = scale.at(box.margin);
  const height = Math.abs(edge - baseline);
  const top = Math.min(baseline, edge);
  const marks = rectangle(box, top, height, theme, box.margin < 0 ? 'drop' : 'rise', box.selected);
  const style = theme.text.value;
  if (box.width < measure(rate, style) + theme.space.sm || height < lineHeight(style)) {
    return marks;
  }

  const fill = box.selected ? theme.colors.accent : theme.context;
  marks.push({
    kind: 'text',
    x: box.left + box.width / 2,
    y: top + height / 2,
    lines: [rate],
    style,
    anchor: 'middle',
    color: textOn(fill, theme),
    colorBefore: textOn(theme.context, theme),
    background: fill,
    backgroundBefore: theme.context,
    anim: 'fade',
    lag: true,
  });
  return marks;
}

/**
 * Draws a rectangle with bounded geometry. An empty margin stays at the zero baseline.
 */
function rectangle(
  box: SegmentBox,
  y: number,
  height: number,
  theme: ChartTheme,
  anim: 'grow-right' | 'rise' | 'drop',
  selected: boolean,
): SceneItem[] {
  if (box.width <= 0 || height <= 0) {
    return [];
  }

  return [
    {
      kind: 'path',
      d: `M${box.left},${y}h${box.width}v${height}h${-box.width}Z`,
      fill: selected ? theme.colors.accent : theme.context,
      fillBefore: theme.context,
      stroke: theme.plate,
      strokeWidth: theme.axis.width,
      anim,
      mark: true,
    },
  ];
}

/**
 * Fits each data label within its own segment's width, without colliding with a neighbour.
 */
function segmentLabel(box: SegmentBox, plot: Box, revenue: string, input: DrawInput): SceneItem[] {
  const { theme, measure } = input;
  const style = theme.text.axis;
  const width = box.width - theme.space.sm;
  const label = wrapLines(box.name, width, { style, measure, maxLines: 2 });
  if (label.lines.some((line) => measure(line, style) > width) || measure(revenue, style) > width) {
    return [];
  }

  return [
    {
      kind: 'text',
      x: box.left + box.width / 2,
      y: plot.y + plot.height + theme.space.sm + lineHeight(style) / 2,
      lines: [...label.lines, revenue],
      style,
      anchor: 'middle',
      color: theme.colors.label,
      ...(label.cut ? { cut: box.name } : {}),
    },
  ];
}

/**
 * Labels the profit amounts on one shared line when there is enough room under each segment.
 */
function profitLabel(box: SegmentBox, plot: Box, profit: string, input: DrawInput): SceneItem[] {
  const { theme, measure } = input;
  const style = theme.text.axis;
  const text = `${profit} profit`;
  const weight = box.selected ? EMPHASIS_WEIGHT : style.weight;
  if (measure(text, { ...style, weight }) > box.width - theme.space.sm) {
    return [];
  }

  return [
    {
      kind: 'text',
      x: box.left + box.width / 2,
      y: plot.y + plot.height + theme.space.sm + lineHeight(style) * 3.5,
      lines: [text],
      style,
      weight,
      anchor: 'middle',
      color: box.selected ? theme.colors.accentText : theme.colors.label,
      anim: 'fade',
    },
  ];
}

/**
 * Creates a heading in the axis style. The right-aligned profit readout uses the emphasis color.
 */
function heading(
  text: string,
  theme: ChartTheme,
  profit?: { x: number; y: number; align: 'end' | 'start' },
): SceneItem {
  return {
    kind: 'text',
    x: profit?.x ?? 0,
    y: profit?.y ?? lineHeight(theme.text.axis) / 2,
    lines: [text],
    style: theme.text.axis,
    anchor: profit?.align ?? 'start',
    color: profit === undefined ? theme.colors.label : theme.colors.accentText,
    ...(profit === undefined ? {} : { weight: EMPHASIS_WEIGHT }),
  };
}

/**
 * Keeps the segment widths fixed while adding the margin rectangles and the profit reading.
 */
function profitLayers(input: {
  first: number | undefined;
  amounts: SceneItem[];
  profits: SceneItem[];
  widths: SceneItem[];
  margins: SceneItem[];
  axes: SceneItem[];
  marginHeading: SceneItem;
  profitHeading: SceneItem;
  theme: ChartTheme;
}): SceneLayer[] {
  const { first, amounts, profits, widths, margins, axes, marginHeading, profitHeading, theme } =
    input;
  if (first === undefined) {
    return [
      {
        at: undefined,
        items: [...axes, ...margins, ...amounts, marginHeading, profitHeading, ...profits],
      },
    ];
  }

  return [
    { at: undefined, items: amounts },
    { at: undefined, until: first, items: [heading('Revenue by segment', theme), ...widths] },
    { at: first, items: [marginHeading, ...axes, ...margins] },
    { at: first + 1, items: [profitHeading, ...profits] },
  ];
}

/**
 * Keeps each quantitative dimension in category order for chart consumers.
 */
function specSeries(name: string, values: number[], color: string): ChartSpecSeries {
  return {
    name,
    values,
    x: null,
    color,
    pointColors: null,
    highlighted: false,
    labels: values.map(() => null),
  };
}
