/**
 * Splits a stat into the text before its number, the number and the text after it: `$18.6M` is `$`,
 * `18.6`, `M`. The number may carry a sign, a comparison (`<5`, `~40`), thousands separators and a
 * range (`12–15`).
 */
const STAT_PATTERN =
  /^(\D*?)([<>≤≥~≈±]?\s?[+−-]?\d(?:[\d.,]*\d)?(?:\s?[–-]\s?\d(?:[\d.,]*\d)?)?)(\s*)(.*)$/u;

/**
 * Comparison and approximation signs, set at the figure's size as part of the number rather than as
 * a unit.
 */
const OPERATOR_PATTERN = /^[<>≤≥~≈±]/u;

/**
 * A digit anywhere in a string.
 */
const DIGIT_PATTERN = /\d/u;

/**
 * A hyphen typed in place of a minus sign at the start of a number.
 */
const LEADING_HYPHEN_PATTERN = /^-/u;

/**
 * A hyphen typed between the two ends of a range, such as `12-15`.
 */
const RANGE_HYPHEN_PATTERN = /(?<=\d)\s?-\s?(?=\d)/u;

/**
 * The most characters a stat's text before its number may take: a currency sign or a short unit,
 * but not a sentence.
 */
const MAX_PREFIX_CHARS = 2;

/**
 * Arrows a delta may start with; the layout draws its own arrow instead.
 */
const ARROWS = new Set(['▲', '▼', '↑', '↓']);

/**
 * Signs that mark a delta as an increase.
 */
const UP_SIGNS = new Set(['+', '▲', '↑']);

/**
 * Signs that mark a delta as a decrease: the minus sign, the hyphen and arrows.
 */
const DOWN_SIGNS = new Set(['−', '-', '–', '▼', '↓']);

/**
 * A stat split for display: the number set large, the unit text around it set smaller.
 */
export type StatParts = {
  /**
   * Text before the number, such as a currency sign; empty when there is none.
   */
  prefix: string;

  /**
   * The number as written, or the whole value when it has no number (such as "1 in 4" stays whole,
   * as does "Zero").
   */
  number: string;

  /**
   * Text after the number, such as `%`, `°C` or `M`; empty when there is none.
   */
  suffix: string;

  /**
   * Whether the value has a space between the number and the suffix (`4.1 °C`, `5 min`), which the
   * layout keeps as a gap so the unit never touches the figure.
   */
  spaced: boolean;
};

/**
 * Which way a delta points.
 */
export type DeltaDirection = 'up' | 'down' | 'flat';

/**
 * Whether a change is good, bad or neither, which sets its color.
 */
export type DeltaTone = 'positive' | 'negative' | 'neutral';

/**
 * Splits a stat into prefix, number and suffix, so the layout can set the unit smaller than the
 * figure. A value with text between numbers ("1 in 4") or with no number stays whole, in `number`.
 *
 * @param value - The stat as the slide writes it, such as `34%`, `$18.6M` or `4.1 °C`.
 */
export function splitStat(value: string): StatParts {
  const trimmed = value.trim();
  const whole = { prefix: '', number: trimmed, suffix: '', spaced: false };
  const match = STAT_PATTERN.exec(trimmed);
  if (match === null) {
    return whole;
  }

  const [, prefix = '', number = '', space = '', suffix = ''] = match;
  if (DIGIT_PATTERN.test(suffix) || prefix.length > MAX_PREFIX_CHARS) {
    return whole;
  }

  // A prefix that is a comparison (`<`, `~`) belongs to the figure; a currency sign is a unit.
  const operator = OPERATOR_PATTERN.test(prefix);
  return {
    prefix: operator ? '' : prefix.trim(),
    number: `${operator ? prefix.trim() : ''}${normalizeNumber(number)}`,
    suffix: suffix.trim(),
    spaced: space !== '' && suffix !== '',
  };
}

/**
 * Which way a delta points: the slide's own `trend` when it gives one, else from the delta's first
 * character (`+` or an up arrow is up, a minus, hyphen, en dash or down arrow is down, anything
 * else is flat).
 *
 * @param delta - The delta as the slide writes it, such as `+12% since 2023`.
 * @param trend - The direction the slide sets, for a delta written without a sign.
 */
export function deltaDirection(delta: string, trend?: DeltaDirection): DeltaDirection {
  if (trend !== undefined) {
    return trend;
  }

  const first = delta.trim().charAt(0);
  if (UP_SIGNS.has(first)) {
    return 'up';
  }

  return DOWN_SIGNS.has(first) ? 'down' : 'flat';
}

/**
 * The tone a delta is shown in: the slide's own `tone` when it gives one, else positive for an
 * increase and negative for a decrease. Give `tone` whenever down is good (fewer hospital visits)
 * or up is bad.
 *
 * @param delta - The delta text.
 * @param tone - The tone the slide sets, if any.
 * @param trend - The direction the slide sets, if any.
 */
export function deltaTone(
  delta: string,
  tone: DeltaTone | undefined,
  trend?: DeltaDirection,
): DeltaTone {
  if (tone !== undefined) {
    return tone;
  }

  switch (deltaDirection(delta, trend)) {
    case 'up': {
      return 'positive';
    }

    case 'down': {
      return 'negative';
    }

    case 'flat': {
      return 'neutral';
    }
  }
}

/**
 * The delta text without its leading sign or arrow, which the layout draws as an arrow instead.
 *
 * @param delta - The delta text.
 */
export function deltaText(delta: string): string {
  const trimmed = delta.trim();
  if (ARROWS.has(trimmed.charAt(0))) {
    return trimmed.slice(1).trim();
  }

  return trimmed;
}

/**
 * A number as the layout sets it: a typed hyphen before it, or between the ends of a range, becomes
 * the true minus sign or an en dash, which have the width and height of the figures.
 *
 * @param number - The number part of a stat.
 */
function normalizeNumber(number: string): string {
  return number.trim().replace(LEADING_HYPHEN_PATTERN, '−').replace(RANGE_HYPHEN_PATTERN, '–');
}
