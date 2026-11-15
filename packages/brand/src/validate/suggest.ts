/**
 * Edits allowed between a typo and the name it suggests; more reads as a different word.
 */
const MAX_SUGGESTION_DISTANCE = 2;

/**
 * Finds the known name closest to a misspelled one, for "did you mean" fixes.
 *
 * @param input - What the author wrote.
 * @param candidates - The valid names.
 * @returns The closest candidate within two edits, or `undefined` when none is that close.
 */
export function suggest(input: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = MAX_SUGGESTION_DISTANCE + 1;
  for (const candidate of candidates) {
    // Names whose lengths differ by more than the allowed edits cannot be close, and skipping
    // them keeps a very long input (a pasted file) from costing its length times each name's.
    if (Math.abs(candidate.length - input.length) > MAX_SUGGESTION_DISTANCE) {
      continue;
    }

    const distance = editDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * A fix that names the closest valid name, or lists them all when none is close.
 *
 * @param input - What the author wrote.
 * @param candidates - The valid names.
 * @param what - What the names are, such as "gradient".
 */
export function pickFrom(input: string, candidates: readonly string[], what: string): string {
  const closest = suggest(input, candidates);
  if (closest !== undefined) {
    return `Use "${closest}".`;
  }

  if (candidates.length === 0) {
    return `Define a ${what} first.`;
  }

  return `Use one of: ${candidates.join(', ')}.`;
}

/**
 * Levenshtein distance, counting an adjacent swap ("acnet") as one edit.
 */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  let beforePrevious = previous;
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (isAdjacentSwap(a, b, i, j)) {
        best = Math.min(best, beforePrevious[j - 2]! + 1);
      }

      current.push(best);
    }

    beforePrevious = previous;
    previous = current;
  }

  return previous[b.length]!;
}

/**
 * Whether the two characters ending at `a[i - 1]` and `b[j - 1]` are the same pair in swapped
 * order, such as "ac" and "ca". Only then can the swap count as one edit.
 *
 * @param a - The first string.
 * @param b - The second string.
 * @param i - The 1-based row of the distance table.
 * @param j - The 1-based column of the distance table.
 */
function isAdjacentSwap(a: string, b: string, i: number, j: number): boolean {
  return i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
}
