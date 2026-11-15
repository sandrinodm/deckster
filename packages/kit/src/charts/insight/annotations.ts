import type { ChartSpecAnnotation } from '#charts/chart-spec.ts';
import type { CategoricalData } from '#charts/data/rows.ts';
import type { ResolvedFormat } from '#charts/format/number-format.ts';

import { formatChange, formatValue } from '#charts/format/number-format.ts';
import { categoryIndex, seriesKey } from '#charts/insight/highlight.ts';

/**
 * A label pointing at one point: an event, an outlier, the reason for a change.
 */
export type CalloutInput = {
  /**
   * Tells annotations apart.
   */
  type: 'callout';

  /**
   * The category (or x value) of the point.
   */
  x: string | number;

  /**
   * The text, a few words: "Redesign ships".
   */
  label: string;

  /**
   * The series whose value it points at; the highlighted or first series when left out.
   */
  series?: string;

  /**
   * The value to point at instead of the series' value.
   */
  y?: number;

  /**
   * The step that reveals it.
   */
  at?: number;
};

/**
 * A line across the plot at a value: a target, an average, a break-even point.
 */
export type ReferenceInput = {
  /**
   * Tells annotations apart.
   */
  type: 'reference';

  /**
   * The value on the value axis.
   */
  value: number;

  /**
   * The text at its end, such as "Target"; the formatted value is added after it.
   */
  label?: string;

  /**
   * The step that reveals it.
   */
  at?: number;
};

/**
 * A shaded span of categories: a period under discussion.
 */
export type RangeInput = {
  /**
   * Tells annotations apart.
   */
  type: 'range';

  /**
   * The first category of the span.
   */
  from: string | number;

  /**
   * The last category of the span.
   */
  to: string | number;

  /**
   * The text above the span.
   */
  label?: string;

  /**
   * The step that reveals it.
   */
  at?: number;
};

/**
 * A bracket between two points of a series with the change between them.
 */
export type BracketInput = {
  /**
   * Tells annotations apart.
   */
  type: 'bracket';

  /**
   * The category of the first point.
   */
  from: string | number;

  /**
   * The category of the second point.
   */
  to: string | number;

  /**
   * The series; the highlighted or first series when left out.
   */
  series?: string;

  /**
   * The text; the change between the two values when left out.
   */
  label?: string;

  /**
   * Write the change as a percentage of the first value (the default) or in the chart's unit.
   */
  relative?: boolean;

  /**
   * Which way is good news, for the label's color: `up` (the default) or `down` (fewer tickets,
   * lower cost).
   */
  better?: 'up' | 'down';

  /**
   * The step that reveals it.
   */
  at?: number;
};

/**
 * One annotation a chart's `annotations` prop takes.
 */
export type AnnotationInput = CalloutInput | ReferenceInput | RangeInput | BracketInput;

/**
 * An annotation resolved against the data, with its label as drawn.
 */
export type ResolvedAnnotation =
  | {
      /**
       * A callout.
       */
      type: 'callout';

      /**
       * The category index of the point.
       */
      index: number;

      /**
       * The value it points at.
       */
      value: number | null;

      /**
       * The series it points into.
       */
      series: string;

      /**
       * The text.
       */
      label: string;

      /**
       * The step that reveals it.
       */
      at: number | undefined;
    }
  | {
      /**
       * A reference line.
       */
      type: 'reference';

      /**
       * The value.
       */
      value: number;

      /**
       * The text, with the formatted value.
       */
      label: string;

      /**
       * The step that reveals it.
       */
      at: number | undefined;
    }
  | {
      /**
       * A shaded span.
       */
      type: 'range';

      /**
       * The first category index.
       */
      from: number;

      /**
       * The last category index.
       */
      to: number;

      /**
       * The text, or empty.
       */
      label: string;

      /**
       * The step that reveals it.
       */
      at: number | undefined;
    }
  | {
      /**
       * A bracket.
       */
      type: 'bracket';

      /**
       * The first point's category index and value.
       */
      from: { index: number; value: number };

      /**
       * The second point's.
       */
      to: { index: number; value: number };

      /**
       * The series.
       */
      series: string;

      /**
       * The change as written.
       */
      label: string;

      /**
       * Whether the change is good news, bad news or neither.
       */
      tone: 'positive' | 'negative' | 'neutral';

      /**
       * The step that reveals it.
       */
      at: number | undefined;
    };

/**
 * Resolves annotations against a chart's data: categories to indexes, a callout's value from its
 * series, a bracket's label from the change it spans.
 *
 * @param inputs - The chart's `annotations` prop.
 * @param data - The chart's data.
 * @param options - The format values are written in and the series annotations default to.
 * @returns The annotations, in the order given.
 * @throws Error naming the chart's categories or series when an annotation names one it lacks, or
 *   when a bracket spans a missing value.
 */
export function resolveAnnotations(
  inputs: readonly AnnotationInput[] | undefined,
  data: CategoricalData,
  options: { format: ResolvedFormat; series: string | undefined },
): ResolvedAnnotation[] {
  return (inputs ?? []).map((input) => resolveOne(input, data, options));
}

