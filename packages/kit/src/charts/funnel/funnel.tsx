import type { ReactNode } from 'react';

import type { ChartSpec } from '#charts/chart-spec.ts';
import type { CategoricalData } from '#charts/data/rows.ts';
import type { ResolvedFormat } from '#charts/format/number-format.ts';
import type { ChartDrawing, ChartFacts, DrawInput } from '#charts/frame/chart-frame.tsx';
import type { ChartProps } from '#charts/frame/chart-props.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { SceneItem } from '#charts/frame/scene.ts';
import type { Box } from '#charts/layout/label-placement.ts';
import type { Measure, TextStyle } from '#charts/layout/text-measure.ts';

import { formatValue, runFormatter } from '#charts/format/number-format.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { readCategorical } from '#charts/frame/chart-input.ts';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { textOn } from '#charts/frame/plot-parts.ts';
import { drawScene } from '#charts/frame/scene-svg.tsx';
import { barPath } from '#charts/frame/scene.ts';
import { buildSpec } from '#charts/frame/spec-builder.ts';
import { resolveHighlight } from '#charts/insight/highlight.ts';
import { EMPHASIS_WEIGHT, lineHeight, wrapLines } from '#charts/layout/text-measure.ts';
import { bandScale } from '#charts/scale/band-scale.ts';
import { maxOf, pushAll } from '#foundation/lists.ts';

/**
 * The share of each row left empty between stages.
 */
const ROW_PADDING = 0.3;

/**
 * The tallest a stage's bar is drawn.
 */
const MAX_ROW = 110;

/**
 * The widest the stage name column may be, as a share of the chart's width.
 */
const MAX_NAMES = 0.28;

/**
 * The text a stage's conversion and the gap under it carry, after the share.
 */
const CARRY_ON = 'carry on';

/**
 * The text a stage with no count is labelled with.
 */
const NO_DATA = 'no data';

/**
 * The widest conversion text, measured to size the column the conversions sit in.
 */
const WIDEST_CONVERSION = '100%';

/**
 * The dash of the outline a stage with no count is drawn with, in canvas pixels.
 */
const MISSING_DASH = '6 6';

/**
 * A share times this is a percentage: 0.34 is 34%.
 */
const PERCENT_SCALE = 100;

/**
 * A conversion under a tenth (under 10%) is written with one decimal place, larger ones whole.
 */
const ONE_DECIMAL_SHARE = 0.1;

/**
 * Props of {@link Funnel}.
 */
export type FunnelProps = Omit<ChartProps, 'annotations' | 'labels' | 'legend'> & {
  /**
   * The field naming each stage; the first text field when left out.
   */
  x?: string;

  /**
   * The field with each stage's count; the first number field when left out.
   */
  y?: string;
};

/**
 * Every prop {@link Funnel} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const FUNNEL_PROPS = propNames<FunnelProps>()([
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
]);

/**
 * A funnel for drop-off through stages: one centred bar per stage, as wide as its count, the stage
 * names beside it, and between stages the share that carried on, which is usually the point. The
 * step with the largest drop (or the one into the highlighted stage) is called out in the negative
 * color.
 *
 * ```mdx
 * <Funnel data={journey} x="stage" y="people" highlight="Read an article" />
 * ```
 */
export function Funnel(props: FunnelProps): ReactNode {
  checkProps('Funnel', props);
  return (
    <ChartFrame kind="funnel" {...frameProps(props)} draw={(input) => drawFunnel(props, input)} />
  );
}

/**
 * Everything a stage of a funnel is drawn with, worked out once for the whole chart.
 */
type FunnelLayout = {
  /**
   * The chart theme.
   */
  theme: ChartTheme;

  /**
   * Measures text.
   */
  measure: Measure;

  /**
   * The chart's data; its categories are the stages.
   */
  data: CategoricalData;

  /**
   * The chart's resolved number format.
   */
  format: ResolvedFormat;

  /**
   * Writes one count in the chart's format.
   */
  write: (value: number) => string;

  /**
   * Each stage's count, zero where it has none.
   */
  values: readonly number[];

  /**
   * Whether each stage has no count.
   */
  missing: readonly boolean[];

  /**
   * The text of the share that carried on into each stage.
   */
  conversions: readonly string[];

  /**
   * The highlight, resolved against the data.
   */
  highlight: ReturnType<typeof resolveHighlight>;

  /**
   * The plot area the bars sit in.
   */
  plot: Box;

  /**
   * Where each stage's band sits along the plot.
   */
  bands: ReturnType<typeof bandScale>;

  /**
   * The width of the stage name column.
   */
  nameWidth: number;

  /**
   * The x the bars are centred on.
   */
  centre: number;

  /**
   * The largest count, which the widest bar stands for.
   */
  largest: number;

  /**
   * Whether every count sits inside its bar; otherwise every count sits beside it.
   */
  inside: boolean;

  /**
   * The stage whose step loses the most.
   */
  worst: number;

  /**
   * The color of the lead data series.
   */
  lead: string;

  /**
   * The style of the stage names.
   */
  nameStyle: TextStyle;

  /**
   * The style of the counts, emphasized.
   */
  valueStyle: TextStyle;

  /**
   * The style of the axis text, which the carry-on label uses.
   */
  axisStyle: TextStyle;
};

