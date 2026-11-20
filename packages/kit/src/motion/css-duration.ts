/**
 * A CSS time in seconds or milliseconds. Production CSS can use either unit.
 */
const CSS_TIME_PATTERN = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)(ms|s)$/i;

/**
 * The number of milliseconds in a second.
 */
const MS_PER_SECOND = 1000;

/**
 * Converts a CSS duration to milliseconds, or returns `undefined` for a missing, invalid or
 * negative value.
 *
 * @param css - The computed value of a duration token, for example `480ms` or `.48s`.
 */
export function cssDurationMs(css: string): number | undefined {
  const match = CSS_TIME_PATTERN.exec(css.trim());
  if (match === null) {
    return undefined;
  }

  const value = Number(match[1]);
  const duration = match[2]?.toLowerCase() === 's' ? value * MS_PER_SECOND : value;
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}
