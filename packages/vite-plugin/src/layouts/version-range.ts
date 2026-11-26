/**
 * How many parts a full version has: major, minor and patch.
 */
const VERSION_PARTS = 3;

/**
 * One comparator of a range: an optional operator and a version of one to three numbers, such as
 * `>=0.10` or `<1`.
 */
const COMPARATOR_PATTERN = /^(>=|<=|>|<|=)?v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;

/**
 * A version: three numbers, with an optional prerelease or build suffix that is ignored.
 */
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

/**
 * What separates the comparators of a range.
 */
const COMPARATOR_SEPARATOR = /\s+/;

/**
 * The range forms {@link satisfiesRange} reads, in words, for messages.
 */
export const RANGE_RULE =
  'comparators joined by spaces, each an operator (>=, >, <=, < or =) and a version, ' +
  'such as ">=0.10 <0.12"';

/**
 * A version as numbers: major, minor, patch.
 */
type Version = readonly [number, number, number];

/**
 * Whether a version lies in a range. A range is one or more comparators joined by spaces, all of
 * which must hold: `>=0.10 <0.12`. A version with fewer than three numbers stands for every version
 * that starts with it, so `<0.12` ends before 0.12.0, `<=0.10` includes every 0.10.x, `>0.10`
 * starts at 0.11.0, and a bare `0.10` or `=0.10` means any 0.10.x. Prerelease suffixes of the
 * version are ignored. Carets, tildes, hyphen ranges and `||` are not read.
 *
 * @param version - A full version, such as `0.10.2`.
 * @param range - The range.
 * @returns Whether the version is in the range, or `undefined` when the version or the range cannot
 *   be read.
 */
export function satisfiesRange(version: string, range: string): boolean | undefined {
  const parsed = VERSION_PATTERN.exec(version.trim());
  const comparators = range.trim().split(COMPARATOR_SEPARATOR).filter(Boolean);
  if (parsed === null || comparators.length === 0) {
    return undefined;
  }

  const actual: Version = [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])];
  const results = comparators.map((comparator) => satisfiesComparator(actual, comparator));
  return results.includes(undefined) ? undefined : results.every((result) => result === true);
}

/**
 * Whether a version meets one comparator, or `undefined` when the comparator cannot be read.
 *
 * @param actual - The version.
 * @param comparator - One comparator, such as `>=0.10`.
 */
function satisfiesComparator(actual: Version, comparator: string): boolean | undefined {
  const match = COMPARATOR_PATTERN.exec(comparator);
  if (match === null) {
    return undefined;
  }

  const operator = match[1] ?? '=';
  const given = match
    .slice(2)
    .filter((part) => part !== undefined)
    .map(Number);
  const lowest = floorOf(given);
  const next = ceilingOf(given);
  switch (operator) {
    case '>=':
      return compare(actual, lowest) >= 0;
    case '>':
      return compare(actual, next) >= 0;
    case '<':
      return compare(actual, lowest) < 0;
    case '<=':
      return compare(actual, next) < 0;
    default:
      return compare(actual, lowest) >= 0 && compare(actual, next) < 0;
  }
}

/**
 * The lowest version that starts with the given numbers: `0.10` gives 0.10.0.
 *
 * @param given - One to three numbers.
 */
function floorOf(given: readonly number[]): Version {
  return [given[0] ?? 0, given[1] ?? 0, given[2] ?? 0];
}

/**
 * The lowest version above every version that starts with the given numbers: `0.10` gives 0.11.0,
 * and `0.10.2` gives 0.10.3.
 *
 * @param given - One to three numbers.
 */
function ceilingOf(given: readonly number[]): Version {
  const parts = [given[0] ?? 0, given[1] ?? 0, given[2] ?? 0];
  const last = Math.min(given.length, VERSION_PARTS) - 1;
  parts[last] = (parts[last] ?? 0) + 1;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Compares two versions: negative when the first is lower, zero when equal, positive when higher.
 *
 * @param left - A version.
 * @param right - Another version.
 */
function compare(left: Version, right: Version): number {
  for (let index = 0; index < VERSION_PARTS; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}