/**
 * Lays out and draws the funnel for the measured plot.
 *
 * @param props - The chart's props.
 * @param input - The plot size, theme and measurer.
 */
export function drawFunnel(props: FunnelProps, input: DrawInput): ChartDrawing {
  const { theme, measure, size } = input;
  const { data, format } = readCategorical(
    { ...props, ...(props.y === undefined ? {} : { y: props.y }) },
    input,
  );
  const raw = data.series[0]?.values ?? [];
  const values = raw.map((value) => Math.max(0, value ?? 0));
  const missing = raw.map((value) => value === null);
  const highlight = resolveHighlight(props.highlight, data);
  const write = runFormatter(values, format);
  const nameStyle = theme.text.legend;
  const valueStyle = { ...theme.text.value, weight: EMPHASIS_WEIGHT };
  const axisStyle = theme.text.axis;
  const nameWidth = Math.min(
    size.width * MAX_NAMES,
    maxOf(
      data.categories.map((name) => measure(name, nameStyle)),
      0,
    ),
  );
  const keep = carryShares(raw);
  const conversions = keep.map((share) => conversionText(share, format));
  const conversionWidth = Math.max(
    measure(WIDEST_CONVERSION, valueStyle),
    measure(CARRY_ON, axisStyle),
  );
  const right = conversionWidth + theme.space.lg;
  const plot = {
    x: nameWidth + theme.space.lg,
    y: 0,
    width: Math.max(0, size.width - nameWidth - theme.space.lg - right - theme.space.md),
    height: size.height,
  };
  const bands = bandScale(data.categories, [plot.y, plot.y + plot.height], {
    padding: ROW_PADDING,
    maxBandwidth: MAX_ROW,
  });
  const largest = maxOf(values, 1);
  // Every count sits inside its bar, or every count beside it: never some of each.
  const inside = data.categories.every((_, index) => {
    const width = ((values[index] ?? 0) / largest) * plot.width;
    return (
      missing[index] === true ||
      measure(write(values[index] ?? 0), valueStyle) + theme.space.md * 2 <= width
    );
  });
  const layout: FunnelLayout = {
    theme,
    measure,
    data,
    format,
    write,
    values,
    missing,
    conversions,
    highlight,
    plot,
    bands,
    nameWidth,
    centre: plot.x + plot.width / 2,
    largest,
    inside,
    worst: worstStep(keep, highlight.active ? [...highlight.categories][0] : undefined),
    lead: theme.categorical[0] ?? theme.colors.accent,
    nameStyle,
    valueStyle,
    axisStyle,
  };
  const items: SceneItem[] = [];
  for (const [index, stage] of data.categories.entries()) {
    pushAll(items, stageItems(stage, index, layout));
    pushAll(items, conversionItems(index, layout));
  }

  return drawScene(
    {
      scene: {
        width: size.width,
        height: size.height,
        layers: [{ at: undefined, items }],
        highlightAt: highlight.at,
      },
      spec: funnelSpec(props, layout),
      facts: funnelFacts(layout, keep),
    },
    input,
  );
}

/**
 * What the funnel tells `deck lint` about itself.
 *
 * @param layout - The funnel's layout.
 * @param keep - The share each stage carried on from the one before.
 */
function funnelFacts(layout: FunnelLayout, keep: readonly (number | null)[]): ChartFacts {
  return {
    series: 1,
    categories: layout.data.categories.length,
    highlighted: true,
    axis: 'zero',
    unit: true,
    legend: false,
    legendAvoidable: false,
    marks: layout.missing.filter((gap) => !gap).length,
    colored: 1,
    growth: layout.data.categories.filter((_, index) => (keep[index] ?? 0) > 1 && index > 0),
  };
}

/**
 * The funnel's chart spec: its stages, its one series with each stage's count, and its highlight.
 *
 * @param props - The chart's props.
 * @param layout - The funnel's layout.
 */
