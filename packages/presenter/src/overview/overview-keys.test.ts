import { describe, expect, it } from 'vite-plus/test';

import { moveOverviewSelection } from '#overview/overview-keys.ts';

const base = { selected: 4, columns: 3, count: 8 };

describe('moveOverviewSelection', () => {
  it('moves by one with left and right and stops at the ends', () => {
    expect(moveOverviewSelection({ ...base, key: 'ArrowLeft' })).toBe(3);
    expect(moveOverviewSelection({ ...base, selected: 0, key: 'ArrowLeft' })).toBe(0);
    expect(moveOverviewSelection({ ...base, selected: 7, key: 'ArrowRight' })).toBe(7);
  });

  it('moves by a row with up and down and stays when there is no row', () => {
    expect(moveOverviewSelection({ ...base, key: 'ArrowUp' })).toBe(1);
    expect(moveOverviewSelection({ ...base, selected: 1, key: 'ArrowUp' })).toBe(1);
    expect(moveOverviewSelection({ ...base, key: 'ArrowDown' })).toBe(7);
    expect(moveOverviewSelection({ ...base, selected: 6, key: 'ArrowDown' })).toBe(6);
  });

  it('jumps with Home and End and ignores other keys', () => {
    expect(moveOverviewSelection({ ...base, key: 'Home' })).toBe(0);
    expect(moveOverviewSelection({ ...base, key: 'End' })).toBe(7);
    expect(moveOverviewSelection({ ...base, key: 'x' })).toBeUndefined();
  });
});
