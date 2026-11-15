/**
 * Matches a character that can start or continue an identifier.
 */
const IDENTIFIER_CHAR = /[\w$]/;

/**
 * Matches whitespace.
 */
const WHITESPACE_CHAR = /\s/;

/**
 * The property name of the slide list.
 */
const SLIDES_KEY = 'slides';

/**
 * One entry of the `slides` list.
 */
export type SlidesListEntry =
  | {
      /**
       * A quoted string: a slide id.
       */
      kind: 'string';

      /**
       * The id.
       */
      value: string;

      /**
       * The quote it was written with.
       */
      quote: "'" | '"';
    }
  | {
      /**
       * Anything else: a variable, a spread, a template, a call.
       */
      kind: 'other';

      /**
       * Its source text.
       */
      text: string;
    };

/**
 * Where the `slides` array is in the deck config and what it holds.
 */
export type SlidesList = {
  /**
   * The index just after `[`.
   */
  bodyStart: number;

  /**
   * The index of the closing `]`.
   */
  bodyEnd: number;

  /**
   * The entries, in order.
   */
  items: readonly SlidesListEntry[];

  /**
   * Whether a comment sits between the brackets.
   */
  hasComments: boolean;

  /**
   * The index just after the last entry's own text, before any comma or comment that follows it;
   * `undefined` for an empty list.
   */
  lastEntryEnd: number | undefined;
};

/**
 * What a scan of the deck config found: no `slides: [...]` list, exactly one, or several.
 */
export type SlidesListScan =
  | {
      /**
       * No list, or one that is not closed.
       */
      kind: 'none';
    }
  | {
      /**
       * More than one list, so which one is meant is unclear.
       */
      kind: 'many';
    }
  | {
      /**
       * Exactly one list.
       */
      kind: 'one';

      /**
       * The list.
       */
      list: SlidesList;
    };

/**
 * Finds the `slides: [...]` array of a deck config by scanning its source the way a parser would:
 * comments, strings and template literals are skipped, so a JSDoc or a string that mentions
 * `slides: [` is never taken for the list, and a member access such as `config.slides` is not a
 * property key.
 *
 * @param source - The source of `deck.config.ts`.
 */
export function findSlidesList(source: string): SlidesListScan {
  const lists: SlidesList[] = [];
  let index = 0;
  while (index < source.length) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      const key = quotedKeyAt(source, index, skipped);
      const list = key === SLIDES_KEY ? listAfterKey(source, skipped) : undefined;
      if (list === null) {
        return { kind: 'none' };
      }

      if (list !== undefined) {
        lists.push(list);
      }

      index = skipped;
      continue;
    }

    const char = source.charAt(index);
    if (!IDENTIFIER_CHAR.test(char)) {
      index += 1;
      continue;
    }

    const end = identifierEnd(source, index);
    const isKey =
      source.slice(index, end) === SLIDES_KEY && previousCodeChar(source, index) !== '.';
    const list = isKey ? listAfterKey(source, end) : undefined;
    if (list === null) {
      return { kind: 'none' };
    }

    if (list !== undefined) {
      lists.push(list);
    }

    index = end;
  }

  const [first] = lists;
  if (first === undefined) {
    return { kind: 'none' };
  }

  return lists.length === 1 ? { kind: 'one', list: first } : { kind: 'many' };
}

/**
 * The array after a property key, when the key is followed by `:` and `[`.
 *
 * @param source - The source.
 * @param afterKey - The index just after the key.
 * @returns The list; `undefined` when the key is not followed by `: [`; `null` when the array is
 *   never closed.
 */
function listAfterKey(source: string, afterKey: number): SlidesList | undefined | null {
  const colon = skipTrivia(source, afterKey).index;
  if (source.charAt(colon) !== ':') {
    return undefined;
  }

  const open = skipTrivia(source, colon + 1).index;
  if (source.charAt(open) !== '[') {
    return undefined;
  }

  return readList(source, open + 1);
}

/**
 * Reads an array body from just after `[` to its closing `]`.
 *
 * @param source - The source.
 * @param bodyStart - The index just after `[`.
 * @returns The list, or `null` when the source ends first.
 */
function readList(source: string, bodyStart: number): SlidesList | null {
  const items: SlidesListEntry[] = [];
  let hasComments = false;
  let lastEntryEnd: number | undefined;
  let index = bodyStart;
  for (;;) {
    const trivia = skipTrivia(source, index);
    hasComments ||= trivia.hasComments;
    index = trivia.index;
    const char = source.charAt(index);
    if (char === '') {
      return null;
    }

    if (char === ']') {
      return { bodyStart, bodyEnd: index, items, hasComments, lastEntryEnd };
    }

    if (char === ',') {
      index += 1;
      continue;
    }

    const entry = readEntry(source, index);
    if (entry === null) {
      return null;
    }

    hasComments ||= entry.hasComments;
    items.push(entry.entry);
    lastEntryEnd = entry.entry.kind === 'string' ? entry.end : undefined;
    index = entry.end;
  }
}

/**
 * Reads one array entry up to the comma or bracket that ends it.
 *
 * @param source - The source.
 * @param start - The index of the entry's first character.
 * @returns The entry, the index after it and whether it holds a comment, or `null` when the source
 *   ends first.
 */
