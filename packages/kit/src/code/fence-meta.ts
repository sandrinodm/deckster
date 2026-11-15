/**
 * The options a fenced code block carries after its language, such as `ts title="server.ts" {2-4|7}
 * lineNumbers /useState/`.
 */
export type FenceMeta = {
  /**
   * The file name for the title bar, from `title="..."` or `file="..."`.
   */
  file?: string;

  /**
   * The language label: text from `label="..."`, or `false` for `noLabel`.
   */
  label?: string | false;

  /**
   * Whether to show line numbers (`lineNumbers`).
   */
  lineNumbers: boolean;

  /**
   * Whether lines starting with `+` or `-` are additions and removals (`diff`).
   */
  diff: boolean;

  /**
   * The highlight steps from `{2-4|7}`, as the text between the braces.
   */
  highlight?: string;

  /**
   * The words to mark, from `/word/` entries.
   */
  words: string[];

  /**
   * The number the first line gets (`start=10`).
   */
  start?: number;

  /**
   * The step the first highlight shows at (`at=2`).
   */
  at?: number;

  /**
   * `false` when `noDim` keeps lines outside the highlight at full strength.
   */
  dim?: boolean;
};

/**
 * One item of a meta string: braces, a slash-delimited word, `key=value`, a quoted string or a bare
 * word.
 */
const ITEM_PATTERN =
  /\{([^}]*)\}|\/((?:[^/\\]|\\.)+)\/|(\w+)=("[^"]*"|'[^']*'|\S+)|"([^"]*)"|'([^']*)'|(\S+)/g;

/**
 * A value in matching single or double quotes.
 */
const QUOTED = /^(["'])(.*)\1$/;

/**
 * Bare words that turn line numbers on.
 */
const LINE_NUMBER_FLAGS = new Set(['lineNumbers', 'showLineNumbers', 'numbers']);

/**
 * Keys whose value names the title bar's file.
 */
const FILE_KEYS = new Set(['title', 'file']);

/**
 * Parses the text after the language of a fenced code block.
 *
 * @param meta - The fence's meta string; `null` or `undefined` for none.
 * @returns The options it sets.
 * @throws RangeError listing the valid options, for an item it does not know or a number that is
 *   not one.
 */
export function parseFenceMeta(meta: string | null | undefined): FenceMeta {
  const result: FenceMeta = { lineNumbers: false, diff: false, words: [] };
  for (const match of (meta ?? '').matchAll(ITEM_PATTERN)) {
    const [, braces, word, key, value, double, single, bare] = match;
    if (braces !== undefined) {
      result.highlight = braces;
    } else if (word !== undefined) {
      result.words.push(word.replaceAll('\\/', '/'));
    } else if (key !== undefined && value !== undefined) {
      applyOption(result, key, unquote(value));
    } else if (double !== undefined || single !== undefined) {
      result.file = double ?? single ?? '';
    } else if (bare !== undefined) {
      applyFlag(result, bare);
    }
  }

  return result;
}

/**
 * Applies a `key=value` option.
 *
 * @param result - The options so far, changed in place.
 * @param key - The option name.
 * @param value - The value without quotes.
 */
function applyOption(result: FenceMeta, key: string, value: string): void {
  if (FILE_KEYS.has(key)) {
    result.file = value;
  } else if (key === 'label') {
    result.label = value;
  } else if (key === 'start') {
    result.start = wholeNumber(key, value);
  } else if (key === 'at') {
    result.at = wholeNumber(key, value);
  } else {
    throw unknownOption(`${key}=${value}`);
  }
}

/**
 * Applies a bare flag.
 *
 * @param result - The options so far, changed in place.
 * @param flag - The word.
 */
function applyFlag(result: FenceMeta, flag: string): void {
  if (LINE_NUMBER_FLAGS.has(flag)) {
    result.lineNumbers = true;
  } else if (flag === 'diff') {
    result.diff = true;
  } else if (flag === 'noDim') {
    result.dim = false;
  } else if (flag === 'noLabel') {
    result.label = false;
  } else {
    throw unknownOption(flag);
  }
}

/**
 * A value as a whole number.
 *
 * @param key - The option, for the message.
 * @param value - The text.
 * @throws RangeError when it is not a non-negative integer.
 */
function wholeNumber(key: string, value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(`${key}=${value} is not a whole number. Write for example \`${key}=2\`.`);
  }

  return number;
}

/**
 * Removes one pair of surrounding quotes.
 *
 * @param value - A value that may be quoted.
 */
function unquote(value: string): string {
  const quoted = QUOTED.exec(value);
  return quoted?.[2] ?? value;
}

/**
 * The error for an option the fence does not support, listing the ones it does.
 *
 * @param item - The item as written.
 */
function unknownOption(item: string): RangeError {
  return new RangeError(
    `"${item}" is not a code block option. Use title="file.ts", {2-4|7}, /word/, lineNumbers, ` +
      'diff, noDim, noLabel, label="TS", start=10 or at=2.',
  );
}
