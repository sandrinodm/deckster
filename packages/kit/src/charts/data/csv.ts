import type { Cell, Row } from '#charts/data/rows.ts';

/**
 * A number as a CSV writes it: an optional sign, digits with optional thousands commas, an optional
 * fraction and exponent.
 */
const NUMBER_PATTERN = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:e[+-]?\d+)?$/iu;

/**
 * A number written with a leading zero (`007`, `0123`, `-0,5`): an identifier or a code, not a
 * quantity, so it stays text.
 */
const LEADING_ZERO = /^[+-]?0[\d,]/u;

/**
 * The byte order mark some spreadsheet exports start a file with.
 */
const BYTE_ORDER_MARK = '\uFEFF';

/**
 * One record of raw fields, with the line it starts on.
 */
type CsvRecord = {
  /**
   * The raw text of each field.
   */
  fields: string[];

  /**
   * The line the record starts on, counting from 1.
   */
  line: number;
};

/**
 * Thousands separators inside a number.
 */
const COMMAS = /,/gu;

/**
 * A digit, which a number-looking field must contain to count as a number.
 */
const DIGIT = /\d/u;

/**
 * Parses CSV text into rows keyed by the header line: quoted fields may hold commas, quotes
 * (doubled) and line breaks; numbers become numbers (`1,240` included when quoted), `true` and
 * `false` booleans, and empty fields `null`. Blank lines are skipped.
 *
 * @param text - The CSV text, with a header line first.
 * @returns One row per data line; an empty list when there is no data line.
 * @throws Error naming the line when a quoted field is never closed or a line has more or fewer
 *   fields than the header, and naming the column when the header repeats one.
 */
export function parseCsv(text: string): Row[] {
  const records = readRecords(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text);
  const [header, ...lines] = records;
  if (header === undefined) {
    return [];
  }

  const keys = header.fields.map((key) => key.trim());
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new Error(
        `The CSV header names the column "${key}" twice (line ${header.line}). ` +
          'Rename one so each column has its own name.',
      );
    }

    seen.add(key);
  }

  return lines
    .filter(({ fields }) => fields.some((field) => field.trim() !== ''))
    .map(({ fields, line }) => {
      if (fields.length !== keys.length) {
        const noun = fields.length === 1 ? 'field' : 'fields';
        throw new Error(
          `CSV line ${line} has ${fields.length} ${noun} but the header has ${keys.length}. ` +
            'Quote a field that contains a comma, and give every line the same fields.',
        );
      }

      return Object.fromEntries(keys.map((key, index) => [key, cell(fields[index])]));
    });
}

/**
 * Reads a CSV cell as the value a chart wants: a number, a boolean, `null` for empty, else the
 * text, trimmed.
 *
 * @param field - The field's raw text, or `undefined` past the end of a short line.
 */
export function cell(field: string | undefined): Cell {
  const trimmed = field?.trim() ?? '';
  if (trimmed === '') {
    return null;
  }

  if (NUMBER_PATTERN.test(trimmed) && DIGIT.test(trimmed) && !LEADING_ZERO.test(trimmed)) {
    return Number(trimmed.replace(COMMAS, ''));
  }

  if (trimmed === 'true' || trimmed === 'false') {
    return trimmed === 'true';
  }

  return trimmed;
}

/**
 * Splits CSV text into records of raw fields, honoring quotes.
 *
 * @param text - The CSV text.
 */
function readRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let recordLine = 1;
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let quoteLine = 1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quoted) {
      if (char === '"' && text.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
        if (char === '\n' || (char === '\r' && text.charAt(index + 1) !== '\n')) {
          line += 1;
        }
      }

      continue;
    }

    if (char === '"' && field.trim() === '') {
      quoted = true;
      quoteLine = line;
      field = '';
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text.charAt(index + 1) === '\n') {
        index += 1;
      }

      fields.push(field);
      records.push({ fields, line: recordLine });
      fields = [];
      field = '';
      line += 1;
      recordLine = line;
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new Error(`A quoted field that starts on line ${quoteLine} is never closed.`);
  }

  if (field !== '' || fields.length > 0) {
    fields.push(field);
    records.push({ fields, line: recordLine });
  }

  return records;
}
