import type { DataProp } from '#charts/data/rows.ts';
import type { FormatProp } from '#charts/format/number-format.ts';
import type { FrameProps } from '#charts/frame/chart-frame.tsx';
import type { AnnotationInput } from '#charts/insight/annotations.ts';
import type { HighlightProp } from '#charts/insight/highlight.ts';

/**
 * Which value labels a chart draws on its marks.
 *
 * - `auto`: every value when there are few enough to read (the value axis is then dropped), else the
 *   highlighted values and the ends.
 * - `all`, `highlight`, `ends` (first and last of each series), `none`.
 */
export type LabelMode = 'auto' | 'all' | 'highlight' | 'ends' | 'none';

/**
 * The props every chart shares: the data, the insight (highlight and annotations), the number
 * format, labels and legend, and the frame's caption, source, name and step.
 */
export type ChartProps = FrameProps & {
  /**
   * The rows to draw: inline (`data={[{ month: 'Jan', users: 1.2 }]}`), imported from a JSON or CSV
   * file in the deck folder, or the name of a dataset in the slide's `data:` frontmatter.
   */
  data: DataProp;

  /**
   * What the chart is about: a series, a category (or `max`, `min`, `first`, `last`), several, or
   * `{ series, category, point, range, at }`. Everything else drops to the brand's context color.
   */
  highlight?: HighlightProp;

  /**
   * Callouts, reference lines, shaded ranges and brackets, each with an optional `at` step.
   */
  annotations?: readonly AnnotationInput[];

  /**
   * How values are written: `number`, `compact`, `currency`, `percent` (values in percent), `delta`
   * or options. The brand's number style when left out.
   */
  format?: FormatProp;

  /**
   * The unit after each value, such as `ms`, `°C` or `trees`.
   */
  unit?: string;

  /**
   * Which value labels to draw.
   */
  labels?: LabelMode;

  /**
   * Force the legend on or off. When left out, it shows only when direct labels cannot name the
   * series.
   */
  legend?: boolean;
};
