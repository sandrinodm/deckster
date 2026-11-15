import { describe, expect, it } from 'vite-plus/test';

import type { SceneCell, TableNode } from '#scene/scene.ts';

import { placeCells, tableXml } from '#pptx/table-xml.ts';
import { surfaceThemeFixture } from '#pptx/theme.fixture.ts';
import { boxNode, line, paragraph } from '#scene/scene.fixture.ts';

/**
 * A cell at a column and row of a 100-pixel grid.
 *
 * @param column - The column.
 * @param row - The row.
 * @param overrides - Fields that differ.
 */
function cell(column: number, row: number, overrides: Partial<SceneCell> = {}): SceneCell {
  return {
    rect: { x: column * 100, y: row * 50, width: 100, height: 50 },
    paragraphs: [
      paragraph([line(`${column},${row}`, row * 50 + 35, { left: column * 100 + 8 })], {
        box: { x: column * 100 + 8, y: row * 50 + 8, width: 84, height: 34 },
      }),
    ],
    fill: null,
    borders: [null, null, { width: 1, color: '#d9dce4', style: 'solid' }, null],
    padding: [8, 8, 8, 8],
    colSpan: 1,
    rowSpan: 1,
    header: row === 0,
    verticalAlign: 'top',
    ...overrides,
  };
}

/**
 * A 3x2 table whose first header cell spans two columns.
 */
const TABLE: TableNode = {
  ...boxNode(1, { rect: { x: 0, y: 0, width: 300, height: 100 } }),
  kind: 'table',
  columns: [100, 100, 100],
  rows: [
    {
      height: 50,
      cells: [cell(0, 0, { colSpan: 2, rect: { x: 0, y: 0, width: 200, height: 50 } }), cell(2, 0)],
    },
    { height: 50, cells: [cell(0, 1), cell(1, 1), cell(2, 1, { fill: '#f4f5f8' })] },
  ],
};

describe('tables', () => {
  it('places spanned cells with merge markers', () => {
    const grid = placeCells(TABLE);
    expect(grid.map((row) => row.map((slot) => slot.kind))).toEqual([
      ['cell', 'merged', 'cell'],
      ['cell', 'cell', 'cell'],
    ]);
  });

  it('writes a native table with its grid, spans, borders, fills and text', () => {
    const xml = tableXml(TABLE, 4, {
      theme: surfaceThemeFixture(),
      families: { major: 'Bricolage Grotesque', minor: 'Inter' },
      link: () => null,
      slideNumber: null,
    });
    expect(xml.match(/<a:gridCol w="635000"\/>/g)).toHaveLength(3);
    expect(xml).toContain('<a:tc gridSpan="2">');
    expect(xml).toContain('<a:tc hMerge="1">');
    expect(xml).toContain('<a:tblPr firstRow="1"/>');
    expect(xml).toContain('<a:lnB w="6350">');
    expect(xml).toContain('<a:schemeClr val="bg2"/>');
    expect(xml).toContain('<a:t>2,1</a:t>');
  });
});
