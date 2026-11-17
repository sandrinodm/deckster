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
 * The shortest part a name shares with a candidate for the candidate to count as close whatever its
 * edit distance: `spot` finds `spotlight`.
 */
const MIN_SHARED_LENGTH = 3;

/**
 * The name closest to a misspelt or unknown one, for a "did you mean" fix: the candidate fewest
 * edits away within a few edits (more for a longer name), else one that contains the name or that
 * the name contains. Ties go to the earlier candidate.
 *
 * @param name - The name as written.
 * @param candidates - The names that exist.
 * @returns The closest candidate, or `undefined` when none is close.
 */
export function nearestName(name: string, candidates: readonly string[]): string | undefined {
  const wanted = name.toLowerCase();
  const budget = Math.max(MIN_EDIT_BUDGET, Math.ceil(wanted.length / CHARACTERS_PER_EDIT));
  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    const distance = editDistance(wanted, lower);
    const close = distance <= budget || sharesLongPart(wanted, lower);
    if (close && (best === undefined || distance < best.distance)) {
      best = { candidate, distance };
    }
  }

  return best?.candidate;
}

/**
 * Whether one name contains the other and the shorter is at least {@link MIN_SHARED_LENGTH}
 * characters.
 *
 * @param a - A name, in lower case.
 * @param b - Another, in lower case.
 */
function sharesLongPart(a: string, b: string): boolean {
  return Math.min(a.length, b.length) >= MIN_SHARED_LENGTH && (a.includes(b) || b.includes(a));
}

/**
 * The Damerau-Levenshtein distance (with adjacent swaps) between two strings.
 *
 * @param a - A string.
 * @param b - Another.
 */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 || j === 0 ? i + j : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    const row = rows[i] ?? [];
    const above = rows[i - 1] ?? [];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min((above[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (above[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (rows[i - 2]?.[j - 2] ?? 0) + 1);
      }

      row[j] = best;
    }
  }

  return rows[a.length]?.[b.length] ?? 0;
}
