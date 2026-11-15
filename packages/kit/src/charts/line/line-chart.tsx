import type { ReactNode } from 'react';

import type { FieldChoice } from '#charts/data/rows.ts';
import type { ChartDrawing, DrawInput } from '#charts/frame/chart-frame.tsx';
import type { ChartProps } from '#charts/frame/chart-props.ts';
import type { RevealOption } from '#charts/frame/reveal.ts';

import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { hasUnit, readCategorical } from '#charts/frame/chart-input.ts';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { SceneSvg } from '#charts/frame/scene-svg.tsx';
import { planLine } from '#charts/line/plan-line.ts';

/**
 * Props of {@link LineChart}.
 */
export type LineChartProps = ChartProps &
  FieldChoice & {
    /**
     * Start the value axis at zero. Lines encode position, so by default the axis hugs the data and
     * says where it starts when that is not zero.
     */
    zero?: boolean;

    /**
     * A fixed value axis minimum.
     */
    min?: number;

    /**
     * A fixed value axis maximum.
     */
    max?: number;

    /**
     * Build the lines in steps: one series or one point per step.
     */
    reveal?: RevealOption;
  };

/**
 * Props of {@link AreaChart}.
 */
export type AreaChartProps = Omit<LineChartProps, 'zero'> & {
  /**
   * Stack the series' areas on each other; put the series that matters first, at the baseline.
   */
  stacked?: boolean;
};

/**
 * Every prop {@link LineChart} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const LINE_CHART_PROPS = propNames<LineChartProps>()([
  'at',
  'caption',
  'source',
  'label',
  'data',
  'highlight',
  'annotations',
  'format',
  'unit',
  'labels',
  'legend',
  'x',
  'y',
  'series',
  'zero',
  'min',
  'max',
  'reveal',
]);

/**
 * A line chart from plain rows, for change over time: time along x in row order, each line labeled
 * at its end with its last value (and its name, when there are several), so no legend is needed.
 * Highlight one series and the others drop to the context color; highlight a category or a `range`
 * and that stretch of the line is drawn in color.
 *
 * ```mdx
 * <LineChart data={tickets} x="month" y={['2025', '2026']} highlight="2026"
 *   annotations={[{ type: 'callout', x: 'Jun', label: 'Redesign ships' }]} />
 * ```
 */
export function LineChart(props: LineChartProps): ReactNode {
  checkProps('LineChart', props);
  return (
    <ChartFrame
      kind="line"
      {...frameProps(props)}
      draw={(input) => drawLine(props, input, false)}
    />
  );
}

/**
 * Every prop {@link AreaChart} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const AREA_CHART_PROPS = propNames<AreaChartProps>()([
  'at',
  'caption',
  'source',
  'label',
  'data',
  'highlight',
  'annotations',
  'format',
  'unit',
  'labels',
  'legend',
  'x',
  'y',
  'series',
  'stacked',
  'min',
  'max',
  'reveal',
]);

/**
 * An area chart: a line chart with the area under each line washed in its color, or stacked areas
 * for a composition over time. Areas encode size, so the axis always starts at zero.
 *
 * ```mdx
 * <AreaChart data={backlog} x="week" y="open" highlight={{ range: ['W30', 'W38'] }} />
 * ```
 */
export function AreaChart(props: AreaChartProps): ReactNode {
  checkProps('AreaChart', props);
  return (
    <ChartFrame kind="area" {...frameProps(props)} draw={(input) => drawLine(props, input, true)} />
  );
}

/**
 * Lays out and draws the lines for the measured plot.
 *
 * @param props - The chart's props.
 * @param input - The plot size, theme and measurer.
 * @param area - Whether to fill under the lines.
 */
function drawLine(
  props: AreaChartProps & { zero?: boolean },
  input: DrawInput,
  area: boolean,
): ChartDrawing {
  const { data, format } = readCategorical(props, input);
  const planned = planLine({
    data,
    size: input.size,
    theme: input.theme,
    measure: input.measure,
    format,
    options: {
      area,
      stacked: props.stacked ?? false,
      zero: props.zero ?? false,
      min: props.min,
      max: props.max,
      labels: props.labels ?? 'auto',
      legend: props.legend,
      highlight: props.highlight,
      annotations: props.annotations,
      reveal: props.reveal,
      hasUnit: hasUnit(props, format),
    },
    frame: { caption: props.caption, source: props.source },
  });
  return {
    plot: (
      <SceneSvg
        scene={planned.scene}
        name={input.label ?? planned.spec.name}
        summaryId={input.summaryId}
      />
    ),
    spec: planned.spec,
    facts: planned.facts,
  };
}
