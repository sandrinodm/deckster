import { Predicate } from 'effect';

import type { ElementSnapshot, StepSnapshot } from '#lint/types.ts';

/**
 * What a kit chart says about itself in its `data-chart-*` attributes, read back for the chart
 * rules.
 */
export type ChartFacts = {
  /**
   * The chart's root element.
   */
  element: ElementSnapshot;

  /**
   * The kind, such as `bar` or `donut`.
   */
  kind: string;

  /**
   * How many series it draws.
   */
  series: number;

  /**
   * How many categories it draws.
   */
  categories: number;

  /**
   * How many slices a donut draws; `undefined` for other kinds.
   */
  slices: number | undefined;

  /**
   * Whether it highlights anything.
   */
  highlighted: boolean;

  /**
   * The value axis fact: `zero`, `zoomed`, `truncated`, `refused` or `none`.
   */
  axis: string;

  /**
   * Whether its values carry a unit.
   */
  unit: boolean;

  /**
   * Whether it shows a legend.
   */
  legend: boolean;

  /**
   * Whether the legend was forced on although direct labels would do.
   */
  legendAvoidable: boolean;

  /**
   * How many data marks it draws (`data-chart-marks`); `undefined` when the chart does not say.
   */
  marks: number | undefined;

  /**
   * How many series it draws in their own color (`data-chart-colored`); `undefined` when the chart
   * does not say.
   */
  colored: number | undefined;

  /**
   * For a funnel, the stages that hold more than the stage before (`data-chart-growth`).
   */
  growth: readonly string[];
};

/**
 * The attribute every kit chart puts on its root, without the `data-` prefix.
 */
const CHART_ATTRIBUTE = 'chart';

/**
 * The charts on a measured slide that have been laid out (they carry their facts).
 *
 * @param snapshot - The measured step.
 */
export function chartsOn(snapshot: StepSnapshot): ChartFacts[] {
  return snapshot.elements
    .filter(
      (element) =>
        element.data[CHART_ATTRIBUTE] !== undefined && element.data['chart-series'] !== undefined,
    )
    .map((element) => {
      const { data } = element;
      const slices = data['chart-slices'];
      const marks = data['chart-marks'];
      const colored = data['chart-colored'];
      return {
        element,
        kind: data[CHART_ATTRIBUTE] ?? '',
        series: Number(data['chart-series'] ?? 0),
        categories: Number(data['chart-categories'] ?? 0),
        slices: slices === undefined ? undefined : Number(slices),
        highlighted: data['chart-highlight'] === 'true',
        axis: data['chart-axis'] ?? 'none',
        unit: data['chart-unit'] !== 'false',
        legend: data['chart-legend'] === 'true',
        legendAvoidable: data['chart-legend-avoidable'] === 'true',
        marks: marks === undefined ? undefined : Number(marks),
        colored: colored === undefined ? undefined : Number(colored),
        growth: stageList(data['chart-growth']),
      };
    });
}

/**
 * The stage names of a `data-chart-growth` attribute: a JSON array of strings, or none when it is
 * missing or not one.
 *
 * @param attribute - The attribute's value.
 */
function stageList(attribute: string | undefined): string[] {
  if (attribute === undefined) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(attribute);
    return Array.isArray(parsed) ? parsed.filter(Predicate.isString) : [];
  } catch {
    return [];
  }
}

/**
 * Whether a slide shows any kit chart or figure.
 *
 * @param snapshot - The measured step.
 */
export function hasChart(snapshot: StepSnapshot): boolean {
  return snapshot.elements.some((element) => element.data[CHART_ATTRIBUTE] !== undefined);
}

/**
 * A chart named for a finding: its tag, such as `<BarChart>`.
 *
 * @param kind - The chart's kind.
 */
export function chartTag(kind: string): string {
  const tags: Readonly<Record<string, string>> = {
    bar: 'BarChart',
    line: 'LineChart',
    area: 'AreaChart',
    donut: 'Donut',
    scatter: 'Scatter',
    'market-movement': 'MarketMovement',
    slope: 'Slope',
    waterfall: 'Waterfall',
    funnel: 'Funnel',
    heatmap: 'Heatmap',
    'retention-cohorts': 'RetentionCohorts',
    'profit-pool': 'ProfitPool',
    sparkline: 'Sparkline',
    'big-number': 'BigNumber',
    'stat-row': 'StatRow',
    comparison: 'Comparison',
    progress: 'Progress',
    pictogram: 'Pictogram',
    table: 'Table',
  };
  return `<${(Object.hasOwn(tags, kind) ? tags[kind] : undefined) ?? kind}>`;
}
