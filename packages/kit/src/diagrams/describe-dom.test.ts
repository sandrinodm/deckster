import { describe, expect, it } from 'vite-plus/test';

import { parseBoxShadows, parseDropShadows } from '#diagrams/describe-dom.ts';

describe('parseDropShadows', () => {
  it('reads nothing from a filter without shadows', () => {
    expect(parseDropShadows('none')).toEqual([]);
    expect(parseDropShadows('')).toEqual([]);
    expect(parseDropShadows('blur(4px)')).toEqual([]);
  });

  it('reads a computed shadow with its color first', () => {
    expect(parseDropShadows('drop-shadow(rgb(23, 23, 23) 8px 8px 0px)')).toEqual([
      { x: 8, y: 8, blur: 0, color: 'rgb(23, 23, 23)' },
    ]);
  });

  it('reads each layer of a list, colors with nested parentheses and colors last', () => {
    expect(
      parseDropShadows(
        'drop-shadow(oklch(0.2 0.01 250 / 0.18) 0px 6px 10px) blur(1px) drop-shadow(-2px 3px color(srgb 1 0 0))',
      ),
    ).toEqual([
      { x: 0, y: 6, blur: 10, color: 'oklch(0.2 0.01 250 / 0.18)' },
      { x: -2, y: 3, blur: 0, color: 'color(srgb 1 0 0)' },
    ]);
  });

  it('takes the current color when a shadow names none, and skips one without offsets', () => {
    expect(parseDropShadows('drop-shadow(0 4px)')).toEqual([
      { x: 0, y: 4, blur: 0, color: 'currentcolor' },
    ]);
    expect(parseDropShadows('drop-shadow(red)')).toEqual([]);
  });
});

describe('parseBoxShadows', () => {
  it('reads the outer layers and leaves out inset ones, which draw accent stripes', () => {
    expect(parseBoxShadows('none')).toEqual([]);
    expect(
      parseBoxShadows(
        'rgb(22, 25, 32) 6px 6px 0px 0px, rgb(45, 74, 224) 6px 0px 0px 0px inset, oklch(0 0 0 / 0.2) 0px 4px 12px -2px',
      ),
    ).toEqual([
      { x: 6, y: 6, blur: 0, color: 'rgb(22, 25, 32)' },
      { x: 0, y: 4, blur: 12, color: 'oklch(0 0 0 / 0.2)' },
    ]);
  });
});
