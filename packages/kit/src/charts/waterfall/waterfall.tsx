import type { ReactNode } from 'react';

import type { CategoricalData } from '#charts/data/rows.ts';
import type { ResolvedFormat } from '#charts/format/number-format.ts';
import type { ChartDrawing, ChartFacts, DrawInput } from '#charts/frame/chart-frame.tsx';
import type { ChartProps } from '#charts/frame/chart-props.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { RevealOption } from '#charts/frame/reveal.ts';
import type { SceneItem, SceneLayer } from '#charts/frame/scene.ts';
import type { Box } from '#charts/layout/label-placement.ts';
import type { TextStyle } from '#charts/layout/text-measure.ts';
import type { BandScale } from '#charts/scale/band-scale.ts';

import { runFormatter } from '#charts/format/number-format.ts';
import { annotationLayers } from '#charts/frame/annotation-items.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { hasUnit, readCategorical } from '#charts/frame/chart-input.ts';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { revealLayers } from '#charts/frame/reveal.ts';
import { drawScene } from '#charts/frame/scene-svg.tsx';
import { barPath } from '#charts/frame/scene.ts';
import { buildSpec, listNames } from '#charts/frame/spec-builder.ts';
import { annotationSpecs, resolveAnnotations, toneOf } from '#charts/insight/annotations.ts';
import { resolveHighlight, type ResolvedHighlight } from '#charts/insight/highlight.ts';
import { EMPHASIS_WEIGHT, lineHeight, wrapLines } from '#charts/layout/text-measure.ts';
import { bandScale } from '#charts/scale/band-scale.ts';
import { linearScale, valueAxis } from '#charts/scale/linear-scale.ts';
import { maxOf } from '#foundation/lists.ts';

/**
 * The share of each band left empty between bars.
 */
const BAND_PADDING = 0.28;

/**
 * The widest a step's bar is drawn.
 */
const MAX_BAR = 140;

/**
 * The most lines a step's label wraps to under its column; past them it is cut, and `deck lint`
 * reports it.
 */
const LABEL_LINES = 3;

/**
 * The share of a step's column its label may wrap within; the rest is the gap to the next label.
 */
const LABEL_WIDTH_SHARE = 0.92;

/**
 * How many value-axis ticks the chart aims for.
 */
const VALUE_AXIS_TICKS = 4;

/**
 * Props of {@link Waterfall}.
 */
export type WaterfallProps = Omit<ChartProps, 'labels' | 'legend'> & {
  /**
   * The field naming each step; the first text field when left out.
   */
  x?: string;

  /**
   * The field with each step's change (or a total's level); the first number field.
   */
  y?: string;

  /**
   * The steps that are totals (the start and the end, subtotals): their bars stand on zero. A total
   * with no value is the running total. The first step is a total unless this says otherwise.
   */
  totals?: readonly string[];

  /**
   * Which way is good news, for the color of rises and falls: `up` (the default) or `down` (costs).
   */
  better?: 'up' | 'down';

  /**
   * Build the changes in steps between the totals, which show from the start: `categories` brings
   * in one change per step, `series` all of them at once.
   */
  reveal?: RevealOption;
};

/**
 * One step, laid out.
 */
type Step = {
  /**
   * The step's name.
   */
  label: string;

  /**
   * Its change, or its level for a total.
   */
  value: number;

  /**
   * Where its bar starts.
   */
  from: number;

  /**
   * Where its bar ends.
   */
  to: number;

  /**
   * Whether it is a total.
   */
  total: boolean;

  /**
   * Whether a change step has no value: it counts as no change and is labeled with a dash.
   */
  missing: boolean;
};

/**
 * Every prop {@link Waterfall} takes. The props type checks them at compile time, and the catalog
 * test checks them against the catalog.
 */
export const WATERFALL_PROPS = propNames<WaterfallProps>()([
  'at',
  'caption',
  'source',
  'label',
  'data',
  'highlight',
  'annotations',
  'format',
  'unit',
  'x',
  'y',
  'totals',
  'better',
  'reveal',
]);

