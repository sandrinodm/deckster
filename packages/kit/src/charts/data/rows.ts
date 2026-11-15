import { parseCsv } from '#charts/data/csv.ts';

/**
 * Separates the series name from the category in the key the duplicate check builds for each long
 * row: a control character that data files do not hold in practice.
 */
const KEY_SEPARATOR = '\u0000';

/**
 * One value in a row: text, a number, a flag or nothing.
 */
export type Cell = string | number | boolean | null;

/**
 * One row of data, as MDX, frontmatter, JSON or CSV give it: field names to values.
 */
export type Row = Readonly<Record<string, Cell>>;

/**
 * Rows of data.
 */
export type Rows = readonly Row[];

/**
 * What a chart's `data` prop takes: rows written inline or imported from a JSON or CSV file in the
 * deck folder, the name of a dataset in the slide's `data:` frontmatter, or CSV text.
 */
export type DataProp = Rows | string;

/**
 * One series a chart draws from a value field: the field name, or the field with a label and the
 * step it appears at.
 */
export type SeriesInput =
  | string
  | {
      /**
       * The field that holds the series' values.
       */
      field: string;

      /**
       * The name the chart labels the series with; the field name when left out.
       */
      label?: string;

      /**
       * The step that reveals the series; shown from the start when left out.
       */
      at?: number;
    };

/**
 * A series drawn from rows, its values in category order.
 */
export type SeriesData = {
  /**
   * The field (wide data) or the value of the series field (long data) it came from.
   */
  key: string;

  /**
   * The name the chart labels it with.
   */
  label: string;

  /**
   * One value per category; `null` where a row has none.
   */
  values: (number | null)[];

  /**
   * The step that reveals it, if any.
   */
  at: number | undefined;
};

/**
 * Categories and the series over them, ready to draw.
 */
export type CategoricalData = {
  /**
   * The category field.
   */
  x: string;

  /**
   * The categories, in the order of their first row.
   */
  categories: string[];

  /**
   * The series, in the order the chart names them (or of their first row, for long data).
   */
  series: SeriesData[];
};

/**
 * Which fields a categorical chart reads.
 */
export type FieldChoice = {
  /**
   * The category field; the first text field when left out.
   */
  x?: string | undefined;

  /**
   * The value field or fields; every number field but `x` (and `series`) when left out.
   */
  y?: SeriesInput | readonly SeriesInput[] | undefined;

  /**
   * For long data, the field whose values name the series; the values then come from `y`.
   */
  series?: string | undefined;
};

/**
 * The rows a chart draws: rows as given, a dataset from the slide's `data:` frontmatter, or CSV
 * text (anything with a line break and a comma).
 *
 * @param data - The chart's `data` prop.
 * @param datasets - The slide's `data:` frontmatter, if any.
 * @returns The rows.
 * @throws Error naming the datasets the slide has when `data` names one it does not.
 */
export function resolveRows(data: DataProp, datasets: unknown): Rows {
  if (typeof data !== 'string') {
    return data;
  }

  const named = typeof datasets === 'object' && datasets !== null ? datasets : {};
  const found: unknown = Reflect.get(named, data);
  if (Array.isArray(found)) {
    return found;
  }

  if (data.includes('\n') && data.includes(',')) {
    return parseCsv(data);
  }

  const names = Object.keys(named);
  const known =
    names.length === 0 ? 'The slide has no `data:` frontmatter' : `It has ${names.join(', ')}`;
  throw new Error(
    `data="${data}" names no dataset in the slide's \`data:\` frontmatter. ${known}. Pass rows ` +
      'with data={[...]}, import a JSON or CSV file, or add the dataset under `data:`.',
  );
}

/**
 * The value of a cell as a number: numbers as they are, numeric text parsed, anything else `null`.
 *
 * @param value - A cell.
 */
export function toNumber(value: Cell | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replaceAll(',', ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * A cell as category text: numbers and flags as written, `null` as an empty string.
 *
 * @param value - A cell.
 */
export function toLabel(value: Cell | undefined): string {
  return value === null || value === undefined || typeof value === 'function' ? '' : String(value);
}

/**
 * The fields of the rows, split into those holding text and those holding only numbers, in the
 * order they first appear.
 *
 * @param rows - The rows.
 */
export function fieldKinds(rows: Rows): { text: string[]; numbers: string[] } {
  const order: string[] = [];
  const isText = new Map<string, boolean>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (!isText.has(key)) {
        order.push(key);
        isText.set(key, false);
      }

      if (value !== null && toNumber(value) === null) {
        isText.set(key, true);
      }
    }
  }

  return {
    text: order.filter((key) => isText.get(key) === true),
    numbers: order.filter((key) => isText.get(key) === false),
  };
}

/**
 * Reads categories and series from rows, wide or long. Wide rows hold one field per series (`{
 * month, us, eu }` with `y={['us', 'eu']}`); long rows hold a series field and one value field (`{
 * month, region, revenue }` with `series="region" y="revenue"`).
 *
 * @param rows - The rows.
 * @param choice - The category, value and series fields; inferred where left out.
 * @returns The categories in row order and the series over them.
 * @throws Error naming the fields the rows have when a named field is missing.
 */
