import { NodeServices } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCaptured } from '#cli.fixture.ts';
import { installElectron, installFailure, readElectronStatus } from '#present/electron-install.ts';

/**
 * The version the fake packages declare.
 */
const VERSION = '45.3.2';

/**
 * A downloader that does what Electron's does on success: writes `dist/version`, the executable and
 * `path.txt`. It also counts its runs and records `force_no_cache`, so tests can tell whether and
 * how it ran.
 */
const WORKING_DOWNLOADER = `
const fs = require('node:fs');
const path = require('node:path');
fs.appendFileSync(path.join(__dirname, 'runs.log'), (process.env.force_no_cache ?? '-') + '\\n');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'version'), 'v${VERSION}');
fs.writeFileSync(path.join(__dirname, 'dist', 'electron'), 'binary');
fs.writeFileSync(path.join(__dirname, 'path.txt'), 'electron');
`;

/**
 * A downloader that fails the way Electron's does: prints the error's stack and exits 1.
 *
 * @param message - The error's message.
 */
function failingDownloader(message: string): string {
  return `
console.error(${JSON.stringify(`${message}\n    at ClientRequest.<anonymous> (node:internal/x:1:1)\n    at process.tick (node:internal/y:2:2)`)});
process.exit(1);
`;
}

/**
 * Makes a fake `electron` package folder with a `package.json` and the given downloader.
 *
 * @param downloader - The source of its `install.js`.
 */
const fakePackage = Effect.fn('fakePackage')(function* (downloader: string) {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped({
    directory: os.tmpdir(),
    prefix: 'deck-electron-',
  });
  yield* fs.writeFileString(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'electron', version: VERSION }),
  );
  yield* fs.writeFileString(path.join(dir, 'install.js'), downloader);
  return dir;
});

/**
 * How many times the fake downloader ran, and the `force_no_cache` of each run.
 *
 * @param dir - The package folder.
 */
function runs(dir: string): string[] {
  const log = path.join(dir, 'runs.log');
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
}

describe('installElectron', () => {
  layer(NodeServices.layer)((it) => {
    it.effect('downloads a missing binary, then leaves the right one alone', () =>
      Effect.gen(function* () {
        const dir = yield* fakePackage(WORKING_DOWNLOADER);
        expect((yield* readElectronStatus(dir)).ready).toBe(false);

        const first = yield* installElectron(dir, false);
        expect(first.downloaded).toBe(true);
        expect(first.status).toMatchObject({
          version: VERSION,
          downloadedVersion: VERSION,
          executable: path.join(dir, 'dist', 'electron'),
          ready: true,
        });

        const second = yield* installElectron(dir, false);
        expect(second.downloaded).toBe(false);
        expect(runs(dir)).toEqual(['-']);
      }).pipe(Effect.scoped),
    );

    it.effect('downloads again with force, removing the old binary and skipping the cache', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fakePackage(WORKING_DOWNLOADER);
        yield* installElectron(dir, false);
        yield* fs.writeFileString(path.join(dir, 'dist', 'stale'), 'old');

        const forced = yield* installElectron(dir, true);
        expect(forced.downloaded).toBe(true);
        expect(existsSync(path.join(dir, 'dist', 'stale'))).toBe(false);
        expect(runs(dir)).toEqual(['-', 'true']);
      }).pipe(Effect.scoped),
    );

    it.effect('replaces a binary of another version, as after upgrading the CLI', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fakePackage(WORKING_DOWNLOADER);
        yield* fs.makeDirectory(path.join(dir, 'dist'), { recursive: true });
        yield* fs.writeFileString(path.join(dir, 'dist', 'version'), 'v44.0.0');
        yield* fs.writeFileString(path.join(dir, 'dist', 'electron'), 'old binary');
        yield* fs.writeFileString(path.join(dir, 'path.txt'), 'electron');
        const before = yield* readElectronStatus(dir);
        expect(before).toMatchObject({ downloadedVersion: '44.0.0', ready: false });
        expect(before.executable).not.toBeNull();

        const result = yield* installElectron(dir, false);
        expect(result.downloaded).toBe(true);
        expect(result.status.downloadedVersion).toBe(VERSION);
      }).pipe(Effect.scoped),
    );

    it.effect('explains a network failure instead of printing the stack', () =>
      Effect.gen(function* () {
        const dir = yield* fakePackage(
          failingDownloader('RequestError: getaddrinfo ENOTFOUND github.com'),
        );
        const error = yield* Effect.flip(installElectron(dir, false));
        expect(error._tag).toBe('ShellError');
        expect(error.message).toContain(`Could not download Electron ${VERSION} from GitHub`);
        expect(error.message).toContain('ELECTRON_MIRROR');
        expect(error.message).toContain('present --browser');
        expect(error.message).not.toContain('at ClientRequest');
      }).pipe(Effect.scoped),
    );

    it.effect('fails when the downloader exits 0 without leaving a binary', () =>
      Effect.gen(function* () {
        const dir = yield* fakePackage('');
        const error = yield* Effect.flip(installElectron(dir, false));
        expect(error.message).toContain(`has no Electron ${VERSION} executable`);
        expect(error.message).toContain('electron install --force');
      }).pipe(Effect.scoped),
    );

    it.effect('names a package folder without a version as damaged', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({
          directory: os.tmpdir(),
          prefix: 'deck-electron-',
        });
        const error = yield* Effect.flip(readElectronStatus(dir));
        expect(error.message).toContain('is damaged');
        expect(error.message).toContain('Reinstall @deckster/cli');
      }).pipe(Effect.scoped),
    );
  });
});