/**
 * A waterfall for how a total builds up or breaks down: totals stand on the baseline in the lead
 * data color, each change floats from the running total in the positive or negative color (by
 * whether it is good news), connectors carry the level from bar to bar, and every bar is labeled
 * with its signed change or its total. With `reveal` the totals show from the start and the changes
 * build between them, so the audience sees where the bridge starts and ends before how it gets
 * there.
 *
 * ```mdx
 * <Waterfall data={bridge} x="step" y="cost" totals={['2025', '2026']} better="down"
 *   format="currency" />
 * ```
 */
export function Waterfall(props: WaterfallProps): ReactNode {
  checkProps('Waterfall', props);
  return (
    <ChartFrame
      kind="waterfall"
      {...frameProps(props)}
      draw={(input) => drawWaterfall(props, input)}
    />
  );
}

/**
 * A mark or label of a waterfall and the change it comes in with under `reveal`.
 */
export type WaterfallMark = {
  /**
   * The scene item.
   */
  item: SceneItem;

  /**
   * The change's place among the changes (0 for the first), or `undefined` for what shows from the
   * start: the totals, their labels and the step names.
   */
  change: number | undefined;
};

/**
 * Each step's place among the changes, `undefined` for a total, so a build numbers the changes one
 * after another however many totals stand between them.
 *
 * @param steps - The steps, in order.
 */
export function changeOrder(steps: readonly Step[]): (number | undefined)[] {
  let changesSoFar = 0;
  return steps.map((entry) => {
    if (entry.total) {
      return undefined;
    }

    const place = changesSoFar;
    changesSoFar += 1;
    return place;
  });
}

/**
 * The waterfall's marks in step layers: all of them from the start without `reveal`. With it, the
 * totals and step names show from the start and the changes build by `reveal`, counted by their
 * place among the changes, so `categories` brings in one change per step.
 *
 * @param reveal - The `reveal` the slide passed.
 * @param data - The chart's data.
 * @param marks - The marks and labels in paint order, with their changes.
 */
export function waterfallLayers(
  reveal: RevealOption | undefined,
  data: CategoricalData,
  marks: readonly WaterfallMark[],
): SceneLayer[] {
  if (reveal === undefined) {
    return [{ at: undefined, items: marks.map((mark) => mark.item) }];
  }

  const series = data.series[0]?.key ?? '';
  const built = revealLayers({
    reveal,
    data,
    items: marks.flatMap((mark) =>
      mark.change === undefined ? [] : [{ item: mark.item, series, index: mark.change }],
    ),
  });

  const always = marks.filter((mark) => mark.change === undefined).map((mark) => mark.item);
  return [{ at: undefined, items: always }, ...built];
}

/**
 * Lays out and draws the waterfall for the measured plot.
 *
 * @param props - The chart's props.
 * @param input - The plot size, theme and measurer.
 */
