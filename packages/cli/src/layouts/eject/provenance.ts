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
 * Matches a path a provenance record may name: a file name in `.eject/` or in `.eject/_shared/`,
 * with no separator other than that one `/` and no `.` or `..` segment.
 */
const PROVENANCE_PATH = new RegExp(`^(?:${SHARED_DIR}/)?(?!\\.\\.?$)[A-Za-z0-9._-]+$`, 'u');

/**
 * Matches a Windows line break, which a checkout with CRLF line endings gives the stored files.
 */
const CRLF = /\r\n/gu;

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
   * The text of each recorded file that is still in the folder, by the record's path, with LF line
   * breaks. A file reached through a link is left out, as if it were missing.
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
 * Reads the provenance folder of an ejected layout. It reads only inside `.eject/`: a record path
 * that would leave it fails, and a recorded file reached through a link counts as missing.
 *
 * @param layoutDir - The layout's folder.
 * @param shown - The folder as messages name it.
 * @returns The record, the recorded files still there, and which of them changed since. A stored
 *   file whose only change is CRLF line endings counts as unchanged.
 * @throws CliError in the error channel when the folder has no readable `eject.json`, when
 *   `.eject/` or `eject.json` is a link, or when the record names a path outside `.eject/`.
 */
export const readProvenance = Effect.fn('readProvenance')(function* (
  layoutDir: string,
  shown: string,
): Effect.fn.Return<StoredProvenance, CliError, FileSystem.FileSystem> {
  const dir = path.join(layoutDir, PROVENANCE_DIR);
  const realDir = yield* realProvenanceDir(layoutDir, shown);
  const recordText =
    realDir === undefined
      ? undefined
      : yield* readUnlinked(path.join(dir, PROVENANCE_FILE), path.join(realDir, PROVENANCE_FILE));
  const record = yield* Schema.decodeUnknownEffect(ProvenanceJson)(recordText).pipe(
    Effect.mapError(() => notProvenance(shown)),
  );
  if (realDir === undefined) {
    return yield* notProvenance(shown);
  }

  const unsafe = Object.keys(record.files).find((file) => !isProvenancePath(file));
  if (unsafe !== undefined) {
    return yield* cliError(
      `${shown}/${PROVENANCE_DIR}/${PROVENANCE_FILE} names the file "${unsafe}", which is ` +
        `not a file of ${PROVENANCE_DIR}/ or ${PROVENANCE_DIR}/${SHARED_DIR}/, so diff does not ` +
        'read it.\nEject the layout again, or restore the record as eject wrote it.',
    );
  }

  const entries: [string, string][] = [];
  const changed: string[] = [];
  for (const [file, hash] of Object.entries(record.files)) {
    const segments = file.split('/');
    const raw = yield* readUnlinked(path.join(dir, ...segments), path.join(realDir, ...segments));
    if (raw !== undefined) {
      entries.push([file, raw.replace(CRLF, '\n')]);
    }

    if (raw === undefined || !matchesHash(raw, hash)) {
      changed.push(file);
    }
  }

  return { record, files: Object.fromEntries(entries), changed };
});

/**
 * Tells whether a record path names a file directly in `.eject/` or in `.eject/_shared/`.
 *
 * @param file - A path from a provenance record.
 */
export function isProvenancePath(file: string): boolean {
  return PROVENANCE_PATH.test(file) && file !== PROVENANCE_FILE;
}

/**
 * The layout's `.eject/` folder with links followed, or nothing when it is missing.
 *
 * @throws CliError in the error channel when `.eject/` is a link, which diff does not follow.
 */
const realProvenanceDir = Effect.fn('realProvenanceDir')(function* (
  layoutDir: string,
  shown: string,
): Effect.fn.Return<string | undefined, CliError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const realLayout = yield* fs.realPath(layoutDir).pipe(Effect.orElseSucceed(() => undefined));
  const realDir = yield* fs
    .realPath(path.join(layoutDir, PROVENANCE_DIR))
    .pipe(Effect.orElseSucceed(() => undefined));
  if (realLayout === undefined || realDir === undefined) {
    return undefined;
  }

  if (realDir !== path.join(realLayout, PROVENANCE_DIR)) {
    return yield* cliError(
      `${shown}/${PROVENANCE_DIR}/ is a link, and diff reads only the folder eject wrote.\n` +
        'Eject the layout again, or replace the link with the folder it points to.',
    );
  }

  return realDir;
});

/**
 * Reads a file only when no link leads to it, so its real path is where it was looked for; nothing
 * when it is missing, unreadable or linked.
 */
const readUnlinked = Effect.fn('readUnlinked')(function* (
  file: string,
  expected: string,
): Effect.fn.Return<string | undefined, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const real = yield* fs.realPath(file).pipe(Effect.orElseSucceed(() => undefined));
  if (real !== expected) {
    return undefined;
  }

  return yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined));
});

/**
 * Tells whether a stored file's text has the recorded hash, as it is or with its CRLF line breaks
 * read as LF.
 */
function matchesHash(text: string, hash: string): boolean {
  return sha256(text) === hash || sha256(text.replace(CRLF, '\n')) === hash;
}

/**
 * The error for a layout without a readable provenance record.
 */
function notProvenance(shown: string): CliError {
  return cliError(
    `${shown}/${PROVENANCE_DIR}/${PROVENANCE_FILE} is missing or not a provenance record, ` +
      'so there is nothing to compare the kit with.\n' +
      '`deckster layouts diff` works on a layout that `deckster layouts eject` wrote, with ' +
      `its ${PROVENANCE_DIR}/ folder kept as it was written.`,
  );
}
