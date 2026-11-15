import { randomFillSync } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFNumber, PDFStream, type PDFRef } from 'pdf-lib';
import { describe, expect, it } from 'vite-plus/test';

import type { RgbPixels } from '#pdf/recompress-images.ts';

import { recompressImages } from '#pdf/recompress-images.ts';

/**
 * Pixels that do not compress, like a photo's fine detail.
 *
 * @param count - The number of bytes.
 */
function noise(count: number): Uint8Array {
  return randomFillSync(new Uint8Array(count));
}

/**
 * A document with one Flate RGB image and a soft mask.
 *
 * @param width - The image width.
 * @param height - The image height.
 */
async function documentWithImage(
  width: number,
  height: number,
): Promise<{ document: PDFDocument; image: PDFRef; mask: PDFRef }> {
  const document = await PDFDocument.create();
  const mask = document.context.register(
    document.context.stream(deflateSync(new Uint8Array(width * height).fill(255)), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: width,
      Height: height,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
    }),
  );
  const image = document.context.register(
    document.context.stream(deflateSync(noise(width * height * 3)), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: width,
      Height: height,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
      SMask: mask,
    }),
  );
  return { document, image, mask };
}

describe('recompressImages', () => {
  it('stores a large rasterised photo as a JPEG no larger than the page at 2x, mask kept', async () => {
    const { document, image, mask } = await documentWithImage(100, 3000);
    const seen: RgbPixels[] = [];
    const result = await recompressImages(document, (pixels) => {
      seen.push(pixels);
      return Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    });
    expect(result.images).toBe(1);
    expect(seen[0]).toMatchObject({
      width: 100,
      height: 3000,
      targetWidth: 72,
      targetHeight: 2160,
    });
    const stream = document.context.lookup(image, PDFStream);
    expect(stream.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('DCTDecode'));
    expect(stream.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber()).toBe(2160);
    expect(stream.dict.get(PDFName.of('SMask'))).toBe(mask);
    expect(stream.getContents()).toHaveLength(4);
  });

  it('keeps an image when the JPEG would not be clearly smaller, and skips small images', async () => {
    const large = await documentWithImage(400, 400);
    const bigger = await recompressImages(large.document, (pixels) =>
      Promise.resolve(new Uint8Array(pixels.data.length)),
    );
    expect(bigger.images).toBe(0);
    const small = await documentWithImage(40, 40);
    const untouched = await recompressImages(small.document, () =>
      Promise.resolve(new Uint8Array(1)),
    );
    expect(untouched.images).toBe(0);
  });
});
