/**
 * Arguments of {@link isolateNode}.
 */
export type IsolateArgs = {
  /**
   * The `data-export-id` of the element to keep.
   */
  id: number;

  /**
   * `subtree` keeps the element and everything inside it; `paint` keeps only what the element
   * paints itself.
   */
  scope: 'subtree' | 'paint';
};

/**
 * Hides everything on the page except one element (and, for `subtree`, its content), and makes the
 * page and the element's ancestors paint nothing, so a screenshot with a transparent background
 * holds exactly what the element draws. Runs in the browser; self-contained. Call
 * {@link restoreIsolation} afterwards.
 *
 * @param args - The element and what to keep.
 * @returns Whether the element was found.
 */
export function isolateNode(args: IsolateArgs): boolean {
  const target = document.querySelector(`[data-export-id="${args.id}"]`);
  if (target === null) {
    return false;
  }

  target.setAttribute('data-export-keep', '');
  if (args.scope === 'subtree') {
    for (const child of Array.from(target.querySelectorAll('*'))) {
      child.setAttribute('data-export-keep', '');
    }
  } else {
    target.setAttribute('data-export-paint-only', '');
  }

  for (let node = target.parentElement; node !== null; node = node.parentElement) {
    node.setAttribute('data-export-ancestor', '');
  }

  const style = document.createElement('style');
  style.id = 'deck-export-isolate';
  style.textContent = [
    'html, body { background: transparent !important; }',
    'body *:not([data-export-keep]):not([data-export-ancestor]) { visibility: hidden !important; }',
    '[data-export-ancestor] { visibility: visible !important; ' +
      'background: transparent !important; border-color: transparent !important; ' +
      'box-shadow: none !important; outline: none !important; }',
    '[data-export-keep] { visibility: visible !important; }',
    '[data-export-paint-only] { color: transparent !important; }',
    '[data-export-paint-only] * { visibility: hidden !important; }',
  ].join('\n');
  document.head.append(style);
  return true;
}

/**
 * Undoes {@link isolateNode}. Runs in the browser; self-contained.
 */
export function restoreIsolation(): void {
  document.getElementById('deck-export-isolate')?.remove();
  for (const attribute of ['data-export-keep', 'data-export-ancestor', 'data-export-paint-only']) {
    for (const element of Array.from(document.querySelectorAll(`[${attribute}]`))) {
      element.removeAttribute(attribute);
    }
  }
}

/**
 * A file the page fetched, base64-encoded.
 */
export type FetchedFile = {
  /**
   * The bytes as base64.
   */
  base64: string;

  /**
   * The media type: `image/png`, `image/jpeg`, `image/gif`, `image/svg+xml` or a video type.
   */
  type: string;
};

/**
 * A file that was not read because it is over the size limit.
 */
export type TooLargeFile = {
  /**
   * Marks the result.
   */
  tooLarge: true;

  /**
   * The size the response declared, or how many bytes had been read when reading stopped.
   */
  bytes: number;
};

/**
 * Arguments of {@link fetchFile}.
 */
export type FetchArgs = {
  /**
   * The URL.
   */
  src: string;

  /**
   * The most bytes to read, or `null` for no limit.
   */
  maxBytes: number | null;
};

/**
 * Fetches a file the page uses, through the page so it resolves exactly as the page did. Pictures
 * in formats PowerPoint does not read (WebP, AVIF) are converted to PNG. With a limit, a response
 * whose `Content-Length` is over it is not read at all, and one without a length is cancelled as
 * soon as it passes it, so a huge file never sits in memory. Runs in the browser; self-contained.
 *
 * @param args - The URL and the size limit.
 * @returns The file, a note that it is too large, or `null` when it cannot be fetched.
 */
export async function fetchFile(args: FetchArgs): Promise<FetchedFile | TooLargeFile | null> {
  const { src, maxBytes } = args;
  const readable = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/svg+xml',
    'video/mp4',
    'video/quicktime',
  ]);
  /**
   * Reads a bounded response body, preserving cancellation before any over-limit result returns.
   */
  const readBlob = async (response: Response): Promise<Blob | TooLargeFile> => {
    if (maxBytes === null || response.body === null) {
      return response.blob();
    }

    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        return { tooLarge: true, bytes: total };
      }

      parts.push(value);
    }

    return new Blob(parts as BlobPart[], { type: response.headers.get('content-type') ?? '' });
  };
  let blob: Blob;
  try {
    const response = await fetch(src);
    if (!response.ok) {
      return null;
    }

    const declared = Number(response.headers.get('content-length') ?? '');
    if (maxBytes !== null && Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel();
      return { tooLarge: true, bytes: declared };
    }

    const result = await readBlob(response);
    if ('tooLarge' in result) {
      return result;
    }

    blob = result;
  } catch {
    return null;
  }

  let type = blob.type.split(';')[0] ?? '';
  if (!readable.has(type) && type.startsWith('image/')) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    const converted = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (converted === null) {
      return null;
    }

    blob = converted;
    type = 'image/png';
  }

  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // String.fromCharCode takes its bytes as call arguments, so they go in 32 KiB pieces to stay
  // under the engine's argument limit.
  const BASE64_CHUNK_BYTES = 0x8000;
  for (let index = 0; index < buffer.length; index += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...buffer.subarray(index, index + BASE64_CHUNK_BYTES));
  }

  return { base64: btoa(binary), type };
}

