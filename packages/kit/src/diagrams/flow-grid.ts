import type { DiagramAlign } from '#diagrams/diagram-design.ts';
import type { FlowSpec, GridCell } from '#diagrams/flow-spec.ts';

import { alignedOffset } from '#diagrams/diagram-design.ts';
import { EPSILON, inflate, unionOf, type Point, type Rect } from '#diagrams/geometry.ts';
import { maxOf, minOf } from '#foundation/lists.ts';

/**
 * The sizes a diagram is built from, in canvas pixels. Text sizes come from the brand's type steps
 * and never scale; these are the boxes around them.
 */
export type FlowMetrics = {
  /**
   * Explicit alignment also lets gutters stay compact when the region is wider than the scene.
   */
  align?: DiagramAlign | undefined;

  /**
   * The narrowest a node may get before the diagram counts as cramped.
   */
  nodeMinWidth: number;

  /**
   * The widest a one-column node gets, however much room there is.
   */
  nodeMaxWidth: number;

  /**
   * The height every node shares: the tallest node's content.
   */
  nodeHeight: number;

  /**
   * The room between two columns of nodes that fits edges and their labels.
   */
  gutterX: number;

  /**
   * The least room between two columns, for edges without labels; narrower than this the diagram is
   * cramped. Defaults to `gutterY`.
   */
  minGutterX?: number;

  /**
   * How wide a node must be for the widest whole word of any node's title or subtitle to fit on a
   * line: when it is narrower than {@link NARROW_NODE_WIDTH} (icon stacked over the text), and when
   * it is wider (icon beside the text). Nodes widen to fit it, taking room from the gutters, before
   * any word breaks.
   */
  wordWidths?: { narrow: number; wide: number };

  /**
   * The least gutter widening nodes may leave between two columns when edge labels sit there: room
   * for a short label, so words in nodes do not crush the labels between them.
   */
  labelGutterMin?: number;

  /**
   * The least room between two rows of nodes.
   */
  gutterY: number;

  /**
   * Room between a group's border and the nodes in it.
   */
  groupPadding: number;

  /**
   * The height of a group's label row, above its nodes.
   */
  groupLabel: number;
};

/**
 * Room kept free at each edge of the diagram, in pixels: group borders and labels around the
 * outermost nodes.
 */
export type Insets = {
  /**
   * Room at the top.
   */
  top: number;

  /**
   * Room at the right.
   */
  right: number;

  /**
   * Room at the bottom.
   */
  bottom: number;

  /**
   * Room at the left.
   */
  left: number;
};

/**
 * No room kept.
 */
export const NO_INSETS: Insets = {
  /**
   * No room at the top.
   */
  top: 0,

  /**
   * No room at the right.
   */
  right: 0,

  /**
   * No room at the bottom.
   */
  bottom: 0,

  /**
   * No room at the left.
   */
  left: 0,
};

/**
 * The node width below which a node stacks its icon over its text (the stylesheet's container
 * query, `.kit-flow-node` narrower than 300px).
 */
export const NARROW_NODE_WIDTH = 300;

/**
 * The widest a grid cell gets, as a multiple of the node width: wider gutters than this make the
 * diagram feel loose, so the grid is centred instead.
 */
const MAX_CELL_WIDTH_RATIO = 1.75;

/**
 * The tallest a grid cell gets, as a multiple of the node height.
 */
const MAX_CELL_HEIGHT_RATIO = 2.6;

/**
 * The share of the row gutter below which rows count as cramped: edges between them have room for
 * their stubs but not for labels.
 */
const CRAMPED_GUTTER_SHARE = 0.6;

/**
 * The half-pixel slack allowed when checking that nodes fit their minimum width, so rounding in the
 * measurements alone does not mark a diagram cramped.
 */
const MIN_WIDTH_SLACK = 0.5;

/**
 * Nodes placed on the grid, in diagram pixels.
 */
export type GridPlacement = {
  /**
   * Each node's box, by id.
   */
  nodes: Map<string, Rect>;

  /**
   * The area the grid takes, centred in the diagram.
   */
  bounds: Rect;

  /**
   * Whether the nodes had to get narrower than {@link FlowMetrics.nodeMinWidth} or the rows closer
   * than the gutter, which `deckster lint` reports as too dense.
   */
  cramped: boolean;

  /**
   * The grid cell of each node, when the nodes sit on a grid; the router picks a diagonal edge's
   * sides from them.
   */
  cells?: ReadonlyMap<string, GridCell>;
};

