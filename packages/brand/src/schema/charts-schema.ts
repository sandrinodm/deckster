import { Schema } from 'effect';

import { ROLE_NAMES } from '#schema/color-schema.ts';
import { STROKE_NAMES } from '#schema/shape-schema.ts';
import { TYPE_STEPS } from '#schema/typography-schema.ts';

/**
 * The chart colors each surface resolves, in each surface's `charts` tokens.
 */
export const CHART_COLORS = [
  'grid',
  'axis',
  'label',
  'value',
  'stat',
  'emphasis',
  'emphasis-fg',
  'zebra',
] as const;

/**
 * A chart color: `grid` and `axis` lines, `label` text (axes, legends, annotations), `value` text
 * (data labels and table cells), `stat` numbers, the `emphasis` color of highlighted table rows
 * with `emphasis-fg` text on them, and the `zebra` tint of alternate rows.
 */
export type ChartColor = (typeof CHART_COLORS)[number];

/**
 * Line styles for gridlines and axes.
 */
export const LINE_DASHES = ['solid', 'dashed', 'dotted'] as const;

/**
 * A line style.
 */
export type LineDash = (typeof LINE_DASHES)[number];

/**
 * How a table marks its emphasized rows: an accent-tinted `fill`, accent `text`, or an accent `bar`
 * at the row's leading edge.
 */
export const TABLE_EMPHASIS = ['fill', 'text', 'bar'] as const;

/**
 * A table emphasis style.
 */
export type TableEmphasis = (typeof TABLE_EMPHASIS)[number];

/**
 * `Intl.NumberFormat` notations charts use: `compact` writes 1.2M, `standard` writes 1,200,000.
 */
export const NUMBER_NOTATIONS = ['standard', 'compact'] as const;

/**
 * A number notation.
 */
export type NumberNotation = (typeof NUMBER_NOTATIONS)[number];

/**
 * When a formatted delta shows its sign, as `Intl.NumberFormat`'s `signDisplay` reads it.
 */
export const SIGN_DISPLAYS = ['auto', 'always', 'exceptZero'] as const;

/**
 * A sign display.
 */
export type SignDisplay = (typeof SIGN_DISPLAYS)[number];

/**
 * Most fraction digits a chart number may show; more is false precision on a slide.
 */
export const MAX_FRACTION_DIGITS = 4;

/**
 * ISO 4217 currency codes: three capital letters.
 */
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * A role name, for chart colors that follow the surface they are drawn on.
 */
const RoleName = Schema.Literals(ROLE_NAMES);

/**
 * A type step name, for chart text.
 */
const TypeStepName = Schema.Literals(TYPE_STEPS);

/**
 * A stroke width name from `shape.stroke`.
 */
const StrokeName = Schema.Literals(STROKE_NAMES);

/**
 * A BCP 47 locale `Intl.NumberFormat` supports, such as `en-US` or `de-DE`.
 */
const Locale = Schema.String.check(
  Schema.makeFilter((value: string) => isSupportedLocale(value), {
    message: 'Expected a locale such as "en-US" or "de-DE"',
  }),
);

/**
 * Gridlines or an axis line: whether it is drawn, the role it takes its color from on each surface,
 * its stroke width and its dash.
 */
const ChartLine = Schema.Struct({
  show: Schema.optionalKey(Schema.Boolean),
  color: Schema.optionalKey(RoleName),
  stroke: Schema.optionalKey(StrokeName),
  dash: Schema.optionalKey(Schema.Literals(LINE_DASHES)),
});

/**
 * The axis line, plus whether it has tick marks.
 */
const ChartAxis = Schema.Struct({
  ...ChartLine.fields,
  ticks: Schema.optionalKey(Schema.Boolean),
});

/**
 * The type steps chart text uses, and the role axis and legend labels take their color from.
 */
const ChartLabels = Schema.Struct({
  axis: Schema.optionalKey(TypeStepName),
  value: Schema.optionalKey(TypeStepName),
  legend: Schema.optionalKey(TypeStepName),
  annotation: Schema.optionalKey(TypeStepName),
  color: Schema.optionalKey(RoleName),
});

/**
 * Number formatting defaults for charts, stats and tables, as `Intl.NumberFormat` options.
 */
const ChartNumbers = Schema.Struct({
  locale: Schema.optionalKey(Locale),
  notation: Schema.optionalKey(Schema.Literals(NUMBER_NOTATIONS)),
  currency: Schema.optionalKey(
    Schema.String.check(
      Schema.isPattern(CURRENCY_PATTERN, {
        message: 'Expected an ISO 4217 currency code such as "USD" or "EUR"',
      }),
    ),
  ),
  maximumFractionDigits: Schema.optionalKey(
    Schema.Int.check(
      Schema.isBetween(
        { minimum: 0, maximum: MAX_FRACTION_DIGITS },
        { message: `Expected a whole number of digits from 0 to ${MAX_FRACTION_DIGITS}` },
      ),
    ),
  ),
  signDisplay: Schema.optionalKey(Schema.Literals(SIGN_DISPLAYS)),
});

/**
 * Big numbers: the type step of the number and of its label, and the role the number takes its
 * color from.
 */
const ChartStat = Schema.Struct({
  step: Schema.optionalKey(TypeStepName),
  label: Schema.optionalKey(TypeStepName),
  color: Schema.optionalKey(RoleName),
});

/**
 * Tables: header and body type steps, how emphasized rows are marked, the rule between rows and
 * whether rows alternate in tint.
 */
const ChartTable = Schema.Struct({
  header: Schema.optionalKey(TypeStepName),
  body: Schema.optionalKey(TypeStepName),
  emphasis: Schema.optionalKey(Schema.Literals(TABLE_EMPHASIS)),
  rule: Schema.optionalKey(StrokeName),
  zebra: Schema.optionalKey(Schema.Boolean),
});

/**
 * The `charts` section of a brand: gridlines, axes, label type, number formatting, and stat and
 * table styles. Every field is optional and defaults from the roles and the type scale; colors are
 * role names, so they follow the surface a chart is drawn on.
 */
export const BrandCharts = Schema.Struct({
  grid: Schema.optionalKey(ChartLine),
  axis: Schema.optionalKey(ChartAxis),
  labels: Schema.optionalKey(ChartLabels),
  numbers: Schema.optionalKey(ChartNumbers),
  stat: Schema.optionalKey(ChartStat),
  table: Schema.optionalKey(ChartTable),
});

/**
 * A decoded `charts` section.
 */
export type BrandCharts = typeof BrandCharts.Type;

/**
 * Whether `Intl.NumberFormat` knows a locale; a malformed tag counts as unknown.
 *
 * @param value - A BCP 47 tag as written.
 */
function isSupportedLocale(value: string): boolean {
  try {
    return Intl.NumberFormat.supportedLocalesOf([value]).length > 0;
  } catch {
    return false;
  }
}
