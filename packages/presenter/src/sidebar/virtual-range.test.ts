import { describe, expect, it } from 'vite-plus/test';

import { scrollToRow, visibleRows } from '#sidebar/virtual-range.ts';

describe('visibleRows', () => {
  it('renders the visible rows plus the overscan, clamped to the list', () => {
    const base = { viewportHeight: 500, rowHeight: 100, count: 100, overscan: 2 };
    expect(visibleRows({ ...base, scrollTop: 0 })).toEqual({ start: 0, end: 7 });
    expect(visibleRows({ ...base, scrollTop: 1050 })).toEqual({ start: 8, end: 18 });
    expect(visibleRows({ ...base, scrollTop: 9500 })).toEqual({ start: 93, end: 100 });
  });

  it('renders nothing for an empty list', () => {
    const rows = visibleRows({
      scrollTop: 0,
      viewportHeight: 500,
      rowHeight: 100,
      count: 0,
      overscan: 2,
    });
    expect(rows.end - rows.start).toBe(0);
  });
});

describe('scrollToRow', () => {
  const base = { viewportHeight: 500, rowHeight: 100 };

  it('leaves the scroll alone when the row is fully visible', () => {
    expect(scrollToRow({ ...base, row: 3, scrollTop: 100 })).toBe(100);
  });

  it('centres a row that is above or below the viewport, never before the start', () => {
    expect(scrollToRow({ ...base, row: 1, scrollTop: 300 })).toBe(0);
    expect(scrollToRow({ ...base, row: 3, scrollTop: 800 })).toBe(100);
    expect(scrollToRow({ ...base, row: 9, scrollTop: 0 })).toBe(700);
  });
});
