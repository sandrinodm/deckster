import { describe, expect, it } from 'vite-plus/test';

import { clipTrend, leastSquares, padded } from '#charts/scatter/scatter.tsx';

describe('leastSquares', () => {
  it('fits a falling line', () => {
    const fit = leastSquares([0, 10, 20], [5, 4, 3]);
    expect(fit?.slope).toBeCloseTo(-0.1);
    expect(fit?.intercept).toBeCloseTo(5);
  });

  it('fits nothing through fewer than two distinct x values', () => {
    expect(leastSquares([3], [1])).toBeUndefined();
    expect(leastSquares([2, 2, 2], [1, 2, 3])).toBeUndefined();
  });
});

describe('clipTrend', () => {
  it('keeps the x range over which the line stays inside the y domain', () => {
    // y = 5 - 0.01x leaves a domain of 1 to 5 at x = 400.
    expect(
      clipTrend({ slope: -0.01, intercept: 5 }, { min: 0, max: 1000 }, { min: 1, max: 5 }),
    ).toEqual([0, 400]);
  });

  it('keeps the whole axis for a line inside it and nothing for one that misses', () => {
    expect(clipTrend({ slope: 0, intercept: 3 }, { min: 0, max: 10 }, { min: 1, max: 5 })).toEqual([
      0, 10,
    ]);
    expect(
      clipTrend({ slope: 0, intercept: 9 }, { min: 0, max: 10 }, { min: 1, max: 5 }),
    ).toBeUndefined();
    expect(
      clipTrend({ slope: 1, intercept: 100 }, { min: 0, max: 10 }, { min: 1, max: 5 }),
    ).toBeUndefined();
  });
});

describe('padded', () => {
  it('adds room past both extremes so no point sits on the edge', () => {
    const values = padded([2, 4.7], false);
    expect(Math.max(...values)).toBeGreaterThan(4.7);
    expect(Math.min(...values)).toBeLessThan(2);
  });

  it('keeps zero as the floor of an axis that starts there', () => {
    expect(Math.min(...padded([0, 10], true))).toBe(0);
    expect(padded([], false)).toEqual([]);
  });
});
