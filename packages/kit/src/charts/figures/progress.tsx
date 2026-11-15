import type { CSSProperties, ReactNode } from 'react';

import type { FormatProp } from '#charts/format/number-format.ts';
import type { ChartDrawing, DrawInput, FrameProps } from '#charts/frame/chart-frame.tsx';

import { figureFormat } from '#charts/figures/figure-format.ts';
import { FitGroup } from '#charts/figures/fit-group.tsx';
import { formatValue, itemFormat, type ResolvedFormat } from '#charts/format/number-format.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { buildSpec } from '#charts/frame/spec-builder.ts';
import { maxOf } from '#foundation/lists.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import '#charts/figures/figures.css';
import { StatValue } from '#foundation/stat-figure.tsx';

/**
 * The whole of a percentage: the top of a track when a bar sets no `max`, and the scale of a
 * percentage value.
 */
const PERCENT_WHOLE = 100;

/**
 * The most bars a progress figure may hold and still count as highlighted by default.
 */
const FEW_BARS = 3;

/**
 * One bar of a {@link Progress}.
 */
export type ProgressItem = {
  /**
   * What is being measured.
   */
  label: string;

  /**
   * How far it has come.
   */
  value: number;

  /**
   * The whole: 100 for a percentage.
   */
  max?: number;

  /**
   * The goal, marked on the track.
   */
  target?: number;

  /**
   * The unit after this bar's value and goal, over the figure's; it resets the figure's format
   * style (a currency figure does not write `$450` for an item in `donors`).
   */
  unit?: string;

  /**
   * How this bar's numbers are written, over the figure's.
   */
  format?: FormatProp;

  /**
   * The bar the point is about, when there are several.
   */
  highlight?: boolean;
};

/**
 * Props of {@link Progress}.
 */
export type ProgressProps = FrameProps & {
  /**
   * How far it has come, for a single bar.
   */
  value?: number;

  /**
   * The whole, for a single bar: 100 when left out.
   */
  max?: number;

  /**
   * The goal, for a single bar, marked on the track and named in the label.
   */
  target?: number;

  /**
   * What is being measured, for a single bar.
   */
  label?: string;

  /**
   * Several bars instead of one, each with its own label, value, max and target.
   */
  items?: readonly ProgressItem[];

  /**
   * How values are written; `percent` when `max` is 100.
   */
  format?: FormatProp;

  /**
   * The unit after each value.
   */
  unit?: string;
};

/**
 * Every prop {@link Progress} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const PROGRESS_PROPS = propNames<ProgressProps>()([
  'at',
  'caption',
  'source',
  'label',
  'format',
  'unit',
  'value',
  'max',
  'target',
  'items',
]);

/**
 * Progress toward a goal: a single bar with the value as a big figure, or a list of bars, each a
 * thick track in the context color filled in the lead data color, the target marked across it. Use
 * it instead of a gauge.
 *
 * ```mdx
 * <Progress value={31} target={40} label="of questions solved by self-serve; goal 40%" />
 * ```
 */
export function Progress(props: ProgressProps): ReactNode {
  checkProps('Progress', props);
  return (
    <ChartFrame
      kind="progress"
      {...frameProps(props)}
      draw={(input) => drawProgress(props, input)}
    />
  );
}

/**
 * Lays out the progress bars for the measured region.
 *
 * @param props - The figure's props.
 * @param input - The region size and theme.
 */