/**
 * Fails when a chart is given an annotation type it cannot draw: a shaded range of categories means
 * nothing on a scatter, a bracket nothing on a slope.
 *
 * @param inputs - The chart's `annotations` prop.
 * @param allowed - The types the chart draws.
 * @param chart - The chart's tag, for the message.
 * @throws Error naming the type and the ones the chart takes.
 */
export function requireAnnotationTypes(
  inputs: readonly AnnotationInput[] | undefined,
  allowed: readonly AnnotationInput['type'][],
  chart: string,
): void {
  for (const input of inputs ?? []) {
    if (!allowed.includes(input.type)) {
      throw new Error(
        `A "${input.type}" annotation does not apply to ${chart}; it takes ` +
          `${allowed.map((type) => `"${type}"`).join(' and ')}.`,
      );
    }
  }
}

/**
 * The annotations as the chart's spec describes them.
 *
 * @param annotations - The resolved annotations.
 * @param data - The chart's data.
 */
export function annotationSpecs(
  annotations: readonly ResolvedAnnotation[],
  data: CategoricalData,
): ChartSpecAnnotation[] {
  /**
   * The category at an index.
   */
  const name = (index: number): string => data.categories[index] ?? '';
  return annotations.map((annotation) => {
    switch (annotation.type) {
      case 'callout': {
        return {
          type: 'callout',
          label: annotation.label,
          category: name(annotation.index),
          value: annotation.value,
        };
      }

      case 'reference': {
        return { type: 'reference', label: annotation.label, value: annotation.value };
      }

      case 'range': {
        return {
          type: 'range',
          label: annotation.label,
          from: name(annotation.from),
          to: name(annotation.to),
        };
      }

      case 'bracket': {
        return {
          type: 'bracket',
          label: annotation.label,
          from: { category: name(annotation.from.index), value: annotation.from.value },
          to: { category: name(annotation.to.index), value: annotation.to.value },
        };
      }
    }
  });
}

/**
 * Resolves one annotation.
 *
 * @param input - The annotation as written.
 * @param data - The chart's data.
 * @param options - The format and the default series.
 */
function resolveOne(
  input: AnnotationInput,
  data: CategoricalData,
  options: { format: ResolvedFormat; series: string | undefined },
): ResolvedAnnotation {
  const at = input.at;
  switch (input.type) {
    case 'callout': {
      const index = categoryIndex(String(input.x), data);
      const series = pickSeries(input.series, options.series, data);
      return {
        type: 'callout',
        index,
        value: input.y ?? valueAt(data, series, index),
        series,
        label: input.label,
        at,
      };
    }

    case 'reference': {
      const value = formatValue(input.value, options.format);
      const label = input.label === undefined ? value : `${input.label} ${value}`;
      return { type: 'reference', value: input.value, label, at };
    }

    case 'range': {
      const from = categoryIndex(String(input.from), data);
      const to = categoryIndex(String(input.to), data);
      return {
        type: 'range',
        from: Math.min(from, to),
        to: Math.max(from, to),
        label: input.label ?? '',
        at,
      };
    }

    case 'bracket': {
      return resolveBracket(input, data, options);
    }
  }
}

/**
 * Resolves a bracket: both points must have values.
 *
 * @param input - The bracket as written.
 * @param data - The chart's data.
 * @param options - The format and the default series.
 */
function resolveBracket(
  input: BracketInput,
  data: CategoricalData,
  options: { format: ResolvedFormat; series: string | undefined },
): ResolvedAnnotation {
  const series = pickSeries(input.series, options.series, data);
  const fromIndex = categoryIndex(String(input.from), data);
  const toIndex = categoryIndex(String(input.to), data);
  const from = valueAt(data, series, fromIndex);
  const to = valueAt(data, series, toIndex);
  if (from === null || to === null) {
    throw new Error(
      `The bracket from "${input.from}" to "${input.to}" spans a point with no value in ` +
        `"${series}". Bracket two points that have values.`,
    );
  }

  const label = input.label ?? formatChange(from, to, options.format, input.relative ?? true);
  const tone = toneOf(to - from, input.better ?? 'up');
  return {
    type: 'bracket',
    from: { index: fromIndex, value: from },
    to: { index: toIndex, value: to },
    series,
    label,
    tone,
    at: input.at,
  };
}

/**
 * The series an annotation points into: its own, else the chart's default, else the first.
 *
 * @param own - The annotation's `series`.
 * @param fallback - The chart's highlighted series, if any.
 * @param data - The chart's data.
 */
function pickSeries(
  own: string | undefined,
  fallback: string | undefined,
  data: CategoricalData,
): string {
  if (own !== undefined) {
    return seriesKey(own, data);
  }

  return fallback ?? data.series[0]?.key ?? '';
}

/**
 * A series' value at a category.
 *
 * @param data - The chart's data.
 * @param series - The series key.
 * @param index - The category index.
 */
function valueAt(data: CategoricalData, series: string, index: number): number | null {
  return data.series.find((candidate) => candidate.key === series)?.values[index] ?? null;
}

/**
 * Whether a change is good news: a rise when up is better, a fall when down is.
 *
 * @param change - The change.
 * @param better - Which way is good news.
 */
export function toneOf(change: number, better: 'up' | 'down'): 'positive' | 'negative' | 'neutral' {
  if (change === 0) {
    return 'neutral';
  }

  const rose = change > 0;
  return rose === (better === 'up') ? 'positive' : 'negative';
}
