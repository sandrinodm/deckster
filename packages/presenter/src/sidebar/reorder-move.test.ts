import { describe, expect, it } from 'vite-plus/test';

import { dropIndex, moveItem } from '#sidebar/reorder-move.ts';

const ids = ['a', 'b', 'c', 'd'];

describe('moveItem', () => {
  it('moves an item forward and back', () => {
    expect(moveItem(ids, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(ids, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns the same list for a no-op or an out-of-range index', () => {
    expect(moveItem(ids, 1, 1)).toBe(ids);
    expect(moveItem(ids, 4, 0)).toBe(ids);
    expect(moveItem(ids, 0, -1)).toBe(ids);
  });
});

describe('dropIndex', () => {
  it('puts the item before or after the row it is dropped on', () => {
    expect(dropIndex({ from: 0, row: 2, after: false })).toBe(1);
    expect(dropIndex({ from: 0, row: 2, after: true })).toBe(2);
    expect(dropIndex({ from: 3, row: 1, after: false })).toBe(1);
    expect(dropIndex({ from: 3, row: 1, after: true })).toBe(2);
  });
});
