import { describe, expect, it } from 'vite-plus/test';

import { focalStyle, objectPosition } from '#media/focal-point.ts';
import { duotoneTables, planTreatment } from '#media/image-treatment.ts';
import { staticFrame } from '#media/lottie-frame.ts';

describe('planTreatment', () => {
  it('keeps square corners and color for none and for no treatment', () => {
    expect(planTreatment({ type: 'none' })).toEqual({ radius: 0, grayscale: false });
    expect(planTreatment(undefined)).toEqual({ radius: 0, grayscale: false });
  });

  it('takes the radius of a rounded treatment', () => {
    expect(planTreatment({ type: 'rounded', radius: 20 }).radius).toBe(20);
  });

  it('draws a duotone in grayscale with both colors as channels', () => {
    const plan = planTreatment({ type: 'duotone', shadow: '#000000', highlight: '#ff8000' });
    expect(plan.grayscale).toBe(true);
    expect(plan.duotone?.highlight[0]).toBe(1);
    expect(duotoneTables(plan.duotone ?? { shadow: [0, 0, 0], highlight: [0, 0, 0] })).toEqual([
      '0.0000 1.0000',
      '0.0000 0.5020',
      '0.0000 0.0000',
    ]);
  });

  it('keeps the color and strength of a tint', () => {
    expect(planTreatment({ type: 'tint', color: '#112233', opacity: 0.4 }).tint).toEqual({
      color: '#112233',
      opacity: 0.4,
    });
  });
});

describe('objectPosition', () => {
  it('centers by default and passes words through', () => {
    expect(objectPosition(undefined)).toBe('50% 50%');
    expect(objectPosition('top left')).toBe('top left');
  });

  it('turns percentages into a position and rejects values outside 0 to 100', () => {
    expect(objectPosition([30, 20])).toBe('30% 20%');
    expect(() => objectPosition([120, 0])).toThrow(/focal/);
  });
});

describe('focalStyle', () => {
  it('sets no position without a focal point, so a layout can crop around its own', () => {
    expect(focalStyle(undefined)).toEqual({});
  });

  it('sets the position of a focal point the picture names', () => {
    expect(focalStyle('center bottom')).toEqual({ objectPosition: 'center bottom' });
    expect(focalStyle([30, 20])).toEqual({ objectPosition: '30% 20%' });
  });
});

describe('staticFrame', () => {
  it('shows the last frame unless told otherwise', () => {
    expect(staticFrame(undefined, 60)).toBe(59);
    expect(staticFrame('last', 60)).toBe(59);
    expect(staticFrame('first', 60)).toBe(0);
  });

  it('clamps a chosen frame into the animation', () => {
    expect(staticFrame(30, 60)).toBe(30);
    expect(staticFrame(500, 60)).toBe(59);
    expect(staticFrame(-3, 60)).toBe(0);
    expect(staticFrame(undefined, 0)).toBe(0);
  });
});