function drawWaterfall(props: WaterfallProps, input: DrawInput): ChartDrawing {
  const { theme, measure, size } = input;
  const { data, format } = readCategorical(
    { ...props, ...(props.y === undefined ? {} : { y: props.y }) },
    input,
  );
  const steps = runningSteps(data.categories, data.series[0]?.values ?? [], props.totals);
  const highlight = resolveHighlight(props.highlight, data);
  const annotations = resolveAnnotations(props.annotations, data, {
    format,
    series: data.series[0]?.key,
  });
  const levels = steps.flatMap((step) => [step.from, step.to]);
  const axis = valueAxis(levels, {
    zero: true,
    count: VALUE_AXIS_TICKS,
    max: maxOf(levels, 0),
  });
  const write = runFormatter(levels, format);
  const signed: ResolvedFormat = { ...format, signed: true };
  const writeChange = runFormatter(levels, signed);
  const axisStyle = theme.text.axis;
  const step = size.width / Math.max(1, steps.length);
  // Value labels take the value step while the widest fits its column, the axis step after that.
  const widestValue = maxOf(
    steps.map((entry) => measure(stepText(entry, write, writeChange), theme.text.value)),
    0,
  );
  const valueStyle = widestValue <= step - theme.space.xs ? theme.text.value : axisStyle;
  const valueHeight = lineHeight(valueStyle);
  const wrapped = steps.map((entry) =>
    wrapLines(entry.label, step * LABEL_WIDTH_SHARE, {
      measure,
      style: axisStyle,
      maxLines: LABEL_LINES,
    }),
  );
  const lines = maxOf(
    wrapped.map((label) => label.lines.length),
    1,
  );
  const plot = {
    x: 0,
    y: valueHeight + theme.space.sm,
    width: size.width,
    height: Math.max(
      0,
      size.height - valueHeight - theme.space.sm - lines * lineHeight(axisStyle) - theme.space.sm,
    ),
  };
  const y = linearScale([axis.min, axis.max], [plot.y + plot.height, plot.y]).at;
  const bands = bandScale(data.categories, [plot.x, plot.x + plot.width], {
    padding: BAND_PADDING,
    maxBandwidth: MAX_BAR,
  });
  const better = props.better ?? 'up';
  const marks = waterfallMarks(steps, {
    theme,
    bands,
    y,
    better,
    highlight,
    plot,
    valueStyle,
    valueHeight,
    wrapped,
    write,
    writeChange,
  });

  const baseline: SceneItem = {
    kind: 'line',
    x1: plot.x,
    y1: y(0),
    x2: plot.x + plot.width,
    y2: y(0),
    stroke: theme.colors.axis,
    width: theme.axis.width,
  };
  const notes = annotationLayers(
    annotations,
    {
      orientation: 'vertical',
      plot,
      span: (index) => {
        const start = bands.at(data.categories[index] ?? '');
        return [start, start + bands.bandwidth];
      },
      value: y,
      tip: (_series, index) => {
        const entry = steps[index];
        return entry === undefined
          ? null
          : { x: bands.center(entry.label), y: y(Math.max(entry.from, entry.to)) };
      },
      bracket: 'over',
    },
    { theme, measure, obstacles: [] },
  );
  const facts: ChartFacts = {
    series: 1,
    categories: steps.length,
    // Rises and falls are colored by tone, which is the waterfall's emphasis.
    highlighted: true,
    axis: 'zero',
    unit: hasUnit(props, format),
    legend: false,
    legendAvoidable: false,
    marks: steps.length,
    colored: 1,
  };
  const first = steps[0];
  const last = steps.at(-1);
  const measured = data.series[0]?.label ?? 'values';
  const spec = buildSpec(
    {
      kind: 'waterfall',
      name: `Waterfall of ${measured} from ${first?.label ?? ''} to ${last?.label ?? ''}`,
      summary: waterfallSummary(steps, write, writeChange, highlight),
      stacked: true,
      categories: data.categories,
      series: [
        {
          name: data.series[0]?.label ?? '',
          values: steps.map((entry) => (entry.total ? entry.to : entry.value)),
          x: null,
          color: theme.categorical[0] ?? theme.context,
          pointColors: steps.map((entry, index) =>
            isStrong(entry, index, highlight) ? stepColor(entry, better, theme) : theme.context,
          ),
          highlighted: highlight.active,
          labels: steps.map((entry) => stepText(entry, write, writeChange)),
        },
      ],
      axis: { min: axis.min, max: axis.max, ticks: axis.ticks, zeroBased: true, truncated: false },
      highlight: highlight.spec,
      annotations: annotationSpecs(annotations, data),
    },
    {
      theme,
      format,
      largest: maxOf(levels.map(Math.abs)),
      caption: props.caption,
      source: props.source,
    },
  );
  return drawScene(
    {
      scene: {
        width: size.width,
        height: size.height,
        layers: [
          { at: undefined, items: [baseline] },
          ...notes.back,
          ...waterfallLayers(props.reveal, data, marks),
          ...notes.front,
        ],
        highlightAt: highlight.at,
      },
      spec,
      facts,
    },
    input,
  );
}

/**
 * The measured geometry, styles and formatters shared by waterfall marks and their labels.
 */
