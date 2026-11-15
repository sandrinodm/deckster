import type { AnchorStatus } from '#model/agent-comment.ts';
import type { Comment } from '#model/comment-schema.ts';

/**
 * The shortest element text worth searching the source for, in characters; shorter text (a digit,
 * "OK") matches too many lines to mean anything.
 */
const MIN_SEARCH_TEXT = 8;

/**
 * How much of the element text is searched for, in characters; a long paragraph is often wrapped or
 * marked up further in, so its start is what matches.
 */
const SEARCH_TEXT_LENGTH = 40;

/**
 * Matches a run of whitespace.
 */
const WHITESPACE_PATTERN = /\s+/g;

/**
 * Matches a letter or digit, which starts a line of plain text.
 */
const TEXT_START_PATTERN = /[\p{L}\p{N}]/u;

/**
 * Matches the indentation at the start of a line.
 */
const INDENT_PATTERN = /^\s*/;

/**
 * Matches a word: a run of letters or digits.
 */
const WORD_PATTERN = /[\p{L}\p{N}]+/gu;

/**
 * How many lines above and below the original line a reworded line is looked for.
 */
const GUESS_REACH_LINES = 12;

/**
 * The share of words a line must have in common with the original line (words both have, over words
 * either has) to be taken for it after a rewording.
 */
const GUESS_MIN_OVERLAP = 0.5;

/**
 * How much each line of distance from the original line lowers a candidate's overlap, so of two
 * equally similar lines the nearer wins.
 */
const GUESS_DISTANCE_PENALTY = 0.01;

/**
 * Where a comment's element is in the source now.
 */
export type AnchorMatch = {
  /**
   * See {@link AnchorStatus}.
   */
  status: AnchorStatus;

  /**
   * The line to edit now, or `null` for a comment without a source line.
   */
  line: number | null;

  /**
   * The column of the element's tag on that line, or `null`.
   */
  column: number | null;
};

/**
 * The match of an anchor that was not found.
 */
const LOST: AnchorMatch = {
  /**
   * Nothing matches.
   */
  status: 'lost',

  /**
   * No line can be named.
   */
  line: null,

  /**
   * Nor a column.
   */
  column: null,
};

/**
 * Finds a comment's element in the current source of its file. The line still reading as it did is
 * `ok`; the same line elsewhere (the nearest one, when it repeats) is `moved`, and so is the line
 * where the element's text now is. A line of the same kind near the original one that shares most
 * of its words (a reworded heading, say) is `guessed`. Otherwise the anchor is `lost` and `line` is
 * `null`: no line can be named with any confidence. Comments on a whole slide are `none`.
 *
 * @param comment - The comment's source and anchor.
 * @param lines - The file's lines now, or `undefined` when the file does not exist.
 */
export function matchAnchor(
  comment: Pick<Comment, 'source' | 'anchor'>,
  lines: readonly string[] | undefined,
): AnchorMatch {
  const { source, anchor } = comment;
  if (source === null) {
    return { status: 'none', line: null, column: null };
  }

  if (lines === undefined) {
    return LOST;
  }

  const lineText = anchor?.lineText ?? null;
  if (lineText === null) {
    return source.line <= lines.length
      ? { status: 'ok', line: source.line, column: source.column }
      : LOST;
  }

  const shape = { text: anchor?.text ?? '', tag: anchor?.tag ?? '', lineText };
  return (
    findLine(lines, source, lineText) ??
    findText(lines, source, shape) ??
    guessLine(lines, source, shape) ??
    LOST
  );
}

/**
 * Collapses whitespace and trims, so re-indenting a line does not count as changing it.
 *
 * @param text - A line or an excerpt.
 */
export function normalizeText(text: string): string {
  return text.replaceAll(WHITESPACE_PATTERN, ' ').trim();
}

/**
 * The original line where it was, else the nearest line that reads the same.
 *
 * @param lines - The file's lines.
 * @param source - Where the comment was made.
 * @param lineText - The line as it read then.
 */
function findLine(
  lines: readonly string[],
  source: { line: number; column: number },
  lineText: string,
): AnchorMatch | undefined {
  const wanted = normalizeText(lineText);
  if (wanted === '') {
    return undefined;
  }

  const index = nearestIndex(lines, source.line - 1, (line) => normalizeText(line) === wanted);
  if (index === undefined) {
    return undefined;
  }

  const line = index + 1;
  const column = Math.max(1, source.column + indentOf(lines[index] ?? '') - indentOf(lineText));
  return { status: line === source.line ? 'ok' : 'moved', line, column };
}

/**
 * The nearest line that contains the start of the element's text and has the element's shape: the
 * same JSX tag when the original line had one, else the same kind of line (a list item, a heading,
 * text). A code comment or a frontmatter field that repeats the text is not mistaken for the
 * element.
 *
 * @param lines - The file's lines.
 * @param source - Where the comment was made.
 * @param anchor - The element's text excerpt, its tag, and the line as it read then.
 */