function drawProgress(props: ProgressProps, input: DrawInput): ChartDrawing {
  const { theme } = input;
  const items = progressItems(props);
  const single = props.items === undefined;
  const percentScale = items.every((item) => (item.max ?? PERCENT_WHOLE) === PERCENT_WHOLE);
  const format = figureFormat(
    {
      format: props.format ?? (percentScale && props.unit === undefined ? 'percent' : undefined),
      unit: props.unit,
    },
    theme,
  );
  const lead = theme.categorical[0] ?? theme.colors.accent;
  const anyHighlight = items.some((item) => item.highlight === true);
  const formats = items.map((item) => barFormat(item, props, format, theme));
  /**
   * The format of the bar at an index: its own, or the figure's.
   */
  const formatOf = (index: number): ResolvedFormat => formats[index] ?? format;
  const plot = (
    <FitGroup className="kit-progress" variant={{ 'data-single': single }}>
      {items.map((item, index) => {
        const strong = single || !anyHighlight || item.highlight === true;
        // A bar the point is not about stays readable against its track in the muted label color.
        const fill: CSSProperties = {
          width: `${trackFraction(item.value, item)}%`,
          background: strong ? lead : theme.colors.label,
        };
        const own = formatOf(index);
        const max = item.max ?? PERCENT_WHOLE;
        const text = formatValue(item.value, own);
        const goal =
          item.target === undefined ? undefined : `goal ${formatValue(item.target, own)}`;
        return (
          <div key={index} className="kit-progress-item" data-highlight={strong}>
            {single ? <StatValue value={text} /> : null}
            <div className="kit-progress-head">
              <p className="kit-progress-label kit-type-body">{smartPunctuation(item.label)}</p>
              <p className="kit-progress-figure">
                {single ? null : (
                  <span className="kit-progress-value kit-type-title kit-numeric">{text}</span>
                )}
                {goal === undefined ? null : (
                  <span className="kit-progress-goal kit-type-caption">{goal}</span>
                )}
              </p>
            </div>
            <div className="kit-progress-track" style={{ background: theme.colors.grid }}>
              <div className="kit-progress-fill" style={fill} />
              {item.value > max ? (
                // Past the whole, the track runs on and marks where the whole ended.
                <div
                  className="kit-progress-target"
                  data-whole=""
                  style={{ left: markerLeft(max, item), background: theme.plate }}
                />
              ) : null}
              {item.target === undefined ? null : (
                <div
                  className="kit-progress-target"
                  style={{ left: markerLeft(item.target, item), background: theme.colors.heading }}
                />
              )}
            </div>
          </div>
        );
      })}
    </FitGroup>
  );
  const sentence = items.map((item, index) => barSentence(item, formatOf(index))).join('. ');
  const spec = buildSpec(
    {
      kind: 'progress',
      orientation: 'horizontal',
      name: items
        .map((item, index) => `${item.label}: ${formatValue(item.value, formatOf(index))}`)
        .join('; '),
      summary: `${sentence}.`,
      categories: items.map((item) => item.label),
      series: [
        {
          name: 'value',
          values: items.map((item) => item.value),
          x: null,
          color: lead,
          pointColors: null,
          highlighted: anyHighlight,
          labels: items.map((item, index) => formatValue(item.value, formatOf(index))),
        },
      ],
      figures: items.map((item, index) => ({
        value: formatValue(item.value, formatOf(index)),
        number: item.value,
        label: item.label,
        delta: null,
        tone: null,
        highlighted: single || item.highlight === true,
        color: lead,
      })),
    },
    {
      theme,
      format,
      largest: maxOf(items.map((item) => item.max ?? PERCENT_WHOLE)),
      caption: props.caption,
      source: props.source,
    },
  );
  return {
    plot,
    spec,
    facts: {
      series: 1,
      categories: items.length,
      highlighted: single || anyHighlight || items.length <= FEW_BARS,
      axis: 'zero',
      unit: true,
      legend: false,
      legendAvoidable: false,
      marks: items.length,
    },
  };
}

/**
 * The bars a progress figure draws: the list it is given, or the one bar its single-value props
 * describe.
 *
 * @param props - The figure's props.
 */
function progressItems(props: ProgressProps): ProgressItem[] {
  if (props.items !== undefined) {
    return [...props.items];
  }

  return [
    {
      label: props.label ?? '',
      value: props.value ?? 0,
      ...(props.max === undefined ? {} : { max: props.max }),
      ...(props.target === undefined ? {} : { target: props.target }),
      highlight: true,
    },
  ];
}

/**
 * A bar's own format: the figure's format, unless the bar sets its own format or unit.
 *
 * @param item - The bar.
 * @param props - The figure's props, whose `format` and `unit` the bar's replace.
 * @param format - The figure's resolved format.
 * @param theme - The chart theme.
 */
function barFormat(
  item: ProgressItem,
  props: ProgressProps,
  format: ResolvedFormat,
  theme: DrawInput['theme'],
): ResolvedFormat {
  if (item.unit === undefined && item.format === undefined) {
    return format;
  }

  return figureFormat(itemFormat(item, { format: props.format, unit: props.unit }), theme);
}

/**
 * The length of a bar's track in values: the whole, or the value or goal past it, so an overshoot
 * shows.
 *
 * @param item - The bar.
 */
function trackDomain(item: ProgressItem): number {
  return Math.max(item.max ?? PERCENT_WHOLE, item.value, item.target ?? 0, Number.EPSILON);
}

/**
 * A value as a share of its track, between 0 and 100.
 *
 * @param value - The value.
 * @param item - The bar whose track it sits on.
 */
function trackFraction(value: number, item: ProgressItem): number {
  return Math.max(0, Math.min(PERCENT_WHOLE, (value / trackDomain(item)) * PERCENT_WHOLE));
}

/**
 * A marker's left edge at a value, held inside the track: one at the very end sits flush with it
 * rather than past it.
 *
 * @param value - The value the marker shows.
 * @param item - The bar it sits on.
 */
function markerLeft(value: number, item: ProgressItem): string {
  const at = trackFraction(value, item);
  return `calc(${at}% - var(--brand-stroke-bold) * ${at / PERCENT_WHOLE})`;
}

/**
 * One bar's sentence for the summary: its value of its whole, and its goal when it has one.
 *
 * @param item - The bar.
 * @param format - The format the bar's numbers are written in.
 */
function barSentence(item: ProgressItem, format: ResolvedFormat): string {
  const goal = item.target === undefined ? '' : `, goal ${formatValue(item.target, format)}`;
  const whole = formatValue(item.max ?? PERCENT_WHOLE, format);
  return `${item.label}: ${formatValue(item.value, format)} of ${whole}${goal}`;
}