/**
 * The columns and rows a diagram's cells use.
 *
 * @param cells - Every placed cell.
 * @param minimum - Columns and rows the author asked for at least.
 */
export function gridSize(
  cells: readonly GridCell[],
  minimum: { cols?: number; rows?: number } = {},
): { cols: number; rows: number } {
  const cols = maxOf(
    cells.map((cell) => cell.col + cell.colSpan - 1),
    minimum.cols ?? 1,
  );
  const rows = maxOf(
    cells.map((cell) => cell.row + cell.rowSpan - 1),
    minimum.rows ?? 1,
  );
  return { cols: Math.ceil(cols), rows: Math.ceil(rows) };
}

/**
 * Places nodes on a grid that fills the diagram's box. Columns share the width and rows the height,
 * up to a comfortable maximum, and the grid is centred in what is left. Every one-column node has
 * the same width and every node the same height, so ports line up across a row; a node that spans
 * columns or rows stretches to the outer edges of the nodes beside it.
 *
 * @param cells - Each node's cell, by id.
 * @param size - The diagram's box.
 * @param metrics - The node and gutter sizes.
 * @param options - Columns and rows to keep at least, and room to keep for group borders.
 */
export function placeOnGrid(
  cells: ReadonlyMap<string, GridCell>,
  size: { width: number; height: number },
  metrics: FlowMetrics,
  options: {
    cols?: number;
    rows?: number;
    insets?: Insets;
    heights?: ReadonlyMap<string, number>;
    widths?: ReadonlyMap<string, number>;
    align?: DiagramAlign | 'start';
  } = {},
): GridPlacement {
  const { cols, rows } = gridSize([...cells.values()], options);
  const rowHeights = rowHeightsOf(cells, rows, metrics.nodeHeight, options.heights);
  const insets = options.insets ?? NO_INSETS;
  const width = Math.max(size.width - insets.left - insets.right, 1);
  const height = Math.max(size.height - insets.top - insets.bottom, 1);
  const columns = columnSizes(width, cols, metrics);
  const { nodeWidth, cellWidth } = columns;
  const tracks = rowTracks(rowHeights, height);
  const used = (cols - 1) * cellWidth + nodeWidth;
  const alignment = options.align ?? metrics.align ?? 'left';
  const left = alignment === 'start' ? 0 : alignedOffset(width - used, alignment);
  const bounds = {
    x: insets.left + left - (cellWidth - nodeWidth) / 2,
    y: insets.top + (height - tracks.total) / 2,
    width: cellWidth * cols,
    height: tracks.total,
  };
  const nodes = new Map<string, Rect>();
  for (const [id, cell] of cells) {
    const rect = cellRect(cell, bounds, { cellWidth, nodeWidth, tracks, rowHeights });
    const preferred = options.widths?.get(id);
    nodes.set(id, preferred === undefined ? rect : withWidth(rect, preferred));
  }

  const cramped = columns.cramped || tracks.gap < metrics.gutterY * CRAMPED_GUTTER_SHARE;
  return { nodes, bounds, cramped, cells };
}

/**
 * How wide a one-column node and a column are: nodes take the free width up to their maximum,
 * keeping the label gutter between columns; when the columns are too narrow for both, the gutter
 * gives way down to its least before the nodes go below their minimum. Nodes also widen, up to
 * their maximum and taking the gutter down to its least, until the widest whole word of any node's
 * text fits ({@link FlowMetrics.wordWidths}), so a word breaks only when even that is not enough. A
 * column is never narrower than its node plus the gutter that is left, and never wider than
 * {@link MAX_CELL_WIDTH_RATIO} nodes unless the labels need it.
 *
 * @param width - The width the grid fills.
 * @param cols - Its columns.
 * @param metrics - The node and gutter sizes.
 */
