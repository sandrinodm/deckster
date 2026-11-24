import { Effect, FileSystem, Schema } from 'effect';
import { createHash } from 'node:crypto';
import path from 'node:path';

import type { EjectedLayout } from '#layouts/eject/eject-transform.ts';

import { cliError, type CliError } from '#cli-error.ts';
import { SHARED_DIR } from '#layouts/eject/eject-transform.ts';

/**
 * What an ejected layout started from: the folder `.eject/` inside the layout's folder holds every
 * file as `deckster layouts eject` produced it (after the import rewrite), the shared helpers under
 * `.eject/_shared/`, and `eject.json` with the hash of each. `deckster layouts diff` compares it
 * with what the kit gives today. Folders that start with a dot are never layouts and are never
 * copied by `deckster brand add`.
 */

/**
 * The folder inside an ejected layout's folder that holds its provenance.
 */
export const PROVENANCE_DIR = '.eject';

/**
 * The provenance record's file name.
 */
export const PROVENANCE_FILE = 'eject.json';

/**
 * The indentation of the provenance record.
 */
const JSON_INDENT_SPACES = 2;

/**
 * The provenance record of one ejected layout.
 */
export const Provenance = Schema.Struct({
  /**
   * The layout's name.
   */
  layout: Schema.String,

  /**
   * The version of the deckster CLI that ejected it.
   */
  deckster: Schema.String,

  /**
   * The SHA-256 of each file as it was ejected, in hex, by path: a file of the layout by its name
   * (`layout.tsx`), a shared helper as `_shared/<file>`.
   */
  files: Schema.Record(Schema.String, Schema.String),
});

/**
 * The provenance record of one ejected layout.
 */
export type Provenance = typeof Provenance.Type;

/**
 * The provenance record as it is stored: JSON text.
 */
const ProvenanceJson = Schema.fromJsonString(Provenance);

/**
 * What a layout's provenance folder holds.
 */
export type StoredProvenance = {
  /**
   * The record in `eject.json`.
   */
  readonly record: Provenance;

  /**
   * The text of each recorded file that is still in the folder, by the record's path.
   */
  readonly files: Readonly<Record<string, string>>;

  /**
   * The recorded paths whose file is missing or has another hash than the recorded one.
   */
  readonly changed: readonly string[];
};

/**
 * The SHA-256 of a text, in hex.
 *
 * @param text - The text, hashed as UTF-8.
 */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The files of an ejected layout by provenance path: its own files by name and its shared helpers
 * as `_shared/<file>`.
 *
 * @param ejected - The transform's result for one layout.
 */
export function provenancePaths(ejected: EjectedLayout): Record<string, string> {
  const shared = Object.entries(ejected.shared).map(
    ([file, text]) => [`${SHARED_DIR}/${file}`, text] as const,
  );
  return Object.fromEntries([...Object.entries(ejected.files), ...shared]);
}

/**
 * The files of a layout's provenance folder: each ejected file under its provenance path, and the
 * record.
 *
 * @param ejected - The transform's result for one layout.
 * @param deckster - The version of the CLI that ejects it.
 * @returns The folder's files by path relative to it, `eject.json` included.
 */
export function provenanceFiles(ejected: EjectedLayout, deckster: string): Record<string, string> {
  const files = provenancePaths(ejected);
  const record: Provenance = {
    layout: ejected.name,
    deckster,
    files: Object.fromEntries(Object.entries(files).map(([file, text]) => [file, sha256(text)])),
  };
  return {
    ...files,
    [PROVENANCE_FILE]: `${JSON.stringify(record, null, JSON_INDENT_SPACES)}\n`,
  };
}

/**
 * Reads the provenance folder of an ejected layout.
 *
 * @param layoutDir - The layout's folder.
 * @param shown - The folder as messages name it.
 * @returns The record, the recorded files still there, and which of them changed since.
 * @throws CliError in the error channel when the folder has no readable `eject.json`.
 */
export const readProvenance = Effect.fn('readProvenance')(function* (
  layoutDir: string,
  shown: string,
): Effect.fn.Return<StoredProvenance, CliError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const dir = path.join(layoutDir, PROVENANCE_DIR);
  const record = yield* fs.readFileString(path.join(dir, PROVENANCE_FILE)).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ProvenanceJson)),
    Effect.mapError(() =>
      cliError(
        `${shown}/${PROVENANCE_DIR}/${PROVENANCE_FILE} is missing or not a provenance record, ` +
          'so there is nothing to compare the kit with.\n' +
          '`deckster layouts diff` works on a layout that `deckster layouts eject` wrote, with ' +
          `its ${PROVENANCE_DIR}/ folder kept as it was written.`,
      ),
    ),
  );
  const files: Record<string, string> = {};
  const changed: string[] = [];
  for (const [file, hash] of Object.entries(record.files)) {
    const text = yield* fs
      .readFileString(path.join(dir, ...file.split('/')))
      .pipe(Effect.orElseSucceed(() => undefined));
    if (text !== undefined) {
      files[file] = text;
    }

    if (text === undefined || sha256(text) !== hash) {
      changed.push(file);
    }
  }

  return { record, files, changed };
});
