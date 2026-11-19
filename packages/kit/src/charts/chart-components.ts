import { BarChart } from '#charts/bar/bar-chart.tsx';
import { Donut } from '#charts/donut/donut.tsx';
import { BigNumber } from '#charts/figures/big-number.tsx';
import { Comparison } from '#charts/figures/comparison.tsx';
import { Table } from '#charts/figures/data-table.tsx';
import { Pictogram } from '#charts/figures/pictogram.tsx';
import { Progress } from '#charts/figures/progress.tsx';
import { StatRow } from '#charts/figures/stat-row.tsx';
import { Funnel } from '#charts/funnel/funnel.tsx';
import { Heatmap } from '#charts/heatmap/heatmap.tsx';
import { AreaChart, LineChart } from '#charts/line/line-chart.tsx';
import { MarketMovement } from '#charts/market-movement/market-movement.tsx';
import { ProfitPool } from '#charts/profit-pool/profit-pool.tsx';
import { RetentionCohorts } from '#charts/retention-cohorts/retention-cohorts.tsx';
import { Scatter } from '#charts/scatter/scatter.tsx';
import { Slope } from '#charts/slope/slope.tsx';
import { Sparkline } from '#charts/sparkline/sparkline.tsx';
import { Waterfall } from '#charts/waterfall/waterfall.tsx';

/**
 * The chart and number components the kit registers for MDX slides, by the tag a slide writes.
 * `deck charts` describes each one (`chart-catalog.ts`).
 */
export const CHART_COMPONENTS = {
  /**
   * Columns or bars: comparison and ranking.
   */
  BarChart,

  /**
   * Lines over time.
   */
  LineChart,

  /**
   * Areas over time.
   */
  AreaChart,

  /**
   * Part of a whole, five slices at most.
   */
  Donut,

  /**
   * Two measures against each other.
   */
  Scatter,

  /**
   * Dated movement on two fixed axes.
   */
  MarketMovement,

  /**
   * Change between two points.
   */
  Slope,

  /**
   * A bridge between two totals.
   */
  Waterfall,

  /**
   * Drop-off through stages.
   */
  Funnel,

  /**
   * A pattern across two dimensions.
   */
  Heatmap,

  /**
   * Retention by cohort and elapsed age.
   */
  RetentionCohorts,

  /**
   * Revenue, margin and profit by segment.
   */
  ProfitPool,

  /**
   * A word-sized trend.
   */
  Sparkline,

  /**
   * One number.
   */
  BigNumber,

  /**
   * Two to four numbers.
   */
  StatRow,

  /**
   * Two values and the change.
   */
  Comparison,

  /**
   * Progress toward a goal.
   */
  Progress,

  /**
   * A unit chart: "3 in 10".
   */
  Pictogram,

  /**
   * A small table with emphasis.
   */
  Table,
};
