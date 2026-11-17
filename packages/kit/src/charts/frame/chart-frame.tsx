import { useId, useRef, type ReactNode } from 'react';

import type { ChartKind, ChartSpec } from '#charts/chart-spec.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { Measure } from '#charts/layout/text-measure.ts';

import { CHART_SPEC_ATTRIBUTE } from '#charts/chart-spec.ts';
import { useReveal } from '#charts/frame/chart-step.tsx';
import { useChartHost, type PlotSize } from '#charts/frame/use-chart-host.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { RevealContext } from '#motion/still-motion.ts';
import '#charts/charts.css';

/**
 * What a chart tells `deck lint` about itself, written as `data-chart-*` attributes on its root.
 */
export type ChartFacts = {
  /**
   * How many series it draws.
   */
  series: number;

  /**
   * How many categories (bars, points along x, rows, stages) it draws.
   */
  categories: number;

  /**
   * How many slices a donut draws; `undefined` for other kinds.
   */
  slices?: number;

  /**
   * Whether it highlights anything.
   */
  highlighted: boolean;

  /**
   * The value axis: from zero, `zoomed` (a line not from zero), `truncated` (a bar axis cut on
   * purpose, drawn with a break), `refused` (a bar axis asked to start above zero without the
   * opt-in, drawn from zero instead), or `none`.
   */
  axis: 'zero' | 'zoomed' | 'truncated' | 'refused' | 'none';

  /**
   * Whether its values carry a unit: a `unit`, a currency or percent format, or a caption that
   * names the measure.
   */
  unit: boolean;

  /**
   * Whether it shows a legend.
   */
  legend: boolean;

  /**
   * Whether the legend was asked for although direct labels would do.
   */
  legendAvoidable: boolean;

  /**
   * How many data marks it draws (bars, points with a value, slices, dots, cells, stages, figures);
   * 0 is an empty chart. Written as `data-chart-marks`.
   */
  marks?: number;

  /**
   * How many series it draws in their own color rather than the context color. Written as
   * `data-chart-colored`.
   */
  colored?: number;

  /**
   * For a funnel, the stages that hold more than the stage before them, which a funnel should not.
   * Written as `data-chart-growth`, a JSON array of stage names, only when there is one.
   */
  growth?: readonly string[];
};

/**
 * What a chart's plot draws once its size is known.
 */
export type ChartDrawing = {
  /**
   * The plot: an SVG sized to the plot area, or HTML.
   */
  plot: ReactNode;

  /**
   * The chart's serialisable description.
   */
  spec: ChartSpec;

  /**
   * The facts `deck lint` reads.
   */
  facts: ChartFacts;
};

/**
 * What a chart's draw function gets: the plot size and everything to lay out with.
 */
export type DrawInput = {
  /**
   * The plot area's size.
   */
  size: PlotSize;

  /**
   * The chart theme of the surface.
   */
  theme: ChartTheme;

  /**
   * Measures text.
   */
  measure: Measure;

  /**
   * The slide's `data:` frontmatter.
   */
  datasets: unknown;

  /**
   * The id of the chart's text summary, for `aria-describedby`.
   */
  summaryId: string;

  /**
   * The author's accessible name, when the chart sets `label`.
   */
  label: string | undefined;
};

/**
 * Props every chart and figure shares, handled by {@link ChartFrame}.
 */
export type FrameProps = {
  /**
   * The step that reveals the whole chart; shown from the start when left out.
   */
  at?: number;

  /**
   * A line above the plot naming the measure, unit and period ("Monthly active users, millions,
   * 2025"), so the slide title can state the takeaway.
   */
  caption?: string;

  /**
   * Where the data comes from, set under the plot.
   */
  source?: string;

  /**
   * The accessible name; built from the data when left out.
   */
  label?: string;
};

/**
 * Props of {@link ChartFrame}.
 */
type ChartFrameProps = FrameProps & {
  /**
   * The kind of chart, set as `data-chart`.
   */
  kind: ChartKind;

  /**
   * Draws the plot for a size; may throw an error that names the fix (an unknown field or
   * highlight), which the slide shows in its place.
   */
  draw: (input: DrawInput) => ChartDrawing;

  /**
   * `fill` (the default) takes the whole height of the region it is in; `content` takes the height
   * its plot asks for, for figures in running text.
   */
  sizing?: 'fill' | 'content';

  /**
   * The plot's height in canvas pixels for `content` sizing.
   */
  plotHeight?: number;

  /**
   * Whether the figure draws the surface's chart plate; `false` for figures made only of text,
   * which read on the surface itself.
   */
  plate?: boolean;
};

