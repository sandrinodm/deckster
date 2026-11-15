import { describe, expect, it } from 'vite-plus/test';

import {
  cellsFromCentres,
  columnSizes,
  gridSize,
  placeAtCentres,
  placeOnGrid,
  widthForWords,
} from '#diagrams/flow-grid.ts';
import { TEST_METRICS } from '#diagrams/flow.fixture.ts';
import { centerOf } from '#diagrams/geometry.ts';

/**
 * A 1600x600 diagram box.
 */
const SIZE = { width: 1600, height: 600 };

describe('placeOnGrid', () => {
  it('gives every one-column node the same width and lines up a row on one centre line', () => {
    const cells = new Map([
      ['a', { col: 1, row: 1, colSpan: 1, rowSpan: 1 }],
      ['b', { col: 2, row: 1, colSpan: 1, rowSpan: 1 }],
      ['c', { col: 3, row: 1, colSpan: 1, rowSpan: 1 }],
    ]);
    const { nodes } = placeOnGrid(cells, SIZE, TEST_METRICS);
    const rects = ['a', 'b', 'c'].map((id) => nodes.get(id));
    expect(new Set(rects.map((rect) => rect?.width)).size).toBe(1);
    expect(new Set(rects.map((rect) => rect && centerOf(rect).y)).size).toBe(1);
    expect(rects.every((rect) => (rect?.width ?? 0) <= TEST_METRICS.nodeMaxWidth)).toBe(true);
  });

  it('aligns the grid with the left edge of the box, centred down it, and keeps it inside', () => {
    const cells = new Map([['a', { col: 1, row: 1, colSpan: 1, rowSpan: 1 }]]);
    const { nodes } = placeOnGrid(cells, SIZE, TEST_METRICS);
    const rect = nodes.get('a');
    expect(rect?.x).toBe(0);
    expect(rect && centerOf(rect).y).toBe(300);
    const centred = placeOnGrid(cells, SIZE, TEST_METRICS, { align: 'center' }).nodes.get('a');
    expect(centred && centerOf(centred)).toEqual({ x: 800, y: 300 });
  });

  it('fills the width when the columns need it, the outer nodes on the box edges', () => {
    const cells = new Map(
      [1, 2, 3, 4, 5].map((col) => [`n${col}`, { col, row: 1, colSpan: 1, rowSpan: 1 }]),
    );
    const { nodes } = placeOnGrid(cells, { width: 1664, height: 600 }, TEST_METRICS);
    const first = nodes.get('n1');
    const last = nodes.get('n5');
    expect(first?.x).toBe(0);
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBeCloseTo(1664);
  });

  it('stretches a spanning node to the outer edges of its neighbours', () => {
    const cells = new Map([
      ['a', { col: 1, row: 1, colSpan: 1, rowSpan: 1 }],
      ['b', { col: 3, row: 1, colSpan: 1, rowSpan: 1 }],
      ['bus', { col: 1, row: 2, colSpan: 3, rowSpan: 1 }],
    ]);
    const { nodes } = placeOnGrid(cells, SIZE, TEST_METRICS);
    const a = nodes.get('a');
    const b = nodes.get('b');
    const bus = nodes.get('bus');
    expect(bus?.x).toBeCloseTo(a?.x ?? 0);
    expect((bus?.x ?? 0) + (bus?.width ?? 0)).toBeCloseTo((b?.x ?? 0) + (b?.width ?? 0));
  });

  it('gives each row the height of its tallest node with even gaps between rows', () => {
    const cells = new Map([
      ['a', { col: 1, row: 1, colSpan: 1, rowSpan: 1 }],
      ['b', { col: 1, row: 2, colSpan: 1, rowSpan: 1 }],
      ['c', { col: 1, row: 3, colSpan: 1, rowSpan: 1 }],
    ]);
    const heights = new Map([
      ['a', 80],
      ['b', 140],
      ['c', 80],
    ]);
    const { nodes } = placeOnGrid(cells, SIZE, TEST_METRICS, { heights });
    const [a, b, c] = ['a', 'b', 'c'].map((id) => nodes.get(id));
    expect(a?.height).toBe(80);
    expect(b?.height).toBe(140);
    const gapAB = (b?.y ?? 0) - ((a?.y ?? 0) + (a?.height ?? 0));
    const gapBC = (c?.y ?? 0) - ((b?.y ?? 0) + (b?.height ?? 0));
    expect(gapAB).toBeCloseTo(gapBC);
  });

  it('reports a grid too narrow for its columns as cramped', () => {
    const cells = new Map(
      Array.from({ length: 9 }, (_, index) => [
        `n${index}`,
        { col: index + 1, row: 1, colSpan: 1, rowSpan: 1 },
      ]),
    );
    expect(placeOnGrid(cells, SIZE, TEST_METRICS).cramped).toBe(true);
    expect(placeOnGrid(new Map([...cells].slice(0, 4)), SIZE, TEST_METRICS).cramped).toBe(false);
  });
});

