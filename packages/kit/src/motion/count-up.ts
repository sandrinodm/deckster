/**
 * A figure that can count: an optional sign, digits with or without comma thousands separators, and
 * an optional decimal part after a point, such as `18.6`, `1,250,000` or `−12`.
 */
const COUNT_PATTERN = /^([+−-]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/u;

/**
 * A plain four-digit number from 1000 to 2999 with no sign, separator or decimals, which on a slide
 * is almost always a year and must not count up from 0.
 */
const YEAR_PATTERN = /^[12]\d{3}$/u;

/**
 * A figure written only with zeros, decimal points and separators, such as `0` or `0.00`. A count
 * at such a figure shows without its minus sign.
 */
const ZERO_PATTERN = /^[0.,]+$/u;

/**
 * Three digits from the right of an integer, for inserting thousands separators.
 */
const THOUSANDS_PATTERN = /\B(?=(\d{3})+(?!\d))/gu;

/**
 * The fewest distinct values a count must pass through, in units of its last digit: a figure under
 * 10 of them (`2 days`, `7%`) flickers through a few values instead of counting, so it stays
 * still.
 */
const MIN_COUNT_UNITS = 10;

/**
 * A figure parsed for counting up from zero.
 */
export type CountValue = {
  /**
   * The text as written; a count at its end shows exactly this.
   */
  text: string;

  /**
   * The sign written before the digits: empty, `+`, `−` or `-`.
   */
  sign: string;

  /**
   * The size of the value, without its sign.
   */
  magnitude: number;

  /**
   * The digits after the decimal point, kept at every point of the count.
   */
  decimals: number;

  /**
   * Whether the integer part is written with comma thousands separators.
   */
  grouped: boolean;
};

/**
 * Parses the number part of a stat (as `splitStat` gives it) for counting up. Only a plain figure
 * counts: an optional sign, digits with or without comma thousands separators, and decimals after a
 * point. A comparison (`<5`, `~40`), a range (`12–15`), text (`1 in 4`), other separators, a value
 * that reads as a year (`2025`), zero, a value with fewer than ten steps in its last digit (`2`,
 * `7`, `0.5`) and one that would not be written back exactly as given (`007`) do not count.
 *
 * @param number - The number part of a stat, such as `18.6` from `$18.6M`.
 * @returns The parsed figure, or `undefined` when it must not count.
 */
export function parseCount(number: string): CountValue | undefined {
  const match = COUNT_PATTERN.exec(number);
  if (match === null) {
    return undefined;
  }

  const [, sign = '', whole = '', fraction = ''] = match;
  if (sign === '' && fraction === '' && YEAR_PATTERN.test(whole)) {
    return undefined;
  }

  const decimals = fraction.length;
  const magnitude = Number(`${whole.replaceAll(',', '')}.${fraction === '' ? '0' : fraction}`);
  const count: CountValue = {
    text: number,
    sign,
    magnitude,
    decimals,
    grouped: whole.includes(','),
  };
  const units = magnitude * 10 ** decimals;
  if (units < MIN_COUNT_UNITS || `${sign}${digitsOf(count, magnitude)}` !== number) {
    return undefined;
  }

  return count;
}

/**
 * The text a count shows at a point of its run: the value at that share of the way from zero,
 * written with the figure's decimals, separators and sign, so it never has more digits than the
 * final value. A minus sign is left off while the value is still zero; a plus sign stays.
 *
 * @param count - The figure, from {@link parseCount}.
 * @param progress - How far the count has run, 0 to 1 (eased); clamped to that range. At 1 or more
 *   it is the figure exactly as written.
 * @returns The text to show.
 */
export function countText(count: CountValue, progress: number): string {
  if (progress >= 1) {
    return count.text;
  }

  const digits = digitsOf(count, count.magnitude * Math.max(progress, 0));
  const negative = count.sign === '−' || count.sign === '-';
  if (negative && ZERO_PATTERN.test(digits)) {
    return digits;
  }

  return `${count.sign}${digits}`;
}

/**
 * A value written with the figure's decimals and separators, without a sign.
 *
 * @param count - The figure.
 * @param value - The value, 0 or more.
 */
function digitsOf(count: CountValue, value: number): string {
  const fixed = value.toFixed(count.decimals);
  if (!count.grouped) {
    return fixed;
  }

  const [whole = '', fraction] = fixed.split('.');
  const grouped = whole.replace(THOUSANDS_PATTERN, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
