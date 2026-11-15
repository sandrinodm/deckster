import { describe, expect, it } from 'vite-plus/test';

import { createPackage } from '#ooxml/opc-package.ts';
import { embedMedia, mediaPart, pictureExtension } from '#pptx/media.ts';

describe('media parts', () => {
  it('tells JPEG from PNG by their first bytes', () => {
    expect(pictureExtension(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(pictureExtension(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('png');
  });

  it('stores the same bytes once, whichever part shows them', () => {
    const pkg = createPackage();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const first = mediaPart(pkg, bytes);
    expect(mediaPart(pkg, { data: bytes, extension: 'jpeg' })).toBe(first);
    expect(first).toMatch(/^ppt\/media\/media-[0-9a-f]{16}\.jpeg$/);
    expect(embedMedia(pkg, 'ppt/slides/slide1.xml', bytes)).toBe(
      embedMedia(pkg, 'ppt/slides/slide1.xml', bytes),
    );
    expect(mediaPart(pkg, { data: new TextEncoder().encode('<svg/>'), extension: 'svg' })).toMatch(
      /^ppt\/media\/vector-/,
    );
  });
});
