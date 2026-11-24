import { Effect, FileSystem, Option, Schema } from 'effect';
import path from 'node:path';

/**
 * The file `deckster brand add` writes into a brand folder: where the brand came from and which of
 * its code layouts were left out.
 */
export const BRAND_SOURCE_FILE = '.deckster-source.json';

/**
 * The parts of {@link BRAND_SOURCE_FILE} the build reads. Other keys are ignored.
 */
const BrandSourceJson = Schema.fromJsonString(
  Schema.Struct({
    source: Schema.String,
    codeLayoutsSkipped: Schema.Array(Schema.String),
  }),
);

/**
 * The code layouts `brand add` left out of a brand.
 */
export type SkippedCodeLayouts = {
  /**
   * Where the brand was added from, as the user gave it.
   */
  readonly source: string;

  /**
   * The names of the code layouts that were not copied.
   */
  readonly names: readonly string[];
};

/**
 * Reads which code layouts `deckster brand add` left out of a brand, from the brand folder's
 * `.deckster-source.json`.
 *
 * @param brandDir - The absolute brand folder.
 * @returns The source and the names; `undefined` when the brand has no such file, or it cannot be
 *   read as one.
 */
export const readSkippedCodeLayouts = Effect.fn('readSkippedCodeLayouts')(function* (
  brandDir: string,
): Effect.fn.Return<SkippedCodeLayouts | undefined, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(path.join(brandDir, BRAND_SOURCE_FILE))
    .pipe(Effect.orElseSucceed(() => undefined));
  if (text === undefined) {
    return undefined;
  }

  const decoded = Schema.decodeUnknownOption(BrandSourceJson)(text);
  return Option.isNone(decoded)
    ? undefined
    : { source: decoded.value.source, names: decoded.value.codeLayoutsSkipped };
});
