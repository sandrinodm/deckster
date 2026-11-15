import type { DiffHunk } from '#protocol/agent-events.ts';

/**
 * Unchanged lines shown around each change.
 */
const CONTEXT_LINES = 3;

/**
 * The most diff lines one file returns; the rest is cut and the result marked truncated.
 */
export const MAX_DIFF_LINES = 400;

/**
 * The longest line kept, in characters; longer lines are cut with an ellipsis.
 */
const MAX_LINE_CHARS = 400;

/**
 * The largest table the line matcher fills (lines before times lines after, once the common start
 * and end are set aside). Beyond it the middle is shown as removed and added in full.
 */
const MAX_TABLE_CELLS = 4_000_000;

/**
 * The most lines either text may have for {@link lineDiff} to compare them; a larger text is
 * reported too large to diff (`tooLarge`), so the work stays bounded.
 */
export const MAX_DIFF_INPUT_LINES = 500_000;

/**
 * How many bytes are checked for a NUL byte to call a file binary.
 */
const BINARY_PROBE_BYTES = 8000;

/**
 * One line of an edit script: kept, removed from the old text or added in the new one.
 */
type Edit = {
  /**
   * What happened to the line.
   */
  readonly op: ' ' | '-' | '+';

  /**
   * The line, without its line break.
   */
  readonly text: string;

  /**
   * Its number in the old text (1-based), or 0 for an added line.
   */
  readonly oldLine: number;

  /**
   * Its number in the new text (1-based), or 0 for a removed line.
   */
  readonly newLine: number;
};

/**
 * What {@link lineDiff} found.
 */
export type LineDiff = {
  /**
   * The changes with their context, in unified-diff hunks.
   */
  readonly hunks: readonly DiffHunk[];

  /**
   * How many lines were added.
   */
  readonly added: number;

  /**
   * How many lines were removed.
   */
  readonly removed: number;

  /**
   * Whether hunks were cut to stay under {@link MAX_DIFF_LINES}.
   */
  readonly truncated: boolean;

  /**
   * True when either text has more than {@link MAX_DIFF_INPUT_LINES} lines, so nothing was
   * compared: there are no hunks and no counts. Absent otherwise.
   */
  readonly tooLarge?: true;
};

/**
 * What {@link lineDiff} answers for texts too large to compare.
 */
const TOO_LARGE: LineDiff = {
  /**
   * No hunks.
   */
  hunks: [],

  /**
   * Not counted.
   */
  added: 0,

  /**
   * Not counted.
   */
  removed: 0,

  /**
   * Nothing is shown.
   */
  truncated: true,

  /**
   * Too large to compare.
   */
  tooLarge: true,
};

/**
 * A line-based diff of two texts as unified-diff hunks with three lines of context. Each hunk line
 * starts with a space, `-` or `+`. The common start and end are matched first; the middle is
 * matched by longest common subsequence, or shown as replaced in full when it is too large. The
 * result is capped at {@link MAX_DIFF_LINES} lines; texts over {@link MAX_DIFF_INPUT_LINES} lines
 * are not compared at all and come back `tooLarge`.
 *
 * @param before - The old text.
 * @param after - The new text.
 */
export function lineDiff(before: string, after: string): LineDiff {
  const old = splitLines(before);
  const now = splitLines(after);
  if (old.length > MAX_DIFF_INPUT_LINES || now.length > MAX_DIFF_INPUT_LINES) {
    return TOO_LARGE;
  }

  const edits = editScript(old, now);
  const added = edits.filter((edit) => edit.op === '+').length;
  const removed = edits.filter((edit) => edit.op === '-').length;
  const hunks: DiffHunk[] = [];
  let budget = MAX_DIFF_LINES;
  let truncated = false;
  for (const range of hunkRanges(edits)) {
    const slice = edits.slice(range.start, range.end);
    if (budget <= 0) {
      truncated = true;
      break;
    }

    const kept = slice.slice(0, budget);
    truncated ||= kept.length < slice.length;
    budget -= kept.length;
    hunks.push(toHunk(kept));
  }

  return { hunks, added, removed, truncated };
}

/**
 * Whether bytes look binary: a NUL byte near the start.
 *
 * @param bytes - The content.
 */
export function looksBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, BINARY_PROBE_BYTES).includes(0);
}

/**
 * A text's lines without line breaks; a final line break does not make an empty last line.
 *
 * @param text - The text.
 */
function splitLines(text: string): string[] {
  if (text === '') {
    return [];
  }

  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines;
}

/**
 * The edit script that turns one list of lines into another.
 *
 * @param old - The old lines.
 * @param now - The new lines.
 */
