import { kindIndex, kindOfColor } from '#code/token-kind.ts';

/**
 * A run of text in one color: the text, the index of its kind in `TOKEN_KINDS` and, for a word the
 * author marked, `1`.
 */
export type HighlightedToken = readonly [text: string, kind: number, marked?: 1];

/**
 * How a line differs from the version before: added or removed.
 */
export type LineChange = 'add' | 'remove';

/**
 * One line of a highlighted block.
 */
export type HighlightedLine = {
  /**
   * The line's text in colored runs; empty for a blank line.
   */
  tokens: HighlightedToken[];

  /**
   * Set for a line in diff notation.
   */
  change?: LineChange;
};

/**
 * A code block after highlighting: what the browser renders, and what the build serializes into the
 * slide.
 */
export type HighlightedCode = {
  /**
   * The language the block was highlighted as.
   */
  lang: string;

  /**
   * The lines, in order, markers removed.
   */
  lines: HighlightedLine[];
};

/**
 * A source with its diff markers read off: the clean lines and what changed.
 */
export type PreparedSource = {
  /**
   * The source lines without markers or diff prefixes.
   */
  lines: string[];

  /**
   * The change of each line, by index; `undefined` for an unchanged line.
   */
  changes: (LineChange | undefined)[];
};

/**
 * What to read off a source before highlighting it.
 */
export type PrepareOptions = {
  /**
   * Treat a leading `+` or `-` on each line as an addition or a removal and drop it.
   */
  diff: boolean;
};

/**
 * A token as Shiki returns it, reduced to what the block uses.
 */
export type ThemedRun = {
  /**
   * The text.
   */
  content: string;

  /**
   * The `var(--brand-code-*)` color the theme gave it.
   */
  color?: string | undefined;
};

/**
 * A trailing marker comment such as `// [!code ++]`, `# [!code --]` or `<!-- [!code ++] -->`.
 */
