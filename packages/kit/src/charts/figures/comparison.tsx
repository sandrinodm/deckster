import type { CSSProperties, ReactNode } from 'react';

import type { FormatProp } from '#charts/format/number-format.ts';
import type { ChartDrawing, DrawInput, FrameProps } from '#charts/frame/chart-frame.tsx';

import { deltaFrom, figureFormat, figureText } from '#charts/figures/figure-format.ts';
import { FitGroup } from '#charts/figures/fit-group.tsx';
import { defaultRelative } from '#charts/format/number-format.ts';
import { toneTextColor } from '#charts/frame/annotation-items.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { buildSpec } from '#charts/frame/spec-builder.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { StatValue } from '#foundation/stat-figure.tsx';
import '#charts/figures/figures.css';

/**
 * The stroke of the arrow between the two values, in its own 48 by 24 box.
 */
const ARROW_STROKE_WIDTH = 2.5;

/**
 * The whole of a percentage, for the width of each value's bar against the larger value.
 */
const PERCENT_WHOLE = 100;

/**
 * One side of a comparison.
 */
export type ComparisonSide = {
  /**
   * The number.
   */
  value: number;

  /**
   * What it is: "Before the redesign", "Plan A".
   */
  label: string;
};

/**
 * Props of {@link Comparison}.
 */
export type ComparisonProps = FrameProps & {
  /**
   * The value before, or the first of the two.
   */
  from: ComparisonSide;

  /**
   * The value after, or the second; the one the point is about.
   */
  to: ComparisonSide;

  /**
   * Which way is good news: `up` (the default) or `down`.
   */
  better?: 'up' | 'down';

  /**
   * Write the difference as a percentage of `from`, or in the values' unit (`false`). The default
   * is a percentage, except for values in percent, whose difference is written in points.
   */
  relative?: boolean;

  /**
   * How the numbers are written.
   */
  format?: FormatProp;

  /**
   * The unit after each number.
   */
  unit?: string;
};

/**
 * Every prop {@link Comparison} takes, checked against its props type at compile time and against
 * the catalog by its test.
 */
export const COMPARISON_PROPS = propNames<ComparisonProps>()([
  'at',
  'caption',
  'source',
  'label',
  'format',
  'unit',
  'from',
  'to',
  'better',
  'relative',
]);

/**
 * Two values side by side, before and after or A against B, with the difference between them as the
 * message: the first muted, the second in the accent, the change in the positive or negative color
 * between them, and a bar under each drawn to scale from zero so the sizes stay honest. When a
 * value is below zero both bars share a zero line and the negative one runs from it towards the
 * start edge, so a loss against a gain reads as one.
 *
 * ```mdx
 * <Comparison from={{ value: 14, label: 'Median first response, 2025' }}
 *   to={{ value: 2.5, label: 'Since the redesign' }} unit="h" better="down" />
 * ```
 */
export function Comparison(props: ComparisonProps): ReactNode {
  checkProps('Comparison', props);
  return (
    <ChartFrame
      kind="comparison"
      {...frameProps(props)}
      draw={(input) => drawComparison(props, input)}
    />
  );
}

/**
 * Where the two values' bars sit on a track that spans from the smaller of zero and the values to
 * the larger, as shares of the track's width from its start edge.
 */
export type ComparisonBarScale = {
  /**
   * Where the zero line sits: 0 when no value is below zero, 1 when none is above it.
   */
  zero: number;

  /**
   * Where a value's bar starts: at zero for a value above it, at the value for one below it.
   */
  start: (value: number) => number;

  /**
   * How long a value's bar is.
   */
  length: (value: number) => number;
};

/**
 * The scale both bars of a comparison share, so their lengths compare honestly: from zero to the
 * larger value when both are positive, and across a zero line when one is negative.
 *
 * @param from - The first value.
 * @param to - The second value.
 */
export function comparisonBarScale(from: number, to: number): ComparisonBarScale {
  const low = Math.min(0, from, to);
  const high = Math.max(0, from, to);
  const span = Math.max(high - low, Number.EPSILON);
  return {
    zero: (0 - low) / span,
    start: (value) => (Math.min(0, value) - low) / span,
    length: (value) => Math.abs(value) / span,
  };
}

/**
 * Lays out the comparison for the measured region.
 *
 * @param props - The comparison's props.
 * @param input - The region size and theme.
 */
