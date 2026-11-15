import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';

import { maxOf } from '#foundation/lists.ts';
import { highlightMatches, useTableLayout } from '#foundation/table-context.ts';

/**
 * A cell that holds a number as a slide writes it: an optional sign and currency, digits with
 * separators, and an optional short unit (`$4.2M`, `−12%`, `1,240`, `2.8 °C`, `12 m³`).
 */
const NUMERIC_CELL = /^[+\-−±]?[$€£¥]?\s?\d[\d,.\s]*(?:\s?(?:%|[A-Za-z°²³µ]{1,3}))?$/u;

/**
 * The props of a cell element MDX renders.
 */
type CellProps = ComponentProps<'td'> & {
  /**
   * Whether the cell is in a column of numbers.
   */
  'data-numeric'?: boolean;

  /**
   * Whether the cell is in the highlighted row or column.
   */
  'data-highlight'?: boolean;
};

/**
 * A React element whose props have children, such as a table section, row or cell.
 */
type ChildrenElement = ReactElement<{ children?: ReactNode }>;

/**
 * Which columns of a table are marked, and how.
 */
type ColumnMarks = {
  /**
   * Whether each column holds numbers, so its cells align right.
   */
  readonly numeric: readonly boolean[];

  /**
   * The highlighted column's index, or -1 when the slide highlights none.
   */
  readonly highlightedColumn: number;
};

/**
 * The text of a React node, as the table shows it.
 *
 * @param node - Any node.
 */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }

  return '';
}

/**
 * The elements among a node's children, skipping the white space MDX leaves between them.
 *
 * @param node - A table section or row.
 */
function elementsOf(node: ReactNode): ChildrenElement[] {
  return Children.toArray(node).filter((child): child is ChildrenElement => isValidElement(child));
}

/**
 * The cells of a row, typed as the table's cells.
 *
 * @param row - A table row.
 */
function cellsOf(row: ChildrenElement): ReactElement<CellProps>[] {
  return elementsOf(row.props.children) as ReactElement<CellProps>[];
}

/**
 * Whether a cell sets its own alignment (a Markdown `:--:` column).
 *
 * @param props - The cell's props.
 */
function hasAlignment(props: CellProps): boolean {
  return props.align !== undefined || props.style?.textAlign !== undefined;
}

/**
 * Which columns hold numbers, so they align right. The first column holds the row names and never
 * aligns; any other column does when every filled cell in it reads as a number.
 *
 * @param rows - The body rows.
 * @param columns - How many columns the table has.
 * @param alignNumbers - Whether the `table` layout aligns numbers at all.
 */
function numericColumns(
  rows: readonly ChildrenElement[],
  columns: number,
  alignNumbers: boolean,
): boolean[] {
  return Array.from({ length: columns }, (_, column) => {
    const filled = rows
      .map((row) => textOf(cellsOf(row)[column]?.props.children).trim())
      .filter((text) => text !== '');
    return (
      alignNumbers &&
      column > 0 &&
      filled.length > 0 &&
      filled.every((text) => NUMERIC_CELL.test(text))
    );
  });
}

/**
 * The index of the highlighted column among the headers, found by its header or its 1-based number.
 *
 * @param headers - The header texts.
 * @param wanted - The column the slide highlights, if any.
 */
function highlightedColumnIndex(
  headers: readonly string[],
  wanted: string | number | undefined,
): number {
  if (wanted === undefined) {
    return -1;
  }

  return headers.findIndex((header, index) => highlightMatches(wanted, header, index));
}

/**
 * A cell with the attributes its column gives it: numbers align right unless the cell sets its own
 * alignment, and the highlighted column is marked.
 *
 * @param cell - The cell.
 * @param column - Its column, 0-based.
 * @param marks - The table's column marks.
 */
function treatCell(
  cell: ReactElement<CellProps>,
  column: number,
  marks: ColumnMarks,
): ReactElement<CellProps> {
  return cloneElement(cell, {
    ...(marks.numeric[column] === true && !hasAlignment(cell.props)
      ? { 'data-numeric': true }
      : {}),
    ...(column === marks.highlightedColumn ? { 'data-highlight': true } : {}),
  });
}

/**
 * The rows of a body section with the highlighted row marked and each cell treated by its column.
 *
 * @param section - A body section.
 * @param firstRow - The 0-based position of the section's first row in the whole table.
 * @param highlightedRow - The row the slide highlights, if any.
 * @param marks - The table's column marks.
 */
function treatRows(
  section: ChildrenElement,
  firstRow: number,
  highlightedRow: string | number | undefined,
  marks: ColumnMarks,
): ReactElement[] {
  return elementsOf(section.props.children).map((row, index) => {
    const first = textOf(cellsOf(row)[0]?.props.children);
    const marked =
      highlightedRow !== undefined && highlightMatches(highlightedRow, first, firstRow + index);
    return cloneElement(row as ReactElement<{ children?: ReactNode; 'data-highlight'?: boolean }>, {
      ...(marked ? { 'data-highlight': true } : {}),
      children: cellsOf(row).map((cell, column) => treatCell(cell, column, marks)),
    });
  });
}

/**
 * How many rows the body sections before one hold, so its first row's position follows them.
 *
 * @param bodies - The body sections, in order.
 * @param sectionIndex - The section's place among them.
 */
function rowsBefore(bodies: readonly ChildrenElement[], sectionIndex: number): number {
  let count = 0;
  for (const previous of bodies.slice(0, sectionIndex)) {
    count += elementsOf(previous.props.children).length;
  }

  return count;
}

/**
 * A Markdown table, as MDX renders `| a | b |` (the kit maps the `table` element to it). Outside
 * the `table` layout it is a plain table. In the layout it gets the kit's treatment from the slide,
 * at render time, so re-renders and hot reload keep it: the brand's emphasis style, columns of
 * numbers marked to align right with tabular figures, and the row and column `highlight:` names
 * marked as the kit `<Table>` marks them.
 */
export function MarkdownTable(props: ComponentProps<'table'>): ReactNode {
  const layout = useTableLayout();
  if (layout === undefined) {
    return <table {...props} />;
  }

  const sections = elementsOf(props.children);
  const head = sections.find((section) => section.type === 'thead');
  const headRow = elementsOf(head?.props.children)[0];
  const headers = elementsOf(headRow?.props.children).map((cell) => textOf(cell.props.children));
  const bodies = sections.filter((section) => section.type !== 'thead');
  const rows = bodies.flatMap((section) => elementsOf(section.props.children));
  const columns = maxOf(
    rows.map((row) => cellsOf(row).length),
    headers.length,
  );
  const marks: ColumnMarks = {
    numeric: numericColumns(rows, columns, layout.alignNumbers),
    highlightedColumn: highlightedColumnIndex(headers, layout.highlight?.column),
  };
  const highlightedRow = layout.highlight?.row;
  const treatedHead =
    head === undefined || headRow === undefined
      ? undefined
      : cloneElement(head, {
          key: 'head',
          children: cloneElement(headRow, {
            children: cellsOf(headRow).map((cell, column) => treatCell(cell, column, marks)),
          }),
        });
  const treatedBodies = bodies.map((section, sectionIndex) =>
    cloneElement(section, {
      key: `body-${sectionIndex}`,
      children: treatRows(section, rowsBefore(bodies, sectionIndex), highlightedRow, marks),
    }),
  );
  return (
    <table
      {...props}
      className={['kit-table', props.className].filter(Boolean).join(' ')}
      data-emphasis={layout.emphasis}>
      {treatedHead}
      {treatedBodies}
    </table>
  );
}
