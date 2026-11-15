import type { ChartTokens } from '@deckster/brand';

import { maxOf } from '#foundation/lists.ts';

/**
 * The brand's number defaults, from its `charts.numbers` tokens.
 */
export type NumberDefaults = ChartTokens['numbers'];

/**
 * Below this magnitude a compact number is written in full: 1,240 rather than 1.2K.
 */
export const COMPACT_FROM = 10_000;

/**
 * The true minus sign, which has the width of a figure, in place of the hyphen `Intl` writes.
 */
const MINUS = '−';

/**
 * Hyphen-minus characters `Intl.NumberFormat` writes for negative numbers.
 */
const HYPHEN = /-/gu;

/**
 * Units written straight after the number, without a space: `34%`, `1.45×`.
 */
const TIGHT_UNITS = new Set(['%', '×', 'x', '‰', 'K', 'M', 'B', 'T', 'bn', 'mn']);

/**
 * Units that are a scale (thousands, millions), written tight like compact notation: `$1.2M`. With
 * one of them a currency keeps its sign and the value takes the brand's digits, not cents.
 */
const MAGNITUDE_UNITS = new Set(['K', 'M', 'B', 'T', 'bn', 'mn']);

/**
 * The most fraction digits any format writes.
 */
const MAX_DIGITS = 4;

/**
 * Slack, in units of the last displayed digit, when deciding whether a value is whole at some
 * number of digits: float noise only, so a cent never counts as noise whatever the magnitude.
 */
const WHOLE_EPSILON = 1e-9;

/**
 * The most fraction digits an axis label takes when its step is small: more than any other format
 * writes, so steps of a thousandth stay apart.
 */
const MAX_TICK_DIGITS = 8;

/**
 * The space between a number and a unit symbol.
 */
const THIN_SPACE = '\u2009';

/**
 * A unit that is a word of three letters or more rather than a symbol.
 */
const WORD_UNIT = /^\p{L}{3,}$/u;

/**
 * Slack when counting the significant digits a value under 1 needs, so a value a hair under a power
 * of ten does not gain a digit.
 */
const SIGNIFICANT_EPSILON = 1e-9;

/**
 * A fraction times this is a percentage: 0.34 is 34%.
 */
const PERCENT_SCALE = 100;

/**
 * A percentage change under this size gets one decimal place (+7.5%); larger ones get none (+12%).
 */
const ONE_DECIMAL_CHANGE_LIMIT = 10;

/**
 * The largest ratio between a change's base and the other value for which the change still reads as
 * a percentage: a base under a hundredth of the other value would make one in the thousands.
 */
const MAX_RELATIVE_RATIO = 100;

/**
 * Compact notation steps by a power of a thousand: 10 to the third for K, to the sixth for M.
 */
const COMPACT_EXPONENT_STEP = 3;

/**
 * The largest power of ten compact notation writes, trillions (T); larger values stay in trillions.
 */
const MAX_COMPACT_EXPONENT = 12;

/**
 * Format names a chart's `format` prop takes, for the common cases.
 *
 * - `number`: the brand's notation (compact by default: 1.2M), as many digits as it allows.
 * - `standard`: every digit, 1,240,000.
 * - `compact`: 1.2M, 12K; under 10,000 in full.
 * - `currency`: the brand's currency, compact: $4.2M.
 * - `percent`: values already in percent, 34 is `34%`.
 * - `delta`, `percent-delta`, `currency-delta`: the same, always signed: `+12`, `−3.5%`, `+$1.2M`.
 */
export const FORMAT_NAMES = [
  'number',
  'standard',
  'compact',
  'currency',
  'percent',
  'delta',
  'percent-delta',
  'currency-delta',
] as const;

/**
 * One of {@link FORMAT_NAMES}.
 */
export type FormatName = (typeof FORMAT_NAMES)[number];

/**
 * A format spelled out, for what the names do not cover. Unset fields come from the brand.
 */
export type FormatOptions = {
  /**
   * `percent` values are in percent already (34 is 34%); `currency` adds the currency sign.
   */
  style?: 'number' | 'currency' | 'percent';

  /**
   * `compact` writes 1.2M; `standard` every digit.
   */
  notation?: 'standard' | 'compact';

  /**
   * An ISO 4217 currency code, such as `EUR`.
   */
  currency?: string;

  /**
   * The fraction digits to show, 0 to 4: exactly this many (`digits: 2` writes 6.10). When left
   * out, the brand's most digits, dropping trailing zeros; currency in full writes cents or none.
   */
  digits?: number;

  /**
   * Always show the sign, for changes: `+12`.
   */
  signed?: boolean;
};

