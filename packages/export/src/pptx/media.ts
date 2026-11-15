import { createHash } from 'node:crypto';

import type { OpcPackage } from '#ooxml/opc-package.ts';
import type { EmbeddedFile } from '#pptx/deck-input.ts';

import { REL } from '#pptx/namespaces.ts';

/**
 * Hex digits of the content hash in a media part's name.
 */
const HASH_DIGITS = 16;

/**
 * The first bytes of a JPEG file.
 */
const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const;

/**
 * The extension of a picture's bytes: `jpeg` when they start like a JPEG, else `png` (every
 * captured picture is one or the other).
 *
 * @param data - The bytes.
 */
export function pictureExtension(data: Uint8Array): 'jpeg' | 'png' {
  return JPEG_MAGIC.every((byte, index) => data[index] === byte) ? 'jpeg' : 'png';
}

/**
 * Embeds a media file once per package, named by a hash of its bytes, so the same picture, logo or
 * video used on several slides, masters or layouts is stored once, and relates it from a part.
 *
 * @param pkg - The package.
 * @param from - The part that shows it.
 * @param file - The file, or captured picture bytes (PNG or JPEG).
 * @param type - The relationship type; an image by default.
 * @returns The relationship id.
 */
export function embedMedia(
  pkg: OpcPackage,
  from: string,
  file: EmbeddedFile | Uint8Array,
  type: string = REL.image,
): string {
  return pkg.relate(from, type, mediaPart(pkg, file));
}

/**
 * The media part of a file, added to the package on first use.
 *
 * @param pkg - The package.
 * @param file - The file, or captured picture bytes.
 * @returns The part's path.
 */
export function mediaPart(pkg: OpcPackage, file: EmbeddedFile | Uint8Array): string {
  const data = file instanceof Uint8Array ? file : file.data;
  const extension = file instanceof Uint8Array ? pictureExtension(file) : file.extension;
  const hash = createHash('sha1').update(data).digest('hex').slice(0, HASH_DIGITS);
  const partPath = `ppt/media/${extension === 'svg' ? 'vector' : 'media'}-${hash}.${extension}`;
  if (!pkg.has(partPath)) {
    pkg.addPart(partPath, data);
  }

  return partPath;
}
