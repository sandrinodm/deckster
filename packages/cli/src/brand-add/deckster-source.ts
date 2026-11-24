import { isSafeName } from '@deckster/brand';
import { Effect, FileSystem, Schema } from 'effect';
import path from 'node:path';

import { fileSystemError, type FileSystemError } from '#cli-error.ts';

/**
 * The file `deckster brand add` writes into the added brand folder, next to `brand.ts`. It is
 * hidden, so a later `brand add` of the brand never copies it on.
 */
export const DECKSTER_SOURCE_FILE = '.deckster-source.json';

/**
 * Spaces of indentation in the written file.
 */
const JSON_INDENT_SPACES = 2;

/**
 * The folder of a brand that holds its layouts, data and code.
 */
const LAYOUTS_FOLDER = 'layouts';

/**
 * The files whose presence makes a folder under `layouts/` a code layout.
 */
const CODE_LAYOUT_FILES = new Set(['contract.ts', 'layout.tsx']);

/**
 * The depth of `layouts/<name>/contract.ts`, in path segments.
 */
const CODE_LAYOUT_FILE_DEPTH = 3;

/**
 * The userinfo of an address (`user:password@`) after its scheme, such as `https://`.
 */
const USERINFO_PATTERN = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#@]*)@/i;

/**
 * Schemes whose userinfo is never worth keeping: for these a user name is a credential too.
 */
const WEB_SCHEMES = new Set(['http://', 'https://']);

/**
 * What `deckster brand add` records about where a brand came from. Other commands read it to say
 * why a slide's layout is missing; it holds no secret and never changes the brand.
 */
export const DecksterSource = Schema.Struct({
  /**
   * Where the brand came from, as the author wrote the source, without credentials.
   */
  source: Schema.String,

  /**
   * The full commit the files were fetched at, or null when it is not known.
   */
  commit: Schema.NullOr(Schema.String),

  /**
   * The names of the code layouts of the source brand that were left out, sorted. A code layout is
   * a folder `layouts/<name>/` with a `contract.ts` or `layout.tsx`.
   */
  codeLayoutsSkipped: Schema.Array(Schema.String),
});

/**
 * The decoded form of {@link DecksterSource}.
 */
export type DecksterSource = typeof DecksterSource.Type;

/**
 * Encodes a record as the text of the file: indented JSON with a trailing newline.
 *
 * @param record - What to record.
 * @returns The file's text.
 * @throws Schema error when the record does not fit {@link DecksterSource}.
 */
export function encodeDecksterSource(record: DecksterSource): string {
  const encoded = Schema.encodeSync(DecksterSource)(record);
  return `${JSON.stringify(encoded, null, JSON_INDENT_SPACES)}\n`;
}

/**
 * Writes `.deckster-source.json` into a brand folder, replacing the one that is there. Only the
 * source and commit are recorded: the files of the source never enter the file's content.
 *
 * @param brandDir - The brand folder to write into.
 * @param record - What to record.
 * @returns The path written.
 * @throws FileSystemError in the error channel when the file cannot be written.
 */
export const writeDecksterSource = Effect.fn('writeDecksterSource')(function* (
  brandDir: string,
  record: DecksterSource,
): Effect.fn.Return<string, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const file = path.join(brandDir, DECKSTER_SOURCE_FILE);
  const text = encodeDecksterSource({ ...record, source: withoutCredentials(record.source) });
  yield* fs
    .writeFileString(file, text)
    .pipe(Effect.mapError((error) => fileSystemError('write', file, error, 'Try again.')));
  return file;
});

/**
 * A file a brand add left out, as far as the code layout names need to know it.
 */
type LeftOutFile = {
  /**
   * The path inside the brand folder.
   */
  readonly path: string;

  /**
   * Why it was left out; only `code` can prove a code layout.
   */
  readonly reason: string;
};

/**
 * The names of the code layouts among the files a brand add left out. Only the files skipped as
 * `code` count: a hidden folder or a symbolic link is never a layout, `_shared` and any other name
 * that is not a safe folder name is not one either, and nothing is read or run.
 *
 * @param skipped - The files left out of the added brand.
 * @returns The layout names, sorted and without duplicates.
 */
export function codeLayoutNames(skipped: readonly LeftOutFile[]): string[] {
  const names = new Set<string>();
  for (const file of skipped) {
    const name = codeLayoutName(file);
    if (name !== undefined) {
      names.add(name);
    }
  }

  return [...names].toSorted();
}

/**
 * The layout a skipped file proves to exist, or `undefined` when it is not a layout's entry file.
 *
 * @param file - A file left out of the added brand.
 */
function codeLayoutName(file: LeftOutFile): string | undefined {
  if (file.reason !== 'code') {
    return undefined;
  }

  const segments = file.path.split('/');
  const [folder, name, entry] = segments;
  const isEntry =
    segments.length === CODE_LAYOUT_FILE_DEPTH &&
    folder === LAYOUTS_FOLDER &&
    entry !== undefined &&
    CODE_LAYOUT_FILES.has(entry);
  return isEntry && name !== undefined && isSafeName(name) ? name : undefined;
}

/**
 * Removes the credentials of an address: the user and password of an `https://` address, the
 * password of any other scheme. A user name in an SSH address stays, as it is part of where the
 * brand lives; the source parser refuses addresses with passwords before this ever sees one.
 *
 * @param source - The source as written.
 */
export function withoutCredentials(source: string): string {
  return source.replace(USERINFO_PATTERN, (_match, scheme: string, userinfo: string) => {
    const user = WEB_SCHEMES.has(scheme.toLowerCase()) ? '' : (userinfo.split(':')[0] ?? '');
    return user === '' ? scheme : `${scheme}${user}@`;
  });
}