function editScript(old: readonly string[], now: readonly string[]): Edit[] {
  let head = 0;
  while (head < old.length && head < now.length && old[head] === now[head]) {
    head += 1;
  }

  let tail = 0;
  while (
    tail < old.length - head &&
    tail < now.length - head &&
    old[old.length - 1 - tail] === now[now.length - 1 - tail]
  ) {
    tail += 1;
  }

  const edits: Edit[] = [];
  for (let index = 0; index < head; index += 1) {
    edits.push({ op: ' ', text: old[index] ?? '', oldLine: index + 1, newLine: index + 1 });
  }

  const oldMiddle = old.slice(head, old.length - tail);
  const newMiddle = now.slice(head, now.length - tail);
  for (const edit of matchMiddle(oldMiddle, newMiddle)) {
    edits.push({
      ...edit,
      oldLine: edit.oldLine === 0 ? 0 : edit.oldLine + head,
      newLine: edit.newLine === 0 ? 0 : edit.newLine + head,
    });
  }

  for (let index = tail; index > 0; index -= 1) {
    const oldIndex = old.length - index;
    const newIndex = now.length - index;
    edits.push({
      op: ' ',
      text: old[oldIndex] ?? '',
      oldLine: oldIndex + 1,
      newLine: newIndex + 1,
    });
  }

  return edits;
}

/**
 * Matches the differing middle of two texts by longest common subsequence, or replaces it whole
 * when the table would be too large.
 *
 * @param old - The old lines.
 * @param now - The new lines.
 */
function matchMiddle(old: readonly string[], now: readonly string[]): Edit[] {
  const removeAll = old.map((text, index): Edit => ({
    op: '-',
    text,
    oldLine: index + 1,
    newLine: 0,
  }));
  const addAll = now.map((text, index): Edit => ({
    op: '+',
    text,
    oldLine: 0,
    newLine: index + 1,
  }));
  if (old.length === 0 || now.length === 0 || old.length * now.length > MAX_TABLE_CELLS) {
    return removeAll.concat(addAll);
  }

  const width = now.length + 1;
  const table = new Uint32Array((old.length + 1) * width);
  for (let row = old.length - 1; row >= 0; row -= 1) {
    for (let column = now.length - 1; column >= 0; column -= 1) {
      table[row * width + column] =
        old[row] === now[column]
          ? (table[(row + 1) * width + column + 1] ?? 0) + 1
          : Math.max(table[(row + 1) * width + column] ?? 0, table[row * width + column + 1] ?? 0);
    }
  }

  const edits: Edit[] = [];
  let row = 0;
  let column = 0;
  while (row < old.length || column < now.length) {
    if (row < old.length && column < now.length && old[row] === now[column]) {
      edits.push({ op: ' ', text: old[row] ?? '', oldLine: row + 1, newLine: column + 1 });
      row += 1;
      column += 1;
    } else if (
      column < now.length &&
      (row === old.length ||
        (table[row * width + column + 1] ?? 0) >= (table[(row + 1) * width + column] ?? 0))
    ) {
      edits.push({ op: '+', text: now[column] ?? '', oldLine: 0, newLine: column + 1 });
      column += 1;
    } else {
      edits.push({ op: '-', text: old[row] ?? '', oldLine: row + 1, newLine: 0 });
      row += 1;
    }
  }

  return reorderRuns(edits);
}

/**
 * Puts the removed lines of each changed run before its added lines, as unified diffs show them.
 * Lines are appended one at a time: a run can be hundreds of thousands of lines long, more than a
 * spread call's arguments may be.
 *
 * @param edits - The edit script.
 */
function reorderRuns(edits: readonly Edit[]): Edit[] {
  const result: Edit[] = [];
  let removed: Edit[] = [];
  let added: Edit[] = [];
  /**
   * Ends a changed run: its removed lines, then its added ones.
   */
  const flush = () => {
    for (const edit of removed) {
      result.push(edit);
    }

    for (const edit of added) {
      result.push(edit);
    }

    removed = [];
    added = [];
  };
  for (const edit of edits) {
    if (edit.op === '-') {
      removed.push(edit);
    } else if (edit.op === '+') {
      added.push(edit);
    } else {
      flush();
      result.push(edit);
    }
  }

  flush();
  return result;
}

/**
 * The ranges of the edit script that become hunks: each change with its context, ranges that touch
 * merged.
 *
 * @param edits - The edit script.
 */
function hunkRanges(edits: readonly Edit[]): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  edits.forEach((edit, index) => {
    if (edit.op === ' ') {
      return;
    }

    const start = Math.max(0, index - CONTEXT_LINES);
    const end = Math.min(edits.length, index + CONTEXT_LINES + 1);
    const last = ranges.at(-1);
    if (last !== undefined && start <= last.end) {
      last.end = Math.max(last.end, end);
    } else {
      ranges.push({ start, end });
    }
  });
  return ranges;
}

/**
 * One hunk from a slice of the edit script.
 *
 * @param slice - The edits of the hunk.
 */
function toHunk(slice: readonly Edit[]): DiffHunk {
  const firstOld = slice.find((edit) => edit.oldLine > 0)?.oldLine;
  const firstNew = slice.find((edit) => edit.newLine > 0)?.newLine;
  const oldLines = slice.filter((edit) => edit.op !== '+').length;
  const newLines = slice.filter((edit) => edit.op !== '-').length;
  return {
    oldStart: firstOld ?? 0,
    oldLines,
    newStart: firstNew ?? 0,
    newLines,
    lines: slice.map((edit) => `${edit.op}${clip(edit.text)}`),
  };
}

/**
 * A line cut to {@link MAX_LINE_CHARS}.
 *
 * @param text - The line.
 */
function clip(text: string): string {
  return text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS)}…` : text;
}
