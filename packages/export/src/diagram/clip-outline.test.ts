import { describe, expect, it } from 'vite-plus/test';

import { clipOutlineToBox } from '#diagram/clip-outline.ts';
import { formatPath, parsePathData, pathBounds } from '#vector/svg-path.ts';

describe('clipOutlineToBox', () => {
  it('keeps the part of a rectangle inside the box', () => {
    const clipped = clipOutlineToBox(parsePathData('M0 0H100V50H0Z'), {
      x: 0,
      y: 0,
      width: 10,
      height: 50,
    });
    expect(pathBounds(clipped)).toEqual({ x: 0, y: 0, width: 10, height: 50 });
    expect(clipped.at(-1)?.type).toBe('Z');
  });

  it('follows a hexagon slanted sides into the stripe', () => {
    const hexagon = parsePathData('M20 0H80L100 25L80 50H20L0 25Z');
    const clipped = clipOutlineToBox(hexagon, { x: 0, y: 0, width: 100, height: 10 });
    expect(pathBounds(clipped)).toEqual({ x: 12, y: 0, width: 76, height: 10 });
  });

  it('flattens rounded corners so the stripe keeps them', () => {
    const rounded = parsePathData('M10 0H90C95.5 0 100 4.5 100 10V40H0V10C0 4.5 4.5 0 10 0Z');
    const clipped = clipOutlineToBox(rounded, { x: 0, y: 0, width: 6, height: 40 });
    const bounds = pathBounds(clipped);
    expect(bounds?.width).toBeCloseTo(6);
    expect(bounds?.y).toBeGreaterThan(0);
    expect(formatPath(clipped)).not.toContain('C');
  });

  it('gives nothing for a box that misses the outline', () => {
    expect(
      clipOutlineToBox(parsePathData('M0 0H10V10H0Z'), { x: 50, y: 50, width: 5, height: 5 }),
    ).toEqual([]);
  });
});