function findText(
  lines: readonly string[],
  source: { line: number },
  anchor: { text: string; tag: string; lineText: string },
): AnchorMatch | undefined {
  const wanted = normalizeText(anchor.text).slice(0, SEARCH_TEXT_LENGTH);
  if (wanted.length < MIN_SEARCH_TEXT) {
    return undefined;
  }

  const hasShape = shapeTest(anchor.lineText, anchor.tag);
  const index = nearestIndex(
    lines,
    source.line - 1,
    (line) => hasShape(line) && normalizeText(line).includes(wanted),
  );
  if (index === undefined) {
    return undefined;
  }

  const line = index + 1;
  return {
    status: line === source.line ? 'ok' : 'moved',
    line,
    column: indentOf(lines[index] ?? '') + 1,
  };
}

/**
 * The line near the original one that reads most like it did, for a line that was reworded: the
 * same kind of line (the same JSX tag, else the same first character) within
 * {@link GUESS_REACH_LINES}, sharing at least {@link GUESS_MIN_OVERLAP} of its words.
 *
 * @param lines - The file's lines.
 * @param source - Where the comment was made.
 * @param anchor - The element's tag and the line as it read then.
 */
function guessLine(
  lines: readonly string[],
  source: { line: number; column: number },
  anchor: { tag: string; lineText: string },
): AnchorMatch | undefined {
  const wanted = wordsOf(anchor.lineText);
  if (wanted.size === 0) {
    return undefined;
  }

  const hasShape = shapeTest(anchor.lineText, anchor.tag);
  const start = source.line - 1;
  let best: { index: number; score: number } | undefined;
  for (let distance = 0; distance <= GUESS_REACH_LINES; distance += 1) {
    for (const index of distance === 0 ? [start] : [start - distance, start + distance]) {
      const line = lines[index];
      if (line === undefined || !hasShape(line)) {
        continue;
      }

      const overlap = wordOverlap(wanted, wordsOf(line));
      const score = overlap - distance * GUESS_DISTANCE_PENALTY;
      if (overlap >= GUESS_MIN_OVERLAP && (best === undefined || score > best.score)) {
        best = { index, score };
      }
    }
  }

  if (best === undefined) {
    return undefined;
  }

  const line = lines[best.index] ?? '';
  const column = Math.max(1, source.column + indentOf(line) - indentOf(anchor.lineText));
  return { status: 'guessed', line: best.index + 1, column };
}

/**
 * The distinct words of a line, lowercased.
 *
 * @param line - A source line.
 */
function wordsOf(line: string): Set<string> {
  return new Set((line.toLowerCase().match(WORD_PATTERN) ?? []).filter((word) => word !== ''));
}

/**
 * The words two lines share over the words either has (Jaccard similarity), from 0 to 1.
 *
 * @param a - One line's words.
 * @param b - The other line's words.
 */
function wordOverlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const shared = [...a].filter((word) => b.has(word)).length;
  const either = new Set([...a, ...b]).size;
  return either === 0 ? 0 : shared / either;
}

/**
 * The index of the matching line closest to a start index, preferring the earlier one on a tie.
 *
 * @param lines - The file's lines.
 * @param start - The zero-based index to search out from.
 * @param matches - The test a line must pass.
 */
function nearestIndex(
  lines: readonly string[],
  start: number,
  matches: (line: string) => boolean,
): number | undefined {
  const reach = Math.max(start + 1, lines.length - start);
  for (let distance = 0; distance < reach; distance += 1) {
    for (const index of [start - distance, start + distance]) {
      const line = lines[index];
      if (line !== undefined && matches(line)) {
        return index;
      }
    }
  }

  return undefined;
}

/**
 * The test a line must pass to be the element's line: it opens the same JSX tag, when the original
 * line did, else it starts like the original line.
 *
 * @param lineText - The line as it read when the comment was made.
 * @param tag - The element's tag name.
 */
function shapeTest(lineText: string, tag: string): (line: string) => boolean {
  const opening = `<${tag}`;
  if (tag !== '' && lineText.includes(opening)) {
    return (line) => line.includes(opening);
  }

  const kind = lineKind(lineText);
  return (line) => lineKind(line) === kind;
}

/**
 * What kind of line a line is, by its first character: text for a letter or digit, else the
 * character itself (`<` for a tag, `-` for a list item, `#` for a heading, `*` for a doc comment).
 *
 * @param line - A source line.
 */
function lineKind(line: string): string {
  const first = line.trimStart().charAt(0);
  return TEXT_START_PATTERN.test(first) ? 'text' : first;
}

/**
 * The width of a line's indentation, in characters.
 *
 * @param line - A source line.
 */
function indentOf(line: string): number {
  return INDENT_PATTERN.exec(line)?.[0].length ?? 0;
}
