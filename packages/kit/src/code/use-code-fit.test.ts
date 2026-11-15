import { describe, expect, it } from 'vite-plus/test';

import { allowedScales, CODE_FIT_STEPS, minimumScale } from '#code/use-code-fit.ts';

describe('allowedScales', () => {
  it('offers every step when the brand minimum leaves room', () => {
    expect(allowedScales(40)).toEqual([...CODE_FIT_STEPS].filter((scale) => scale >= 0.5));
  });

  it('stops at the largest scale that keeps text at the minimum size', () => {
    const scales = allowedScales(28);
    expect(scales.at(-1)).toBeGreaterThanOrEqual(minimumScale(28));
    expect(28 * (scales.at(-1) ?? 0)).toBeGreaterThanOrEqual(20);
  });

  it('never steps down a brand whose code size is already the minimum', () => {
    expect(allowedScales(20)).toEqual([1]);
    expect(allowedScales(18)).toEqual([1]);
  });

  it('always includes the natural size', () => {
    expect(allowedScales(26)[0]).toBe(1);
  });
});