/**
 * What a chart's `format` prop takes: a name or options.
 */
export type FormatProp = FormatName | FormatOptions;

/**
 * A format with every choice made, from the chart's props and the brand's defaults.
 */
export type ResolvedFormat = {
  /**
   * The BCP 47 locale.
   */
  locale: string;

  /**
   * Plain, currency or percent (values in percent).
   */
  style: 'number' | 'currency' | 'percent';

  /**
   * Compact or standard notation.
   */
  notation: 'standard' | 'compact';

  /**
   * The currency code.
   */
  currency: string;

  /**
   * The most fraction digits.
   */
  digits: number;

  /**
   * The fewest fraction digits: `digits` when the chart set them, else 0.
   */
  minDigits: number;

  /**
   * Whether the chart set `digits`, which then hold for every value; otherwise a value under 1
   * keeps one significant digit and currency in full writes cents or none.
   */
  fixed: boolean;

  /**
   * Whether every value shows its sign.
   */
  signed: boolean;

  /**
   * Text after the number, such as `%` or ` ms`; empty for none.
   */
  suffix: string;
};

/**
 * Makes the format a chart writes its numbers in: the named or spelled-out format over the brand's
 * defaults, with the unit as a suffix. A unit of `%`, `×` or `‰` sits against the number; any other
 * gets a space (`12 ms`, `4.1 °C`).
 *
 * @param format - The chart's `format` prop; the brand's plain number format when left out.
 * @param unit - The chart's `unit` prop, such as `ms`, `°C` or `trees`; ignored for `percent`.
 * @param defaults - The brand's `charts.numbers` tokens.
 */
export function resolveFormat(
  format: FormatProp | undefined,
  unit: string | undefined,
  defaults: NumberDefaults,
): ResolvedFormat {
  const options = optionsOf(format);
  const style = options.style ?? 'number';
  const digits = clampDigits(options.digits ?? defaults.maximumFractionDigits);
  const fixed = options.digits !== undefined;
  return {
    locale: defaults.locale,
    style,
    notation: style === 'percent' ? 'standard' : (options.notation ?? defaults.notation),
    currency: options.currency ?? defaults.currency,
    digits,
    minDigits: fixed ? digits : 0,
    fixed,
    signed: options.signed ?? false,
    suffix: style === 'percent' ? '%' : unitSuffix(unit),
  };
}

/**
 * A figure's own format over its group's: the item's `format` when it sets one; else the group's,
 * except that an item `unit` (other than a scale such as `M`) resets the group's style, so a row in
 * currency does not write `$12.5%` for an item in percent.
 *
 * @param item - The item's own `format` and `unit`.
 * @param group - The group's (a StatRow's, a Progress's) `format` and `unit`.
 * @returns The `format` and `unit` to resolve.
 */
export function itemFormat(
  item: { format?: FormatProp | undefined; unit?: string | undefined },
  group: { format?: FormatProp | undefined; unit?: string | undefined },
): { format: FormatProp | undefined; unit: string | undefined } {
  const unit = item.unit ?? group.unit;
  if (item.format !== undefined || item.unit === undefined || group.format === undefined) {
    return { format: item.format ?? group.format, unit };
  }

  if (MAGNITUDE_UNITS.has(item.unit.trim())) {
    return { format: group.format, unit };
  }

  return { format: keptFormat(optionsOf(group.format)), unit };
}

/**
 * Whether a change between two values in this format is written in points by default: values in
 * percent change by points (84% to 91% is +7 pts), everything else as a percentage of the first.
 *
 * @param format - The figure's resolved format.
 * @returns The default of `relative`: `false` for values in percent, `true` otherwise.
 */
export function defaultRelative(format: ResolvedFormat): boolean {
  return !isPercent(format);
}

/**
 * Writes one value in a format: compact under the brand's notation from 10,000 up, the currency
 * sign, the unit, and the true minus sign. `signed` formats write `+` on increases and nothing on
 * zero.
 *
 * @param value - The number; `NaN` and infinities are written as an em dash.
 * @param format - The resolved format.
 * @param digits - Overrides the format's fraction digits, as axis ticks do to keep them even.
 * @param compactRun - Whether the run the value belongs to is compact, from {@link runFormatter};
 *   decided from the value alone when left out.
 * @param cents - Whether currency written in full shows cents, from {@link runFormatter}; decided
 *   from the value alone when left out.
 */
