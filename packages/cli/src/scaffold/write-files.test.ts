import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createNewDirectory, writeNewFiles } from '#scaffold/write-files.ts';

/**
 * Runs a test body in a temp folder that is removed afterwards.
 *
 * @param body - The test, given the folder.
 */
function inTempDir<A, E>(
  body: (dir: string) => Effect.Effect<A, E, NodeServices.NodeServices>,
): Effect.Effect<A, E> {
  return Effect.suspend(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-write-files-'));
    return body(dir).pipe(
      Effect.provide(NodeServices.layer),
      Effect.ensuring(Effect.sync(() => fs.rmSync(dir, { recursive: true, force: true }))),
    );
  });
}

describe('writeNewFiles', () => {
  it.effect('creates the files and their folders', () =>
    inTempDir((dir) =>
      Effect.gen(function* () {
        const file = path.join(dir, 'a', 'b.txt');
        expect(yield* writeNewFiles({ [file]: 'new\n' })).toEqual([file]);
        expect(fs.readFileSync(file, 'utf8')).toBe('new\n');
      }),
    ),
  );

  it.effect('neither replaces a file nor writes through a dangling link', () =>
    inTempDir((dir) =>
      Effect.gen(function* () {
        const file = path.join(dir, 'mine.txt');
        fs.writeFileSync(file, 'mine\n');
        const replaced = yield* Effect.flip(writeNewFiles({ [file]: 'new\n' }));
        expect(replaced.message).toContain('something already exists at that path');
        expect(fs.readFileSync(file, 'utf8')).toBe('mine\n');

        const target = path.join(dir, 'target.txt');
        const link = path.join(dir, 'link.txt');
        fs.symlinkSync(target, link);
        yield* Effect.flip(writeNewFiles({ [link]: 'new\n' }));
        expect(fs.existsSync(target)).toBe(false);
      }),
    ),
  );
});

describe('createNewDirectory', () => {
  it.effect('creates a folder once, and fails when something is already there', () =>
    inTempDir((dir) =>
      Effect.gen(function* () {
        const folder = path.join(dir, 'layouts', 'quote');
        yield* createNewDirectory(folder);
        expect(fs.statSync(folder).isDirectory()).toBe(true);
        const again = yield* Effect.flip(createNewDirectory(folder));
        expect(again.message).toContain(`Could not create the folder ${folder}`);
      }),
    ),
  );
});
