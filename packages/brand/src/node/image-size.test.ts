import { describe, expect, it } from 'vite-plus/test';

import { imageSize } from '#node/image-size.ts';

/**
 * Bytes from numbers and one-byte-per-character strings.
 */
function bytes(...parts: (string | readonly number[])[]): Uint8Array {
  return Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === 'string'
        ? Array.from(part, (character) => character.charCodeAt(0))
        : [...part],
    ),
  );
}

describe('imageSize', () => {
  it('reads a PNG from its IHDR chunk', () => {
    const png = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13],
      'IHDR',
      [0, 0, 0x07, 0x80, 0, 0, 0x04, 0x38],
    );
    expect(imageSize(png)).toEqual({ width: 1920, height: 1080, raster: true });
  });

  it('reads a JPEG from its first frame header, past other segments', () => {
    const jpeg = bytes(
      [0xff, 0xd8],
      [0xff, 0xe0, 0, 6, 1, 2, 3, 4],
      [0xff, 0xc2, 0, 17, 8, 0x02, 0xd0, 0x05, 0x00, 3],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
    expect(imageSize(jpeg)).toEqual({ width: 1280, height: 720, raster: true });
  });

  it('reads lossy, lossless and extended WebP headers', () => {
    const lossy = bytes(
      'RIFF',
      [0, 0, 0, 0],
      'WEBP',
      'VP8 ',
      Array.from({ length: 10 }, () => 0),
      [0x80, 0x07, 0x38, 0x04],
    );
    expect(imageSize(lossy)).toEqual({ width: 1920, height: 1080, raster: true });

    const extended = bytes(
      'RIFF',
      [0, 0, 0, 0],
      'WEBP',
      'VP8X',
      Array.from({ length: 8 }, () => 0),
      [0x7f, 0x07, 0, 0x37, 0x04, 0],
    );
    expect(imageSize(extended)).toEqual({ width: 1920, height: 1080, raster: true });

    // 100 x 50: width-1 = 99 in 14 bits, height-1 = 49 in the next 14.
    const bits = 99 | (49 << 14);
    const lossless = bytes(
      'RIFF',
      [0, 0, 0, 0],
      'WEBP',
      'VP8L',
      [0, 0, 0, 0, 0x2f],
      [bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >> 24) & 0xff, 0, 0, 0, 0, 0],
    );
    expect(imageSize(lossless)).toEqual({ width: 100, height: 50, raster: true });
  });

  it('reads an SVG from its viewBox, else its width and height', () => {
    expect(imageSize(bytes('<?xml version="1.0"?><svg viewBox="0 0 400 100">'))).toEqual({
      width: 400,
      height: 100,
      raster: false,
    });
    expect(imageSize(bytes('<svg width="64px" height="32">'))).toEqual({
      width: 64,
      height: 32,
      raster: false,
    });
    expect(imageSize(bytes('<svg width="50%">'))).toBeUndefined();
  });

  it('gives up on anything else', () => {
    expect(imageSize(bytes('GIF89a'))).toBeUndefined();
    expect(imageSize(bytes([0xff, 0xd8, 0x00]))).toBeUndefined();
  });
});
