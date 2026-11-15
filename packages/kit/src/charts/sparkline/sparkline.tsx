import type { ReactNode } from 'react';

import type { Rows } from '#charts/data/rows.ts';
import type { FormatProp } from '#charts/format/number-format.ts';
import type {
  ChartDrawing,
  ChartFacts,
  DrawInput,
  FrameProps,
} from '#charts/frame/chart-frame.tsx';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { SceneItem } from '#charts/frame/scene.ts';

import { fieldKinds, resolveRows, toNumber } from '#charts/data/rows.ts';
import { resolveFormat, runFormatter } from '#charts/format/number-format.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { drawScene } from '#charts/frame/scene-svg.tsx';
import { linePath } from '#charts/frame/scene.ts';
import { buildSpec } from '#charts/frame/spec-builder.ts';
import { EMPHASIS_WEIGHT, lineHeight } from '#charts/layout/text-measure.ts';
import { maxOf, minOf } from '#foundation/lists.ts';

/**
 * A sparkline's height in canvas pixels when it stands alone.
 */
const DEFAULT_HEIGHT = 80;

/**
 * Props of {@link Sparkline}.
 */
export type SparklineProps = FrameProps & {
  /**
   * The values, oldest first.
   */
  values?: readonly number[];

  /**
   * Rows instead of values: inline, imported, or a dataset of the slide's `data:` frontmatter.
   */
  data?: Rows | string;

  /**
   * The field of the rows to draw; the first number field when left out.
   */
  y?: string;

  /**
   * The point to mark and label: the `last` (the default), the `max` or the `min`.
   */
  highlight?: 'last' | 'max' | 'min';

  /**
   * How the marked value is written.
   */
  format?: FormatProp;

  /**
   * The unit after the marked value.
   */
  unit?: string;

  /**
   * Write the marked value at the line's end.
   */
  value?: boolean;

  /**
   * The height in canvas pixels; 80 when left out.
   */
  height?: number;
};

/**
 * Every prop {@link Sparkline} takes. The props type checks them at compile time, and the catalog
 * test checks them against the catalog.
 */
export const SPARKLINE_PROPS = propNames<SparklineProps>()([
  'at',
  'caption',
  'source',
  'label',
  'format',
  'unit',
  'values',
  'data',
  'y',
  'highlight',
  'value',
  'height',
]);

/**
 * A word-sized line for a trend beside a number: no axes, the line in the context color and its
 * last (or highest, or lowest) point marked in the lead data color with its value. Inside a
 * `StatRow` or `BigNumber` use their `trend` field instead.
 *
 * ```mdx
 * <Sparkline values={[42, 44, 41, 47, 52, 58]} unit="%" />
 * ```
 */
export function Sparkline(props: SparklineProps): ReactNode {
  checkProps('Sparkline', props);
  return (
    <ChartFrame
      kind="sparkline"
      {...frameProps(props)}
      sizing="content"
      plotHeight={props.height ?? DEFAULT_HEIGHT}
      draw={(input) => drawSparkline(props, input)}
    />
  );
}

/**
 * Draws the sparkline for the measured width.
 *
 * @param props - The chart's props.
 * @param input - The plot size, theme and measurer.
 */
function drawSparkline(props: SparklineProps, input: DrawInput): ChartDrawing {
  const { theme, measure } = input;
  const values = sparkValues(props, input.datasets);
  const height = input.size.height;
  const format = resolveFormat(props.format, props.unit, theme.numbers);
  const write = runFormatter(values, format);
  const marked = markedIndex(values, props.highlight ?? 'last');
  const text = write(values[marked] ?? 0);
  const labelWidth =
    props.value === false
      ? 0
      : measure(text, { ...theme.text.value, weight: EMPHASIS_WEIGHT }) + theme.space.sm;
  const box = { width: input.size.width - labelWidth, height, theme };
  const items = sparkItems(values, { ...box, marked });
  const point = sparkPoint(values, marked, box);
  if (props.value !== false && point !== undefined) {
    items.push(valueLabel(point, text, height, theme));
  }

  const facts: ChartFacts = {
    series: 1,
    categories: values.length,
    highlighted: true,
    axis: 'none',
    unit: props.unit !== undefined || format.style !== 'number' || props.caption !== undefined,
    legend: false,
    legendAvoidable: false,
  };
  const spec = buildSpec(
    {
      kind: 'sparkline',
      name: `Sparkline of ${values.length} values`,
      summary: `From ${write(values[0] ?? 0)} to ${write(values.at(-1) ?? 0)}.`,
      categories: values.map((_, index) => String(index + 1)),
      series: [
        {
          name: props.y ?? 'value',
          values,
          x: null,
          color: theme.context,
          pointColors: null,
          highlighted: false,
          labels: values.map((_, index) => (index === marked ? text : null)),
        },
      ],
    },
    {
      theme,
      format,
      largest: maxOf(values.map(Math.abs)),
      caption: props.caption,
      source: props.source,
    },
  );
  return drawScene(
    {
      scene: {
        width: input.size.width,
        height,
        layers: [{ at: undefined, items }],
        highlightAt: undefined,
      },
      spec,
      facts,
    },
    input,
  );
}

