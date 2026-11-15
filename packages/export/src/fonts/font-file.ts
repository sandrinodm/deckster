import { FRAMEWORK_INSTALLED } from '@deckster/brand/node';
import { Effect, FileSystem } from 'effect';
import { createRequire } from 'node:module';

import { exportError, type ExportError } from '#export-error.ts';
import { fontContainer, woffToSfnt } from '#fonts/sfnt.ts';

/**
 * Google's WOFF 2.0 decoder compiled to WebAssembly (the `wawoff2` package): WOFF 2.0 rebuilds the
 * `glyf` and `loca` tables from a transformed stream, which only a full decoder does right.
 */
type Woff2Decoder = (bytes: Uint8Array) => Promise<Uint8Array>;

/**
 * The fix printed when a brand font cannot be read.
 */
const FONT_FIX =
  (FRAMEWORK_INSTALLED
    ? 'Install the font package in the workspace folder (`npm install <package>`)'
    : 'Run `pnpm install` so the brand fonts are installed') +
  ', or pass --no-embed-fonts to export without embedding.';

/**
 * Reads a font file the brand loads and returns it as an sfnt (TrueType or OpenType) font: WOFF 2.0
 * files are decoded with Google's decoder, WOFF 1.0 files are inflated table by table, and TTF and
 * OTF files are read as they are.
 *
 * @param file - The absolute path of the font file.
 * @returns The sfnt bytes.
 * @throws ExportError in the error channel when the file cannot be read or decoded.
 */
export const readFontFile = Effect.fn('readFontFile')(function* (
  file: string,
): Effect.fn.Return<Uint8Array, ExportError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const bytes = yield* fs
    .readFile(file)
    .pipe(Effect.mapError((cause) => exportError(`read the font ${file}`, cause, FONT_FIX)));
  const container = fontContainer(bytes);
  if (container === 'sfnt') {
    return bytes;
  }

  if (container === 'woff') {
    const sfnt = yield* Effect.try({
      try: () => woffToSfnt(bytes),
      catch: (cause) => exportError(`decode the WOFF font ${file}`, cause, FONT_FIX),
    });
    if (typeof sfnt === 'string') {
      return yield* exportError(`decode the WOFF font ${file}`, sfnt, FONT_FIX);
    }

    return sfnt;
  }

  const decode = yield* Effect.try({
    try: (): Woff2Decoder => createRequire(import.meta.url)('wawoff2/decompress.js'),
    catch: (cause) => exportError('load the WOFF 2.0 decoder', cause, FONT_FIX),
  });
  const decoded = yield* Effect.tryPromise({
    try: () => decode(bytes),
    catch: (cause) => exportError(`decode the WOFF 2.0 font ${file}`, cause, FONT_FIX),
  });
  return new Uint8Array(decoded);
});