function funnelSpec(props: FunnelProps, layout: FunnelLayout): ChartSpec {
  const { theme, data, values, missing, conversions, write, highlight, lead } = layout;
  const seriesName = data.series[0]?.label ?? 'values';
  const stages = data.categories.length;
  return buildSpec(
    {
      kind: 'funnel',
      orientation: 'horizontal',
      name: `Funnel of ${seriesName} through ${stages} stages`,
      summary: funnelSummary(data.categories, values, missing, conversions, write),
      categories: data.categories,
      series: [
        {
          name: data.series[0]?.label ?? '',
          values,
          x: null,
          color: lead,
          pointColors: data.categories.map((_, index) =>
            !highlight.active || highlight.categories.has(index) ? lead : theme.context,
          ),
          highlighted: highlight.active,
          labels: values.map((value) => write(value)),
        },
      ],
      highlight: highlight.spec,
    },
    {
      theme,
      format: layout.format,
      largest: layout.largest,
      caption: props.caption,
      source: props.source,
    },
  );
}

/**
 * The marks, count and name of one stage: a bar as wide as its count (or an outlined slot with "no
 * data" when it has none), the count beside or inside it, and the stage's name.
 *
 * @param stage - The stage's name.
 * @param index - The stage's position.
 * @param layout - The funnel's layout.
 */
function stageItems(stage: string, index: number, layout: FunnelLayout): SceneItem[] {
  const { theme, measure, bands, highlight, lead } = layout;
  const top = bands.at(stage);
  const strong = !highlight.active || highlight.categories.has(index);
  const fill = strong ? lead : theme.context;
  const { lines, cut } = wrapLines(stage, layout.nameWidth, {
    measure,
    style: layout.nameStyle,
    maxLines: 2,
  });
  const nameY = top + bands.bandwidth / 2 - ((lines.length - 1) * lineHeight(layout.nameStyle)) / 2;
  const name: SceneItem = {
    kind: 'text',
    x: layout.nameWidth,
    y: nameY,
    lines,
    ...(cut ? { cut: stage } : {}),
    style: layout.nameStyle,
    color: strong ? theme.colors.value : theme.colors.label,
    colorBefore: theme.colors.value,
    anchor: 'end',
    ...(highlight.active && strong ? { weight: EMPHASIS_WEIGHT } : {}),
  };
  if (layout.missing[index] === true) {
    return missingStageItems(index, top, name, layout);
  }

  return countedStageItems(index, top, fill, name, layout);
}

/**
 * A stage with no count: an outlined slot across the plot labelled "no data". It is never drawn as
 * a bar of zero.
 *
 * @param index - The stage's position.
 * @param top - The top of the stage's band.
 * @param name - The stage's name item.
 * @param layout - The funnel's layout.
 */
function missingStageItems(
  index: number,
  top: number,
  name: SceneItem,
  layout: FunnelLayout,
): SceneItem[] {
  const { theme, plot, bands, centre } = layout;
  return [
    {
      kind: 'path',
      d: barPath({ x: plot.x, y: top, width: plot.width, height: bands.bandwidth }, 'right', 0),
      fill: 'none',
      stroke: theme.colors.grid,
      strokeWidth: theme.axis.width,
      dash: MISSING_DASH,
      anim: 'fade',
      order: index,
    },
    {
      kind: 'text',
      x: centre,
      y: top + bands.bandwidth / 2,
      lines: [NO_DATA],
      style: theme.text.axis,
      color: theme.colors.label,
      anchor: 'middle',
      anim: 'fade',
      lag: true,
      order: index,
    },
    name,
  ];
}

/**
 * A stage with a count: its bar, as wide as the count, and the count beside the bar or inside it.
 *
 * @param index - The stage's position.
 * @param top - The top of the stage's band.
 * @param fill - The bar's fill once the highlight is on.
 * @param name - The stage's name item.
 * @param layout - The funnel's layout.
 */
function countedStageItems(
  index: number,
  top: number,
  fill: string,
  name: SceneItem,
  layout: FunnelLayout,
): SceneItem[] {
  const { theme, plot, bands, centre, lead, write } = layout;
  const value = layout.values[index] ?? 0;
  const width = (value / layout.largest) * plot.width;
  const box = {
    x: centre - width / 2,
    y: top,
    width: Math.max(1, width),
    height: bands.bandwidth,
  };
  const text = write(value);
  const valueX = layout.inside ? centre : centre + width / 2 + theme.space.sm;
  return [
    {
      kind: 'path',
      d: barPath(box, 'right', 0),
      fill,
      fillBefore: lead,
      anim: 'fade',
      order: index,
      mark: true,
    },
    {
      kind: 'text',
      x: valueX,
      y: top + bands.bandwidth / 2,
      lines: [text],
      style: theme.text.value,
      weight: EMPHASIS_WEIGHT,
      color: layout.inside ? textOn(fill, theme) : theme.colors.heading,
      colorBefore: layout.inside ? textOn(lead, theme) : theme.colors.heading,
      anchor: layout.inside ? 'middle' : 'start',
      ...(layout.inside ? { background: fill } : {}),
      anim: 'fade',
      lag: true,
      order: index,
    },
    name,
  ];
}

