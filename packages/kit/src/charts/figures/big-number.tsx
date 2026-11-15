import type { CSSProperties, ReactNode } from 'react';

import type { FormatProp } from '#charts/format/number-format.ts';
import type { ChartDrawing, DrawInput, FrameProps } from '#charts/frame/chart-frame.tsx';
import type { DeltaDirection, DeltaTone } from '#layouts/stat-value.ts';

import {
  deltaFrom,
  figureFormat,
  figureText,
  type FigureValue,
} from '#charts/figures/figure-format.ts';
import { TrendLine } from '#charts/figures/trend-line.tsx';
import { defaultRelative } from '#charts/format/number-format.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { buildSpec } from '#charts/frame/spec-builder.ts';
import { lineHeight, wrapLines } from '#charts/layout/text-measure.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { StatDelta, StatValue } from '#foundation/stat-figure.tsx';
import '#charts/figures/figures.css';

/**
 * The most a big number grows past the brand's stat size to fill its region.
 */
const MAX_SCALE = 2.4;

/**
 * The least a big number shrinks below the brand's stat size, to fit a narrow column or an aside.
 */
const MIN_SCALE = 0.5;

/**
 * The label's measure in ems of its type step, as `figures.css` sets it (`max-width: 22em`).
 */
const LABEL_MEASURE_EM = 22;

/**
 * The share of the region's width the figure may take.
 */
const WIDTH_SHARE = 0.92;

/**
 * A trend's height as a share of the figure's type size: about its x-height.
 */
const TREND_SHARE = 0.32;

/**
 * A trend's width as a multiple of its height.
 */
const TREND_ASPECT = 2.6;

/**
 * Gaps of the small space between the blocks under the figure when a delta or a context follows the
 * label.
 */
const GAPS_WITH_TEXT_UNDER = 3;

/**
 * Gaps of the small space under the figure when the label stands alone.
 */
const GAPS_LABEL_ONLY = 2;

/**
 * Props of {@link BigNumber}.
 */
export type BigNumberProps = FrameProps & {
  /**
   * The number: a value the brand formats (`3`, `0.38`, `4200000`), or text as it should read (`"3
   * in 10"`).
   */
  value: FigureValue;

  /**
   * What it counts, in about six words: "days from signup to first value".
   */
  label: string;

  /**
   * The comparison that gives it meaning, in a line: "down from 14 days in 2025".
   */
  context?: string;

  /**
   * The value it is compared with; the change is written as the delta.
   */
  from?: number;

  /**
   * The change as written, when it is not computed from `from`: "−11 days".
   */
  delta?: string;

  /**
   * Whether the change is good news; from `better` and the sign when left out.
   */
  tone?: DeltaTone;

  /**
   * Which way is good news: `up` (the default) or `down`.
   */
  better?: 'up' | 'down';

  /**
   * Write the change from `from` as a percentage of it, or in the value's unit (`false`). The
   * default is a percentage, except for values in percent, whose change is written in points.
   */
  relative?: boolean;

  /**
   * Recent values, oldest first, drawn as a sparkline beside the label.
   */
  trend?: readonly number[];

  /**
   * How a numeric value is written.
   */
  format?: FormatProp;

  /**
   * The unit after a numeric value: `days`, `ms`, `%`.
   */
  unit?: string;
};

/**
 * Every prop {@link BigNumber} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const BIG_NUMBER_PROPS = propNames<BigNumberProps>()([
  'at',
  'caption',
  'source',
  'label',
  'format',
  'unit',
  'value',
  'context',
  'from',
  'delta',
  'tone',
  'better',
  'relative',
  'trend',
]);

/**
 * One number that says it all, as large as the region allows (never smaller than the brand's stat
 * size), with what it counts under it and the comparison that gives it meaning. When the message is
 * a single value, this beats any chart.
 *
 * ```mdx
 * <BigNumber value={3} unit="days" label="from signup to a live workspace" from={14}
 *   better="down" relative={false} context="Median for customers who signed up in October" />
 * ```
 */
export function BigNumber(props: BigNumberProps): ReactNode {
  checkProps('BigNumber', props);
  return (
    <ChartFrame
      kind="big-number"
      {...frameProps(props)}
      plate={false}
      draw={(input) => drawBigNumber(props, input)}
    />
  );
}

/**
 * Lays out the big number for the measured region.
 *
 * @param props - The figure's props.
 * @param input - The region size, theme and measurer.
 */