export function categorical(rows: Rows, choice: FieldChoice): CategoricalData {
  const kinds = fieldKinds(rows);
  const x = choice.x ?? kinds.text[0] ?? Object.keys(rows[0] ?? {})[0] ?? '';
  requireField(rows, x, 'x');
  const labels = rows.map((row) => toLabel(row[x]));
  const categories = unique(labels);
  if (choice.series !== undefined) {
    return { x, ...longSeries(rows, x, choice.series, categories, choice.y) };
  }

  const inputs = seriesInputs(
    choice.y,
    kinds.numbers.filter((key) => key !== x),
  );
  requireUnique(labels, (category) => `Two rows have ${x}="${category}"`);
  const series = inputs.map((input) => {
    requireField(rows, input.field, 'y');
    const byCategory = new Map(rows.map((row) => [toLabel(row[x]), toNumber(row[input.field])]));
    return {
      key: input.field,
      label: input.label ?? input.field,
      values: categories.map((category) => byCategory.get(category) ?? null),
      at: input.at,
    };
  });
  return { x, categories, series };
}

/**
 * The value fields a chart reads, each as an object.
 *
 * @param y - The chart's `y` prop.
 * @param fallback - The fields to use when `y` is left out.
 */
export function seriesInputs(
  y: SeriesInput | readonly SeriesInput[] | undefined,
  fallback: readonly string[],
): { field: string; label?: string; at?: number }[] {
  return asList(y, fallback).map((input) => (typeof input === 'string' ? { field: input } : input));
}

/**
 * A `y` prop as a list.
 *
 * @param y - One field, several, or none.
 * @param fallback - The fields to use for none.
 */
function asList(
  y: SeriesInput | readonly SeriesInput[] | undefined,
  fallback: readonly string[],
): readonly SeriesInput[] {
  if (y === undefined) {
    return fallback;
  }

  return isList(y) ? y : [y];
}

/**
 * Whether a `y` prop is a list of fields.
 *
 * @param y - One field or several.
 */
function isList(y: SeriesInput | readonly SeriesInput[]): y is readonly SeriesInput[] {
  return Array.isArray(y);
}

/**
 * Series from long rows: one per distinct value of the series field.
 *
 * @param rows - The rows.
 * @param x - The category field.
 * @param seriesField - The field naming each row's series.
 * @param categories - The categories in order.
 * @param y - The value field.
 */
function longSeries(
  rows: Rows,
  x: string,
  seriesField: string,
  categories: string[],
  y: SeriesInput | readonly SeriesInput[] | undefined,
): Omit<CategoricalData, 'x'> {
  requireField(rows, seriesField, 'series');
  const kinds = fieldKinds(rows);
  const [input] = seriesInputs(
    y,
    kinds.numbers.filter((key) => key !== x && key !== seriesField),
  );
  const valueField = input?.field ?? '';
  requireField(rows, valueField, 'y');
  const names = unique(rows.map((row) => toLabel(row[seriesField])));
  requireUnique(
    rows.map((row) => `${toLabel(row[seriesField])}${KEY_SEPARATOR}${toLabel(row[x])}`),
    (pair) => {
      const [name, category] = pair.split(KEY_SEPARATOR);
      return `Two rows have ${seriesField}="${name ?? ''}" and ${x}="${category ?? ''}"`;
    },
  );
  const series = names.map((name) => {
    const byCategory = new Map(
      rows
        .filter((row) => toLabel(row[seriesField]) === name)
        .map((row) => [toLabel(row[x]), toNumber(row[valueField])]),
    );
    return {
      key: name,
      label: name,
      values: categories.map((category) => byCategory.get(category) ?? null),
      at: undefined,
    };
  });
  return { categories, series };
}

/**
 * Fails when no row has a field the chart names.
 *
 * @param rows - The rows.
 * @param field - The field name.
 * @param prop - The prop that named it, for the message.
 */
function requireField(rows: Rows, field: string, prop: string): void {
  if (rows.length === 0 || rows.some((row) => Object.hasOwn(row, field))) {
    return;
  }

  const fields = Object.keys(rows[0] ?? {}).join(', ');
  throw new Error(`${prop}="${field}" is not a field of the data. Its fields are: ${fields}.`);
}

/**
 * Fails when a key repeats: a second row for the same category (or series and category) would
 * silently replace the first.
 *
 * @param keys - One key per row.
 * @param describe - Says which rows clash, for a repeated key.
 * @throws Error naming the repeated key and the fix.
 */
function requireUnique(keys: readonly string[], describe: (key: string) => string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new Error(
        `${describe(key)}; a chart draws one value per category and series. Sum or remove the ` +
          'repeated rows, or name them apart.',
      );
    }

    seen.add(key);
  }
}

/**
 * The distinct values of a list, in first-seen order.
 *
 * @param values - The values.
 */
function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