function drawComparison(props: ComparisonProps, input: DrawInput): ChartDrawing {
  const { theme } = input;
  const format = figureFormat(props, theme);
  const from = figureText(props.from.value, format);
  const to = figureText(props.to.value, format);
  const change = deltaFrom({
    value: props.to.value,
    from: props.from.value,
    format,
    better: props.better ?? 'up',
    relative: props.relative ?? defaultRelative(format),
  });
  const largest = Math.max(Math.abs(props.from.value), Math.abs(props.to.value), Number.EPSILON);
  const scale = comparisonBarScale(props.from.value, props.to.value);
  /**
   * A bar to scale from the zero line: a negative value runs from zero towards the start edge, so a
   * loss never reads as a gain of the same size.
   */
  const bar = (value: number, color: string): CSSProperties => ({
    marginInlineStart: `${scale.start(value) * PERCENT_WHOLE}%`,
    width: `${scale.length(value) * PERCENT_WHOLE}%`,
    background: color,
  });
  /**
   * The zero line on a track, drawn only when a value is below zero, so the bars show which side of
   * it each value is on.
   */
  const zero =
    scale.zero === 0 ? null : (
      <div
        className="kit-compare-zero"
        style={{
          insetInlineStart: `${scale.zero * PERCENT_WHOLE}%`,
          width: theme.axis.width,
          // Centred on zero, whichever way the text runs.
          marginInlineStart: -theme.axis.width / 2,
          background: theme.colors.axis,
        }}
      />
    );
  const lead = theme.categorical[0] ?? theme.colors.accent;
  const plot = (
    <FitGroup className="kit-compare">
      <div className="kit-compare-side" data-side="from">
        <p className="kit-compare-label kit-type-body">{smartPunctuation(props.from.label)}</p>
        <StatValue value={from} />
        <div className="kit-compare-track">
          <div className="kit-compare-bar" style={bar(props.from.value, theme.context)} />
          {zero}
        </div>
      </div>
      <div className="kit-compare-change">
        <svg
          className="kit-compare-arrow"
          viewBox="0 0 48 24"
          aria-hidden="true"
          data-decorative="">
          <path
            d="M2,12H44M34,3l10,9l-10,9"
            fill="none"
            stroke={theme.colors.axis}
            strokeWidth={ARROW_STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {change === undefined ? null : (
          <p
            className="kit-compare-delta kit-type-title"
            style={{ color: toneTextColor(change.tone, theme) }}>
            {change.text}
          </p>
        )}
      </div>
      <div className="kit-compare-side" data-side="to">
        <p className="kit-compare-label kit-type-body">{smartPunctuation(props.to.label)}</p>
        <StatValue value={to} />
        <div className="kit-compare-track">
          <div className="kit-compare-bar" style={bar(props.to.value, lead)} />
          {zero}
        </div>
      </div>
    </FitGroup>
  );
  const changeSentence = change === undefined ? '' : ` Change: ${change.text}.`;
  const spec = buildSpec(
    {
      kind: 'comparison',
      name: `${props.from.label} ${from} against ${props.to.label} ${to}`,
      summary: `${props.from.label}: ${from}. ${props.to.label}: ${to}.${changeSentence}`,
      categories: [props.from.label, props.to.label],
      series: [
        {
          name: 'value',
          values: [props.from.value, props.to.value],
          x: null,
          color: lead,
          pointColors: [theme.context, lead],
          highlighted: true,
          labels: [from, to],
        },
      ],
      figures: [
        {
          value: from,
          number: props.from.value,
          label: props.from.label,
          delta: null,
          tone: null,
          highlighted: false,
          color: theme.colors.label,
        },
        {
          value: to,
          number: props.to.value,
          label: props.to.label,
          delta: change?.text ?? null,
          tone: change?.tone ?? null,
          highlighted: true,
          color: theme.colors.accent,
        },
      ],
    },
    { theme, format, largest, caption: props.caption, source: props.source },
  );
  return {
    plot,
    spec,
    facts: {
      series: 1,
      categories: 2,
      highlighted: true,
      axis: 'zero',
      unit: props.unit !== undefined || format.style !== 'number' || props.caption !== undefined,
      legend: false,
      legendAvoidable: false,
      marks: 2,
    },
  };
}