export function columnSizes(
  width: number,
  cols: number,
  metrics: FlowMetrics,
): { nodeWidth: number; cellWidth: number; gutter: number; cramped: boolean } {
  const least = metrics.minGutterX ?? metrics.gutterY;
  /**
   * The node width that leaves a gutter between every two columns, the outer nodes on the edges.
   */
  const withGutter = (gutter: number): number => Math.max((width - (cols - 1) * gutter) / cols, 0);
  let nodeWidth = Math.min(metrics.nodeMaxWidth, withGutter(metrics.gutterX));
  let cramped = false;
  if (nodeWidth < metrics.nodeMinWidth) {
    nodeWidth = Math.min(metrics.nodeMinWidth, withGutter(least));
    cramped = withGutter(least) < metrics.nodeMinWidth - MIN_WIDTH_SLACK;
  }

  const wanted = widthForWords(nodeWidth, metrics.wordWidths);
  if (wanted > nodeWidth) {
    const floor = Math.max(least, metrics.labelGutterMin ?? 0);
    nodeWidth = Math.max(nodeWidth, Math.min(wanted, metrics.nodeMaxWidth, withGutter(floor)));
  }

  if (cols <= 1) {
    return { nodeWidth, cellWidth: nodeWidth, gutter: 0, cramped };
  }

  const fill = (width - nodeWidth) / (cols - 1);
  const comfortable =
    metrics.align === undefined
      ? Math.max(nodeWidth * MAX_CELL_WIDTH_RATIO, nodeWidth + metrics.gutterX)
      : nodeWidth + metrics.gutterX;
  const cellWidth = Math.min(fill, comfortable);
  return { nodeWidth, cellWidth, gutter: cellWidth - nodeWidth, cramped };
}

/**
 * The width a node needs so every whole word of the diagram's node text fits on a line, given the
 * width it would get: unchanged when the words fit; else the narrow need when that stays narrow, or
 * the wide need.
 *
 * @param width - The width the node would get.
 * @param words - The widths the words need, narrow and wide.
 */
export function widthForWords(
  width: number,
  words: { narrow: number; wide: number } | undefined,
): number {
  if (words === undefined) {
    return width;
  }

  const fits = width < NARROW_NODE_WIDTH ? words.narrow <= width : words.wide <= width;
  if (fits) {
    return width;
  }

  return width < NARROW_NODE_WIDTH && words.narrow < NARROW_NODE_WIDTH ? words.narrow : words.wide;
}

/**
 * Places nodes at the centres an automatic layout found, stretched to fill the diagram's box. Node
 * sizes stay as measured; only the distances between them change. A layout that does not fit is
 * kept at the layout's own spacing (overflowing the box rather than landing nodes on each other)
 * and marked cramped; the caller tries another direction first.
 *
 * @param centres - Each node's centre in the layout's own coordinates.
 * @param size - The diagram's box.
 * @param metrics - The node sizes.
 * @param insets - Room to keep at the edges, for group borders.
 */
export function placeAtCentres(
  centres: ReadonlyMap<string, Point>,
  size: { width: number; height: number },
  metrics: FlowMetrics,
  insets: Insets = NO_INSETS,
  widths?: ReadonlyMap<string, number>,
): GridPlacement {
  const points = [...centres.values()];
  const minX = minOf(points.map((point) => point.x));
  const maxX = maxOf(points.map((point) => point.x));
  const minY = minOf(points.map((point) => point.y));
  const maxY = maxOf(points.map((point) => point.y));
  const innerWidth = Math.max(size.width - insets.left - insets.right, 1);
  const nodeWidth = widths?.size
    ? Math.min(metrics.nodeMaxWidth, innerWidth)
    : metrics.nodeMaxWidth;
  const usableWidth = Math.max(innerWidth - nodeWidth, 0);
  const usableHeight = Math.max(size.height - insets.top - insets.bottom - metrics.nodeHeight, 0);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const fitX = spanX <= 0 ? 0 : usableWidth / spanX;
  const fitY = spanY <= 0 ? 0 : usableHeight / spanY;
  const squeezed = (spanX > 0 && fitX < 1) || (spanY > 0 && fitY < 1);
  const scaleY = squeezed ? 1 : fitY;
  const scaleX = centreScaleX(points, metrics, scaleY, squeezed ? 1 : fitX, spanX);
  const extraWidth = usableWidth - spanX * scaleX;
  const left =
    metrics.align === undefined ? extraWidth / 2 : alignedOffset(extraWidth, metrics.align);
  const offsetX = insets.left + nodeWidth / 2 + left;
  const offsetY = insets.top + metrics.nodeHeight / 2 + (usableHeight - spanY * scaleY) / 2;
  const nodes = new Map<string, Rect>();
  for (const [id, point] of centres) {
    const cx = offsetX + (point.x - minX) * scaleX;
    const cy = offsetY + (point.y - minY) * scaleY;
    const rect = {
      x: cx - nodeWidth / 2,
      y: cy - metrics.nodeHeight / 2,
      width: nodeWidth,
      height: metrics.nodeHeight,
    };
    const preferred = widths?.get(id);
    nodes.set(id, preferred === undefined ? rect : withWidth(rect, preferred));
  }

  const rects = [...nodes.values()];
  const cramped =
    squeezed ||
    rects.some((a, index) => rects.slice(index + 1).some((b) => tooClose(a, b, metrics)));
  return { nodes, bounds: unionOf(rects), cramped };
}