function drawBigNumber(props: BigNumberProps, input: DrawInput): ChartDrawing {
  const { theme } = input;
  const format = figureFormat(props, theme);
  const text = figureText(props.value, format);
  const computed = deltaFrom({
    value: props.value,
    from: props.from,
    format,
    better: props.better ?? 'up',
    relative: props.relative ?? defaultRelative(format),
  });
  const delta = props.delta ?? computed?.text;
  const tone = props.tone ?? computed?.tone;
  const direction: DeltaDirection | undefined =
    computed === undefined ? undefined : deltaDirectionOf(props.value, props.from);
  const stat = theme.text.stat;
  const rest = textUnder(props, delta !== undefined, input);
  const scale = bigNumberScale(props, text, rest, input);
  // `--kit-scale` does not inherit, so the figure reads it from a custom property that does.
  const style = { '--kit-big-scale': scale } as CSSProperties;
  // The trend sits against the figure it trends, about half its height.
  const trendHeight = Math.round(stat.size * scale * TREND_SHARE);
  const plot = (
    <div className="kit-big-number">
      <div className="kit-big-number-figure">
        <div style={style} className="kit-big-number-value" data-fit="stepped">
          <StatValue value={text} />
        </div>
        {props.trend === undefined ? null : (
          <TrendLine
            values={props.trend}
            theme={theme}
            width={trendHeight * TREND_ASPECT}
            height={trendHeight}
          />
        )}
      </div>
      <div className="kit-big-number-meta">
        <p className="kit-big-number-label kit-type-title">{smartPunctuation(props.label)}</p>
      </div>
      {props.context === undefined && delta === undefined ? null : (
        <div className="kit-big-number-context">
          {delta !== undefined && <StatDelta stat={{ delta, tone, trend: direction }} />}
          {props.context !== undefined && (
            <p className="kit-type-body kit-muted">{smartPunctuation(props.context)}</p>
          )}
        </div>
      )}
    </div>
  );
  const sentence = [text, props.label, delta, props.context]
    .filter((part) => part !== undefined)
    .join('. ');
  const spec = buildSpec(
    {
      kind: 'big-number',
      name: `${text} ${props.label}`,
      summary: `${sentence}.`,
      figures: [
        {
          value: text,
          number: typeof props.value === 'number' ? props.value : null,
          label: props.label,
          delta: delta ?? null,
          tone: tone ?? null,
          highlighted: true,
          color: theme.colors.stat,
        },
      ],
    },
    {
      theme,
      format,
      largest: typeof props.value === 'number' ? Math.abs(props.value) : 0,
      caption: props.caption,
      source: props.source,
    },
  );
  return {
    plot,
    spec,
    facts: {
      series: 1,
      categories: 1,
      highlighted: true,
      axis: 'none',
      unit: true,
      legend: false,
      legendAvoidable: false,
      marks: 1,
    },
  };
}

/**
 * The scale the figure is drawn at: the largest that fits the region's width (with a trend beside
 * it) and its height left under the text, kept between the brand's bounds.
 *
 * @param props - The figure's props.
 * @param text - The figure's value as written.
 * @param rest - The height the text under the figure takes.
 * @param input - The region size, theme and measurer.
 */
function bigNumberScale(
  props: BigNumberProps,
  text: string,
  rest: number,
  input: DrawInput,
): number {
  const { theme, measure, size } = input;
  const stat = theme.text.stat;
  // A trend beside the figure scales with it and takes some of its width.
  const trendWidth = props.trend === undefined ? 0 : stat.size * TREND_SHARE * TREND_ASPECT;
  const trendGap = props.trend === undefined ? 0 : theme.space.lg;
  const widthFit =
    (size.width * WIDTH_SHARE - trendGap) / Math.max(1, measure(text, stat) + trendWidth);
  // A figure with a unit or currency in a smaller size has a line box taller than its leading
  // (the two sizes share a baseline), so it is counted at a whole line at least.
  const heightFit = Math.max(0, size.height - rest) / (stat.size * Math.max(1, stat.lineHeight));
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, widthFit, heightFit));
}

/**
 * The height the text under the figure takes: the label's lines at its measure, and the delta and
 * context's lines across the region, with the gaps between them.
 *
 * @param props - The figure's props.
 * @param hasDelta - Whether a delta is shown.
 * @param input - The region size, theme and measurer.
 */
function textUnder(props: BigNumberProps, hasDelta: boolean, input: DrawInput): number {
  const { theme, measure, size } = input;
  const label = theme.text.heading;
  const body = theme.text.body;
  const width = Math.max(1, size.width);
  const options = { measure, maxLines: Number.POSITIVE_INFINITY };
  const labelLines = wrapLines(props.label, Math.min(width, label.size * LABEL_MEASURE_EM), {
    ...options,
    style: label,
  }).lines.length;
  const contextLines =
    props.context === undefined
      ? Number(hasDelta)
      : wrapLines(props.context, width, { ...options, style: body }).lines.length;
  const gaps = contextLines > 0 ? GAPS_WITH_TEXT_UNDER : GAPS_LABEL_ONLY;
  return labelLines * lineHeight(label) + contextLines * lineHeight(body) + theme.space.sm * gaps;
}

/**
 * Which way the value moved from the one it is compared with.
 *
 * @param value - The value.
 * @param from - The value before.
 */
function deltaDirectionOf(value: FigureValue, from: number | undefined): DeltaDirection {
  if (typeof value !== 'number' || from === undefined || value === from) {
    return 'flat';
  }

  return value > from ? 'up' : 'down';
}
