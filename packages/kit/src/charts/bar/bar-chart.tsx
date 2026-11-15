import type { ReactNode } from 'react';

import type { FieldChoice } from '#charts/data/rows.ts';
import type { ChartDrawing, DrawInput } from '#charts/frame/chart-frame.tsx';
import type { ChartProps } from '#charts/frame/chart-props.ts';
import type { RevealOption } from '#charts/frame/reveal.ts';

import { planBar } from '#charts/bar/plan-bar.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { hasUnit, readCategorical } from '#charts/frame/chart-input.ts';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { SceneSvg } from '#charts/frame/scene-svg.tsx';

/**
 * Props of {@link BarChart}.
 */
export type BarChartProps = ChartProps &
  FieldChoice & {
    /**
     * `vertical` columns, `horizontal` bars, or `auto` (the default): horizontal when the category
     * labels do not fit under columns.
     */
    orientation?: 'auto' | 'vertical' | 'horizontal';

    /**
     * Stack the series instead of grouping them side by side.
     */
    stacked?: boolean;

    /**
     * Sort categories by value: `true` or `descending` puts the largest first, `ascending` the
     * smallest. Rankings should be sorted; time keeps its order.
     */
    sort?: boolean | 'ascending' | 'descending';

    /**
     * The value axis maximum.
     */
    max?: number;

    /**
     * The value axis minimum. Bars encode length, so a minimum above zero is drawn only with
     * `truncate`, as an axis break; without it the axis starts at zero and lint reports it.
     */
    min?: number;

    /**
     * Allow `min` above zero, drawn with a break across every bar.
     */
    truncate?: boolean;

    /**
     * Build the bars in steps: one series or one category per step.
     */
    reveal?: RevealOption;
  };

/**
 * Every prop {@link BarChart} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const BAR_CHART_PROPS = propNames<BarChartProps>()([
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
  'orientation',
  'stacked',
  'sort',
  'min',
  'max',
  'truncate',
  'reveal',
]);

/**
 * A bar chart from plain rows: vertical columns or horizontal bars, single, grouped or stacked,
 * optionally sorted. Bars start at zero; values are labeled on the bars when there are few enough
 * to read (and the value axis is dropped), else on the highlighted bars with a light axis. A
 * highlight drops everything else to the brand's context color.
 *
 * ```mdx
 * <BarChart data={regions} x="region" y="revenue" format="currency" sort highlight="EMEA" />
 * ```
 */
export function BarChart(props: BarChartProps): ReactNode {
  checkProps('BarChart', props);
  return <ChartFrame kind="bar" {...frameProps(props)} draw={(input) => drawBar(props, input)} />;
}

/**
 * Lays out and draws the bars for the measured plot.
 *
 * @param props - The chart's props.
 * @param input - The plot size, theme and measurer.
 */
function drawBar(props: BarChartProps, input: DrawInput): ChartDrawing {
  const { data, format } = readCategorical(props, input);
  const planned = planBar({
    data,
    xField: data.x,
    size: input.size,
    theme: input.theme,
    measure: input.measure,
    format,
    options: {
      orientation: props.orientation ?? 'auto',
      stacked: props.stacked ?? false,
      sort: sortOf(props.sort),
      labels: props.labels ?? 'auto',
      legend: props.legend,
      min: props.min,
      max: props.max,
      truncate: props.truncate ?? false,
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

/**
 * The sort a `sort` prop asks for.
 *
 * @param sort - The prop.
 */
function sortOf(sort: BarChartProps['sort']): 'none' | 'ascending' | 'descending' {
  if (sort === undefined || sort === false) {
    return 'none';
  }

  return sort === true ? 'descending' : sort;
}