/**
 * Compacts the horizontal span while keeping the gutter between nearby boxes.
 */
function centreScaleX(
  points: readonly Point[],
  metrics: FlowMetrics,
  scaleY: number,
  fit: number,
  spanX: number,
): number {
  if (metrics.align === undefined) {
    return fit;
  }

  const span = metrics.nodeMaxWidth + metrics.gutterX;
  if (spanX < EPSILON) {
    return 0;
  }

  let minimum = span / spanX;
  for (const [index, point] of points.entries()) {
    for (const other of points.slice(index + 1)) {
      const dx = Math.abs(point.x - other.x);
      const dy = Math.abs(point.y - other.y) * scaleY;
      if (dx > 0 && dy < metrics.nodeHeight + metrics.gutterY) {
        minimum = Math.max(minimum, span / dx);
      }
    }
  }

  return Math.min(fit, minimum);
}

/**
 * Narrows a node to its preferred width inside the allocated track, preserving its center.
 */
function withWidth(rect: Rect, preferred: number): Rect {
  const width = Math.min(rect.width, preferred);
  return { ...rect, x: rect.x + (rect.width - width) / 2, width };
}

/**
 * Snaps the centres an automatic layout found to grid cells: centres that line up within half a
 * node become one column (or row), so a layered or tree layout gets the same even spacing, aligned
 * ports and fitting as a grid the author placed.
 *
 * @param centres - Each node's centre in the layout's coordinates.
 * @param node - The node size the layout used.
 * @returns Cells by node id; `undefined` when two nodes would share a cell.
 */
export function cellsFromCentres(
  centres: ReadonlyMap<string, Point>,
  node: { width: number; height: number },
): Map<string, GridCell> | undefined {
  const columns = clusterIndex(
    [...centres.values()].map((point) => point.x),
    node.width / 2,
  );
  const rows = clusterIndex(
    [...centres.values()].map((point) => point.y),
    node.height / 2,
  );
  const cells = new Map<string, GridCell>();
  const taken = new Set<string>();
  for (const [id, point] of centres) {
    const col = (columns.get(point.x) ?? 0) + 1;
    const row = (rows.get(point.y) ?? 0) + 1;
    const key = `${col},${row}`;
    if (taken.has(key)) {
      return undefined;
    }

    taken.add(key);
    cells.set(id, { col, row, colSpan: 1, rowSpan: 1 });
  }

  return cells;
}

/**
 * Groups coordinates that lie within a tolerance of the one before into bands, numbered from 0.
 *
 * @param values - Coordinates.
 * @param tolerance - The largest gap inside one band.
 * @returns Each coordinate's band.
 */
function clusterIndex(values: readonly number[], tolerance: number): Map<number, number> {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const bands = new Map<number, number>();
  let band = 0;
  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous > tolerance) {
      band += 1;
    }

    bands.set(value, band);
  });
  return bands;
}

/**
 * A group's box: its nodes and inner groups with padding around them and its label row on top.
 *
 * @param members - The boxes of its nodes and inner groups.
 * @param metrics - The padding and label sizes.
 */
export function groupRect(members: readonly Rect[], metrics: FlowMetrics): Rect {
  const content = inflate(unionOf(members), metrics.groupPadding);
  return {
    x: content.x,
    y: content.y - metrics.groupLabel,
    width: content.width,
    height: content.height + metrics.groupLabel,
  };
}

/**
 * How many group borders stack around the most deeply grouped node, for the inset the grid keeps.
 *
 * @param spec - The diagram.
 */
export function groupDepth(spec: FlowSpec): number {
  let deepest = 0;
  for (const group of spec.groups) {
    let depth = 1;
    let parent = group.parent;
    while (parent !== undefined) {
      depth += 1;
      parent = spec.groups.find((candidate) => candidate.id === parent)?.parent;
    }

    deepest = Math.max(deepest, depth);
  }

  return deepest;
}

/**
 * The rows of a grid: each as tall as its nodes plus an equal share of the room left, so the gaps
 * between rows are even whatever the nodes' heights, up to a comfortable maximum.
 */
