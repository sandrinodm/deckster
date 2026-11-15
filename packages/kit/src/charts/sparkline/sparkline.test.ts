import { describe, expect, it } from 'vite-plus/test';

import { TEST_THEME } from '#charts/frame/chart-theme.fixture.ts';
import { markedIndex, sparkItems, sparkPoint } from '#charts/sparkline/sparkline.tsx';

const BOX = { width: 200, height: 60, theme: TEST_THEME };

describe('sparkPoint', () => {
  it('puts the lowest value at the bottom and the highest at the top, inside a pad', () => {
    const values = [3, 9, 1];
    const pad = TEST_THEME.lineWidth * 3;
    expect(sparkPoint(values, 1, BOX)).toEqual({ x: 100, y: pad });
    expect(sparkPoint(values, 2, BOX)).toEqual({ x: 200 - pad, y: 60 - pad });
    expect(sparkPoint(values, 5, BOX)).toBeUndefined();
  });

  it('draws a flat run along the middle', () => {
    expect(sparkPoint([4, 4], 0, BOX)?.y).toBe(30);
  });
});

describe('sparkItems', () => {
  it('draws the line in the context color and marks one point in the lead color', () => {
    const items = sparkItems([3, 9, 1], { ...BOX, marked: markedIndex([3, 9, 1], 'min') });
    expect(items.map((item) => item.kind)).toEqual(['path', 'circle']);
    expect(items[0]).toMatchObject({ stroke: TEST_THEME.context });
    expect(items[1]).toMatchObject({ fill: TEST_THEME.categorical[0] });
  });
});
