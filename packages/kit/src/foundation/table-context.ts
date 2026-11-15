import { createContext, useContext } from 'react';

/**
 * What the `table` layout tells the tables on its slide: the row or column the frontmatter
 * highlights, how the brand marks emphasis, and whether columns of numbers align right. A Markdown
 * table and a kit `<Table>` in the layout read it, so both mark the same row the same way.
 */
export type TableLayoutSettings = {
  /**
   * The row (by its first cell or 1-based number) and column (by its header or number) the slide's
   * `highlight:` names.
   */
  readonly highlight:
    | { readonly row?: string | number; readonly column?: string | number }
    | undefined;

  /**
   * How the brand marks emphasis in tables (`charts.table.emphasis`).
   */
  readonly emphasis: string;

  /**
   * Whether columns of numbers are aligned right.
   */
  readonly alignNumbers: boolean;
};

/**
 * The settings of the `table` layout the table renders in, or `undefined` anywhere else.
 */
export const TableLayoutContext = createContext<TableLayoutSettings | undefined>(undefined);

/**
 * The `table` layout's settings, when the calling table renders in one.
 */
export function useTableLayout(): TableLayoutSettings | undefined {
  return useContext(TableLayoutContext);
}

/**
 * Whether a highlight value names a row or column: by its text, case aside, or its 1-based number.
 *
 * @param wanted - The highlight's value.
 * @param text - The row's first cell or the column's header.
 * @param index - The 0-based position.
 */
export function highlightMatches(wanted: string | number, text: string, index: number): boolean {
  return typeof wanted === 'number'
    ? wanted === index + 1
    : wanted.trim().toLowerCase() === text.trim().toLowerCase();
}