export function formatValue(
  value: number,
  format: ResolvedFormat,
  digits?: number,
  compactRun?: boolean,
  cents?: boolean,
): string {
  if (!Number.isFinite(value)) {
    return '—';
  }

  const compact = format.notation === 'compact' && (compactRun ?? Math.abs(value) >= COMPACT_FROM);
  const [minimum, maximum] =
    digits === undefined ? valueDigits(value, format, compact, cents) : [digits, digits];
  const options: Intl.NumberFormatOptions = {
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: maximum,
    minimumFractionDigits: minimum,
    signDisplay: format.signed ? 'exceptZero' : 'auto',
    ...(format.style === 'currency' ? { style: 'currency', currency: format.currency } : {}),
  };
  const text = new Intl.NumberFormat(format.locale, options).format(value);
  return `${text.replace(HYPHEN, MINUS)}${format.suffix}`;
}

/**
 * The fewest and most fraction digits a value is written with: the format's own when it fixes them;
 * cents or none for currency written in full (never one decimal: $6.10, $6); else up to the
 * format's digits, more for a value under 1 so it keeps two significant digits (0.05, 0.95, not 0.1
 * and 1).
 *
 * @param value - The value.
 * @param format - The resolved format.
 * @param compact - Whether the value is written in compact notation.
 * @param cents - Whether the run it belongs to has cents, from {@link runFormatter}.
 */
function valueDigits(
  value: number,
  format: ResolvedFormat,
  compact: boolean,
  cents: boolean | undefined,
): [number, number] {
  if (format.fixed) {
    return [format.minDigits, format.digits];
  }

  if (format.style === 'currency' && !compact && !hasMagnitudeSuffix(format)) {
    const withCents = cents ?? !isWholeAt(value, 0);
    return withCents ? [2, 2] : [0, 0];
  }

  const magnitude = Math.abs(compact ? value / compactUnit(Math.abs(value)) : value);
  // A compact value that is not whole in its unit keeps its decimal: $1.0B, not $1B, for 1.03
  // billion.
  if (compact && format.digits > 0 && !isWholeAt(magnitude, 0)) {
    return [format.digits, format.digits];
  }

  if (magnitude > 0 && magnitude < 1) {
    // Two significant digits: 0.95, 0.05, 0.12.
    const significant = Math.ceil(-Math.log10(magnitude) - SIGNIFICANT_EPSILON) + 1;
    return [format.minDigits, Math.min(MAX_DIGITS, Math.max(format.digits, significant))];
  }

  return [format.minDigits, format.digits];
}

/**
 * A formatter for a run of values shown together (the labels of one chart): compact or not for all
 * of them, decided by the largest, so `18.4K` never sits beside `9,310`.
 *
 * @param values - Every value the run shows.
 * @param format - The resolved format.
 * @returns A function that writes one value.
 */
export function runFormatter(
  values: readonly number[],
  format: ResolvedFormat,
): (value: number) => string {
  const largest = maxOf(
    values.map((value) => Math.abs(value)),
    0,
  );
  const compact = format.notation === 'compact' && largest >= COMPACT_FROM;
  // Currency in full writes cents on every value of the run or on none.
  const cents = values.some((value) => Number.isFinite(value) && !isWholeAt(value, 0));
  return (value) => formatValue(value, format, undefined, compact, cents);
}

/**
 * Writes a change between two values, always signed: in the format's own unit, or relative to the
 * first value as a percentage. A relative change across zero or from a value near zero (a loss
 * turning into a profit) means nothing as a percentage, so it is written in the unit instead. An
 * absolute change of values in percent is written in points: `+7 pts`.
 *
 * @param from - The value before.
 * @param to - The value after.
 * @param format - The chart's format, for an absolute change.
 * @param relative - Write the change as a percentage of `from`, where that means something.
 */
export function formatChange(
  from: number,
  to: number,
  format: ResolvedFormat,
  relative: boolean,
): string {
  if (relative && relativeMeaningful(from, to)) {
    const percent = ((to - from) / Math.abs(from)) * PERCENT_SCALE;
    const digits = Math.abs(percent) < ONE_DECIMAL_CHANGE_LIMIT ? 1 : 0;
    return formatValue(percent, {
      ...format,
      style: 'percent',
      suffix: '%',
      signed: true,
      digits,
      minDigits: 0,
      fixed: true,
    });
  }

  const change = to - from;
  if (isPercent(format)) {
    const points = Math.abs(change) === 1 ? ' pt' : ' pts';
    return formatValue(change, { ...format, style: 'number', signed: true, suffix: points });
  }

  return formatValue(change, { ...format, signed: true });
}