describe('installFailure', () => {
  const dir = '/usr/local/lib/node_modules/@deckster/cli/node_modules/electron';

  it('tells a permission problem from a checksum, a network and an unpacking one', () => {
    expect(
      installFailure(dir, "Error: EACCES: permission denied, mkdir '/x/dist'", VERSION),
    ).toContain(`Cannot write to ${dir}`);
    expect(
      installFailure(dir, 'Error: Generated checksum for "electron.zip" did not match', VERSION),
    ).toContain('did not match its published checksum');
    expect(installFailure(dir, 'HTTPError: Response code 404 (Not Found)', VERSION)).toContain(
      'Could not download',
    );
    expect(
      installFailure(dir, "Error: Cannot find module '@electron-internal/extract-zip'", VERSION),
    ).toContain('the module that unpacks it could not load');
  });

  it('quotes the first lines of an unknown failure without stack frames', () => {
    const message = installFailure(
      dir,
      'Error: something odd\n    at a (b:1:1)\nmore detail\n    at c (d:2:2)',
      VERSION,
    );
    expect(message).toContain(
      `Downloading Electron ${VERSION} failed:\n  Error: something odd\n  more detail`,
    );
    expect(message).not.toContain('at a (b:1:1)');
    expect(message).toContain('present --browser');
  });

  it('says so when the downloader printed nothing', () => {
    expect(installFailure(dir, '\n', VERSION)).toContain('(it printed nothing)');
  });
});

describe('the electron command', () => {
  it.effect('names the subcommands when none or an unknown one is given', () =>
    Effect.gen(function* () {
      for (const argv of [['electron'], ['electron', 'bogus'], ['electron', 'status', 'extra']]) {
        const error = yield* Effect.flip(runCaptured(argv));
        expect(error.message).toContain('One of: install, update, status.');
        expect(error.message).toContain('electron --help');
      }

      const forced = yield* Effect.flip(runCaptured(['electron', 'status', '--force']));
      expect(forced.message).toContain('--force goes with install only.');
    }),
  );

  it.effect('reports the repository Electron as ready or names the fix', () =>
    Effect.gen(function* () {
      const run = yield* runCaptured(['electron', 'status', '--json']);
      const printed: unknown = JSON.parse(run.output);
      expect(printed).toMatchObject({
        ok: run.code === 0,
        electron: { version: expect.any(String) },
      });
      if (run.code !== 0) {
        const text = yield* runCaptured(['electron', 'status']);
        expect(text.output).toContain('electron install');
      }
    }),
  );
});
