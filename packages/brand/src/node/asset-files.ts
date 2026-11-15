import { Effect, FileSystem, Option } from 'effect';
import path from 'node:path';

/**
 * How many leading bytes are read to recognise a file: enough for every binary signature and for
 * the XML declaration, comments and doctype that may precede `<svg`.
 */
const SNIFF_BYTES = 1024;

/**
 * The WebP signature follows RIFF's four-byte size field.
 */
const WEBP_SIGNATURE_OFFSET_BYTES = 8;

/**
 * The JPEG marker prefix and start-of-image marker.
 */
const JPEG_MARKER_PREFIX = 0xff;

/**
 * The JPEG start-of-image marker value.
 */
const JPEG_START_OF_IMAGE = 0xd8;

/**
 * A Unicode byte order mark at the start of an SVG text file.
 */
const BYTE_ORDER_MARK_PATTERN = /^\uFEFF/;

/**
 * An SVG root after the optional XML declaration, comments and doctype.
 */
const SVG_PROLOGUE_PATTERN =
  /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>/]/i;

/**
 * What a file a brand points at may be, by extension, with how to recognise its content.
 */
const ASSET_KINDS: ReadonlyMap<
  string,
  { readonly name: string; readonly matches: (head: Uint8Array) => boolean }
> = new Map([
  ['woff2', { name: 'a WOFF2 font file', matches: (head) => startsWith(head, 'wOF2') }],
  ['woff', { name: 'a WOFF font file', matches: (head) => startsWith(head, 'wOFF') }],
  [
    'ttf',
    {
      name: 'a TrueType font file',
      matches: (head) => startsWith(head, '\u0000\u0001\u0000\u0000') || startsWith(head, 'true'),
    },
  ],
  ['otf', { name: 'an OpenType font file', matches: (head) => startsWith(head, 'OTTO') }],
  ['png', { name: 'a PNG image', matches: (head) => startsWith(head, '\u0089PNG\r\n\u001A\n') }],
  [
    'webp',
    {
      name: 'a WebP image',
      matches: (head) =>
        startsWith(head, 'RIFF') && startsWith(head.subarray(WEBP_SIGNATURE_OFFSET_BYTES), 'WEBP'),
    },
  ],
  ['svg', { name: 'an SVG image', matches: isSvg }],
  ['jpg', { name: 'a JPEG image', matches: isJpeg }],
  ['jpeg', { name: 'a JPEG image', matches: isJpeg }],
]);

/**
 * The extensions of the font files a brand may ship.
 */
export const FONT_EXTENSIONS: readonly string[] = ['woff2', 'woff', 'ttf', 'otf'];

/**
 * The extensions of the logo files a brand may ship.
 */
export const IMAGE_EXTENSIONS: readonly string[] = ['svg', 'png', 'webp'];

/**
 * The extensions of the background layer files a brand may ship: the logo kinds and JPEG, for
 * photos.
 */
export const BACKGROUND_EXTENSIONS: readonly string[] = [...IMAGE_EXTENSIONS, 'jpg', 'jpeg'];

/**
 * A file a brand points at: where it is written to be, the folder it must stay inside, and what it
 * must be.
 */
export type AssetCheck = {
  /**
   * The absolute path the brand's relative path resolves to.
   */
  file: string;

  /**
   * The folder the file must stay inside once every symlink is followed: the brand folder, or a
   * font package's folder.
   */
  root: string;

  /**
   * The folder as messages name it, such as `brands/acme/`.
   */
  rootName: string;

  /**
   * The path as the brand writes it, for messages.
   */
  written: string;

  /**
   * The extensions allowed: {@link FONT_EXTENSIONS}, {@link IMAGE_EXTENSIONS} or
   * {@link BACKGROUND_EXTENSIONS}.
   */
  extensions: readonly string[];
};

/**
 * Why a file a brand points at cannot be used, or `undefined` when it can: it does not exist, it
 * leaves its folder once symlinks are followed (so a brand cannot publish `/etc/hosts` or a
 * workspace file as a font or a logo), its extension is not allowed, or its first bytes are not the
 * signature of what its extension says.
 *
 * @param check - The file and what it must be.
 * @returns A message naming the file, or `undefined`.
 */
export const assetProblem = Effect.fn('assetProblem')(function* (
  check: AssetCheck,
): Effect.fn.Return<string | undefined, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const real = yield* Effect.option(fs.realPath(check.file));
  if (Option.isNone(real)) {
    return `${check.written} does not exist in ${check.rootName}.`;
  }

  const root = yield* fs.realPath(check.root).pipe(Effect.orElseSucceed(() => check.root));
  const relative = path.relative(root, real.value);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return `${check.written} is outside ${check.rootName} once symlinks are followed.`;
  }

  const extension = path.extname(real.value).slice(1).toLowerCase();
  const kind = check.extensions.includes(extension) ? ASSET_KINDS.get(extension) : undefined;
  if (kind === undefined) {
    return `${check.written} is not a ${check.extensions.join(', ')} file.`;
  }

  const head = yield* readHead(real.value);
  return head !== undefined && kind.matches(head)
    ? undefined
    : `${check.written} is not ${kind.name}: its content does not start as one does.`;
});

/**
 * The first {@link SNIFF_BYTES} of a file, or `undefined` when it cannot be read.
 *
 * @param file - The absolute path.
 */
const readHead = Effect.fn('readHead')(function* (
  file: string,
): Effect.fn.Return<Uint8Array | undefined, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const head = yield* Effect.scoped(
    Effect.flatMap(fs.open(file, { flag: 'r' }), (handle) => handle.readAlloc(SNIFF_BYTES)),
  ).pipe(Effect.orElseSucceed(() => Option.none<Uint8Array>()));
  return Option.getOrUndefined(head);
});

/**
 * Whether bytes start with a signature written as one character per byte.
 *
 * @param bytes - The bytes.
 * @param signature - The signature.
 */
function startsWith(bytes: Uint8Array, signature: string): boolean {
  for (let index = 0; index < signature.length; index++) {
    if (bytes[index] !== signature.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

/**
 * Whether bytes start as a JPEG does: the start-of-image marker followed by another marker.
 *
 * @param head - The first bytes.
 */
function isJpeg(head: Uint8Array): boolean {
  return (
    head[0] === JPEG_MARKER_PREFIX &&
    head[1] === JPEG_START_OF_IMAGE &&
    head[2] === JPEG_MARKER_PREFIX
  );
}

/**
 * Whether the start of a file reads as SVG: text whose first element, after an optional byte order
 * mark, XML declaration, comments and doctype, is `<svg`.
 *
 * @param head - The first bytes.
 */
function isSvg(head: Uint8Array): boolean {
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(head)
    .replace(BYTE_ORDER_MARK_PATTERN, '');
  return SVG_PROLOGUE_PATTERN.test(text);
}
