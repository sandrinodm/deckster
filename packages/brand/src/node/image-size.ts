import { Effect, FileSystem, Option } from 'effect';

/**
 * How many leading bytes are read to find an image's size: enough for a JPEG's metadata blocks
 * before its frame header in the files a brand ships.
 */
const HEAD_BYTES = 512 * 1024;

/**
 * PNG dimensions follow the signature and the IHDR chunk name.
 */
const PNG_SIZE_HEADER_BYTES = 24;

/**
 * The leading PNG signature bytes recognized by the size reader.
 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

/**
 * The byte offset of the PNG IHDR chunk name.
 */
const PNG_IHDR_OFFSET_BYTES = 12;

/**
 * The byte offset of the PNG width field.
 */
const PNG_WIDTH_OFFSET_BYTES = 16;

/**
 * The byte offset of the PNG height field.
 */
const PNG_HEIGHT_OFFSET_BYTES = 20;

/**
 * JPEG marker bytes and dimension offsets relative to a start-of-frame segment.
 */
const JPEG_SIGNATURE = [0xff, 0xd8];

/**
 * The byte that introduces each JPEG marker.
 */
const JPEG_MARKER_PREFIX = 0xff;

/**
 * The bytes required before reading dimensions from a JPEG segment.
 */
const JPEG_MIN_SEGMENT_BYTES = 9;

/**
 * The width field offset from the start of a JPEG frame segment.
 */
const JPEG_WIDTH_OFFSET_BYTES = 7;

/**
 * The height field offset from the start of a JPEG frame segment.
 */
const JPEG_HEIGHT_OFFSET_BYTES = 5;

/**
 * The standalone JPEG temporary marker, which has no length field.
 */
const JPEG_TEMPORARY_MARKER = 0x01;

/**
 * The first JPEG restart marker in the standalone-marker range.
 */
const JPEG_RESTART_MARKER_FIRST = 0xd0;

/**
 * The last standalone JPEG marker accepted without a length field.
 */
const JPEG_END_OF_IMAGE_MARKER = 0xd9;

/**
 * WebP's container and frame header offsets, in bytes.
 */
const WEBP_SIZE_HEADER_BYTES = 30;

/**
 * The byte offset of the WEBP container signature.
 */
const WEBP_SIGNATURE_OFFSET_BYTES = 8;

/**
 * The byte offset of the WebP frame-format identifier.
 */
const WEBP_FRAME_KIND_OFFSET_BYTES = 12;

/**
 * The byte offset of a lossy WebP frame width.
 */
const WEBP_LOSSY_WIDTH_OFFSET_BYTES = 26;

/**
 * The byte offset of a lossy WebP frame height.
 */
const WEBP_LOSSY_HEIGHT_OFFSET_BYTES = 28;

/**
 * The fourteen dimension bits retained from a lossy WebP size field.
 */
const WEBP_LOSSY_DIMENSION_MASK = 0x3fff;

/**
 * SVG root and viewBox grammars used while inspecting its opening tag.
 */
const SVG_ROOT_PATTERN = /<svg\b[^>]*>/i;

/**
 * The SVG viewBox attribute and its quoted coordinate list.
 */
const SVG_VIEWBOX_PATTERN = /\sviewBox\s*=\s*["']([^"']+)["']/i;

/**
 * The whitespace and commas between viewBox coordinates.
 */
const SVG_VIEWBOX_SEPARATOR_PATTERN = /[\s,]+/;

/**
 * The four values that define a viewBox origin and dimensions.
 */
const SVG_VIEWBOX_DIMENSIONS = 4;

/**
 * The bit width of a byte when combining two bytes into an unsigned integer.
 */
const BITS_PER_BYTE = 8;

/**
 * JPEG start-of-frame markers that carry the image size: every `SOFn` except the Huffman table
 * (`C4`), the arithmetic-coding extension (`C8`) and the arithmetic conditioning table (`CC`).
 */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/**
 * An image's size in its own pixels (an SVG's in user units).
 */
