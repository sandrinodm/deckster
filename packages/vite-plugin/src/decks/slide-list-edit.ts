import { findSlidesList, type SlidesList } from '#decks/slides-list-scan.ts';

/**
 * The indentation of the first item in a multi-line list.
 */
const ITEM_INDENT_PATTERN = /\n([ \t]+)\S/;

/**
 * The indentation of the line that closes a multi-line list.
 */
const CLOSING_INDENT_PATTERN = /\n([ \t]*)$/;

/**
 * A slide id that can be written between quotes as it is.
 */
const PLAIN_ID_PATTERN = /^[^'"`\\\s]+$/;

/**
 * Appends an id to the `slides` array of a deck config, keeping its single-line or multi-line
 * layout and quote style. The comma that separates it from the last item goes directly after that
 * item, so a comment after the item stays a comment.
 *
 * @param config - The source of `deck.config.ts`.
 * @param id - The slide id to add.
 * @returns The new source, or `undefined` when the list cannot be edited safely or already holds
 *   the id; {@link slideListProblem} says why.
 */
export function appendSlideId(config: string, id: string): string | undefined {
  const list = editableList(config);
  if (list === undefined || !PLAIN_ID_PATTERN.test(id) || holdsId(list, id)) {
    return undefined;
  }

  const body = config.slice(list.bodyStart, list.bodyEnd);
  const item = quoted(id, list);
  const multiLine = body.includes('\n');
  const last = list.lastEntryEnd;
  if (last === undefined) {
    const text = multiLine ? `\n${indentOf(body)}${item},` : item;
    return config.slice(0, list.bodyStart) + text + config.slice(list.bodyStart);
  }

  const comma = skipSpaceAndComments(config, last, false);
  const hasComma = config.charAt(comma) === ',';
  if (!multiLine) {
    const at = hasComma ? comma + 1 : last;
    const text = hasComma ? ` ${item},` : `, ${item}`;
    return config.slice(0, at) + text + config.slice(at);
  }

  const lineEnd = skipSpaceAndComments(config, hasComma ? comma + 1 : last, true);
  const added = `\n${indentOf(body)}${item},`;
  const withItem = config.slice(0, lineEnd) + added + config.slice(lineEnd);
  return hasComma ? withItem : withItem.slice(0, last) + ',' + withItem.slice(last);
}

/**
 * Whether the list already holds an id.
 *
 * @param list - The list.
 * @param id - The slide id.
 */
function holdsId(list: SlidesList, id: string): boolean {
  return list.items.some((entry) => entry.kind === 'string' && entry.value === id);
}

/**
 * Skips spaces, tabs and comments.
 *
 * @param source - The source.
 * @param start - Where to start.
 * @param sameLine - Whether to stop at the first line break outside a comment, so the result is the
 *   end of the line's own code and comments.
 * @returns The index of the next character that is not skipped.
 */
function skipSpaceAndComments(source: string, start: number, sameLine: boolean): number {
  let index = start;
  while (index < source.length) {
    const char = source.charAt(index);
    const next = source.charAt(index + 1);
    if (char === ' ' || char === '\t' || (!sameLine && (char === '\n' || char === '\r'))) {
      index += 1;
    } else if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      index = end < 0 ? source.length : end;
      if (sameLine) {
        return index;
      }
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end < 0 ? source.length : end + 2;
    } else {
      break;
    }
  }

  return index;
}

/**
 * Rewrites the `slides` array of a deck config to list the given ids in the given order, keeping
 * its single-line or multi-line layout, indentation and quote style.
 *
 * @param config - The source of `deck.config.ts`.
 * @param ids - Every slide id, in the new order.
 * @returns The new source, or `undefined` when the list cannot be rewritten safely (no list, more
 *   than one, entries that are not quoted ids, or comments inside it); {@link slideListProblem}
 *   says why.
 */
export function reorderSlideIds(config: string, ids: readonly string[]): string | undefined {
  const list = editableList(config);
  if (list === undefined || list.hasComments) {
    return undefined;
  }

  const body = config.slice(list.bodyStart, list.bodyEnd);
  const items = ids.map((id) => quoted(id, list));
  const text = body.includes('\n') ? multiLineList(body, items) : items.join(', ');
  return config.slice(0, list.bodyStart) + text + config.slice(list.bodyEnd);
}

/**
 * Why the `slides` list of a deck config cannot be edited, as a sentence for an error message.
 *
 * @param config - The source of `deck.config.ts`.
 * @param options - `rewrite: true` for a reorder, which also refuses comments inside the list;
 *   `append` is an id about to be added, which the list may not hold already.
 * @returns The reason, or `undefined` when the list can be edited.
 */
export function slideListProblem(
  config: string,
  options: { rewrite: boolean; append?: string },
): string | undefined {
  const found = findSlidesList(config);
  if (found.kind === 'none') {
    return 'No `slides: [...]` list was found in the deck config.';
  }

  if (found.kind === 'many') {
    return (
      'The deck config has more than one `slides: [...]` list, ' + 'so it is unclear which to edit.'
    );
  }

  const other = found.list.items.find((entry) => entry.kind === 'other');
  if (other !== undefined) {
    return (
      `The \`slides\` list holds \`${other.text}\`, which is not a quoted slide id, ` +
      'so it cannot be edited without changing what it means.'
    );
  }

  const { append } = options;
  if (append !== undefined && holdsId(found.list, append)) {
    return `The \`slides\` list already holds "${append}".`;
  }

  if (options.rewrite && found.list.hasComments) {
    return 'The `slides` list has comments inside it, which rewriting it would lose.';
  }

  return undefined;
}

/**
 * The deck config's one `slides` list, when every entry is a quoted id.
 *
 * @param config - The source of `deck.config.ts`.
 */
function editableList(config: string): SlidesList | undefined {
  const found = findSlidesList(config);
  if (found.kind !== 'one' || found.list.items.some((entry) => entry.kind === 'other')) {
    return undefined;
  }

  return found.list;
}

/**
 * An id in the quote style the list already uses.
 *
 * @param id - The slide id.
 * @param list - The list.
 */
function quoted(id: string, list: SlidesList): string {
  const first = list.items.find((entry) => entry.kind === 'string');
  const quote = first?.kind === 'string' ? first.quote : "'";
  return `${quote}${id}${quote}`;
}

/**
 * A multi-line list body with one item per line, keeping the original indentation.
 *
 * @param body - The text between the brackets.
 * @param items - The quoted ids in the new order.
 */
function multiLineList(body: string, items: readonly string[]): string {
  const indent = indentOf(body);
  const lines = items.map((item) => `\n${indent}${item},`);
  return `${lines.join('')}\n${closingIndent(body)}`;
}

/**
 * The indentation of the list's items, or two spaces when there are none.
 *
 * @param body - The text between the brackets.
 */
function indentOf(body: string): string {
  return ITEM_INDENT_PATTERN.exec(body)?.[1] ?? '  ';
}

/**
 * The indentation before the closing bracket.
 *
 * @param body - The text between the brackets.
 */
function closingIndent(body: string): string {
  return CLOSING_INDENT_PATTERN.exec(body)?.[1] ?? '';
}