type WaterfallMarkOptions = {
  /**
   * The chart's theme.
   */
  theme: ChartTheme;

  /**
   * The horizontal position and width of each step.
   */
  bands: BandScale;

  /**
   * Maps a value to its vertical canvas position.
   */
  y: (value: number) => number;

  /**
   * Which direction receives the positive tone.
   */
  better: 'up' | 'down';

  /**
   * The categories kept in full color.
   */
  highlight: ResolvedHighlight;

  /**
   * The plot's canvas box.
   */
  plot: Box;

  /**
   * The chosen style of values above the bars.
   */
  valueStyle: TextStyle;

  /**
   * A value line's height in canvas pixels.
   */
  valueHeight: number;

  /**
   * Category text already wrapped to each band.
   */
  wrapped: readonly ReturnType<typeof wrapLines>[];

  /**
   * Formats totals.
   */
  write: (value: number) => string;

  /**
   * Formats signed changes.
   */
  writeChange: (value: number) => string;
};

/**
 * Lays out the step bars, their connectors and their labels in paint order: the bars and connectors
 * first, then the labels, each with the change it comes in with under `reveal`.
 *
 * @param steps - The running totals in category order.
 * @param options - The measured geometry, styles and formatters.
 */
function waterfallMarks(steps: readonly Step[], options: WaterfallMarkOptions): WaterfallMark[] {
  const {
    theme,
    bands,
    y,
    better,
    highlight,
    plot,
    valueStyle,
    valueHeight,
    wrapped,
    write,
    writeChange,
  } = options;
  const axisStyle = theme.text.axis;
  const order = changeOrder(steps);
  const items: WaterfallMark[] = [];
  const labels: WaterfallMark[] = [];
  for (const [index, entry] of steps.entries()) {
    const change = order[index];
    const x = bands.at(entry.label);
    const top = y(Math.max(entry.from, entry.to));
    const bottom = y(Math.min(entry.from, entry.to));
    const upward = entry.total || entry.to >= entry.from;
    const own = stepColor(entry, better, theme);
    const strong = isStrong(entry, index, highlight);
    const box = { x, y: top, width: bands.bandwidth, height: Math.max(1, bottom - top) };
    const bar: SceneItem = {
      kind: 'path',
      d: barPath(box, upward ? 'top' : 'bottom', entry.total ? theme.barRadius : 0),
      fill: strong ? own : theme.context,
      fillBefore: own,
      anim: upward ? 'rise' : 'drop',
      order: index,
      mark: true,
    };
    items.push({ item: bar, change });

    const next = steps[index + 1];
    if (next !== undefined) {
      const level = y(entry.to);
      const connector: SceneItem = {
        kind: 'line',
        x1: x + bands.bandwidth,
        y1: level,
        x2: bands.at(next.label),
        y2: level,
        stroke: theme.colors.axis,
        width: theme.axis.width,
        anim: 'fade',
        lag: true,
      };
      items.push({ item: connector, change: laterChange(change, order[index + 1]) });
    }

    const text = stepText(entry, write, writeChange);
    const value: SceneItem = {
      kind: 'text',
      x: x + bands.bandwidth / 2,
      y: top - theme.space.sm - valueHeight / 2,
      lines: [text],
      style: valueStyle,
      ...(entry.total || (highlight.active && strong) ? { weight: EMPHASIS_WEIGHT } : {}),
      color: strong ? theme.colors.heading : theme.colors.label,
      colorBefore: theme.colors.heading,
      anchor: 'middle',
      anim: 'fade',
      lag: true,
      order: index,
    };
    labels.push({ item: value, change });

    const label = wrapped[index] ?? { lines: [entry.label], cut: false };
    // The name shows from the start, as a category axis does, so each column is there before its
    // change builds.
    const name: SceneItem = {
      kind: 'text',
      x: x + bands.bandwidth / 2,
      y: plot.y + plot.height + theme.space.sm + lineHeight(axisStyle) / 2,
      lines: label.lines,
      ...(label.cut ? { cut: entry.label } : {}),
      style: axisStyle,
      color: entry.total ? theme.colors.value : theme.colors.label,
      anchor: 'middle',
      ...(entry.total ? { weight: EMPHASIS_WEIGHT } : {}),
    };
    labels.push({ item: name, change: undefined });
  }

  return [...items, ...labels];
}

