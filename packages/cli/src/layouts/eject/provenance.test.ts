import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readProvenance, sha256 } from '#layouts/eject/provenance.ts';

/**
 * The text of the one recorded file the tests store.
 */
const STORED = 'const a = 1;\nconst b = 2;\n';

/**
 * Runs a test body with a temp folder holding a layout folder, `title/`, removed afterwards.
 *
 * @param body - The test, given the temp folder and the layout folder.
 */
function inLayout<A, E>(
  body: (temp: string, layoutDir: string) => Effect.Effect<A, E, NodeServices.NodeServices>,
): Effect.Effect<A, E> {
  return Effect.suspend(() => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-provenance-'));
    const layoutDir = path.join(temp, 'title');
    fs.mkdirSync(path.join(layoutDir, '.eject'), { recursive: true });
    return body(temp, layoutDir).pipe(
      Effect.provide(NodeServices.layer),
      Effect.ensuring(Effect.sync(() => fs.rmSync(temp, { recursive: true, force: true }))),
    );
  });
}

/**
 * Writes a provenance record naming the given files, each with the hash of {@link STORED}.
 *
 * @param layoutDir - The layout folder.
 * @param files - The record's paths.
 */
function writeRecord(layoutDir: string, files: readonly string[]): void {
  const record = {
    layout: 'title',
    deckster: '0.0.0',
    files: Object.fromEntries(files.map((file) => [file, sha256(STORED)])),
  };
  fs.writeFileSync(path.join(layoutDir, '.eject/eject.json'), JSON.stringify(record));
}

/**
 * The message of the error an effect fails with.
 *
 * @param effect - An effect expected to fail.
 */
function failureMessage<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<string, never, R> {
  return effect.pipe(
    Effect.flip,
    Effect.map((error) => (error instanceof Error ? error.message : String(error))),
    Effect.orElseSucceed(() => 'the effect did not fail'),
  );
}

describe('readProvenance', () => {
  it.effect('refuses a record path that leaves .eject/', () =>
    inLayout((temp, layoutDir) =>
      Effect.gen(function* () {
        fs.writeFileSync(path.join(temp, 'secret.txt'), STORED);
        for (const file of ['../../secret.txt', '/etc/passwd', '_shared/../../x', 'a\\b', '..']) {
          writeRecord(layoutDir, [file]);
          const message = yield* failureMessage(readProvenance(layoutDir, 'title'));
          expect(message, file).toContain(`names the file "${file}"`);
        }
      }),
    ),
  );

  it.effect('reads a recorded file reached through a link as missing', () =>
    inLayout((temp, layoutDir) =>
      Effect.gen(function* () {
        fs.writeFileSync(path.join(temp, 'private.ts'), STORED);
        fs.symlinkSync(path.join(temp, 'private.ts'), path.join(layoutDir, '.eject/layout.tsx'));
        fs.mkdirSync(path.join(temp, 'elsewhere'));
        fs.writeFileSync(path.join(temp, 'elsewhere/portrait.tsx'), STORED);
        fs.symlinkSync(path.join(temp, 'elsewhere'), path.join(layoutDir, '.eject/_shared'));
        writeRecord(layoutDir, ['layout.tsx', '_shared/portrait.tsx']);
        const stored = yield* readProvenance(layoutDir, 'title');
        expect(stored.files).toEqual({});
        expect(stored.changed).toEqual(['layout.tsx', '_shared/portrait.tsx']);
      }),
    ),
  );

  it.effect('refuses a .eject/ folder that is a link', () =>
    inLayout((temp, layoutDir) =>
      Effect.gen(function* () {
        writeRecord(layoutDir, []);
        fs.renameSync(path.join(layoutDir, '.eject'), path.join(temp, 'other'));
        fs.symlinkSync(path.join(temp, 'other'), path.join(layoutDir, '.eject'));
        const message = yield* failureMessage(readProvenance(layoutDir, 'title'));
        expect(message).toContain('title/.eject/ is a link');
      }),
    ),
  );

  it.effect('reads a stored file with CRLF line endings as unchanged, with LF line breaks', () =>
    inLayout((_temp, layoutDir) =>
      Effect.gen(function* () {
        fs.writeFileSync(
          path.join(layoutDir, '.eject/layout.tsx'),
          STORED.replaceAll('\n', '\r\n'),
        );
        writeRecord(layoutDir, ['layout.tsx']);
        const stored = yield* readProvenance(layoutDir, 'title');
        expect(stored.changed).toEqual([]);
        expect(stored.files).toEqual({ 'layout.tsx': STORED });
      }),
    ),
  );

  it.effect('keeps a file named like an object property as an own entry', () =>
    inLayout((_temp, layoutDir) =>
      Effect.gen(function* () {
        fs.writeFileSync(path.join(layoutDir, '.eject/constructor'), STORED);
        writeRecord(layoutDir, ['constructor', 'toString']);
        const stored = yield* readProvenance(layoutDir, 'title');
        expect(Object.keys(stored.files)).toEqual(['constructor']);
        expect(stored.changed).toEqual(['toString']);
      }),
    ),
  );
});
