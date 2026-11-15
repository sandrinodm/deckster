import type { FieldChoice } from '#charts/data/rows.ts';
import type { DrawInput } from '#charts/frame/chart-frame.tsx';
import type { ChartProps } from '#charts/frame/chart-props.ts';

import { categorical, resolveRows, type CategoricalData } from '#charts/data/rows.ts';
import { resolveFormat, type ResolvedFormat } from '#charts/format/number-format.ts';

/**
 * The data and format of a categorical chart, read from its props.
 *
 * @param props - The chart's props, with its field choice.
 * @param input - What the frame measured and resolved.
 * @returns The categories and series, and the format values are written in.
 * @throws Error naming the fix when the data names a missing dataset or field.
 */
export function readCategorical(
  props: ChartProps & FieldChoice,
  input: DrawInput,
): { data: CategoricalData; format: ResolvedFormat } {
  const rows = resolveRows(props.data, input.datasets);
  const data = categorical(rows, { x: props.x, y: props.y, series: props.series });
  const format = resolveFormat(props.format, props.unit, input.theme.numbers);
  return { data, format };
}

/**
 * Whether a chart's values carry a unit: a `unit`, a currency or percent format, or a caption
 * (which names the measure and its unit).
 *
 * @param props - The chart's props.
 * @param format - Its resolved format.
 */
export function hasUnit(
  props: Pick<ChartProps, 'unit' | 'caption'>,
  format: ResolvedFormat,
): boolean {
  return props.unit !== undefined || format.style !== 'number' || props.caption !== undefined;
}
