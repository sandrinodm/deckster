import { inflateSync } from 'node:zlib';
import { PDFName, PDFNumber, PDFRawStream, type PDFDocument } from 'pdf-lib';

/**
 * Images smaller than this, in encoded bytes, are left as they are: recompressing them saves too
 * little to be worth a lossy step.
 */
const MIN_BYTES = 256 * 1024;

/**
 * A JPEG replaces an image only when it is at most this share of the Flate bytes.
 */
const MAX_SHARE = 0.6;

/**
 * Bits per colour channel in an image this module touches: 8-bit DeviceRGB only.
 */
const BITS_PER_CHANNEL = 8;

/**
 * Bytes per pixel of a DeviceRGB image: one per channel.
 */
const BYTES_PER_RGB_PIXEL = 3;

/**
 * The largest picture worth keeping: the whole slide at twice the canvas, 3840 by 2160 pixels. A
 * rasterised image is never shown larger than the page, so pixels beyond this are never seen.
 */
const MAX_PIXELS = {
  /**
   * The width.
   */
  width: 3840,

  /**
   * The height.
   */
  height: 2160,
} as const;

/**
 * Raw RGB pixels, 8 bits per channel, row by row without padding, and the size to encode them at.
 */
export type RgbPixels = {
  /**
   * The pixel bytes: width x height x 3.
   */
  data: Uint8Array;

  /**
   * The width in pixels.
   */
  width: number;

  /**
   * The height in pixels.
   */
  height: number;

  /**
   * The width of the JPEG, at most `width`.
   */
  targetWidth: number;

  /**
   * The height of the JPEG, at most `height`.
   */
  targetHeight: number;
};

/**
 * Encodes RGB pixels as a baseline JPEG at the target size.
 */
export type JpegEncoder = (pixels: RgbPixels) => Promise<Uint8Array>;

/**
 * What recompression changed.
 */
export type RecompressResult = {
  /**
   * Images now stored as JPEG.
   */
  images: number;

  /**
   * Encoded bytes saved.
   */
  bytesSaved: number;
};

/**
 * Stores large rasterised photographs as JPEG. Chromium prints an image it had to rasterise (a
 * photo behind a CSS filter such as the brand's image treatment) as lossless Flate RGB at 300 dpi,
 * about 3 MB for one photo; its colour channels become a JPEG, scaled down to at most the whole
 * page at twice the canvas (3840 by 2160), while its soft mask (the alpha, rounded corners) stays
 * lossless at its own resolution, so transparency is unchanged. Only 8-bit DeviceRGB Flate images
 * without a predictor are touched, and only when the JPEG is clearly smaller.
 *
 * @param document - The assembled document; changed in place.
 * @param encode - The JPEG encoder.
 * @returns How many images changed and the bytes saved.
 */
export async function recompressImages(
  document: PDFDocument,
  encode: JpegEncoder,
): Promise<RecompressResult> {
  let images = 0;
  let bytesSaved = 0;
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || !isPhotoCandidate(object)) {
      continue;
    }

    const width = numberOf(object, 'Width');
    const height = numberOf(object, 'Height');
    const data = inflateSync(object.getContents());
    if (data.length !== width * height * BYTES_PER_RGB_PIXEL) {
      continue;
    }

    const scale = Math.min(1, MAX_PIXELS.width / width, MAX_PIXELS.height / height);
    const target = {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
    const jpeg = await encode({
      data,
      width,
      height,
      targetWidth: target.width,
      targetHeight: target.height,
    });
    const before = object.getContents().length;
    if (jpeg.length > before * MAX_SHARE) {
      continue;
    }

    document.context.assign(ref, asJpeg(object, jpeg, target));
    images += 1;
    bytesSaved += before - jpeg.length;
  }

  return { images, bytesSaved };
}

/**
 * Whether a stream is a large 8-bit DeviceRGB image compressed with plain Flate.
 *
 * @param stream - The stream.
 */
function isPhotoCandidate(stream: PDFRawStream): boolean {
  const { dict } = stream;
  return (
    dict.get(PDFName.of('Subtype')) === PDFName.of('Image') &&
    dict.get(PDFName.of('Filter')) === PDFName.of('FlateDecode') &&
    dict.get(PDFName.of('ColorSpace')) === PDFName.of('DeviceRGB') &&
    numberOf(stream, 'BitsPerComponent') === BITS_PER_CHANNEL &&
    !dict.has(PDFName.of('DecodeParms')) &&
    !dict.has(PDFName.of('Decode')) &&
    stream.getContents().length >= MIN_BYTES
  );
}

/**
 * A number entry of a stream's dictionary, or 0.
 *
 * @param stream - The stream.
 * @param key - The key.
 */
function numberOf(stream: PDFRawStream, key: string): number {
  const value = stream.dict.get(PDFName.of(key));
  return value instanceof PDFNumber ? value.asNumber() : 0;
}

/**
 * The image with its colour channels stored as a JPEG, every other entry (the soft mask) kept.
 *
 * @param stream - The image stream.
 * @param jpeg - The JPEG bytes.
 * @param size - The JPEG's size in pixels.
 * @param size.width - The width.
 * @param size.height - The height.
 */
function asJpeg(
  stream: PDFRawStream,
  jpeg: Uint8Array,
  size: { width: number; height: number },
): PDFRawStream {
  const dict = stream.dict.clone();
  dict.set(PDFName.of('Width'), PDFNumber.of(size.width));
  dict.set(PDFName.of('Height'), PDFNumber.of(size.height));
  dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
  dict.set(PDFName.of('Length'), PDFNumber.of(jpeg.length));
  return PDFRawStream.of(dict, jpeg);
}
