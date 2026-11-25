import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect, FileSystem, PlatformError } from 'effect';
import { chmodSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
const exportFolder = Effect.fn('exportFolder')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-stage-' });
  const outDir = path.join(root, 'png');
  mkdirSync(outDir);
  writeFileSync(path.join(outDir, '01-old.png'), 'old');
  writeFileSync(path.join(outDir, 'notes.txt'), 'mine');
  return { root, outDir };
});

layer(NodeServices.layer)('stageShots', (it) => {
  it.effect('moves the files in and replaces the stale screenshots when asked', () =>
    Effect.gen(function* () {
      const { root, outDir } = yield* exportFolder();
      const result = yield* stageShots(outDir, true, (staging) => {
        const file = path.join(staging, '01-new.png');
        writeFileSync(file, 'new');
        return Effect.succeed({ files: [shotAt(file)] });
      });
      expect(result.files.map((file) => file.path)).toEqual([path.join(outDir, '01-new.png')]);
      expect(readdirSync(outDir).toSorted()).toEqual(['01-new.png', 'notes.txt']);
      expect(readdirSync(root)).toEqual(['png']);
    }).pipe(Effect.scoped),
  );

  it.effect('keeps the earlier screenshots when only some slides are taken', () =>
    Effect.gen(function* () {
      const { outDir } = yield* exportFolder();
      yield* stageShots(outDir, false, (staging) => {
        const file = path.join(staging, '02-new.png');
        writeFileSync(file, 'new');
        return Effect.succeed({ files: [shotAt(file)] });
      });
      expect(readdirSync(outDir).toSorted()).toEqual(['01-old.png', '02-new.png', 'notes.txt']);
    }).pipe(Effect.scoped),
  );

  it.effect('removes what the run wrote and leaves the folder as it was when it fails', () =>
    Effect.gen(function* () {
      const { root, outDir } = yield* exportFolder();
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
    }).pipe(Effect.scoped),
  );

  it.effect('restores earlier PNGs and removes new ones when a later move fails', () =>
    Effect.gen(function* () {
      const { root, outDir } = yield* exportFolder();
      const previous = path.join(outDir, '01-old.png');
      const additional = path.join(outDir, '02-extra.png');
      const stale = path.join(outDir, '03-stale.png');
      const missing = '04-missing.png';
      writeFileSync(stale, 'stale');
      const fs = yield* FileSystem.FileSystem;
      const observeMoves = {
        ...fs,
        rename: (source: string, target: string) => {
          if (path.basename(source) === missing) {
            expect(readFileSync(previous, 'utf8')).toBe('replacement');
            expect(readFileSync(additional, 'utf8')).toBe('additional');
            expect(readFileSync(stale, 'utf8')).toBe('stale');
          }

          return fs.rename(source, target);
        },
      };
      const error = yield* stageShots(outDir, true, (staging) => {
        const replacement = path.join(staging, '01-old.png');
        const extra = path.join(staging, '02-extra.png');
        writeFileSync(replacement, 'replacement');
        writeFileSync(extra, 'additional');
        return Effect.succeed({
          files: [shotAt(replacement), shotAt(extra), shotAt(path.join(staging, missing))],
        });
      }).pipe(Effect.provideService(FileSystem.FileSystem, observeMoves), Effect.flip);
      expect(error.path).toBe(path.join(outDir, missing));
      expect(readdirSync(outDir).toSorted()).toEqual(['01-old.png', '03-stale.png', 'notes.txt']);
      expect(readFileSync(previous, 'utf8')).toBe('old');
      expect(readFileSync(stale, 'utf8')).toBe('stale');
      expect(readdirSync(root)).toEqual(['png']);
    }).pipe(Effect.scoped),
  );

  it.effect('keeps an existing screenshot mode when it replaces the file', () =>
    Effect.gen(function* () {
      const { outDir } = yield* exportFolder();
      const target = path.join(outDir, '01-old.png');
      chmodSync(target, 0o640);
      const mode = statSync(target).mode;
      yield* stageShots(outDir, false, (staging) => {
        const file = path.join(staging, '01-old.png');
        writeFileSync(file, 'replacement', { mode: 0o600 });
        return Effect.succeed({ files: [shotAt(file)] });
      });
      expect(readFileSync(target, 'utf8')).toBe('replacement');
      expect(statSync(target).mode).toBe(mode);
    }).pipe(Effect.scoped),
  );

  it.effect('copies and unlinks screenshots when rename returns EXDEV', () =>
    Effect.gen(function* () {
      const { root, outDir } = yield* exportFolder();
      const target = path.join(outDir, '01-old.png');
      chmodSync(target, 0o640);
      const mode = statSync(target).mode;
      const fs = yield* FileSystem.FileSystem;
      const copies: string[] = [];
      const unlinks: string[] = [];
      const crossDevice = {
        ...fs,
        rename: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: 'Unknown',
              module: 'FileSystem',
              method: 'rename',
              cause: Object.assign(new Error('cross-device link'), { code: 'EXDEV' }),
            }),
          ),
        copyFile: (source: string, target: string) => {
          copies.push(source);
          return fs.copyFile(source, target);
        },
        remove: (file, options) => {
          if (options === undefined) {
            unlinks.push(file);
          }

          return fs.remove(file, options);
        },
      } satisfies FileSystem.FileSystem;
      yield* stageShots(outDir, true, (staging) => {
        const file = path.join(staging, '01-old.png');
        writeFileSync(file, 'replacement', { mode: 0o600 });
        return Effect.succeed({ files: [shotAt(file)] });
      }).pipe(Effect.provideService(FileSystem.FileSystem, crossDevice));
      expect(copies).toHaveLength(2);
      expect(unlinks).toEqual(copies);
      expect(readFileSync(target, 'utf8')).toBe('replacement');
      expect(statSync(target).mode).toBe(mode);
      expect(readdirSync(root)).toEqual(['png']);
    }).pipe(Effect.scoped),
  );
});
