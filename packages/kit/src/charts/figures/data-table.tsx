import type { CSSProperties, ReactNode } from 'react';

import type { DataProp, Row, Rows } from '#charts/data/rows.ts';
import type { FormatProp, ResolvedFormat } from '#charts/format/number-format.ts';
import type { ChartDrawing, DrawInput, FrameProps } from '#charts/frame/chart-frame.tsx';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';

import { fieldKinds, resolveRows, toLabel, toNumber } from '#charts/data/rows.ts';
import { COMPACT_FROM, resolveFormat, runFormatter } from '#charts/format/number-format.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { buildSpec } from '#charts/frame/spec-builder.ts';
import { maxOf } from '#foundation/lists.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import '#charts/figures/figures.css';
import {
  highlightMatches,
  useTableLayout,
  type TableLayoutSettings,
} from '#foundation/table-context.ts';

/**
 * The most fraction digits a column writes to keep its values exact.
 */
const MAX_EXACT_DIGITS = 4;

/**
 * The base the digits of a fraction are counted in.
 */
const DECIMAL_BASE = 10;

/**
 * The whole of a percentage, for the width of an in-cell bar.
 */
const PERCENT_WHOLE = 100;

/**
 * How far a value may sit from a whole multiple of 10 to the power of its digits and still count as
 * written exactly.
 */
const EXACT_DIGIT_TOLERANCE = 1e-9;

/**
 * One column of a {@link Table}.
 */
export type TableColumn = {
  /**
   * The field it shows.
   */
  key: string;

  /**
   * The header; the field name when left out.
   */
  label?: string;

  /**
   * How a number column's values are written.
   */
  format?: FormatProp;

  /**
   * The unit after a number column's values.
   */
  unit?: string;

  /**
   * Draw a bar under each number, to scale from zero within the column.
   */
  bar?: boolean;

  /**
   * Alignment: numbers right, text left when left out.
   */
  align?: 'left' | 'right';
};

/**
 * What a table emphasizes: rows (by the first column's text, or index), a column, or single cells.
 */
export type TableHighlight = {
  /**
   * Rows by the text in their first column, or by index from 0.
   */
  row?: string | number | readonly (string | number)[];

  /**
   * A column by its key.
   */
  column?: string;

  /**
   * Single cells, by row and column.
   */
  cell?:
    | { row: string | number; column: string }
    | readonly { row: string | number; column: string }[];
};

/**
 * Props of {@link Table}.
 */
export type TableProps = FrameProps & {
  /**
   * The rows: inline, imported, or a dataset of the slide's `data:` frontmatter.
   */
  data: DataProp;

  /**
   * The columns, in order: field names or column settings; every field when left out.
   */
  columns?: readonly (string | TableColumn)[];

  /**
   * The rows, column or cells the point rests on, marked the way the brand's table style says (an
   * accent fill, accent text or an accent bar).
   */
  highlight?: TableHighlight;

  /**
   * How number columns are written, unless a column sets its own.
   */
  format?: FormatProp;
};

/**
 * Every prop {@link Table} takes, checked against its props type at compile time and against the
 * catalog by its test.
 */
export const TABLE_PROPS = propNames<TableProps>()([
  'at',
  'caption',
  'source',
  'label',
  'data',
  'format',
  'columns',
  'highlight',
]);

/**
 * A small table with emphasis, for exact values, lookups and mixed units: the kit's base table
 * style (label headers, hairline rules, tabular figures, numbers right-aligned) in the brand's
 * table type steps, with highlighted rows, a column or cells marked the brand's way, and optional
 * in-cell bars to scale from zero. Keep it to about five rows by four columns on a slide.
 *
 * ```mdx
 * <Table data={plans} columns={['plan', { key: 'cost', format: 'currency', bar: true }, 'seats']}
 *   highlight={{ row: 'Team' }} />
 * ```
 */
export function Table(props: TableProps): ReactNode {
  checkProps('Table', props);
  const layout = useTableLayout();
  // In the table layout, the slide's `highlight:` marks the table unless the table names its own.
  const fromLayout = props.highlight === undefined ? layout?.highlight : undefined;
  return (
    <ChartFrame
      kind="table"
      {...frameProps(props)}
      draw={(input) => drawTable(props, input, fromLayout)}
    />
  );
}

/**
 * A column with every choice made.
 */
type ResolvedColumn = {
  /**
   * The field.
   */
  key: string;

  /**
   * The header.
   */
  label: string;

  /**
   * Whether it holds numbers.
   */
  numeric: boolean;

  /**
   * How its numbers are written.
   */
  write: (value: number) => string;

  /**
   * Whether it draws bars.
   */
  bar: boolean;

  /**
   * Its largest magnitude, for bars.
   */
  largest: number;

  /**
   * Its alignment.
   */
  align: 'left' | 'right';
};

/**
 * Lays out the table.
 *
 * @param props - The table's props.
 * @param input - The theme and the slide's datasets.
 */
