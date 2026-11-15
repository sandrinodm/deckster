import { Effect, FileSystem } from 'effect';
import { createRequire } from 'node:module';

import { exportError, type ExportError } from '#export-error.ts';

/**
 * `HB_MEMORY_MODE_WRITABLE`: HarfBuzz may use the bytes in place.
 */
const MEMORY_MODE_WRITABLE = 2;

/**
 * `HB_SUBSET_SETS_LAYOUT_FEATURE_TAG`: the OpenType layout features the subset keeps.
 */
const SETS_LAYOUT_FEATURE_TAG = 6;

/**
 * The HarfBuzz functions the subsetter build of harfbuzzjs exports (`harfbuzz-subset.wasm`), as the
 * C API declares them (`hb-subset.h`, `hb-set.h`, `hb-blob.h`, `hb-face.h`). Pointers are offsets
 * into {@link HarfBuzz.memory}.
 */
export type HarfBuzz = {
  /**
   * The module's linear memory.
   */
  memory: WebAssembly.Memory;

  /**
   * Allocates bytes in the module's memory.
   */
  malloc: (size: number) => number;

  /**
   * Frees an allocation.
   */
  free: (pointer: number) => void;

  /**
   * Wraps bytes in a blob.
   */
  hb_blob_create: (
    data: number,
    length: number,
    mode: number,
    userData: number,
    destroy: number,
  ) => number;

  /**
   * Releases a blob.
   */
  hb_blob_destroy: (blob: number) => void;

  /**
   * Where a blob's bytes are.
   */
  hb_blob_get_data: (blob: number, length: number) => number;

  /**
   * How many bytes a blob holds.
   */
  hb_blob_get_length: (blob: number) => number;

  /**
   * Opens a face of a font blob.
   */
  hb_face_create: (blob: number, index: number) => number;

  /**
   * Releases a face.
   */
  hb_face_destroy: (face: number) => void;

  /**
   * The font file of a face, as a blob.
   */
  hb_face_reference_blob: (face: number) => number;

  /**
   * Adds a value to a set.
   */
  hb_set_add: (set: number, value: number) => void;

  /**
   * Empties a set.
   */
  hb_set_clear: (set: number) => void;

  /**
   * Turns a set into its complement.
   */
  hb_set_invert: (set: number) => void;

  /**
   * A new subset request, or 0.
   */
  hb_subset_input_create_or_fail: () => number;

  /**
   * Releases a subset request.
   */
  hb_subset_input_destroy: (input: number) => void;

  /**
   * The code points a subset request keeps.
   */
  hb_subset_input_unicode_set: (input: number) => number;

  /**
   * One of the sets of a subset request.
   */
  hb_subset_input_set: (input: number, which: number) => number;

  /**
   * Pins a variation axis at a location, which instances the font along it; false when the font has
   * no such axis.
   */
  hb_subset_input_pin_axis_location: (
    input: number,
    face: number,
    tag: number,
    value: number,
  ) => number;

  /**
   * Subsets (and instances) a face, or returns 0.
   */
  hb_subset_or_fail: (face: number, input: number) => number;
};

/**
 * What to keep of a font.
 */
export type CutRequest = {
  /**
   * The code points to keep; glyphs they need through layout features are kept too.
   */
  codePoints: Iterable<number>;

  /**
   * Where to pin each variation axis, by tag; the font's axes this leaves out are pinned at their
   * defaults by the caller.
   */
  axes: Readonly<Record<string, number>>;
};

/**
 * The loaded module, shared by every export in the process.
 */
let loaded: HarfBuzz | undefined;

/**
 * Loads HarfBuzz's subsetter (harfbuzzjs `dist/harfbuzz-subset.wasm`, a standalone WebAssembly
 * module with no imports) once per process.
 *
 * @returns The exported functions.
 * @throws ExportError in the error channel when the module cannot be read or compiled.
 */