/**
 * The frame every kit chart is drawn in: a `figure` that fills the region it is placed in, the
 * surface's chart plate behind it when the plate shows (gradient and mid-tone surfaces), a caption
 * above the plot and a source line under it. It measures the plot area and holds the slide's
 * readiness until the chart is laid out in the brand's fonts, then writes the chart's description
 * (`data-chart-spec`), the facts lint reads (`data-chart-*`) and a text summary for screen readers.
 * With `at`, the whole chart is revealed at that step.
 */
export function ChartFrame({
  kind,
  at,
  caption,
  source,
  label,
  draw,
  sizing = 'fill',
  plotHeight,
  plate = true,
}: ChartFrameProps): ReactNode {
  const root = useRef<HTMLElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const host = useChartHost(root, plotRef);
  const reveal = useReveal(at);
  const summaryId = `kit-chart-${useId().replaceAll(':', '')}`;
  const drawing =
    host.size === undefined || host.size.width === 0
      ? undefined
      : draw({
          size: host.size,
          theme: host.theme,
          measure: host.measure,
          datasets: host.datasets,
          summaryId,
          label,
        });
  const spec = drawing === undefined ? undefined : withName(drawing.spec, label);
  return (
    <figure
      ref={root}
      className="kit-chart"
      data-chart={kind}
      data-sizing={sizing}
      data-plate={plate && host.theme.plateVisible ? 'visible' : 'flush'}
      data-motion={host.isStatic ? 'off' : 'on'}
      data-entrance={host.entrance ? 'play' : 'still'}
      data-reveal={at === undefined ? undefined : reveal}
      data-step={at}
      aria-label={spec?.name}
      {...factAttributes(drawing?.facts)}
      {...(spec === undefined ? {} : { [CHART_SPEC_ATTRIBUTE]: JSON.stringify(spec) })}>
      {caption === undefined ? null : (
        <figcaption className="kit-chart-caption kit-type-caption">
          {smartPunctuation(caption)}
        </figcaption>
      )}
      <div
        ref={plotRef}
        className="kit-chart-plot"
        style={plotHeight === undefined ? undefined : { height: plotHeight }}>
        {/* With `at`, the figures inside (stats that count up) play when the chart is revealed. */}
        {at === undefined ? (
          drawing?.plot
        ) : (
          <RevealContext value={reveal}>{drawing?.plot}</RevealContext>
        )}
      </div>
      {source === undefined ? null : (
        <p className="kit-chart-source kit-type-caption">{smartPunctuation(source)}</p>
      )}
      {spec === undefined ? null : (
        <p id={summaryId} className="kit-chart-summary" data-decorative="">
          {spec.summary}
        </p>
      )}
    </figure>
  );
}

/**
 * The frame's own props out of a chart's props, leaving out the ones the chart does not set.
 *
 * @param props - The chart's props.
 * @returns The step, caption, source and label that are set.
 */
export function frameProps(props: FrameProps): FrameProps {
  return {
    ...(props.at === undefined ? {} : { at: props.at }),
    ...(props.caption === undefined ? {} : { caption: props.caption }),
    ...(props.source === undefined ? {} : { source: props.source }),
    ...(props.label === undefined ? {} : { label: props.label }),
  };
}

/**
 * The spec with the author's accessible name, when one is given.
 *
 * @param spec - The spec the chart built.
 * @param label - The `label` prop.
 */
function withName(spec: ChartSpec, label: string | undefined): ChartSpec {
  return label === undefined ? spec : { ...spec, name: label };
}

/**
 * The `data-chart-*` attributes for a chart's facts; none until the chart is drawn.
 *
 * @param facts - The facts.
 */
function factAttributes(facts: ChartFacts | undefined): Record<`data-${string}`, string> {
  if (facts === undefined) {
    return {};
  }

  return {
    'data-chart-series': String(facts.series),
    'data-chart-categories': String(facts.categories),
    ...(facts.slices === undefined ? {} : { 'data-chart-slices': String(facts.slices) }),
    'data-chart-highlight': String(facts.highlighted),
    'data-chart-axis': facts.axis,
    'data-chart-unit': String(facts.unit),
    'data-chart-legend': String(facts.legend),
    'data-chart-legend-avoidable': String(facts.legendAvoidable),
    ...(facts.marks === undefined ? {} : { 'data-chart-marks': String(facts.marks) }),
    ...(facts.colored === undefined ? {} : { 'data-chart-colored': String(facts.colored) }),
    ...(facts.growth === undefined || facts.growth.length === 0
      ? {}
      : { 'data-chart-growth': JSON.stringify(facts.growth) }),
  };
}
