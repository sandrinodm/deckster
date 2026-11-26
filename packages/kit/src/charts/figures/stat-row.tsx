import type { ReactNode } from 'react';

import type { ChartDrawing, DrawInput, FrameProps } from '#charts/frame/chart-frame.tsx';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { DeltaDirection, DeltaTone } from '#layouts/stat-value.ts';

import { CHART_LIMITS } from '#charts/chart-catalog.ts';
import {
  deltaFrom,
  figureFormat,
  figureText,
  type FigureValue,
} from '#charts/figures/figure-format.ts';
import { FitGroup } from '#charts/figures/fit-group.tsx';
import { TrendLine } from '#charts/figures/trend-line.tsx';
import {
  defaultRelative,
  itemFormat,
  type FormatProp,
  type ResolvedFormat,
} from '#charts/format/number-format.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { buildSpec } from '#charts/frame/spec-builder.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { StatDelta, StatValue } from '#foundation/stat-figure.tsx';
import { deltaTone } from '#layouts/stat-value.ts';
import '#charts/figures/figures.css';
import '#layouts/stat-cards.css';

/**
 * The most stats a row holds, from the chart limits `deckster charts --json` prints; more belong in
 * a table.
 */
export const MAX_ROW_STATS = CHART_LIMITS.categories['stat-row'] ?? 4;

/**
 * One stat in a {@link StatRow}.
 */
export type RowStat = {
  /**
   * The number, formatted by the brand, or text as it should read.
   */
  value: FigureValue;

  /**
   * What it counts, in a few words.
   */
  label: string;

  /**
   * The change as written ("+12% since 2025"); computed from `from` when that is given.
   */
  delta?: string;

  /**
   * The value it is compared with, for a computed delta.
   */
  from?: number;

  /**
   * Whether the change is good news.
   */
  tone?: DeltaTone;

  /**
   * Which way the change points, for a delta written without a sign.
   */
  trend?: DeltaDirection;

  /**
   * Which way is good news, for a computed delta: `up` (the default) or `down`.
   */
  better?: 'up' | 'down';

  /**
   * Write the change from `from` as a percentage of it, or in the stat's unit (`false`). The
   * default is a percentage, except for values in percent, whose change is written in points.
   */
  relative?: boolean;

  /**
   * Recent values, oldest first, drawn as a sparkline under the label.
   */
  spark?: readonly number[];

  /**
   * The stat the point rests on: an accent rule and the accent color.
   */
  highlight?: boolean;

  /**
   * How this stat's number is written, over the row's.
   */
  format?: FormatProp;

  /**
   * This stat's unit, over the row's. It resets the row's format style unless it is a scale such as
   * `M`: a stat in `%` in a currency row is not written `$12.5%`.
   */
  unit?: string;
};

/**
 * Props of {@link StatRow}.
 */
export type StatRowProps = FrameProps & {
  /**
   * Two to four stats.
   */
  stats: readonly RowStat[];

  /**
   * How numbers are written, for every stat that sets none.
   */
  format?: FormatProp;

  /**
   * The unit after every number, for stats that set none.
   */
  unit?: string;
};

/**
 * A {@link RowStat} with its text, delta and tone worked out.
 */
type ResolvedStat = {
  /**
   * The number as written.
   */
  text: string;

  /**
   * The number, or `null` when the value is text.
   */
  number: number | null;

  /**
   * What it counts.
   */
  label: string;

  /**
   * The change as written, when there is one.
   */
  delta: string | undefined;

  /**
   * Whether the change is good news.
   */
  tone: DeltaTone | undefined;

  /**
   * Which way the change points, for a delta written without a sign.
   */
  trend: DeltaDirection | undefined;

  /**
   * Recent values, oldest first, when the stat has a trend.
   */
  spark: readonly number[] | undefined;

  /**
   * Whether the stat is the one the point rests on.
   */
  highlight: boolean;

  /**
   * The format the stat's number is written in.
   */
  format: ResolvedFormat;
};