export const loadHarfBuzz = Effect.fn('loadHarfBuzz')(function* (): Effect.fn.Return<
  HarfBuzz,
  ExportError,
  FileSystem.FileSystem
> {
  if (loaded !== undefined) {
    return loaded;
  }

  const fix = 'Run `pnpm install` so harfbuzzjs is installed, or pass --no-embed-fonts.';
  const file = yield* Effect.try({
    try: () => createRequire(import.meta.url).resolve('harfbuzzjs/dist/harfbuzz-subset.wasm'),
    catch: (cause) => exportError('find the HarfBuzz subsetter', cause, fix),
  });
  const fs = yield* FileSystem.FileSystem;
  const bytes = yield* fs
    .readFile(file)
    .pipe(Effect.mapError((cause) => exportError(`read ${file}`, cause, fix)));
  const instance = yield* Effect.try({
    try: () => new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(bytes)), {}),
    catch: (cause) => exportError('start the HarfBuzz subsetter', cause, fix),
  });
  loaded = instance.exports as unknown as HarfBuzz;
  return loaded;
});

/**
 * Cuts a static font out of a font: pins the requested variation axes (HarfBuzz's instancer applies
 * `gvar`, `HVAR`, `MVAR` and the layout tables' variations and drops `fvar`), keeps the glyphs the
 * code points need and every layout feature, so shaping and advances match the browser at those
 * axes.
 *
 * @param hb - HarfBuzz.
 * @param font - An sfnt font.
 * @param request - The code points and axis locations.
 * @returns The new font, or a sentence saying why HarfBuzz refused.
 */
export function cutFont(hb: HarfBuzz, font: Uint8Array, request: CutRequest): Uint8Array | string {
  const pointer = hb.malloc(font.length);
  new Uint8Array(hb.memory.buffer).set(font, pointer);
  const blob = hb.hb_blob_create(pointer, font.length, MEMORY_MODE_WRITABLE, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  const input = hb.hb_subset_input_create_or_fail();
  if (input === 0) {
    hb.hb_face_destroy(face);
    hb.free(pointer);
    return 'HarfBuzz could not create a subset request';
  }

  const codePoints = hb.hb_subset_input_unicode_set(input);
  for (const codePoint of request.codePoints) {
    hb.hb_set_add(codePoints, codePoint);
  }

  const features = hb.hb_subset_input_set(input, SETS_LAYOUT_FEATURE_TAG);
  hb.hb_set_clear(features);
  hb.hb_set_invert(features);
  for (const [tag, value] of Object.entries(request.axes)) {
    hb.hb_subset_input_pin_axis_location(input, face, tagNumber(tag), value);
  }

  const subset = hb.hb_subset_or_fail(face, input);
  hb.hb_subset_input_destroy(input);
  if (subset === 0) {
    hb.hb_face_destroy(face);
    hb.free(pointer);
    return 'HarfBuzz could not subset the font';
  }

  const result = hb.hb_face_reference_blob(subset);
  const data = hb.hb_blob_get_data(result, 0);
  const length = hb.hb_blob_get_length(result);
  const bytes = new Uint8Array(hb.memory.buffer).slice(data, data + length);
  hb.hb_blob_destroy(result);
  hb.hb_face_destroy(subset);
  hb.hb_face_destroy(face);
  hb.free(pointer);
  return length === 0 ? 'HarfBuzz returned an empty font' : bytes;
}

/**
 * An OpenType tag as the 32-bit number HarfBuzz takes (`HB_TAG`).
 *
 * @param tag - A four-character tag such as `wght`.
 */
export function tagNumber(tag: string): number {
  const padded = tag.padEnd(4, ' ');
  return (
    ((padded.charCodeAt(0) << 24) |
      (padded.charCodeAt(1) << 16) |
      (padded.charCodeAt(2) << 8) |
      padded.charCodeAt(3)) >>>
    0
  );
}
