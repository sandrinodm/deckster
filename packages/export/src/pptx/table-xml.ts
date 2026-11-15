import type { TextContext } from '#pptx/text-xml.ts';
import type { SceneBorder, SceneCell, TableNode } from '#scene/scene.ts';

import { el } from '#ooxml/xml.ts';
import { TABLE_URI } from '#pptx/namespaces.ts';
import { cNvPr, xfrm } from '#pptx/shape-xml.ts';
import { layoutFrame, paragraphsXml } from '#pptx/text-xml.ts';
import { colorXml } from '#pptx/theme.ts';
import { pxToEmu } from '#units.ts';

/**
 * A cell's position in the grid, or a position another cell spans.
 */
type GridSlot =
  | {
      /**
       * A cell starts here.
       */
      kind: 'cell';

      /**
       * The cell.
       */
      cell: SceneCell;
    }
  | {
      /**
       * Spanned by the cell to the left (`h`), above (`v`), or both.
       */
      kind: 'merged';

      /**
       * Whether it continues a horizontal span.
       */
      horizontal: boolean;

      /**
       * Whether it continues a vertical span.
       */
      vertical: boolean;
    };

/**
 * A native table: the grid as rendered, each cell's text with its fonts and line breaks, fills and
 * borders, and merged cells for row and column spans.
 *
 * @param node - The table.
 * @param id - The shape id.
 * @param context - The slide's theme, fonts and links.
 * @returns A graphic frame.
 */
export function tableXml(node: TableNode, id: number, context: TextContext): string {
  const grid = placeCells(node);
  const columns = el(
    'a:tblGrid',
    {},
    ...node.columns.map((width) => el('a:gridCol', { w: pxToEmu(width) })),
  );
  const rows = grid.map((slots, rowIndex) =>
    el(
      'a:tr',
      { h: pxToEmu(node.rows[rowIndex]?.height ?? 0) },
      ...slots.map((slot) =>
        slot.kind === 'cell' ? cellXml(slot.cell, context) : mergedXml(slot),
      ),
    ),
  );
  const hasHeader = node.rows[0]?.cells.every((cell) => cell.header) ?? false;
  return el(
    'p:graphicFrame',
    {},
    el(
      'p:nvGraphicFramePr',
      {},
      cNvPr(id, `Table ${node.id}`),
      el('p:cNvGraphicFramePr', {}, el('a:graphicFrameLocks', { noGrp: 1 })),
      el('p:nvPr'),
    ),
    xfrm(node.rect, 'p:xfrm'),
    el(
      'a:graphic',
      {},
      el(
        'a:graphicData',
        { uri: TABLE_URI },
        el('a:tbl', {}, el('a:tblPr', { firstRow: hasHeader ? 1 : undefined }), columns, ...rows),
      ),
    ),
  );
}

/**
 * Places every cell in the grid, marking the positions spans cover.
 *
 * @param node - The table.
 * @returns One row of slots per table row, one slot per column.
 */
export function placeCells(node: TableNode): GridSlot[][] {
  const edges = node.columns.reduce<number[]>(
    (list, width) => [...list, (list.at(-1) ?? node.rect.x) + width],
    [node.rect.x],
  );
  const width = node.columns.length;
  const grid: (GridSlot | undefined)[][] = node.rows.map(() => Array.from({ length: width }));
  node.rows.forEach((row, rowIndex) => {
    for (const cell of row.cells) {
      const column = nearestEdge(edges, cell.rect.x);
      const target = grid[rowIndex];
      if (target === undefined || column >= width) {
        continue;
      }

      target[column] = { kind: 'cell', cell };
      markSpans(grid, rowIndex, column, cell, width);
    }
  });
  return grid.map((row) =>
    row.map((slot) => slot ?? { kind: 'merged', horizontal: true, vertical: false }),
  );
}

