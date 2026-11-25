import { BRANDS_DIR, DECKSTER_SOURCE_FILE, DecksterSource } from '@deckster/brand/node';
import { Effect, FileSystem, Option, Schema } from 'effect';
import path from 'node:path';

import type { Problem } from '#errors.ts';
import type { LayoutProblemCode } from '#layouts/layout-problem.ts';

import { LAYOUTS_DIR } from '#layouts/local-layouts.ts';

/**
 * The file `deckster brand add` writes into a brand folder: where the brand came from and which of
 * its code layouts were left out.
 */
export const BRAND_SOURCE_FILE = DECKSTER_SOURCE_FILE;

/**
 * The parts of {@link BRAND_SOURCE_FILE} the build reads, taken from the schema `brand add` writes
 * it with. The other keys, such as the commit, may be missing or ignored.
 */
const BrandSourceJson = Schema.fromJsonString(
  Schema.Struct({
    source: DecksterSource.fields.source,
    codeLayoutsSkipped: DecksterSource.fields.codeLayoutsSkipped,
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

/**
 * Why a brand's code layout that `brand add` left out cannot be used: the layout's name, then what
 * to copy from where. The message starts with the layout's name in quotes, so a slide check can put
 * its field in front of it.
 *
 * @param name - The layout `brand add` left out.
 * @param brand - The brand's folder name.
 * @param skipped - What `brand add` recorded for the brand.
 * @returns The problem, with the code `layout-code-skipped`.
 */
export function skippedCodeLayoutProblem(
  name: string,
  brand: string,
  skipped: SkippedCodeLayouts,
): Problem {
  const folder = `${BRANDS_DIR}/${brand}/${LAYOUTS_DIR}`;
  return {
    code: 'layout-code-skipped' satisfies LayoutProblemCode,
    message:
      `"${name}" is a code layout of the ${brand} brand that \`brand add\` left out, ` +
      'because a fetched brand is added as data and its code is not copied.',
    fix:
      `Read the layout's code at ${skipped.source}, then copy its ${LAYOUTS_DIR}/${name}/ ` +
      `folder (and what it imports from ${LAYOUTS_DIR}/_shared/) into ${folder}/. Or use a ` +
      'layout the brand has here.',
  };
}