const MARKER_PATTERN = /\s*(?:\/\/|#|--|\/\*|<!--)\s*\[!code (\+\+|--)\]\s*(?:\*\/|-->)?\s*$/;

/**
 * A carriage return, with or without the line feed after it.
 */
const LINE_ENDS = /\r\n?/g;

/**
 * One newline at the end of a source.
 */
const TRAILING_NEWLINE = /\n$/;

/**
 * A character that can be part of an identifier: a letter, a digit, `_` or `$`.
 */
const IDENTIFIER_CHARACTER = /[\p{L}\p{N}_$]/u;

/**
 * Splits a source into lines and reads the diff notation off them. Markers are comments at the end
 * of a line, `[!code ++]` for an addition and `[!code --]` for a removal; with `diff`, a leading
 * `+` or `-` does the same, so a pasted `git diff` works. Markers and prefixes are removed so the
 * highlighter sees real code.
 *
 * @param source - The code, with `\n` or `\r\n` line ends; one trailing newline is ignored.
 * @param options - Whether leading `+` and `-` mark lines.
 */
export function prepareSource(source: string, options: PrepareOptions): PreparedSource {
  const raw = source.replace(LINE_ENDS, '\n').replace(TRAILING_NEWLINE, '').split('\n');
  const lines: string[] = [];
  const changes: (LineChange | undefined)[] = [];
  for (const line of raw) {
    const marker = MARKER_PATTERN.exec(line);
    if (marker !== null) {
      lines.push(line.slice(0, marker.index));
      changes.push(marker[1] === '++' ? 'add' : 'remove');
    } else if (options.diff && (line.startsWith('+') || line.startsWith('-'))) {
      lines.push(line.slice(1));
      changes.push(line.startsWith('+') ? 'add' : 'remove');
    } else {
      lines.push(line);
      changes.push(undefined);
    }
  }

  return { lines, changes };
}

/**
 * Builds a highlighted block from the tokens Shiki produced for a prepared source.
 *
 * @param lang - The language the block was highlighted as.
 * @param themed - Shiki's tokens, one list per line.
 * @param prepared - The source the tokens came from, for its diff changes.
 * @param words - Words to mark wherever they appear; empty for none.
 */
export function buildHighlightedCode(
  lang: string,
  themed: readonly (readonly ThemedRun[])[],
  prepared: PreparedSource,
  words: readonly string[],
): HighlightedCode {
  const lines = themed.map((line, index): HighlightedLine => {
    const tokens = markWords(
      line.map((run): HighlightedToken => [run.content, kindIndex(kindOfColor(run.color))]),
      words,
    );
    const change = prepared.changes[index];
    return change === undefined ? { tokens } : { tokens, change };
  });
  return { lang, lines };
}

/**
 * Marks every occurrence of the given words, splitting runs at the edges of a match so only the
 * word itself is marked. Words match as plain text, case-sensitively.
 *
 * @param tokens - One line's runs.
 * @param words - The words to mark.
 */
export function markWords(
  tokens: readonly HighlightedToken[],
  words: readonly string[],
): HighlightedToken[] {
  const text = tokens.map(([part]) => part).join('');
  const ranges = wordRanges(text, words);
  if (ranges.length === 0) {
    return [...tokens];
  }

  const result: HighlightedToken[] = [];
  let offset = 0;
  for (const [part, kind] of tokens) {
    let cursor = offset;
    const end = offset + part.length;
    for (const [from, to] of ranges) {
      if (to <= cursor || from >= end) {
        continue;
      }

      const start = Math.max(from, cursor);
      const stop = Math.min(to, end);
      if (start > cursor) {
        result.push([text.slice(cursor, start), kind]);
      }

      result.push([text.slice(start, stop), kind, 1]);
      cursor = stop;
    }

    if (cursor < end) {
      result.push([text.slice(cursor, end), kind]);
    }

    offset = end;
  }

  return result;
}

/**
 * The plain text of a highlighted block, lines joined by newlines; what a reader would copy.
 *
 * @param code - A highlighted block.
 */
export function plainText(code: HighlightedCode): string {
  return code.lines.map((line) => line.tokens.map(([text]) => text).join('')).join('\n');
}

/**
 * The longest line of a block, in characters.
 *
 * @param code - A highlighted block.
 */
export function longestLine(code: HighlightedCode): number {
  return Math.max(
    0,
    ...code.lines.map((line) => line.tokens.reduce((sum, [t]) => sum + t.length, 0)),
  );
}

/**
 * Whether a match at `[from, to)` stands on identifier boundaries: where the word starts or ends
 * with an identifier character, the character beyond that edge is not one. `step` then marks `step`
 * but not the start of `steps`, while `=>` still marks every arrow.
 *
 * @param text - The line.
 * @param from - The first character of the match.
 * @param to - One past its last character.
 */
function onBoundaries(text: string, from: number, to: number): boolean {
  /**
   * Whether the character at an index can be part of an identifier.
   */
  const isPart = (index: number): boolean => IDENTIFIER_CHARACTER.test(text.charAt(index));
  const startsWord = from > 0 && isPart(from) && isPart(from - 1);
  const endsWord = to < text.length && isPart(to - 1) && isPart(to);
  return !startsWord && !endsWord;
}

/**
 * The sorted, non-overlapping `[from, to)` ranges where any word occurs in the text as a whole word
 * (see {@link onBoundaries}).
 *
 * @param text - One line.
 * @param words - The words.
 */
function wordRanges(text: string, words: readonly string[]): [number, number][] {
  const found: [number, number][] = [];
  for (const word of words) {
    if (word === '') {
      continue;
    }

    for (let from = text.indexOf(word); from !== -1; from = text.indexOf(word, from + 1)) {
      if (onBoundaries(text, from, from + word.length)) {
        found.push([from, from + word.length]);
      }
    }
  }

  found.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of found) {
    const last = merged.at(-1);
    if (last !== undefined && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push(range);
    }
  }

  return merged;
}