/**
 * Whether a change from one value to another reads as a percentage: both on the same side of zero
 * and the first not near zero next to the second.
 *
 * @param from - The value before.
 * @param to - The value after.
 */
export function relativeMeaningful(from: number, to: number): boolean {
  if (from === 0 || crossesZero(from, to)) {
    return false;
  }

  return Math.abs(from) * MAX_RELATIVE_RATIO >= Math.abs(to);
}

/**
 * Whether a change runs from one side of zero to the other, a loss turning into a profit.
 *
 * @param from - The value before.
 * @param to - The value after.
 */
function crossesZero(from: number, to: number): boolean {
  return (from < 0 && to > 0) || (from > 0 && to < 0);
}

/**
 * The labels of a run of evenly spaced values (axis ticks): each written in its own compact unit
 * (as `Intl` writes it: 500K, 1M) with the fraction digits its unit needs, the same for every tick
 * in that unit, and none where every tick in it is whole: `0`, `500K`, `1M`, `1.5M` rather than
 * `0.0`, `500.0K`, `1.0M`. The brand's digits are the default, not a cap: a step of a thousandth
 * gets three digits.
 *
 * @param ticks - The tick values.
 * @param format - The resolved format; its sign is dropped.
 * @returns One label per tick.
 */
export function tickTexts(ticks: readonly number[], format: ResolvedFormat): string[] {
  const largest = maxOf(
    ticks.map((tick) => Math.abs(tick)),
    0,
  );
  const compact = format.notation === 'compact' && largest >= COMPACT_FROM;
  /**
   * The compact unit a tick is written in.
   */
  const unitOf = (tick: number): number => (compact ? compactUnit(Math.abs(tick)) : 1);
  const most = Math.max(format.digits, MAX_TICK_DIGITS);
  const needs = new Map<number, number>();
  for (const tick of ticks) {
    const unit = unitOf(tick);
    let digits = 0;
    while (digits < most && !isWholeAt(tick / unit, digits)) {
      digits += 1;
    }

    needs.set(unit, Math.max(needs.get(unit) ?? 0, digits));
  }

  const plain: ResolvedFormat = { ...format, signed: false };
  return ticks.map((tick) =>
    formatValue(tick, plain, tick === 0 ? 0 : (needs.get(unitOf(tick)) ?? 0), compact),
  );
}

/**
 * The fraction digits that keep a run of evenly spaced values (axis ticks) apart and even: none for
 * whole steps, one for steps of a tenth, and so on, up to the format's own limit. Compact values
 * are counted in their compact unit.
 *
 * @param step - The distance between ticks.
 * @param largest - The largest tick's magnitude, which decides the compact unit.
 * @param format - The resolved format.
 */
export function tickDigits(step: number, largest: number, format: ResolvedFormat): number {
  if (step <= 0 || !Number.isFinite(step)) {
    return 0;
  }

  const unit = format.notation === 'compact' && largest >= COMPACT_FROM ? compactUnit(largest) : 1;
  const scaled = step / unit;
  const most = Math.max(format.digits, 1);
  for (let digits = 0; digits < most; digits += 1) {
    if (isWholeAt(scaled, digits)) {
      return digits;
    }
  }

  return most;
}

/**
 * The Excel-style number format code for a resolved format, for native PowerPoint charts and
 * tables: `#,##0.0`, `$#,##0.0,,"M"` or `0"%"`.
 *
 * @param format - The resolved format.
 * @param largest - The largest magnitude shown, which decides the compact unit.
 */
export function excelFormat(format: ResolvedFormat, largest: number): string {
  const digits = format.digits > 0 ? `.${'0'.repeat(format.digits)}` : '';
  const prefix = format.style === 'currency' ? currencySymbol(format) : '';
  const compact = format.notation === 'compact' && largest >= COMPACT_FROM;
  const unit = compact ? compactUnit(largest) : 1;
  const commas = ','.repeat(Math.round(Math.log10(unit) / COMPACT_EXPONENT_STEP));
  const letter = compact ? compactLetter(unit) : '';
  const suffix = `${letter}${format.suffix}`;
  const quoted = suffix === '' ? '' : `"${suffix}"`;
  const sign = format.signed ? '+' : '';
  return `${sign}${prefix}#,##0${digits}${commas}${quoted}`;
}

/**
 * The options a format prop stands for: a name's options, a spelled-out format as it is, and
 * nothing when the prop is left out.
 *
 * @param format - The chart's `format` prop, or nothing.
 */