function drawTable(
  props: TableProps,
  input: DrawInput,
  fromLayout?: TableLayoutSettings['highlight'],
): ChartDrawing {
  const { theme } = input;
  const rows = resolveRows(props.data, input.datasets);
  const columns = resolveColumns(rows, props, theme);
  const marks = emphasis(rows, columns, props.highlight ?? layoutHighlight(fromLayout, columns));
  const lead = theme.categorical[0] ?? theme.colors.accent;
  const body = `kit-type-${theme.table.body}`;
  const plot = (
    <table
      className={`kit-chart-table ${body}`}
      data-emphasis={theme.table.emphasis}
      style={{ '--kit-table-rows': rows.length + 1 } as CSSProperties}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              align={column.align}
              data-highlight={marks.columns.has(column.key) || undefined}>
              {smartPunctuation(column.label)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} data-highlight={marks.rows.has(index) || undefined}>
            {columns.map((column) => (
              <td
                key={column.key}
                align={column.align}
                data-highlight={
                  marks.columns.has(column.key) ||
                  marks.cells.has(`${index}|${column.key}`) ||
                  undefined
                }>
                <Cell
                  row={row}
                  column={column}
                  color={
                    marks.active &&
                    !marks.rows.has(index) &&
                    !marks.cells.has(`${index}|${column.key}`)
                      ? theme.context
                      : lead
                  }
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  const text = rows.map((row) => columns.map((column) => cellText(row, column)));
  const sentence = text.map((cells) => cells.join(', ')).join('; ');
  const format = resolveFormat(props.format, undefined, theme.numbers);
  const spec = buildSpec(
    {
      kind: 'table',
      name: `Table of ${rows.length} rows: ${columns.map((column) => column.label).join(', ')}`,
      summary: `${sentence}.`,
      table: {
        columns: columns.map((column) => ({
          key: column.key,
          label: column.label,
          align: column.align,
        })),
        rows: text,
        highlightRows: [...marks.rows],
        highlightColumns: [...marks.columns],
        highlightCells: [...marks.cells].map((cell) => {
          const [row = '0', column = ''] = cell.split('|');
          return { row: Number(row), column };
        }),
        emphasis: theme.table.emphasis,
      },
    },
    { theme, format, largest: 0, caption: props.caption, source: props.source },
  );
  return {
    plot,
    spec,
    facts: {
      series: columns.length,
      categories: rows.length,
      highlighted: marks.active,
      axis: 'none',
      unit: true,
      legend: false,
      legendAvoidable: false,
      marks: rows.length,
    },
  };
}

/**
 * Props of {@link Cell}.
 */
type CellProps = {
  /**
   * The row.
   */
  row: Row;

  /**
   * The column.
   */
  column: ResolvedColumn;

  /**
   * The bar's color.
   */
  color: string;
};

/**
 * One cell's content: its text, and for a bar column a bar to scale under it.
 */
function Cell({ row, column, color }: CellProps): ReactNode {
  const text = cellText(row, column);
  const value = toNumber(row[column.key]);
  if (!column.bar || value === null) {
    return smartPunctuation(text);
  }

  const style: CSSProperties = {
    width: `${(Math.abs(value) / Math.max(column.largest, Number.EPSILON)) * PERCENT_WHOLE}%`,
    background: color,
  };
  return (
    <span className="kit-table-bar-cell">
      <span className="kit-table-value">{text}</span>
      <span className="kit-table-bar" aria-hidden="true" data-decorative="">
        <span style={style} />
      </span>
    </span>
  );
}

/**
 * A cell's text: a number in its column's format, anything else as written.
 *
 * @param row - The row.
 * @param column - The column.
 */
function cellText(row: Row, column: ResolvedColumn): string {
  const value = row[column.key];
  const number = column.numeric ? toNumber(value) : null;
  return number === null ? toLabel(value) : column.write(number);
}

/**
 * The columns with their headers, formats and alignment.
 *
 * @param rows - The rows.
 * @param props - The table's props.
 * @param theme - The chart theme.
 */
function resolveColumns(rows: Rows, props: TableProps, theme: ChartTheme): ResolvedColumn[] {
  const kinds = fieldKinds(rows);
  const numbers = new Set(kinds.numbers);
  const list = props.columns ?? Object.keys(rows[0] ?? {});
  return list.map((entry) => {
    const column: TableColumn = typeof entry === 'string' ? { key: entry } : entry;
    const numeric = numbers.has(column.key);
    const values = rows.map((row) => toNumber(row[column.key])).filter((value) => value !== null);
    const asked = resolveFormat(column.format ?? props.format, column.unit, theme.numbers);
    // A table states exact values: it writes the digits the data has unless a format fixes them.
    const exact =
      asked.fixed || (asked.notation === 'compact' && largestOf(values) >= COMPACT_FROM);
    const format: ResolvedFormat = exact
      ? asked
      : { ...asked, digits: exactDigits(values), minDigits: exactDigits(values), fixed: true };
    return {
      key: column.key,
      label: column.label ?? column.key,
      numeric,
      write: runFormatter(values, format),
      bar: column.bar === true && numeric,
      largest: largestOf(values),
      align: column.align ?? (numeric ? 'right' : 'left'),
    };
  });
}

/**
 * The table layout's `highlight:` as a table highlight: a row by its first cell or number (1-based,
 * as the frontmatter counts), a column by its key, its label or its number. A column the table does
 * not have marks nothing; a row it does not have fails as the table's own `highlight` does.
 *
 * @param highlight - The slide's highlight, if any.
 * @param columns - The table's columns.
 */
function layoutHighlight(
  highlight: TableLayoutSettings['highlight'],
  columns: readonly ResolvedColumn[],
): TableHighlight | undefined {
  if (highlight === undefined) {
    return undefined;
  }

  const { row, column } = highlight;
  const key = column === undefined ? undefined : layoutColumnKey(column, columns);
  // The slide counts rows from 1; a row given as text is matched by its first cell as it is.
  const rowKey = typeof row === 'number' ? row - 1 : row;
  return {
    ...(rowKey === undefined ? {} : { row: rowKey }),
    ...(key === undefined ? {} : { column: key }),
  };
}

/**
 * The key of the column the table layout's highlight names: by its number (1-based), or by a key or
 * label the column matches.
 *
 * @param column - The highlight's column, as the slide wrote it.
 * @param columns - The table's columns.
 */
function layoutColumnKey(
  column: string | number,
  columns: readonly ResolvedColumn[],
): string | undefined {
  return columns.find((candidate, index) => columnMatches(column, candidate, index))?.key;
}

/**
 * Whether a column is the one a table layout's highlight names.
 *
 * @param column - The highlight's column, as the slide wrote it.
 * @param candidate - The column to test.
 * @param index - The column's position from 0.
 */
function columnMatches(column: string | number, candidate: ResolvedColumn, index: number): boolean {
  if (typeof column === 'number') {
    return index + 1 === column;
  }

  return (
    highlightMatches(column, candidate.key, index) ||
    highlightMatches(column, candidate.label, index)
  );
}

/**
 * The largest magnitude of some values.
 *
 * @param values - The values.
 */
function largestOf(values: readonly number[]): number {
  return maxOf(values.map(Math.abs), 0);
}

/**
 * The fraction digits that write every value of a column as it is, at most four: 8.25 keeps two.
 *
 * @param values - The column's values.
 */
export function exactDigits(values: readonly number[]): number {
  return maxOf(
    values.map((value) => {
      let digits = 0;
      while (
        digits < MAX_EXACT_DIGITS &&
        Math.abs(value * DECIMAL_BASE ** digits - Math.round(value * DECIMAL_BASE ** digits)) >
          EXACT_DIGIT_TOLERANCE
      ) {
        digits += 1;
      }

      return digits;
    }),
    0,
  );
}

/**
 * The rows, columns and cells a highlight marks.
 *
 * @param rows - The rows.
 * @param columns - The columns.
 * @param highlight - The `highlight` prop.
 * @throws Error naming the rows or columns when a highlight names one the table lacks.
 */
function emphasis(
  rows: Rows,
  columns: readonly ResolvedColumn[],
  highlight: TableHighlight | undefined,
): { active: boolean; rows: Set<number>; columns: Set<string>; cells: Set<string> } {
  const first = columns[0]?.key ?? '';
  /**
   * The index of a row named by its first-column text or its index.
   */
  const rowIndex = (target: string | number): number => {
    const index =
      typeof target === 'number' ? target : rows.findIndex((row) => toLabel(row[first]) === target);
    if (index < 0 || index >= rows.length) {
      const names = rows.map((row) => toLabel(row[first])).join(', ');
      throw new Error(`The table has no row "${target}". Its rows are: ${names}.`);
    }

    return index;
  };
  /**
   * A column key the table has.
   */
  const columnKey = (key: string): string => {
    if (!columns.some((column) => column.key === key)) {
      const keys = columns.map((column) => column.key).join(', ');
      throw new Error(`The table has no column "${key}". Its columns are: ${keys}.`);
    }

    return key;
  };
  const rowList = highlight?.row === undefined ? [] : [highlight.row].flat();
  const cellList = highlight?.cell === undefined ? [] : [highlight.cell].flat();
  const marked = {
    rows: new Set(rowList.map(rowIndex)),
    columns: new Set(highlight?.column === undefined ? [] : [columnKey(highlight.column)]),
    cells: new Set(cellList.map((cell) => `${rowIndex(cell.row)}|${columnKey(cell.column)}`)),
  };
  return { active: marked.rows.size + marked.columns.size + marked.cells.size > 0, ...marked };
}
