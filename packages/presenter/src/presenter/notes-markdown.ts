/**
 * A run of text in speaker notes, with the inline formatting it carries.
 */
export type NoteInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: readonly NoteInline[] }
  | { kind: 'em'; children: readonly NoteInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: readonly NoteInline[] };

/**
 * A block of speaker notes: a paragraph, or a bulleted or numbered list.
 */
export type NoteBlock =
  | { kind: 'paragraph'; children: readonly NoteInline[] }
  | { kind: 'list'; ordered: boolean; items: readonly (readonly NoteInline[])[] };

/**
 * Two or more line breaks in a row, which separate blocks.
 */
const BLOCK_BREAK = /\n[\t ]*\n/;

/**
 * A bulleted list item: `-`, `*` or `+` and a space.
 */
const BULLET_ITEM = /^\s*[-*+]\s+(.*)$/;

/**
 * A numbered list item: digits, `.` or `)` and a space.
 */
const NUMBERED_ITEM = /^\s*\d{1,9}[.)]\s+(.*)$/;

/**
 * The link schemes notes may link to; anything else stays plain text.
 */
const SAFE_LINK = /^(?:https?:|mailto:)/i;

/**
 * Whitespace at the start of a line, which makes the line a continuation of the list item above.
 */
const INDENTED_LINE = /^\s+/;

/**
 * One whitespace character, which ends a link target.
 */
const WHITESPACE = /\s/;

/**
 * The longest span, in characters, that one piece of inline formatting may cover: how far the
 * parser looks for a closing marker or the end of a link. Longer spans stay plain text, which keeps
 * the work per character constant.
 */
const MAX_SPAN = 2000;

/**
 * The most characters of notes that are formatted. Longer notes render as plain text, one paragraph
 * per blank-line separated block, so a huge paste can never stall the presenter window.
 */
export const MAX_FORMATTED_CHARS = 20_000;

/**
 * Anything that is not whitespace; an emphasis marker must sit next to one.
 */
const NON_SPACE = /\S/;

/**
 * A letter, digit or underscore; an underscore after one of these is part of a word.
 */
const WORD_CHARACTER = /\w/;

/**
 * An inline element found in the text, and the index just after it.
 */
type InlineMatch = {
  /**
   * The parsed element.
   */
  node: NoteInline;

  /**
   * The index in the text where the element ends, exclusive.
   */
  end: number;
};

/**
 * Parses the speaker notes Markdown a presenter writes: paragraphs, `-`/`*`/`1.` lists, `**bold**`,
 * `*italic*` or `_italic_`, `` `code` `` and `[links](https://…)`. Everything else, raw HTML
 * included, stays text: the result is rendered as React elements, never as HTML. Links keep only
 * `http`, `https` and `mailto` targets. Notes longer than {@link MAX_FORMATTED_CHARS} come back as
 * one plain paragraph.
 *
 * @param notes - The notes as written.
 */
export function parseNotes(notes: string): readonly NoteBlock[] {
  if (notes.length > MAX_FORMATTED_CHARS) {
    return [{ kind: 'paragraph', children: [{ kind: 'text', text: notes }] }];
  }

  const blocks: NoteBlock[] = [];
  for (const chunk of notes.split(BLOCK_BREAK)) {
    if (chunk.trim() !== '') {
      blocks.push(...parseChunk(chunk));
    }
  }

  return blocks;
}

/**
 * Parses one chunk between blank lines, which may hold a paragraph and lists one after another.
 *
 * @param chunk - The chunk.
 */
function parseChunk(chunk: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  /**
   * Closes the paragraph being collected.
   */
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join('\n')) });
      paragraph = [];
    }
  };

  for (const line of chunk.split('\n')) {
    const bullet = BULLET_ITEM.exec(line);
    const numbered = bullet === null ? NUMBERED_ITEM.exec(line) : null;
    const item = bullet ?? numbered;
    if (item === null) {
      const last = blocks.at(-1);
      const continuesItem =
        paragraph.length === 0 && last?.kind === 'list' && INDENTED_LINE.test(line);
      if (continuesItem) {
        continueListItem(blocks, last, line);
      } else {
        paragraph.push(line);
      }

      continue;
    }

    flush();
    const ordered = numbered !== null;
    const content = parseInline(item[1] ?? '');
    const last = blocks.at(-1);
    if (last?.kind === 'list' && last.ordered === ordered) {
      blocks[blocks.length - 1] = { ...last, items: [...last.items, content] };
    } else {
      blocks.push({ kind: 'list', ordered, items: [content] });
    }
  }

  flush();
  return blocks;
}

/**
 * Adds an indented line to the text of the last list item, after a space, so a wrapped item reads
 * as one item. The last block is replaced, not mutated.
 *
 * @param blocks - The blocks parsed so far; the list is the last one.
 * @param list - That last list block.
 * @param line - The indented line.
 */
function continueListItem(
  blocks: NoteBlock[],
  list: Extract<NoteBlock, { kind: 'list' }>,
  line: string,
): void {
  const items = [...list.items];
  items[items.length - 1] = [
    ...(items.at(-1) ?? []),
    { kind: 'text', text: ' ' },
    ...parseInline(line.trim()),
  ];
  blocks[blocks.length - 1] = { ...list, items };
}

/**
 * Parses inline formatting. Scanning is index based and every look-ahead is bounded by
 * {@link MAX_SPAN}, so the time is linear in the length of the text for any input.
 *
 * @param text - A paragraph or list item.
 */