/**
 * The marked value's label, beside its point. It is kept inside the box's height, so a point at the
 * top or bottom edge does not push the text out of the plot.
 *
 * @param point - The marked point.
 * @param text - The value as written.
 * @param height - The box's height.
 * @param theme - The chart theme.
 */
function valueLabel(
  point: { x: number; y: number },
  text: string,
  height: number,
  theme: ChartTheme,
): SceneItem {
  const half = lineHeight(theme.text.value) / 2;
  return {
    kind: 'text',
    x: point.x + theme.space.sm,
    y: Math.min(Math.max(point.y, half), Math.max(half, height - half)),
    lines: [text],
    style: theme.text.value,
    weight: EMPHASIS_WEIGHT,
    color: theme.colors.heading,
    anchor: 'start',
    anim: 'fade',
    lag: true,
  };
}

/**
 * The values a sparkline draws, from `values` or from rows.
 *
 * @param props - The sparkline's props.
 * @param datasets - The slide's `data:` frontmatter.
 */
function sparkValues(
  props: Pick<SparklineProps, 'values' | 'data' | 'y'>,
  datasets: unknown,
): number[] {
  if (props.values !== undefined) {
    return [...props.values];
  }

  const rows = props.data === undefined ? [] : resolveRows(props.data, datasets);
  const field = props.y ?? fieldKinds(rows).numbers[0] ?? '';
  return rows.map((row) => toNumber(row[field])).filter((value) => value !== null);
}

/**
 * The index of the point a sparkline marks.
 *
 * @param values - The values.
 * @param which - Which point.
 */
export function markedIndex(values: readonly number[], which: 'last' | 'max' | 'min'): number {
  if (which === 'last') {
    return values.length - 1;
  }

  const target = which === 'max' ? maxOf(values) : minOf(values);
  return values.indexOf(target);
}

/**
 * A sparkline's line and marked point, to draw inside a box of the given size.
 *
 * @param values - The values, oldest first.
 * @param box - The width and height, the theme and the marked index.
 */
export function sparkItems(
  values: readonly number[],
  box: { width: number; height: number; theme: ChartTheme; marked: number },
): SceneItem[] {
  const { theme, marked } = box;
  const points = values.map((_, index) => sparkPoint(values, index, box) ?? null);
  const dot = points[marked];
  const items: SceneItem[] = [
    {
      kind: 'path',
      d: linePath(points),
      fill: 'none',
      stroke: theme.context,
      strokeWidth: theme.lineWidth,
      anim: 'draw',
      drawable: true,
      mark: true,
    },
  ];
  if (dot !== null && dot !== undefined) {
    items.push({
      kind: 'circle',
      cx: dot.x,
      cy: dot.y,
      r: theme.lineWidth * 1.8,
      fill: theme.categorical[0] ?? theme.colors.accent,
      ring: theme.plate,
      ringWidth: theme.lineWidth,
      anim: 'pop',
      lag: true,
      mark: true,
    });
  }

  return items;
}

/**
 * Where one value of a sparkline sits in its box, leaving room for the marker at the edges.
 *
 * @param values - The values.
 * @param index - The value's index.
 * @param box - The width, height and theme.
 */
export function sparkPoint(
  values: readonly number[],
  index: number,
  box: { width: number; height: number; theme: ChartTheme },
): { x: number; y: number } | undefined {
  const value = values[index];
  if (value === undefined) {
    return undefined;
  }

  const pad = box.theme.lineWidth * 3;
  const low = minOf(values);
  const high = maxOf(values);
  const x = pad + (values.length <= 1 ? 0 : (index / (values.length - 1)) * (box.width - pad * 2));
  const y =
    high === low
      ? box.height / 2
      : pad + (1 - (value - low) / (high - low)) * (box.height - pad * 2);
  return { x, y };
}
