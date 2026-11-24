import type { LimitCase } from '@deckster/kit/limit-cases';

/**
 * Prints a layout's limit cases as the `limits.ts` of a code layout, laid out the way the
 * repository's formatter lays out literals: on one line when it fits, otherwise one entry per
 * line.
 */

/**
 * The widest line the formatter allows.
 */
const MAX_LINE_CHARS = 100;

/**
 * One step of indentation.
 */
const INDENT = '  ';

/**
 * The longest key the formatter keeps a long string beside: moving the string to the next line
 * would gain too little room.
 */
const SHORT_KEY_CHARS = 4;

/**
 * The text between a property's key and its value.
 */
const KEY_SEPARATOR = ': ';

/**
 * Matches a property name that needs no quotes.
 */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

/**
 * The text before the list of cases.
 */
const LEAD = 'export default ';

/**
 * The text after the list of cases.
 */
const TAIL = ' satisfies readonly LimitCase[];';

/**
 * A printed value.
 */
type Printed = {
  /**
   * The text, which continues at the indent it was printed for.
   */
  readonly text: string;

  /**
   * Whether the text spans several lines.
   */
  readonly broken: boolean;
};

/**
 * The source of a code layout's `limits.ts` holding the given cases as plain literals.
 *
 * @param cases - The limit cases; values other than plain data (strings, numbers, booleans, null,
 *   arrays and objects of those) are not expected, and a key whose value is `undefined` is left
 *   out.
 * @returns The module's text.
 */
export function limitsSource(cases: readonly LimitCase[]): string {
  const list = printValue(cases, '', LEAD.length, TAIL.length);
  return [
    "import type { LimitCase } from '@deckster/kit/limit-cases';",
    '',
    '/**',
    " * The slides `deckster layouts check` fills to the layout's limits: the cases the kit tests this",
    ' * layout with, as they were when it was ejected. Each is rendered with the title, the eyebrow and',
    ' * the slots at their longest. Change a case when you change what the layout accepts: its',
    ' * `frontmatter`, and in `filled` the named slots it fills besides body. The file runs in Node like',
    ' * `contract.ts`, so import types only, or the modules a contract may import.',
    ' */',
    `${LEAD}${list.text}${TAIL}`,
    '',
  ].join('\n');
}

/**
 * Prints a value at an indent, on one line when the line stays within the width.
 *
 * @param value - Plain data.
 * @param indent - The indent of the line the value starts on.
 * @param before - How many characters stand before the value on its line, after the indent.
 * @param after - How many characters follow the value on its last line.
 */
function printValue(value: unknown, indent: string, before: number, after: number): Printed {
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return printList({
      items: items.map((item) => ({ lead: '', value: item })),
      brackets: ['[', ']'],
      spaced: false,
      mustBreak: breaksAlways(items),
      indent,
      before,
      after,
    });
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
    return printList({
      items: entries.map(([key, entry]) => ({
        lead: `${printKey(key)}${KEY_SEPARATOR}`,
        value: entry,
      })),
      brackets: ['{', '}'],
      spaced: true,
      mustBreak: false,
      indent,
      before,
      after,
    });
  }

  return { text: typeof value === 'string' ? printString(value) : String(value), broken: false };
}

/**
 * Prints an array or an object.
 */
function printList(list: {
  /**
   * The entries, each with the text in front of its value (a key, or nothing).
   */
  readonly items: readonly { lead: string; value: unknown }[];

  /**
   * The opening and closing bracket.
   */
  readonly brackets: readonly [string, string];

  /**
   * Whether the one-line form has a space inside the brackets.
   */
  readonly spaced: boolean;

  /**
   * Whether the list is printed one entry per line even when it would fit on one.
   */
  readonly mustBreak: boolean;

  /**
   * The indent of the line the list starts on.
   */
  readonly indent: string;

  /**
   * The characters before the list on its line, after the indent.
   */
  readonly before: number;

  /**
   * The characters after the list on its last line.
   */
  readonly after: number;
}): Printed {
  const [open, close] = list.brackets;
  if (list.items.length === 0) {
    return { text: `${open}${close}`, broken: false };
  }

  const inner = `${list.indent}${INDENT}`;
  const flat = list.items.map((item) => ({
    lead: item.lead,
    printed: printValue(item.value, '', 0, 0),
  }));
  const pad = list.spaced ? ' ' : '';
  const oneLine = `${open}${pad}${flat.map((item) => `${item.lead}${item.printed.text}`).join(', ')}${pad}${close}`;
  const fits = list.indent.length + list.before + oneLine.length + list.after <= MAX_LINE_CHARS;
  const anyBroken = flat.some((item) => item.printed.broken);
  if (fits && !list.mustBreak && !anyBroken && !oneLine.includes('\n')) {
    return { text: oneLine, broken: false };
  }

  const lines = list.items.map((item) => {
    const printed = printValue(item.value, inner, item.lead.length, 1);
    const line = `${inner}${item.lead}${printed.text},`;
    return movesToNextLine(item, line)
      ? `${inner}${item.lead.trimEnd()}\n${inner}${INDENT}${printed.text},`
      : line;
  });
  return { text: [open, ...lines, `${list.indent}${close}`].join('\n'), broken: true };
}

/**
 * Tells whether the formatter puts a property's value on the line after its key: a string that
 * makes the line too wide, unless the key is so short that the move gains nothing.
 */
function movesToNextLine(item: { lead: string; value: unknown }, line: string): boolean {
  const keyChars = item.lead.length - KEY_SEPARATOR.length;
  return (
    typeof item.value === 'string' && keyChars > SHORT_KEY_CHARS && line.length > MAX_LINE_CHARS
  );
}

/**
 * Tells whether the formatter prints an array one entry per line whatever its width: when it has
 * several entries and each is an object, or each an array, with more than one entry of its own.
 */
function breaksAlways(items: readonly unknown[]): boolean {
  if (items.length < 2) {
    return false;
  }

  const allArrays = items.every((item) => Array.isArray(item) && item.length > 1);
  const allObjects = items.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      !Array.isArray(item) &&
      Object.keys(item).length > 1,
  );
  return allArrays || allObjects;
}

/**
 * Prints a property name, quoted only when it is not an identifier.
 */
function printKey(key: string): string {
  return IDENTIFIER.test(key) ? key : printString(key);
}

/**
 * Prints a string in single quotes, or in double quotes when that needs fewer escapes.
 */
function printString(value: string): string {
  const singles = value.split("'").length - 1;
  const doubles = value.split('"').length - 1;
  const quote = singles > doubles ? '"' : "'";
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
    .replaceAll(quote, `\\${quote}`);
  return `${quote}${escaped}${quote}`;
}