/**
 * The share that carried on into a stage, between it and the stage before, and the words under it.
 * The first stage has none.
 *
 * @param index - The stage's position.
 * @param layout - The funnel's layout.
 */
function conversionItems(index: number, layout: FunnelLayout): SceneItem[] {
  if (index === 0) {
    return [];
  }

  const { theme, bands, plot, axisStyle } = layout;
  const previous = layout.data.categories[index - 1] ?? '';
  const top = bands.at(layout.data.categories[index] ?? '');
  const gapY = (bands.at(previous) + bands.bandwidth + top) / 2;
  const x = plot.x + plot.width + theme.space.lg;
  const isWorst = index === layout.worst;
  return [
    {
      kind: 'text',
      x,
      y: gapY - lineHeight(axisStyle) / 2 + theme.space.xs,
      lines: [layout.conversions[index] ?? ''],
      style: theme.text.value,
      weight: EMPHASIS_WEIGHT,
      color: isWorst ? theme.colors.negativeText : theme.colors.value,
      anchor: 'start',
      anim: 'fade',
      lag: true,
      order: index,
    },
    {
      kind: 'text',
      x,
      y: gapY + lineHeight(axisStyle) / 2 + theme.space.xs,
      lines: [CARRY_ON],
      style: axisStyle,
      color: theme.colors.label,
      anchor: 'start',
      anim: 'fade',
      lag: true,
      order: index,
    },
  ];
}

/**
 * The text of the share that carried on into a stage, as a percentage: one decimal under a tenth,
 * whole above it. A missing share reads as a dash.
 *
 * @param share - The share, from {@link carryShares}, or `null`.
 * @param format - The chart's resolved format.
 */
function conversionText(share: number | null, format: ResolvedFormat): string {
  if (share === null) {
    return '—';
  }

  return formatValue(
    share * PERCENT_SCALE,
    { ...format, style: 'percent', suffix: '%', signed: false, notation: 'standard' },
    share < ONE_DECIMAL_SHARE ? 1 : 0,
  );
}

/**
 * The text summary of a funnel for screen readers: each stage with its count, and the share that
 * carried on into every stage after the first.
 *
 * @param stages - The stage names.
 * @param values - Each stage's count.
 * @param missing - Whether each stage has no count.
 * @param conversions - The text of each stage's conversion.
 * @param write - Writes one count in the chart's format.
 */
function funnelSummary(
  stages: readonly string[],
  values: readonly number[],
  missing: readonly boolean[],
  conversions: readonly string[],
  write: (value: number) => string,
): string {
  const parts = stages.map((stage, index) => {
    const count = missing[index] === true ? NO_DATA : write(values[index] ?? 0);
    const carried = index > 0 ? ` (${conversions[index] ?? ''} ${CARRY_ON})` : '';
    return `${stage} ${count}${carried}`;
  });
  return `${parts.join(', ')}.`;
}

/**
 * The share of each stage that carried on from the stage before: 1 for the first, `null` where
 * either count is missing (or the one before is zero).
 *
 * @param values - Each stage's count, `null` where it has none.
 * @returns One share per stage.
 */
export function carryShares(values: readonly (number | null)[]): (number | null)[] {
  return values.map((value, index) => {
    if (index === 0) {
      return 1;
    }

    const before = values[index - 1] ?? null;
    if (value === null || before === null || before <= 0) {
      return null;
    }

    return Math.max(0, value) / before;
  });
}

/**
 * The stage whose step loses the most: the one into the highlighted stage when there is one, else
 * the step with the lowest share carrying on.
 *
 * @param keep - The share of each stage that carried on from the one before (1 for the first).
 * @param highlighted - The highlighted stage's index, if any.
 * @returns The index of the stage the worst step leads into.
 */
export function worstStep(
  keep: readonly (number | null)[],
  highlighted: number | undefined,
): number {
  if (highlighted !== undefined && highlighted > 0) {
    return highlighted;
  }

  let worst = 1;
  for (let index = 1; index < keep.length; index += 1) {
    if ((keep[index] ?? 1) < (keep[worst] ?? 1)) {
      worst = index;
    }
  }

  return worst;
}
