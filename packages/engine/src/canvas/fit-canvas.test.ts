import { describe, expect, it } from 'vite-plus/test';

import { fitCanvas } from '#canvas/fit-canvas.ts';

describe('fitCanvas', () => {
  it('fills a 16:9 viewport exactly', () => {
    expect(fitCanvas({ width: 1280, height: 720 })).toEqual({
      scale: 2 / 3,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('letterboxes a viewport taller than 16:9', () => {
    const fit = fitCanvas({ width: 1920, height: 1280 });
    expect(fit.scale).toBe(1);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(100);
  });

  it('pillarboxes a viewport wider than 16:9', () => {
    const fit = fitCanvas({ width: 2120, height: 1080 });
    expect(fit.scale).toBe(1);
    expect(fit.offsetX).toBe(100);
    expect(fit.offsetY).toBe(0);
  });

  it('scales to zero for an empty or negative viewport', () => {
    expect(fitCanvas({ width: 0, height: 500 }).scale).toBe(0);
    expect(fitCanvas({ width: -10, height: -10 })).toEqual({ scale: 0, offsetX: 0, offsetY: 0 });
  });
});