/**
 * Every prop {@link StatRow} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const STAT_ROW_PROPS = propNames<StatRowProps>()([
  'at',
  'caption',
  'source',
  'label',
  'format',
  'unit',
  'stats',
]);

/**
 * Two to four headline numbers in a row, as the `stats` layout sets them (the same figure, unit,
 * delta and accent rule), each optionally with a sparkline of its trend. Use it inside a chart or
 * split slide; on a slide of its own, the `stats` layout does the same from frontmatter.
 *
 * ```mdx
 * <StatRow stats={[
 *   {
 *     value: 38,
 *     unit: '%',
 *     label: 'fewer tickets per customer',
 *     highlight: true,
 *     spark: [9, 9.4, 8.1, 6.2, 5.6],
 *   },
 *   { value: 2.5, unit: 'h', label: 'median first response', from: 14, better: 'down' },
 * ]} />
 * ```
 */
export function StatRow(props: StatRowProps): ReactNode {
  checkProps('StatRow', props);
  if (props.stats.length > MAX_ROW_STATS) {
    throw new Error(
      `StatRow holds at most ${MAX_ROW_STATS} stats and got ${props.stats.length}. ` +
        'Cut it to the stats that carry the point, or show the rest in a <DataTable>.',
    );
  }

  return (
    <ChartFrame
      kind="stat-row"
      {...frameProps(props)}
      plate={false}
      draw={(input) => drawStatRow(props, input)}
    />
  );
}

/**
 * Lays out the row for the measured region.
 *
 * @param props - The row's props.
 * @param input - The region size and theme.
 */
function drawStatRow(props: StatRowProps, input: DrawInput): ChartDrawing {
  const { theme } = input;
  const stats = props.stats.map((stat) => resolveStat(stat, props, theme));
  const plot = (
    <FitGroup
      className="kit-stat-row"
      variant={{ 'data-count': stats.length, 'data-kit-stat-cards': '' }}>
      {stats.map((stat, index) => (
        <div key={index} className="kit-stat" data-highlight={stat.highlight}>
          <StatValue value={stat.text} />
          <p className="kit-stat-label kit-type-body">{smartPunctuation(stat.label)}</p>
          {stat.spark === undefined ? null : (
            <div className="kit-stat-spark">
              <TrendLine values={stat.spark} theme={theme} />
            </div>
          )}
          <StatDelta stat={{ delta: stat.delta, tone: stat.tone, trend: stat.trend }} />
        </div>
      ))}
    </FitGroup>
  );
  const highlighted = stats.some((stat) => stat.highlight);
  const sentence = stats
    .map((stat) =>
      [stat.text, stat.label, stat.delta].filter((part) => part !== undefined).join(' '),
    )
    .join('. ');
  const spec = buildSpec(
    {
      kind: 'stat-row',
      name: stats.map((stat) => `${stat.text} ${stat.label}`).join('; '),
      summary: `${sentence}.`,
      figures: stats.map((stat) => ({
        value: stat.text,
        number: stat.number,
        label: stat.label,
        delta: stat.delta ?? null,
        tone: stat.delta === undefined ? null : deltaTone(stat.delta, stat.tone, stat.trend),
        highlighted: stat.highlight,
        color: stat.highlight ? theme.colors.accent : theme.colors.stat,
      })),
    },
    {
      theme,
      format: stats[0]?.format ?? figureFormat(props, theme),
      largest: 0,
      caption: props.caption,
      source: props.source,
    },
  );
  return {
    plot,
    spec,
    facts: {
      series: 1,
      categories: stats.length,
      highlighted: highlighted || stats.length <= 2,
      axis: 'none',
      unit: true,
      legend: false,
      legendAvoidable: false,
      marks: stats.length,
    },
  };
}

/**
 * A stat with its text, delta and tone worked out.
 *
 * @param stat - The stat as written.
 * @param row - The row's format and unit.
 * @param theme - The chart theme.
 */
function resolveStat(
  stat: RowStat,
  row: Pick<StatRowProps, 'format' | 'unit'>,
  theme: ChartTheme,
): ResolvedStat {
  const format = figureFormat(itemFormat(stat, row), theme);
  const computed = deltaFrom({
    value: stat.value,
    from: stat.from,
    format,
    better: stat.better ?? 'up',
    relative: stat.relative ?? defaultRelative(format),
  });
  return {
    text: figureText(stat.value, format),
    number: typeof stat.value === 'number' ? stat.value : null,
    label: stat.label,
    delta:
      stat.delta ??
      (computed === undefined
        ? undefined
        : `${computed.text} vs ${figureText(stat.from ?? 0, format)}`),
    tone: stat.tone ?? computed?.tone,
    trend: stat.trend,
    spark: stat.spark,
    highlight: stat.highlight === true,
    format,
  };
}
