import { describe, expect, it } from 'vite-plus/test';

import { moveAts, moveIndexAt } from '#code/move-states.ts';

describe('moveAts', () => {
  it('registers one step per state after the first', () => {
    expect(moveAts(3)).toEqual([1, 2]);
    expect(moveAts(3, 4)).toEqual([4, 5]);
  });

  it('registers none for fewer than two states', () => {
    expect(moveAts(1)).toEqual([]);
    expect(moveAts(0)).toEqual([]);
  });
});

describe('moveIndexAt', () => {
  const ats = [2, 3];

  it('shows the first state before any of its steps', () => {
    expect(moveIndexAt(ats, 0)).toBe(0);
    expect(moveIndexAt(ats, 1)).toBe(0);
  });

  it('moves one state per step reached and ends on the last', () => {
    expect(moveIndexAt(ats, 2)).toBe(1);
    expect(moveIndexAt(ats, 3)).toBe(2);
    expect(moveIndexAt(ats, 99)).toBe(2);
  });
});
