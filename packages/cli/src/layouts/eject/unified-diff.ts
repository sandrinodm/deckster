/**
 * A unified diff of two texts, line by line, as `diff -u` prints it. It is written here because the
 * CLI has no text-diff dependency and must not need a `diff` program on the machine.
 */

/**
 * The unchanged lines shown around each change.
 */
const CONTEXT_LINES = 3;

/**
 * One line of the comparison.
 */
type DiffLine = {
  /**
   * Whether the line is in both texts, only in the old one or only in the new one.
   */
  readonly kind: 'same' | 'removed' | 'added';

  /**
   * The line's text.
   */
  readonly text: string;
};

/**
 * The labels of the two sides of a diff.
 */
export type DiffLabels = {
  /**
   * The name printed after `---`.
   */
  readonly before: string;

  /**
   * The name printed after `+++`.
   */
  readonly after: string;
};

/**
 * Compares two texts line by line.
 *
 * @param before - The old text.
 * @param after - The new text.
 * @param labels - The names of the two sides.
 * @returns The unified diff with three lines of context and a trailing newline, or an empty string
 *   when the texts are the same. A missing final newline is not marked.
 */
export function unifiedDiff(before: string, after: string, labels: DiffLabels): string {
  if (before === after) {
    return '';
  }

  const lines = compareLines(splitLines(before), splitLines(after));
  const hunks = hunksOf(lines).map((hunk) => printHunk(lines, hunk));
  return [`--- ${labels.before}`, `+++ ${labels.after}`, ...hunks, ''].join('\n');
}

/**
 * Splits a text into lines, without an empty last line for a final newline.
 */
function splitLines(text: string): string[] {
  const lines = text.split('\n');
  return lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

/**
 * Lines up two lists of lines by their longest common subsequence.
 */
function compareLines(before: readonly string[], after: readonly string[]): DiffLine[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }

  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end += 1;
  }

  /**
   * A line both texts have.
   *
   * @param text - The line.
   */
  const same = (text: string): DiffLine => ({ kind: 'same', text });
  return [
    ...before.slice(0, start).map(same),
    ...compareMiddle(
      before.slice(start, before.length - end),
      after.slice(start, after.length - end),
    ),
    ...before.slice(before.length - end).map(same),
  ];
}

/**
 * Lines up the parts of two texts that differ, with a table of common-subsequence lengths.
 */
function compareMiddle(before: readonly string[], after: readonly string[]): DiffLine[] {
  const width = after.length + 1;
  const lengths = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        before[i] === after[j]
          ? (lengths[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lengths[(i + 1) * width + j] ?? 0, lengths[i * width + j + 1] ?? 0);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    const old = before[i];
    const next = after[j];
    if (old !== undefined && old === next) {
      lines.push({ kind: 'same', text: old });
      i += 1;
      j += 1;
    } else if (old !== undefined && (next === undefined || removesFirst(lengths, width, i, j))) {
      lines.push({ kind: 'removed', text: old });
      i += 1;
    } else {
      lines.push({ kind: 'added', text: next ?? '' });
      j += 1;
    }
  }

  return lines;
}

/**
 * Tells whether dropping the old line keeps at least as long a common subsequence as adding the new
 * one, so removals print before additions.
 */
function removesFirst(lengths: Uint32Array, width: number, i: number, j: number): boolean {
  return (lengths[(i + 1) * width + j] ?? 0) >= (lengths[i * width + j + 1] ?? 0);
}

/**
 * The ranges of lines to print: each change with its context, ranges that touch merged.
 */
function hunksOf(lines: readonly DiffLine[]): { from: number; to: number }[] {
  const hunks: { from: number; to: number }[] = [];
  for (const [index, line] of lines.entries()) {
    if (line.kind === 'same') {
      continue;
    }

    const from = Math.max(0, index - CONTEXT_LINES);
    const to = Math.min(lines.length, index + CONTEXT_LINES + 1);
    const last = hunks.at(-1);
    if (last !== undefined && from <= last.to) {
      last.to = to;
    } else {
      hunks.push({ from, to });
    }
  }

  return hunks;
}

/**
 * Prints one hunk with its `@@` header.
 */
function printHunk(lines: readonly DiffLine[], hunk: { from: number; to: number }): string {
  const earlier = lines.slice(0, hunk.from);
  const shown = lines.slice(hunk.from, hunk.to);
  /**
   * How many of the lines one side has.
   *
   * @param list - The lines.
   * @param skipped - The kind only the other side has.
   */
  const count = (list: readonly DiffLine[], skipped: DiffLine['kind']): number =>
    list.filter((line) => line.kind !== skipped).length;
  const oldCount = count(shown, 'added');
  const newCount = count(shown, 'removed');
  const oldStart = count(earlier, 'added') + (oldCount === 0 ? 0 : 1);
  const newStart = count(earlier, 'removed') + (newCount === 0 ? 0 : 1);
  const marks = { same: ' ', removed: '-', added: '+' } as const;
  return [
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    ...shown.map((line) => `${marks[line.kind]}${line.text}`),
  ].join('\n');
}
