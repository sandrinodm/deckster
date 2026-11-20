import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { isIconImage } from '#diagrams/diagram-icon-source.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isIconImage', () => {
  it('allows a bundled absolute HTTP URL under the same nested preview origin', () => {
    vi.stubGlobal('location', new URL('http://localhost:4182/decks/dispatch/index.html'));
    expect(isIconImage('http://localhost:4182/decks/dispatch/assets/parcel-bdab.svg')).toBe(true);
    expect(isIconImage('http://localhost:4183/decks/dispatch/assets/parcel-bdab.svg')).toBe(false);
    expect(isIconImage('http://example.com/parcel.svg')).toBe(false);
  });

  it('allows HTTPS and bundled image data while rejecting executable URLs', () => {
    expect(isIconImage('https://example.com/parcel.svg')).toBe(true);
    expect(isIconImage('https://name:password@example.com/parcel.svg')).toBe(false);
    expect(isIconImage('data:image/svg+xml,%3csvg%3e')).toBe(true);
    expect(isIconImage('data:text/html;base64,AAAA')).toBe(false);
    expect(isIconImage('javascript:alert(1)')).toBe(false);
    expect(isIconImage('/\\example.com/parcel.svg')).toBe(false);
  });
});