function readEntry(
  source: string,
  start: number,
): { entry: SlidesListEntry; end: number; hasComments: boolean } | null {
  const quote = source.charAt(start);
  if (quote === "'" || quote === '"') {
    const close = skipNonCode(source, start);
    const after = skipTrivia(source, close);
    const next = source.charAt(after.index);
    if (next === ',' || next === ']') {
      const value = source.slice(start + 1, close - 1);
      return {
        entry: { kind: 'string', value, quote },
        end: close,
        hasComments: after.hasComments,
      };
    }
  }

  let depth = 0;
  let hasComments = false;
  let index = start;
  while (index < source.length) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      hasComments ||= isCommentStart(source, index);
      index = skipped;
      continue;
    }

    const char = source.charAt(index);
    if (depth === 0 && (char === ',' || char === ']')) {
      const text = source.slice(start, index).trim();
      return { entry: { kind: 'other', text }, end: index, hasComments };
    }

    if (char === '(' || char === '[' || char === '{') {
      depth += 1;
    } else if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
    }

    index += 1;
  }

  return null;
}

/**
 * Skips whitespace and comments.
 *
 * @param source - The source.
 * @param start - Where to start.
 * @returns The index of the next code character and whether a comment was skipped.
 */
function skipTrivia(source: string, start: number): { index: number; hasComments: boolean } {
  let index = start;
  let hasComments = false;
  while (index < source.length) {
    if (WHITESPACE_CHAR.test(source.charAt(index))) {
      index += 1;
    } else if (isCommentStart(source, index)) {
      hasComments = true;
      index = skipNonCode(source, index);
    } else {
      break;
    }
  }

  return { index, hasComments };
}

/**
 * Skips one comment, string or template literal starting at an index.
 *
 * @param source - The source.
 * @param start - The index.
 * @returns The index after it, or `start` when none starts there.
 */
function skipNonCode(source: string, start: number): number {
  const char = source.charAt(start);
  const next = source.charAt(start + 1);
  if (char === '/' && next === '/') {
    const end = source.indexOf('\n', start);
    return end < 0 ? source.length : end;
  }

  if (char === '/' && next === '*') {
    const end = source.indexOf('*/', start + 2);
    return end < 0 ? source.length : end + 2;
  }

  if (char === "'" || char === '"') {
    return stringEnd(source, start, char);
  }

  if (char === '`') {
    return templateEnd(source, start);
  }

  return start;
}

/**
 * Whether a comment starts at an index.
 *
 * @param source - The source.
 * @param index - The index.
 */
function isCommentStart(source: string, index: number): boolean {
  return source.charAt(index) === '/' && '/*'.includes(source.charAt(index + 1) || 'x');
}

/**
 * The index after a quoted string's closing quote, honouring backslash escapes.
 *
 * @param source - The source.
 * @param start - The index of the opening quote.
 * @param quote - The quote character.
 */
function stringEnd(source: string, start: number, quote: string): number {
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === '\\') {
      index += 1;
    } else if (char === quote || char === '\n') {
      return index + 1;
    }
  }

  return source.length;
}

/**
 * The index after a template literal's closing backtick, skipping `${...}` expressions.
 *
 * @param source - The source.
 * @param start - The index of the opening backtick.
 */
function templateEnd(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length) {
    const char = source.charAt(index);
    if (char === '\\') {
      index += 2;
    } else if (char === '`') {
      return index + 1;
    } else if (char === '$' && source.charAt(index + 1) === '{') {
      index = expressionEnd(source, index + 2);
    } else {
      index += 1;
    }
  }

  return source.length;
}

/**
 * The index after the `}` that closes a template expression.
 *
 * @param source - The source.
 * @param start - The index just after `${`.
 */
function expressionEnd(source: string, start: number): number {
  let depth = 1;
  let index = start;
  while (index < source.length) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }

    const char = source.charAt(index);
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }

    index += 1;
  }

  return source.length;
}

/**
 * The text of a quoted property key: the string's contents when it is directly followed by `:`.
 *
 * @param source - The source.
 * @param start - The index of the opening quote.
 * @param end - The index after the closing quote.
 * @returns The key, or `undefined` when the text there is not a quoted string.
 */
function quotedKeyAt(source: string, start: number, end: number): string | undefined {
  const quote = source.charAt(start);
  if (quote !== "'" && quote !== '"') {
    return undefined;
  }

  return source.slice(start + 1, end - 1);
}

/**
 * The index after an identifier.
 *
 * @param source - The source.
 * @param start - The identifier's first character.
 */
function identifierEnd(source: string, start: number): number {
  let index = start;
  while (index < source.length && IDENTIFIER_CHAR.test(source.charAt(index))) {
    index += 1;
  }

  return index;
}

/**
 * The nearest character before an index that is not whitespace.
 *
 * @param source - The source.
 * @param index - The index.
 */
function previousCodeChar(source: string, index: number): string {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = source.charAt(cursor);
    if (!WHITESPACE_CHAR.test(char)) {
      return char;
    }
  }

  return '';
}