export type ImageSize = {
  /**
   * The width.
   */
  width: number;

  /**
   * The height.
   */
  height: number;

  /**
   * Whether the image is made of pixels, so it can be too small for where it is shown; `false` for
   * SVG.
   */
  raster: boolean;
};

/**
 * Reads an image file's size from its first bytes: PNG, JPEG, WebP or SVG.
 *
 * @param file - The absolute path, already checked to be the image its extension says.
 * @returns The size, or `undefined` when the file cannot be read or does not say its size.
 */
export const readImageSize = Effect.fn('readImageSize')(function* (
  file: string,
): Effect.fn.Return<ImageSize | undefined, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const head = yield* Effect.scoped(
    Effect.flatMap(fs.open(file, { flag: 'r' }), (handle) => handle.readAlloc(HEAD_BYTES)),
  ).pipe(Effect.orElseSucceed(() => Option.none<Uint8Array>()));
  return Option.match(head, { onNone: () => undefined, onSome: imageSize });
});

/**
 * An image's size from its first bytes: PNG, JPEG, WebP or SVG.
 *
 * @param bytes - The start of the file.
 * @returns The size, or `undefined` when the bytes are none of these or do not say it.
 */
export function imageSize(bytes: Uint8Array): ImageSize | undefined {
  return pngSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes) ?? svgSize(bytes);
}

/**
 * A PNG's size, from its `IHDR` chunk, which always comes first.
 *
 * @param bytes - The start of the file.
 */
function pngSize(bytes: Uint8Array): ImageSize | undefined {
  if (
    bytes.length < PNG_SIZE_HEADER_BYTES ||
    !matches(bytes, 0, PNG_SIGNATURE) ||
    !text(bytes, PNG_IHDR_OFFSET_BYTES, 'IHDR')
  ) {
    return undefined;
  }

  return raster(uint32(bytes, PNG_WIDTH_OFFSET_BYTES), uint32(bytes, PNG_HEIGHT_OFFSET_BYTES));
}

/**
 * A JPEG's size, from its first start-of-frame segment.
 *
 * @param bytes - The start of the file.
 */
function jpegSize(bytes: Uint8Array): ImageSize | undefined {
  if (!matches(bytes, 0, JPEG_SIGNATURE)) {
    return undefined;
  }

  let offset = 2;
  while (offset + JPEG_MIN_SEGMENT_BYTES < bytes.length) {
    if (bytes[offset] !== JPEG_MARKER_PREFIX) {
      return undefined;
    }

    const marker = bytes[offset + 1] ?? 0;
    if (marker === JPEG_MARKER_PREFIX) {
      // Fill bytes before a marker.
      offset += 1;
    } else if (SOF_MARKERS.has(marker)) {
      return raster(
        uint16(bytes, offset + JPEG_WIDTH_OFFSET_BYTES),
        uint16(bytes, offset + JPEG_HEIGHT_OFFSET_BYTES),
      );
    } else if (
      marker === JPEG_TEMPORARY_MARKER ||
      (marker >= JPEG_RESTART_MARKER_FIRST && marker <= JPEG_END_OF_IMAGE_MARKER)
    ) {
      // Markers without a length.
      offset += 2;
    } else {
      offset += 2 + uint16(bytes, offset + 2);
    }
  }

  return undefined;
}

/**
 * A WebP's size, from its lossy (`VP8 `), lossless (`VP8L`) or extended (`VP8X`) header.
 *
 * @param bytes - The start of the file.
 */