export function parseInline(text: string): readonly NoteInline[] {
  const out: NoteInline[] = [];
  let plainStart = 0;
  let index = 0;
  while (index < text.length) {
    const match = matchInline(text, index);
    if (match === undefined) {
      index += 1;
      continue;
    }

    if (index > plainStart) {
      out.push({ kind: 'text', text: text.slice(plainStart, index) });
    }

    out.push(match.node);
    index = match.end;
    plainStart = index;
  }

  if (text.length > plainStart) {
    out.push({ kind: 'text', text: text.slice(plainStart) });
  }

  return out;
}

/**
 * The inline element that starts at `index`, if one does. Code is tried first, then bold, italic
 * and links; the first that matches wins.
 *
 * @param text - The text.
 * @param index - Where to look.
 */
function matchInline(text: string, index: number): InlineMatch | undefined {
  return (
    matchCode(text, index) ??
    matchStrong(text, index) ??
    matchEmphasis(text, index) ??
    matchLink(text, index)
  );
}

/**
 * The first index of `marker` in `text` from `from` on, looking no further than `limit`.
 *
 * @param text - The text.
 * @param marker - What to find.
 * @param from - The first index to try.
 * @param limit - The last index to try.
 * @returns The index, or `-1` when it is not within the bounds.
 */
function findWithin(text: string, marker: string, from: number, limit: number): number {
  const last = Math.min(limit, text.length - marker.length);
  for (let index = from; index <= last; index += 1) {
    if (text.startsWith(marker, index)) {
      return index;
    }
  }

  return -1;
}

/**
 * A code span: the text between two backticks.
 *
 * @param text - The text.
 * @param index - Where the span may start.
 */
function matchCode(text: string, index: number): InlineMatch | undefined {
  if (text.charAt(index) !== '`') {
    return undefined;
  }

  const close = findWithin(text, '`', index + 1, index + MAX_SPAN);
  if (close <= index + 1) {
    return undefined;
  }

  return { node: { kind: 'code', text: text.slice(index + 1, close) }, end: close + 1 };
}

/**
 * Bold text between a pair of `**` or of `__`.
 *
 * @param text - The text.
 * @param index - Where the bold text may start.
 */
function matchStrong(text: string, index: number): InlineMatch | undefined {
  for (const marker of ['**', '__']) {
    if (text.startsWith(marker, index)) {
      const close = findWithin(text, marker, index + marker.length + 1, index + MAX_SPAN);
      if (close > index + marker.length) {
        const children = parseInline(text.slice(index + marker.length, close));
        return { node: { kind: 'strong', children }, end: close + marker.length };
      }
    }
  }

  return undefined;
}

/**
 * Italic text between a single `*` or `_`. An underscore inside a word does not open one.
 *
 * @param text - The text.
 * @param index - Where the italic text may start.
 */
function matchEmphasis(text: string, index: number): InlineMatch | undefined {
  for (const marker of ['*', '_']) {
    const opensWord = text.startsWith(marker, index) && NON_SPACE.test(text[index + 1] ?? ' ');
    const afterWord = marker === '_' && index > 0 && WORD_CHARACTER.test(text[index - 1] ?? '');
    if (opensWord && !afterWord) {
      const close = findClosing(text, index, marker);
      if (close !== undefined) {
        const children = parseInline(text.slice(index + 1, close));
        return { node: { kind: 'em', children }, end: close + 1 };
      }
    }
  }

  return undefined;
}

/**
 * A link whose target uses a safe scheme; any other link stays plain text. The label and the target
 * are looked for within bounded lengths.
 *
 * @param text - The text.
 * @param index - Where the link may start.
 */
function matchLink(text: string, index: number): InlineMatch | undefined {
  if (text.charAt(index) !== '[') {
    return undefined;
  }

  const labelEnd = findWithin(text, ']', index + 1, index + MAX_SPAN);
  if (labelEnd <= index + 1 || !text.startsWith('(', labelEnd + 1)) {
    return undefined;
  }

  const targetStart = labelEnd + 2;
  let targetEnd = targetStart;
  while (
    targetEnd < text.length &&
    targetEnd - targetStart <= MAX_SPAN &&
    text[targetEnd] !== ')' &&
    !WHITESPACE.test(text[targetEnd] ?? '')
  ) {
    targetEnd += 1;
  }

  if (targetEnd === targetStart || text[targetEnd] !== ')') {
    return undefined;
  }

  const target = text.slice(targetStart, targetEnd);
  if (!SAFE_LINK.test(target)) {
    return undefined;
  }

  const children = parseInline(text.slice(index + 1, labelEnd));
  return { node: { kind: 'link', href: target, children }, end: targetEnd + 1 };
}

/**
 * Where a single-character emphasis marker closes: the next marker, within {@link MAX_SPAN}, that
 * follows a non-space and is not part of a double marker.
 *
 * @param text - The text.
 * @param open - The index of the opening marker.
 * @param marker - `*` or `_`.
 */
function findClosing(text: string, open: number, marker: string): number | undefined {
  const last = Math.min(open + MAX_SPAN, text.length - 1);
  for (let index = open + 2; index <= last; index += 1) {
    const isMarker = text[index] === marker && text[index + 1] !== marker;
    if (isMarker && NON_SPACE.test(text[index - 1] ?? ' ')) {
      return index;
    }
  }

  return undefined;
}
