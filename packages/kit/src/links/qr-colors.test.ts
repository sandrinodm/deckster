import { describe, expect, it } from 'vite-plus/test';

import { qrColors } from '#links/qr-colors.ts';
import { qrShape } from '#links/qr-modules.ts';

describe('qrColors', () => {
  it('draws the modules in the darker color whichever order the colors come in', () => {
    expect(qrColors('#101828', '#fcfcfd')).toEqual({ modules: '#101828', plate: '#fcfcfd' });
    expect(qrColors('#f4f5f8', '#0b0911')).toEqual({ modules: '#0b0911', plate: '#f4f5f8' });
  });

  it('falls back to black on white for a color it cannot read', () => {
    expect(qrColors('rebeccapurple', '#ffffff')).toEqual({ modules: '#000000', plate: '#ffffff' });
  });
});

describe('qrShape', () => {
  it('encodes a URL into a square of modules with a path that fills only dark ones', () => {
    const shape = qrShape('https://example.com/shade');
    expect(shape.size).toBeGreaterThanOrEqual(21);
    expect(shape.path.startsWith('M')).toBe(true);
    expect(shape.path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
  });

  it('is the same for the same value and differs for another', () => {
    expect(qrShape('https://a.example').path).toBe(qrShape('https://a.example').path);
    expect(qrShape('https://a.example').path).not.toBe(qrShape('https://b.example').path);
  });

  it('refuses an empty value with the fix', () => {
    expect(() => qrShape('')).toThrow(/needs a value to encode/);
  });
});
