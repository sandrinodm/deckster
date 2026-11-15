/**
 * The layout a slide uses when its frontmatter names none.
 */
export const DEFAULT_LAYOUT = 'default';

/**
 * The brand surface a slide uses when its frontmatter names none.
 */
export const DEFAULT_SURFACE = 'default';

/**
 * Matches a speaking budget such as `90s`, `2m` or `1m30s`: up to 999 minutes and 9999 seconds, so
 * a very long run of digits is rejected instead of becoming `Infinity`.
 */
export const BUDGET_PATTERN = /^(?=\d)(?:(\d{1,3})m)?(?:(\d{1,4})s)?$/;

/**
 * Seconds per minute, for converting a `1m30s` budget.
 */
const SECONDS_PER_MINUTE = 60;

/**
 * Converts a speaking budget from slide frontmatter to seconds.
 *
 * @param budget - A duration such as `90s`, `2m` or `1m30s`, or `undefined` when the slide has
 *   none.
 * @returns The duration in seconds, or `undefined` for a missing budget or one that does not match
 *   {@link BUDGET_PATTERN} (the build rejects those, so they only reach this from hand-built
 *   manifests).
 */
export function budgetSeconds(budget: string | undefined): number | undefined {
  if (budget === undefined) {
    return undefined;
  }

  const match = BUDGET_PATTERN.exec(budget);
  if (match === null) {
    return undefined;
  }

  const [, minutes = '0', seconds = '0'] = match;
  const total = Number(minutes) * SECONDS_PER_MINUTE + Number(seconds);
  return Number.isFinite(total) ? total : undefined;
}
