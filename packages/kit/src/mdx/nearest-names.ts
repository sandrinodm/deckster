/**
 * The shortest part a name shares with a candidate for the candidate to count as close whatever its
 * edit distance: `arrow` finds `arrow-right`.
 */
const MIN_SHARED_LENGTH = 3;

/**
 * The fewest edits a candidate may be away from the name and still count as close, however short
 * the name is.
 */
const MIN_EDIT_BUDGET = 2;

/**
 * How many characters of the name each allowed edit covers: a longer name may be further away.
 */
const CHARACTERS_PER_EDIT = 3;

/**
 * The names closest to a misspelt or unknown one, closest first: those within a few edits (more for
 * a longer name), those that contain it, and those it contains that make up at least half of it
 * (`leafs` finds `leaf`, `nonexistent` does not find `tent`).
 *
 * @param name - The name as written.
 * @param candidates - The names that exist.
 * @param limit - The most names to return.
 */
export function nearestNames(name: string, candidates: Iterable<string>, limit: number): string[] {
  const wanted = name.toLowerCase();
  const maxDistance = Math.max(MIN_EDIT_BUDGET, Math.ceil(wanted.length / CHARACTERS_PER_EDIT));
  const close: { candidate: string; distance: number; shared: boolean }[] = [];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    const shared = sharesLongPart(wanted, lower);
    const distance = editDistance(wanted, lower);
    if (distance <= maxDistance || shared) {
      close.push({ candidate, distance, shared });
    }
  }

  return close
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        Number(b.shared) - Number(a.shared) ||
        a.candidate.localeCompare(b.candidate),
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

/**
 * Whether a candidate contains the name, or the name contains a candidate that is at least half of
 * it. Both must be at least `MIN_SHARED_LENGTH` characters, so a short name finds nothing this
 * way.
 *
 * @param wanted - The name, in lower case.
 * @param candidate - A candidate, in lower case.
 */
function sharesLongPart(wanted: string, candidate: string): boolean {
  if (Math.min(wanted.length, candidate.length) < MIN_SHARED_LENGTH) {
    return false;
  }

  return (
    candidate.includes(wanted) ||
    (wanted.includes(candidate) && candidate.length * 2 >= wanted.length)
  );
}

/**
 * Whether the prefixes `a[0..i)` and `b[0..j)` end in two characters swapped, such as `ab` and
 * `ba`.
 *
 * @param a - A string.
 * @param b - Another.
 * @param i - The length of the prefix of `a`.
 * @param j - The length of the prefix of `b`.
 */
function isAdjacentSwap(a: string, b: string, i: number, j: number): boolean {
  return i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
}

/**
 * The Damerau–Levenshtein distance (with adjacent swaps) between two strings.
 *
 * @param a - A string.
 * @param b - Another.
 */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 || j === 0 ? i + j : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    const row = rows[i] as number[];
    const above = rows[i - 1] as number[];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min((above[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (above[j - 1] ?? 0) + cost);
      if (isAdjacentSwap(a, b, i, j)) {
        best = Math.min(best, ((rows[i - 2] as number[])[j - 2] ?? 0) + 1);
      }

      row[j] = best;
    }
  }

  return (rows[a.length] as number[])[b.length] ?? 0;
}