function optionsOf(format: FormatProp | undefined): FormatOptions {
  const resolved = format ?? {};
  if (typeof resolved !== 'string') {
    return resolved;
  }

  if (!FORMAT_NAMES.includes(resolved)) {
    throw new Error(
      `format="${resolved}" is not a format. Use one of: ${FORMAT_NAMES.join(', ')}, or an ` +
        'object such as `{ style: "currency", digits: 2 }`.',
    );
  }

  return namedFormat(resolved);
}

/**
 * The fields of a group's format an item keeps when it sets its own unit: notation, digits and
 * sign. The style and currency go, since the item's unit replaces them.
 *
 * @param options - The group's format options.
 */
function keptFormat(options: FormatOptions): FormatOptions {
  return {
    ...(options.notation === undefined ? {} : { notation: options.notation }),
    ...(options.digits === undefined ? {} : { digits: options.digits }),
    ...(options.signed === undefined ? {} : { signed: options.signed }),
  };
}

/**
 * The options a format name stands for.
 *
 * @param name - A format name.
 */
function namedFormat(name: FormatName): FormatOptions {
  switch (name) {
    case 'number': {
      return {};
    }

    case 'standard': {
      return { notation: 'standard' };
    }

    case 'compact': {
      return { notation: 'compact' };
    }

    case 'currency': {
      return { style: 'currency' };
    }

    case 'percent': {
      return { style: 'percent' };
    }

    case 'delta': {
      return { signed: true };
    }

    case 'percent-delta': {
      return { style: 'percent', signed: true };
    }

    case 'currency-delta': {
      return { style: 'currency', signed: true };
    }
  }
}

/**
 * The text a unit adds after a number.
 *
 * @param unit - The unit as the chart writes it, or nothing.
 */
function unitSuffix(unit: string | undefined): string {
  const trimmed = unit?.trim() ?? '';
  if (trimmed === '') {
    return '';
  }

  if (TIGHT_UNITS.has(trimmed)) {
    return trimmed;
  }

  // A symbol (h, ms, °C) sits a thin space away; a word (articles, days) a full one.
  return WORD_UNIT.test(trimmed) ? ` ${trimmed}` : `${THIN_SPACE}${trimmed}`;
}

/**
 * The power of a thousand compact notation divides a magnitude by: 1,000 for thousands, a million
 * for millions.
 *
 * @param largest - The magnitude.
 */
function compactUnit(largest: number): number {
  const steps = Math.floor(Math.log10(Math.max(largest, 1)) / COMPACT_EXPONENT_STEP);
  const exponent = steps * COMPACT_EXPONENT_STEP;
  return 10 ** Math.min(exponent, MAX_COMPACT_EXPONENT);
}

/**
 * The letter English compact notation writes for a unit: K, M, B or T.
 *
 * @param unit - A power of a thousand.
 */
function compactLetter(unit: number): string {
  const letters: Record<number, string> = { 1e3: 'K', 1e6: 'M', 1e9: 'B', 1e12: 'T' };
  return Object.hasOwn(letters, unit) ? (letters[unit] ?? '') : '';
}

/**
 * The currency sign a format writes, such as `$` or `€`.
 *
 * @param format - A currency format.
 */
function currencySymbol(format: ResolvedFormat): string {
  const parts = new Intl.NumberFormat(format.locale, {
    style: 'currency',
    currency: format.currency,
  }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value ?? '';
}

/**
 * Whether a value is whole once shifted by some fraction digits: 2.5 at one digit, 6 at none.
 *
 * @param value - The value.
 * @param digits - The fraction digits.
 */
function isWholeAt(value: number, digits: number): boolean {
  const shifted = value * 10 ** digits;
  const noise = Math.max(WHOLE_EPSILON, Math.abs(shifted) * Number.EPSILON * 2);
  return Math.abs(shifted - Math.round(shifted)) < noise;
}

/**
 * Whether a format writes values in percent: the `percent` style or a `%` unit.
 *
 * @param format - The resolved format.
 */
function isPercent(format: ResolvedFormat): boolean {
  return format.style === 'percent' || format.suffix === '%';
}

/**
 * Whether a format's unit is a scale (`M`, `K`), which acts as compact notation.
 *
 * @param format - The resolved format.
 */
function hasMagnitudeSuffix(format: ResolvedFormat): boolean {
  return MAGNITUDE_UNITS.has(format.suffix.trim());
}

/**
 * Fraction digits held between 0 and the most any format writes.
 *
 * @param digits - The digits asked for.
 */
function clampDigits(digits: number): number {
  return Math.min(MAX_DIGITS, Math.max(0, Math.round(digits)));
}
