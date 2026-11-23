import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import os from 'node:os';
import path from 'node:path';

import { fakeToolSpawner, writeFakeElectron } from '#present/fake-electron.fixture.ts';
import { resolveShellBinary } from '#present/shell-binary.ts';

/**
 * The part of the missing-binary message that names the download command.
 */
const INSTALL_HINT = 'electron install`';

/**
 * Writes the `package.json` every real `electron` package folder has.
 *
 * @param fs - The file system.
 * @param dir - The package folder.
 */
const writeManifest = (fs: FileSystem.FileSystem, dir: string) =>
  fs.writeFileString(path.join(dir, 'package.json'), '{"name":"electron","version":"45.3.2"}');

describe('resolveShellBinary', () => {
  layer(NodeServices.layer)((it) => {
    it.effect('names the download command and --browser when the binary is missing', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({
          directory: os.tmpdir(),
          prefix: 'deck-electron-',
        });
        yield* writeManifest(fs, dir);
        const error = yield* Effect.flip(resolveShellBinary(dir, dir));
        expect(error._tag).toBe('ShellError');
        expect(error.message).toContain(INSTALL_HINT);
        expect(error.message).toContain('--browser');
        expect(error.message).toContain('Electron 45.3.2 is not downloaded');
      }).pipe(Effect.scoped),
    );

    it.effect('fails when path.txt names a file that is not there', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({
          directory: os.tmpdir(),
          prefix: 'deck-electron-',
        });
        yield* fs.writeFileString(
          path.join(dir, 'path.txt'),
          'Electron.app/Contents/MacOS/Electron',
        );
        yield* writeManifest(fs, dir);
        const error = yield* Effect.flip(resolveShellBinary(dir, dir));
        expect(error.message).toContain(INSTALL_HINT);
      }).pipe(Effect.scoped),
    );

    it.effect('reads path.txt without a trailing newline and resolves the entry file', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({
          directory: os.tmpdir(),
          prefix: 'deck-electron-',
        });
        yield* fs.makeDirectory(path.join(dir, 'dist'), { recursive: true });
        yield* fs.writeFileString(path.join(dir, 'dist', 'electron-fake'), '');
        yield* fs.writeFileString(path.join(dir, 'path.txt'), 'electron-fake');
        yield* writeManifest(fs, dir);
        const binary = yield* resolveShellBinary(dir, dir);
        expect(path.basename(binary.executable)).toBe('electron-fake');
        expect(binary.branded).toBe(false);
        expect(binary.entry).toMatch(/packages\/shell\/src\/main\/main\.ts$/);
      }).pipe(Effect.scoped),
    );

    it.effect('starts the branded app on macOS, and stock Electron when it cannot be built', () =>
      Effect.gen(function* () {
        if (process.platform !== 'darwin') {
          return;
        }

        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped({
          directory: os.tmpdir(),
          prefix: 'deck-electron-',
        });
        const dir = path.join(root, 'electron');
        writeFakeElectron(dir);
        const works = yield* resolveShellBinary(root, dir).pipe(
          Effect.provide(fakeToolSpawner().layer),
        );
        expect(works.branded).toBe(true);
        expect(works.executable).toMatch(/\/Deckster\.app\/Contents\/MacOS\/Deckster$/);

        const brokenRoot = path.join(root, 'broken');
        const broken = yield* resolveShellBinary(brokenRoot, dir).pipe(
          Effect.provide(fakeToolSpawner((call) => call.command === '/bin/cp').layer),
        );
        expect(broken.branded).toBe(false);
        expect(broken.executable).toMatch(/\/Electron\.app\/Contents\/MacOS\/Electron$/);
      }).pipe(Effect.scoped),
    );

    it.effect('finds the real package of @deckster/shell by default', () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(resolveShellBinary(FRAMEWORK_ROOT));
        if (result._tag === 'Failure') {
          expect(result.failure.message).toContain(INSTALL_HINT);
        } else {
          expect(result.success.executable).toMatch(/Deckster|Electron/);
        }
      }),
    );
  });
});