/**
 * Marks the grid positions a cell's row and column spans cover, other than its own, as merged.
 * Positions past the table's last column are left out.
 *
 * @param grid - The grid being placed.
 * @param rowIndex - The row of the cell.
 * @param column - The column of the cell.
 * @param cell - The cell.
 * @param width - The number of columns.
 */
function markSpans(
  grid: (GridSlot | undefined)[][],
  rowIndex: number,
  column: number,
  cell: SceneCell,
  width: number,
): void {
  for (let r = 0; r < cell.rowSpan; r += 1) {
    for (let c = 0; c < cell.colSpan; c += 1) {
      const isCoveredByOther = r > 0 || c > 0;
      const spanned = grid[rowIndex + r];
      if (isCoveredByOther && spanned !== undefined && column + c < width) {
        spanned[column + c] = { kind: 'merged', horizontal: c > 0, vertical: r > 0 };
      }
    }
  }
}

/**
 * The index of the grid line nearest a position.
 *
 * @param edges - The column edges, left to right.
 * @param x - The position.
 */
function nearestEdge(edges: readonly number[], x: number): number {
  let best = 0;
  edges.forEach((edge, index) => {
    if (Math.abs(edge - x) < Math.abs((edges[best] ?? 0) - x)) {
      best = index;
    }
  });
  return best;
}

/**
 * One cell: its text laid out from the cell's top-left corner, its padding as margins, its borders
 * and fill.
 *
 * @param cell - The cell.
 * @param context - The slide's theme, fonts and links.
 */
function cellXml(cell: SceneCell, context: TextContext): string {
  const hasText = cell.paragraphs.some((paragraph) => paragraph.lines.length > 0);
  const layout = hasText ? layoutFrame(cell.paragraphs) : null;
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = cell.padding;
  const marginLeft = layout === null ? paddingLeft : Math.max(0, layout.rect.x - cell.rect.x);
  const marginTop = layout === null ? paddingTop : Math.max(0, layout.rect.y - cell.rect.y);
  const body =
    layout === null
      ? el('a:p', {}, el('a:endParaRPr', { lang: 'en-US', dirty: 0 }))
      : paragraphsXml(layout, context);
  const [top, right, bottom, left] = cell.borders;
  return el(
    'a:tc',
    {
      gridSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
      rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
    },
    el('a:txBody', {}, el('a:bodyPr'), el('a:lstStyle'), body),
    el(
      'a:tcPr',
      {
        marL: pxToEmu(marginLeft),
        marR: pxToEmu(paddingRight),
        marT: pxToEmu(marginTop),
        marB: pxToEmu(paddingBottom),
        anchor: 't',
      },
      borderXml('a:lnL', left, context),
      borderXml('a:lnR', right, context),
      borderXml('a:lnT', top, context),
      borderXml('a:lnB', bottom, context),
      cell.fill === null
        ? el('a:noFill')
        : el('a:solidFill', {}, colorXml(cell.fill, context.theme)),
    ),
  );
}

/**
 * A position covered by a span.
 *
 * @param slot - The merged slot.
 */
function mergedXml(slot: Extract<GridSlot, { kind: 'merged' }>): string {
  return el(
    'a:tc',
    { hMerge: slot.horizontal ? 1 : undefined, vMerge: slot.vertical ? 1 : undefined },
    el('a:txBody', {}, el('a:bodyPr'), el('a:lstStyle'), el('a:p')),
    el('a:tcPr'),
  );
}

/**
 * One cell border; a side without a border gets no line, so PowerPoint's table style draws none.
 *
 * @param tag - `a:lnL`, `a:lnR`, `a:lnT` or `a:lnB`.
 * @param border - The side.
 * @param context - The slide's theme.
 */
function borderXml(tag: string, border: SceneBorder | null, context: TextContext): string {
  if (border === null) {
    return el(tag, { w: 0 }, el('a:noFill'));
  }

  return el(
    tag,
    { w: pxToEmu(border.width) },
    el('a:solidFill', {}, colorXml(border.color, context.theme)),
  );
}