/**
 * The change a connector between two steps comes in with: the later of the two, since it carries
 * the level from one bar to the next and means nothing until both are there.
 *
 * @param before - The change of the step it leaves, `undefined` for a total.
 * @param after - The change of the step it reaches, `undefined` for a total.
 */
function laterChange(before: number | undefined, after: number | undefined): number | undefined {
  if (before === undefined) {
    return after;
  }

  return after === undefined ? before : Math.max(before, after);
}

/**
 * The steps with their running totals: totals stand on zero (a total without a value takes the
 * running total), changes float from the level before them.
 *
 * @param labels - The step names.
 * @param values - Each step's change or level.
 * @param totals - The names of total steps; the first step when left out.
 * @returns The steps, in order.
 */
export function runningSteps(
  labels: readonly string[],
  values: readonly (number | null)[],
  totals: readonly string[] | undefined,
): Step[] {
  const isTotal = new Set(totals ?? [labels[0] ?? '']);
  let level = 0;
  return labels.map((label, index) => {
    const value = values[index] ?? null;
    if (isTotal.has(label)) {
      level = value ?? level;
      return { label, value: level, from: 0, to: level, total: true, missing: false };
    }

    const change = value ?? 0;
    const from = level;
    level += change;
    return { label, value: change, from, to: level, total: false, missing: value === null };
  });
}

/**
 * Whether a step is drawn in full color. Totals always are, since a highlight never mutes the frame
 * of the bridge; a change is full color when nothing is highlighted or it is one of the highlighted
 * steps.
 *
 * @param step - The step.
 * @param index - Its position among the steps.
 * @param highlight - The highlight.
 */
function isStrong(step: Step, index: number, highlight: ResolvedHighlight): boolean {
  return step.total || !highlight.active || highlight.categories.has(index);
}

/**
 * The text summary of a waterfall: the first and last totals, each change between them, and what is
 * highlighted.
 *
 * @param steps - The steps, in order.
 * @param write - Writes a level.
 * @param writeChange - Writes a signed change.
 * @param highlight - The highlight.
 */
function waterfallSummary(
  steps: readonly Step[],
  write: (value: number) => string,
  writeChange: (value: number) => string,
  highlight: ResolvedHighlight,
): string {
  const first = steps[0];
  const last = steps.at(-1);
  const changes = steps
    .slice(1, -1)
    .map((entry) => `${entry.label} ${writeChange(entry.value)}`)
    .join(', ');
  const highlighted = highlight.active
    ? ` Highlighted: ${listNames(highlight.spec.categories)}.`
    : '';
  const start = `${first?.label ?? ''} ${write(first?.to ?? 0)}`;
  const end = `${last?.label ?? ''} ${write(last?.to ?? 0)}`;
  return `${start}. ${changes}. ${end}.${highlighted}`;
}

/**
 * A step's label: a total's level, a change signed, a dash for a change with no value.
 *
 * @param step - The step.
 * @param write - Writes a level.
 * @param writeChange - Writes a signed change.
 */
function stepText(
  step: Step,
  write: (value: number) => string,
  writeChange: (value: number) => string,
): string {
  if (step.missing) {
    return '—';
  }

  return step.total ? write(step.to) : writeChange(step.value);
}

/**
 * A step's color: the lead data color for totals, the positive or negative role for changes by
 * whether they are good news.
 *
 * @param step - The step.
 * @param better - Which way is good news.
 * @param theme - The chart theme.
 */
function stepColor(step: Step, better: 'up' | 'down', theme: ChartTheme): string {
  if (step.total) {
    return theme.categorical[0] ?? theme.colors.accent;
  }

  return toneOf(step.value, better) === 'negative' ? theme.colors.negative : theme.colors.positive;
}
