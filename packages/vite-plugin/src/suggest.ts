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
    const distance = editDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Levenshtein distance, counting an adjacent swap ("layuot") as one edit.
 */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => initialCell(i, j)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i]![j] = cellDistance(rows, a, b, i, j);
    }
  }

  return rows[a.length]![b.length]!;
}

/**
 * The starting value of a cell in the distance table: the first row and column count insertions and
 * deletions, every other cell is filled in later.
 *
 * @param i - The row, a position in the first word.
 * @param j - The column, a position in the second word.
 */
function initialCell(i: number, j: number): number {
  if (i === 0) {
    return j;
  }

  return j === 0 ? i : 0;
}

/**
 * The edit distance between the first `i` letters of `a` and the first `j` of `b`, from the cells
 * already filled in.
 *
 * @param rows - The distance table so far.
 * @param a - The first word.
 * @param b - The second word.
 * @param i - The row.
 * @param j - The column.
 */
function cellDistance(rows: number[][], a: string, b: string, i: number, j: number): number {
  const cost = a[i - 1] === b[j - 1] ? 0 : 1;

  /**
   * Reads a filled-in cell of the table.
   */
  const at = (row: number, column: number): number => rows[row]![column]!;
  const best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
  const isSwap = i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
  return isSwap ? Math.min(best, at(i - 2, j - 2) + 1) : best;
}