describe('columnSizes', () => {
  it('lets nodes take free width up to their maximum and keeps the label gutter', () => {
    const sized = columnSizes(1664, 4, { ...TEST_METRICS, gutterX: 80 });
    expect(sized.nodeWidth).toBe(TEST_METRICS.nodeMaxWidth);
    expect(sized.cellWidth).toBeGreaterThanOrEqual(sized.nodeWidth + 80);
    expect(sized.cramped).toBe(false);
  });

  it('gives the gutter up before the nodes when a long label wants more than there is', () => {
    const sized = columnSizes(1664, 4, { ...TEST_METRICS, gutterX: 600, minGutterX: 48 });
    expect(sized.nodeWidth).toBe(TEST_METRICS.nodeMinWidth);
    expect(sized.cellWidth).toBeGreaterThanOrEqual(sized.nodeWidth + 48);
    expect(sized.cellWidth * 3 + sized.nodeWidth).toBeLessThanOrEqual(1664 + 0.01);
    expect(sized.cramped).toBe(false);
  });

  it('widens nodes until their widest whole word fits, taking room from the gutters', () => {
    const words = { narrow: 290, wide: 330 };
    const plain = columnSizes(1664, 4, { ...TEST_METRICS, gutterX: 300 });
    const widened = columnSizes(1664, 4, { ...TEST_METRICS, gutterX: 300, wordWidths: words });
    expect(plain.nodeWidth).toBeLessThan(290);
    expect(widened.nodeWidth).toBe(290);
    expect(widened.gutter).toBeLessThan(plain.gutter);
    expect(widthForWords(310, words)).toBe(330);
    expect(widthForWords(200, { narrow: 320, wide: 360 })).toBe(360);
    expect(
      columnSizes(1664, 4, {
        ...TEST_METRICS,
        gutterX: 300,
        wordWidths: { narrow: 900, wide: 900 },
      }).nodeWidth,
    ).toBe(TEST_METRICS.nodeMaxWidth);
  });

  it('keeps room for a short label between columns however wide the words want the nodes', () => {
    const sized = columnSizes(1664, 4, {
      ...TEST_METRICS,
      gutterX: 300,
      labelGutterMin: 150,
      wordWidths: { narrow: 330, wide: 330 },
    });
    expect(sized.gutter).toBeGreaterThanOrEqual(150 - 0.01);
    expect(sized.nodeWidth).toBeCloseTo((1664 - 3 * 150) / 4);
  });

  it('is cramped only when even the least gutter leaves nodes under their minimum', () => {
    expect(columnSizes(1600, 9, TEST_METRICS).cramped).toBe(true);
  });
});

describe('placeAtCentres', () => {
  it('never squeezes a layout below its own spacing: it keeps the spacing and is cramped', () => {
    const centres = new Map(
      Array.from({ length: 7 }, (_, index) => [`n${index}`, { x: 0, y: index * 160 }]),
    );
    const placed = placeAtCentres(centres, SIZE, TEST_METRICS);
    const rects = [...placed.nodes.values()].sort((a, b) => a.y - b.y);
    rects.slice(1).forEach((rect, index) => {
      const above = rects[index];
      expect(rect.y).toBeGreaterThanOrEqual((above?.y ?? 0) + (above?.height ?? 0));
    });
    expect(placed.cramped).toBe(true);
  });
});

describe('gridSize', () => {
  it('counts the columns and rows the cells use, spans included, and keeps a minimum', () => {
    expect(gridSize([{ col: 2, row: 1, colSpan: 3, rowSpan: 2 }])).toEqual({ cols: 4, rows: 2 });
    expect(gridSize([{ col: 1, row: 1, colSpan: 1, rowSpan: 1 }], { cols: 5 })).toEqual({
      cols: 5,
      rows: 1,
    });
  });
});

describe('cellsFromCentres', () => {
  it('snaps centres that line up within half a node into the same column or row', () => {
    const centres = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 400, y: 10 }],
      ['c', { x: 410, y: 200 }],
    ]);
    const cells = cellsFromCentres(centres, { width: 300, height: 100 });
    expect(cells?.get('a')).toMatchObject({ col: 1, row: 1 });
    expect(cells?.get('b')).toMatchObject({ col: 2, row: 1 });
    expect(cells?.get('c')).toMatchObject({ col: 2, row: 2 });
  });

  it('gives up when two nodes would share a cell', () => {
    const centres = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 20, y: 20 }],
    ]);
    expect(cellsFromCentres(centres, { width: 300, height: 100 })).toBeUndefined();
  });
});

describe('placeOnGrid with many rows', () => {
  it('places a tall grid in linear time', () => {
    const rows = 40_000;
    const cells = new Map([
      ['top', { col: 1, row: 1, colSpan: 1, rowSpan: 1 }],
      ['far', { col: 1, row: rows, colSpan: 1, rowSpan: 1 }],
    ]);
    const started = performance.now();
    const { nodes } = placeOnGrid(cells, SIZE, TEST_METRICS);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(nodes.get('far')?.y).toBeGreaterThan(nodes.get('top')?.y ?? 0);
  });
});