/**
 * Arguments of {@link encodePicture}.
 */
export type EncodeArgs = {
  /**
   * The PNG as base64.
   */
  base64: string;

  /**
   * The width to scale it to, in pixels; never larger than the picture.
   */
  width: number;

  /**
   * The height to scale it to, in pixels.
   */
  height: number;

  /**
   * The JPEG quality, from 0 to 1, for a picture without transparency.
   */
  quality: number;
};

/**
 * An encoded picture.
 */
export type EncodedPicture = {
  /**
   * The bytes as base64.
   */
  base64: string;

  /**
   * `png` when the picture has transparent pixels, else `jpeg`.
   */
  extension: 'png' | 'jpeg';

  /**
   * Its width in pixels.
   */
  width: number;

  /**
   * Its height in pixels.
   */
  height: number;
};

/**
 * Scales a PNG down to a size and encodes it compactly: JPEG when every pixel is opaque (a photo, a
 * gradient, a slide), PNG when it has transparency. Runs in the browser; self-contained.
 *
 * @param args - The PNG, the size and the JPEG quality.
 * @returns The encoded picture, or `null` when the PNG does not decode.
 */
export async function encodePicture(args: EncodeArgs): Promise<EncodedPicture | null> {
  const RGBA_CHANNELS = 4;
  const ALPHA_CHANNEL = 3;
  const OPAQUE_ALPHA = 255;
  const bytes = Uint8Array.from(atob(args.base64), (character) => character.charCodeAt(0));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  } catch {
    return null;
  }

  const width = Math.max(1, Math.min(bitmap.width, Math.round(args.width)));
  const height = Math.max(1, Math.min(bitmap.height, Math.round(args.height)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    return null;
  }

  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  let opaque = true;
  for (let index = ALPHA_CHANNEL; index < pixels.length; index += RGBA_CHANNELS) {
    if ((pixels[index] ?? 0) < OPAQUE_ALPHA) {
      opaque = false;
      break;
    }
  }

  const unchanged = width === bitmap.width && height === bitmap.height;
  if (!opaque && unchanged) {
    return { base64: args.base64, extension: 'png', width, height };
  }

  const type = opaque ? 'image/jpeg' : 'image/png';
  const url = canvas.toDataURL(type, args.quality);
  return {
    base64: url.slice(url.indexOf(',') + 1),
    extension: opaque ? 'jpeg' : 'png',
    width,
    height,
  };
}

/**
 * A grain texture tile, as the brand draws it over a gradient.
 */
export type GrainTile = {
  /**
   * The tile as a PNG with transparency, base64, one pixel per canvas pixel.
   */
  base64: string;

  /**
   * The tile's size in canvas pixels.
   */
  size: number;
};

/**
 * Draws the grain texture of an element's background (the brand's SVG noise layer, a
 * `data:image/svg+xml` URL with `feTurbulence`) into a PNG tile, so PowerPoint can tile a small
 * picture over a native gradient instead of storing the whole textured slide. Runs in the browser;
 * self-contained.
 *
 * @param id - The `data-export-id` of the element whose background has the grain.
 * @returns The tile, or `null` when the element has no grain layer.
 */
export async function grainTile(id: number): Promise<GrainTile | null> {
  const SVG_DATA_URL_PATTERN = /url\("(data:image\/svg\+xml[^"]*)"\)/gi;
  const TURBULENCE_PATTERN = /feTurbulence/i;
  const TILE_WIDTH_PATTERN = /width='(\d+)'/;
  const element = document.querySelector(`[data-export-id="${id}"]`);
  if (element === null) {
    return null;
  }

  const urls = Array.from(
    getComputedStyle(element).backgroundImage.matchAll(SVG_DATA_URL_PATTERN),
    (match) => {
      try {
        return decodeURIComponent(match[1] ?? '');
      } catch {
        return '';
      }
    },
  );
  const source = urls.find((url) => TURBULENCE_PATTERN.test(url));
  if (source === undefined) {
    return null;
  }

  const size = Number(TILE_WIDTH_PATTERN.exec(source)?.[1] ?? '0');
  if (size === 0) {
    return null;
  }

  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(source.slice(source.indexOf(',') + 1))}`;
  try {
    await image.decode();
  } catch {
    return null;
  }

  // One pixel per canvas pixel: the grain is noise at a few percent opacity, so a sharper tile
  // only makes the file bigger.
  const density = 1;
  const canvas = document.createElement('canvas');
  canvas.width = size * density;
  canvas.height = size * density;
  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/png');
  return { base64: url.slice(url.indexOf(',') + 1), size };
}