function webpSize(bytes: Uint8Array): ImageSize | undefined {
  if (
    bytes.length < WEBP_SIZE_HEADER_BYTES ||
    !text(bytes, 0, 'RIFF') ||
    !text(bytes, WEBP_SIGNATURE_OFFSET_BYTES, 'WEBP')
  ) {
    return undefined;
  }

  /**
   * One byte of the header, or 0 past its end.
   */
  const byte = (index: number): number => bytes[index] ?? 0;
  if (text(bytes, WEBP_FRAME_KIND_OFFSET_BYTES, 'VP8 ')) {
    return raster(
      uint16le(bytes, WEBP_LOSSY_WIDTH_OFFSET_BYTES) & WEBP_LOSSY_DIMENSION_MASK,
      uint16le(bytes, WEBP_LOSSY_HEIGHT_OFFSET_BYTES) & WEBP_LOSSY_DIMENSION_MASK,
    );
  }

  if (text(bytes, WEBP_FRAME_KIND_OFFSET_BYTES, 'VP8L')) {
    const [b0, b1, b2, b3] = [byte(21), byte(22), byte(23), byte(24)];
    return raster(
      1 + (((b1 & 0x3f) << 8) | b0),
      1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    );
  }

  if (text(bytes, WEBP_FRAME_KIND_OFFSET_BYTES, 'VP8X')) {
    return raster(
      1 + (byte(24) | (byte(25) << 8) | (byte(26) << 16)),
      1 + (byte(27) | (byte(28) << 8) | (byte(29) << 16)),
    );
  }

  return undefined;
}

/**
 * An SVG's size, from its root element's `viewBox`, else its unitless or pixel `width` and
 * `height`.
 *
 * @param bytes - The start of the file.
 */
function svgSize(bytes: Uint8Array): ImageSize | undefined {
  const source = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const root = SVG_ROOT_PATTERN.exec(source)?.[0];
  if (root === undefined) {
    return undefined;
  }

  const viewBox = SVG_VIEWBOX_PATTERN.exec(root)?.[1];
  const box = viewBox?.trim().split(SVG_VIEWBOX_SEPARATOR_PATTERN).map(Number);
  if (box?.length === SVG_VIEWBOX_DIMENSIONS && box.every(Number.isFinite)) {
    return vector(box[2] ?? 0, box[3] ?? 0);
  }

  return vector(length(root, 'width'), length(root, 'height'));
}

/**
 * A unitless or pixel length attribute of an SVG root, or 0.
 *
 * @param root - The root element's start tag.
 * @param name - `width` or `height`.
 */
function length(root: string, name: string): number {
  const value = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(?:px)?\\s*["']`, 'i').exec(
    root,
  )?.[1];
  return value === undefined ? 0 : Number(value);
}

/**
 * A raster size, or `undefined` when either side is zero.
 *
 * @param width - Pixels.
 * @param height - Pixels.
 */
function raster(width: number, height: number): ImageSize | undefined {
  return width > 0 && height > 0 ? { width, height, raster: true } : undefined;
}

/**
 * A vector size, or `undefined` when either side is zero or not a number.
 *
 * @param width - User units.
 * @param height - User units.
 */
function vector(width: number, height: number): ImageSize | undefined {
  return width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)
    ? { width, height, raster: false }
    : undefined;
}

/**
 * Whether the bytes at an offset are the given ones.
 *
 * @param bytes - The bytes.
 * @param offset - Where to look.
 * @param expected - The bytes expected there.
 */
function matches(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

/**
 * Whether the bytes at an offset spell ASCII text.
 *
 * @param bytes - The bytes.
 * @param offset - Where to look.
 * @param expected - The text, one byte per character.
 */
function text(bytes: Uint8Array, offset: number, expected: string): boolean {
  return matches(
    bytes,
    offset,
    Array.from(expected, (character) => character.charCodeAt(0)),
  );
}

/**
 * A big-endian 32-bit unsigned integer.
 *
 * @param bytes - The bytes.
 * @param offset - Where it starts.
 */
function uint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

/**
 * A big-endian 16-bit unsigned integer, or 0 past the end.
 *
 * @param bytes - The bytes.
 * @param offset - Where it starts.
 */
function uint16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << BITS_PER_BYTE) | (bytes[offset + 1] ?? 0);
}

/**
 * A little-endian 16-bit unsigned integer, or 0 past the end.
 *
 * @param bytes - The bytes.
 * @param offset - Where it starts.
 */
function uint16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << BITS_PER_BYTE);
}
