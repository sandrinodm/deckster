import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ShotFile } from '#shot/take-shots.ts';

import { cliError } from '#cli-error.ts';
import { stageShots } from '#export/stage-shots.ts';

/**
 * A shot file record at a path.
 *
 * @param file - The absolute path.
 */
function shotAt(file: string): ShotFile {
  return {
    path: file,
    slide: 'a',
    number: 1,
    step: null,
    hidden: false,
    width: 1920,
    height: 1080,
    error: null,
  };
}

/**
 * A fresh export folder with a `png` folder that holds earlier output.
 */
function exportFolder(): { root: string; outDir: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'deck-stage-'));
  const outDir = path.join(root, 'png');
  mkdirSync(outDir);
  writeFileSync(path.join(outDir, '01-old.png'), 'old');
  writeFileSync(path.join(outDir, 'notes.txt'), 'mine');
  return { root, outDir };
}

layer(NodeServices.layer)('stageShots', (it) => {
  it.effect('moves the files in and replaces the stale screenshots when asked', () =>
    Effect.gen(function* () {
      const { root, outDir } = exportFolder();
      const result = yield* stageShots(outDir, true, (staging) => {
        const file = path.join(staging, '01-new.png');
        writeFileSync(file, 'new');
        return Effect.succeed({ files: [shotAt(file)] });
      });
      expect(result.files.map((file) => file.path)).toEqual([path.join(outDir, '01-new.png')]);
      expect(readdirSync(outDir).toSorted()).toEqual(['01-new.png', 'notes.txt']);
      expect(readdirSync(root)).toEqual(['png']);
    }),
  );

  it.effect('keeps the earlier screenshots when only some slides are taken', () =>
    Effect.gen(function* () {
      const { outDir } = exportFolder();
      yield* stageShots(outDir, false, (staging) => {
        const file = path.join(staging, '02-new.png');
        writeFileSync(file, 'new');
        return Effect.succeed({ files: [shotAt(file)] });
      });
      expect(readdirSync(outDir).toSorted()).toEqual(['01-old.png', '02-new.png', 'notes.txt']);
    }),
  );

  it.effect('removes what the run wrote and leaves the folder as it was when it fails', () =>
    Effect.gen(function* () {
      const { root, outDir } = exportFolder();
      const error = yield* Effect.flip(
        stageShots(outDir, true, (staging) => {
          writeFileSync(path.join(staging, '01-new.png'), 'new');
          return Effect.fail(cliError('a slide renders an error'));
        }),
      );
      expect(error.message).toBe('a slide renders an error');
      expect(readdirSync(root)).toEqual(['png']);
      expect(readdirSync(outDir).toSorted()).toEqual(['01-old.png', 'notes.txt']);
      expect(readFileSync(path.join(outDir, '01-old.png'), 'utf8')).toBe('old');
    }),
  );
});