type RowTracks = {
  /**
   * Where each row starts, from the top of the grid.
   */
  starts: number[];

  /**
   * Each row's height, its nodes and its share of the gap.
   */
  sizes: number[];

  /**
   * The gap between two rows' nodes.
   */
  gap: number;

  /**
   * The grid's height.
   */
  total: number;
};

/**
 * Shares a grid's height out between its rows.
 *
 * @param rowHeights - Each row's node height.
 * @param height - The height to fill.
 */
function rowTracks(rowHeights: readonly number[], height: number): RowTracks {
  const content = rowHeights.reduce((sum, row) => sum + row, 0);
  const tallest = maxOf(rowHeights);
  const gap = Math.max(
    Math.min((height - content) / rowHeights.length, tallest * (MAX_CELL_HEIGHT_RATIO - 1)),
    0,
  );
  const sizes = rowHeights.map((row) => row + gap);
  const starts: number[] = [];
  let total = 0;
  for (const size of sizes) {
    starts.push(total);
    total += size;
  }

  return { starts, sizes, gap, total };
}

/**
 * The box of one node on the grid. A fractional row (a tree growing sideways) sits between the rows
 * around it.
 *
 * @param cell - Its cell.
 * @param bounds - The grid's area.
 * @param sizes - The column width, the node width, the rows and their node heights.
 */
function cellRect(
  cell: GridCell,
  bounds: Rect,
  sizes: { cellWidth: number; nodeWidth: number; tracks: RowTracks; rowHeights: readonly number[] },
): Rect {
  const { cellWidth, nodeWidth, tracks } = sizes;
  const width = cell.colSpan <= 1 ? nodeWidth : cell.colSpan * cellWidth - (cellWidth - nodeWidth);
  const first = Math.max(Math.round(cell.row) - 1, 0);
  const cx = bounds.x + (cell.col - 1 + cell.colSpan / 2) * cellWidth;
  if (cell.rowSpan > 1) {
    const last = Math.min(first + cell.rowSpan - 1, tracks.sizes.length - 1);
    const top = bounds.y + (tracks.starts[first] ?? 0) + tracks.gap / 2;
    const bottom =
      bounds.y + (tracks.starts[last] ?? 0) + (tracks.sizes[last] ?? 0) - tracks.gap / 2;
    return { x: cx - width / 2, y: top, width, height: bottom - top };
  }

  const height = sizes.rowHeights[first] ?? 0;
  const cy = bounds.y + rowCentre(cell.row, tracks);
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/**
 * The middle of a row, from the top of the grid; between two rows for a fractional one.
 *
 * @param row - The row, from 1.
 * @param tracks - The rows.
 */
function rowCentre(row: number, tracks: RowTracks): number {
  /**
   * The middle of one row.
   */
  const centre = (index: number): number =>
    (tracks.starts[index] ?? 0) + (tracks.sizes[index] ?? 0) / 2;
  const index = row - 1;
  const below = Math.floor(index);
  const share = index - below;
  return share === 0 ? centre(below) : centre(below) + (centre(below + 1) - centre(below)) * share;
}

/**
 * The height of each grid row's nodes: the tallest content of the one-row nodes in it, so a row of
 * nodes lines up while rows of shorter nodes stay short.
 *
 * @param cells - Each node's cell.
 * @param rows - The number of rows.
 * @param fallback - The height for a row without measured one-row nodes.
 * @param heights - Each node's content height, when measured.
 */
function rowHeightsOf(
  cells: ReadonlyMap<string, GridCell>,
  rows: number,
  fallback: number,
  heights: ReadonlyMap<string, number> | undefined,
): number[] {
  const result = Array.from({ length: rows }, () => 0);
  for (const [id, cell] of cells) {
    const height = heights?.get(id);
    const index = Math.round(cell.row) - 1;
    if (height !== undefined && cell.rowSpan <= 1 && index >= 0 && index < rows) {
      result[index] = Math.max(result[index] ?? 0, height);
    }
  }

  return result.map((height) => (height === 0 ? fallback : height));
}

/**
 * Whether two node boxes are closer than the gutters allow.
 *
 * @param a - A node box.
 * @param b - Another node box.
 * @param metrics - The gutters.
 */
function tooClose(a: Rect, b: Rect, metrics: FlowMetrics): boolean {
  const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
  const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
  return gapX < metrics.gutterX / 2 && gapY < metrics.gutterY / 2;
}
