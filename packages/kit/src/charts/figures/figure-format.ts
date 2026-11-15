import type { FormatProp, ResolvedFormat } from '#charts/format/number-format.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { DeltaTone } from '#layouts/stat-value.ts';

import { formatChange, formatValue, resolveFormat } from '#charts/format/number-format.ts';
import { toneOf } from '#charts/insight/annotations.ts';

/**
 * A figure's value as a slide writes it: a number the brand formats, or text written as it should
 * appear (`"3 in 10"`, `"$18.6M"`).
 */
export type FigureValue = number | string;

/**
 * A figure's value as text: a number in the format, text as it is.
 *
 * @param value - The value.
 * @param format - The format numbers are written in.
 */
export function figureText(value: FigureValue, format: ResolvedFormat): string {
  return typeof value === 'number' ? formatValue(value, format) : value;
}

/**
 * The format a figure writes its numbers in.
 *
 * @param props - The figure's `format` and `unit`.
 * @param theme - The chart theme, for the brand's number defaults.
 */
export function figureFormat(
  props: { format?: FormatProp | undefined; unit?: string | undefined },
  theme: ChartTheme,
): ResolvedFormat {
  return resolveFormat(props.format, props.unit, theme.numbers);
}

/**
 * The delta of a figure that names the value it is compared with: the change from `from` to
 * `value`, as a percentage (`relative`) or in the figure's unit, with its tone.
 *
 * @param input - The value, the value before, the format, which way is better and whether the
 *   change is relative.
 * @returns The delta text and tone, or `undefined` when the figure has no number to compare.
 */
export function deltaFrom(input: {
  value: FigureValue;
  from: number | undefined;
  format: ResolvedFormat;
  better: 'up' | 'down';
  relative: boolean;
}): { text: string; tone: DeltaTone } | undefined {
  const { value, from, format, better, relative } = input;
  if (typeof value !== 'number' || from === undefined) {
    return undefined;
  }

  return {
    text: formatChange(from, value, format, relative),
    tone: toneOf(value - from, better),
  };
}
