/**
 * The rows of a fixed-height list to render.
 */
export type RowRange = {
  /**
   * The first row to render, zero-based.
   */
  start: number;

  /**
   * One past the last row to render.
   */
  end: number;
};

/**
 * The rows of a fixed-height list that are visible, plus a few on each side so scrolling never
 * shows a gap.
 *
 * @param input - How far the list is scrolled, how tall its viewport and rows are, how many rows
 *   there are, and how many extra rows to render on each side.
 */
export function visibleRows(input: {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  count: number;
  overscan: number;
}): RowRange {
  const { scrollTop, viewportHeight, rowHeight, count, overscan } = input;
  const first = Math.floor(scrollTop / rowHeight);
  const last = Math.ceil((scrollTop + viewportHeight) / rowHeight);
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(count, last + overscan),
  };
}

/**
 * The scroll position that brings a row into view: unchanged when the row is fully visible,
 * otherwise centred in the viewport so its neighbours show too. The browser clamps a position past
 * either end of the list.
 *
 * @param input - The row, the current scroll, and the viewport and row heights.
 */
export function scrollToRow(input: {
  row: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
}): number {
  const { row, scrollTop, viewportHeight, rowHeight } = input;
  const top = row * rowHeight;
  const isVisible = top >= scrollTop && top + rowHeight <= scrollTop + viewportHeight;
  if (isVisible) {
    return scrollTop;
  }

  return Math.max(0, top + rowHeight / 2 - viewportHeight / 2);
}
