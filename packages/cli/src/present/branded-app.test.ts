import { NodeFileSystem, NodeServices } from '@effect/platform-node';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, Fiber, FileSystem } from 'effect';
import { TestClock } from 'effect/testing';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  applyPlistEdit,
  ensureBrandedApp,
  brandedAppsDir,
  brandedAppWarning,
} from '#present/branded-app.ts';
import { fakeToolSpawner, writeFakeElectron } from '#present/fake-electron.fixture.ts';

/**
 * A scratch workspace and a fake Electron package inside it.
 */
const scratch = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped({ directory: os.tmpdir(), prefix: 'deck-brand-' });
  const electronDir = path.join(root, 'electron');
  writeFakeElectron(electronDir);
  return { root, electronDir };
});

/**
 * The folders in the branded apps folder.
 *
 * @param root - The workspace root.
 */
function appFolders(root: string): string[] {
  const dir = brandedAppsDir(root);
  return existsSync(dir) ? readdirSync(dir) : [];
}

/**
 * Waits, in real time, until the code under test has started a program.
 *
 * @param calls - The fake spawner's record.
 * @param command - The program.
 */
const untilCalled = Effect.fn('untilCalled')(function* (
  calls: readonly { command: string }[],
  command: string,
) {
  while (!calls.some((call) => call.command === command)) {
    yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 5)));
  }

  yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
});

describe('ensureBrandedApp', () => {
  layer(NodeFileSystem.layer)((it) => {
    it.effect('is not applicable off macOS, and starts nothing', () =>
      Effect.gen(function* () {
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner();
        const result = yield* ensureBrandedApp(root, electronDir, 'linux').pipe(
          Effect.provide(spawner.layer),
        );
        expect(result).toEqual({ _tag: 'NotApplicable' });
        expect(spawner.calls).toEqual([]);
        expect(appFolders(root)).toEqual([]);
      }).pipe(Effect.scoped),
    );

    it.effect('is not applicable when the Electron folder holds no Electron.app', () =>
      Effect.gen(function* () {
        const { root } = yield* scratch;
        const spawner = fakeToolSpawner();
        const result = yield* ensureBrandedApp(root, path.join(root, 'nowhere'), 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        expect(result._tag).toBe('NotApplicable');
      }).pipe(Effect.scoped),
    );

    it.effect('builds, signs and caches the bundle; a warm call starts nothing', () =>
      Effect.gen(function* () {
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner();
        const first = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        expect(first).toMatchObject({ _tag: 'Branded', signing: 'outer', built: true });
        if (first._tag !== 'Branded') {
          return;
        }

        expect(first.executable).toMatch(
          /\.deck\/shell\/app\/[0-9a-f]{16}\/Deckster\.app\/Contents\/MacOS\/Deckster$/,
        );
        expect(existsSync(first.executable)).toBe(true);
        const app = path.resolve(first.executable, '../../..');
        expect(
          existsSync(path.join(app, 'Contents/Frameworks/Deckster Helper (Renderer).app')),
        ).toBe(true);
        expect(existsSync(path.join(app, 'Contents/Resources/default_app.asar'))).toBe(false);
        expect(existsSync(path.join(app, 'Contents/Resources/app/main.mjs'))).toBe(true);
        expect(existsSync(path.join(app, 'Contents/Resources/deckster-bundle.json'))).toBe(true);
        expect(spawner.calls[0]?.command).toBe('/bin/cp');
        expect(spawner.calls[0]?.args.slice(0, 2)).toEqual(['-c', '-R']);
        const codesign = spawner.calls.filter((call) => call.command === '/usr/bin/codesign');
        expect(codesign.map((call) => call.args[0])).toEqual([
          '--force',
          '--force',
          '--verify',
          '--verify',
          '--verify',
          '--verify',
          '--verify',
        ]);
        expect(codesign[0]?.args).toHaveLength(7);
        expect(codesign.flatMap((call) => call.args).join(' ')).not.toContain('.framework');
        const plutil = spawner.calls.filter((call) => call.command === '/usr/bin/plutil');
        expect(plutil).toHaveLength(11 + 4 * 4);
        expect(appFolders(root)).toHaveLength(1);

        const callsAfterFirst = spawner.calls.length;
        const second = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        expect(second).toMatchObject({
          _tag: 'Branded',
          built: false,
          executable: first.executable,
        });
        expect(spawner.calls.length).toBe(callsAfterFirst);
      }).pipe(Effect.scoped),
    );

    it.effect('falls back to an unsigned bundle, under its own key, when signing fails', () =>
      Effect.gen(function* () {
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner((call) => call.command === '/usr/bin/codesign');
        const result = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        expect(result).toMatchObject({ _tag: 'Branded', signing: 'none', built: true });
        expect(appFolders(root)).toHaveLength(1);
        const codesigns = spawner.calls.filter((call) => call.command === '/usr/bin/codesign');
        expect(codesigns).toHaveLength(1);

        const again = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(fakeToolSpawner().layer),
        );
        expect(again).toMatchObject({ _tag: 'Branded', signing: 'none', built: false });
      }).pipe(Effect.scoped),
    );

    it.effect('falls back to the unsigned bundle when codesign is missing altogether', () =>
      Effect.gen(function* () {
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner((call) => call.command === '/usr/bin/codesign');
        const result = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        expect(result._tag).toBe('Branded');
      }).pipe(Effect.scoped),
    );

    it.effect('is unavailable, with the reason, when the copy fails, and leaves no folder', () =>
      Effect.gen(function* () {
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner((call) => call.command === '/bin/cp');
        const result = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        expect(result._tag).toBe('Unavailable');
        if (result._tag === 'Unavailable') {
          expect(result.reason).toContain('cp');
          expect(result.reason).toContain('boom');
          expect(brandedAppWarning(result.reason)).toBe(
            `Could not prepare Deckster.app (${result.reason}); the window will show as "Electron".`,
          );
        }

        expect(spawner.calls.filter((call) => call.command === '/bin/cp')).toHaveLength(1);
        expect(appFolders(root)).toEqual([]);
        expect(spawner.calls.some((call) => call.command === '/usr/bin/codesign')).toBe(false);
      }).pipe(Effect.scoped),
    );

    it.effect('requests a symlink-preserving copy when cp rejects the clone flag', () =>
      Effect.gen(function* () {
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner((call) =>
          call.command === '/bin/cp' && call.args[0] === '-c'
            ? "error: unexpected argument \u001b[33m'-c'\u001b[0m found"
            : false,
        );
        const result = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        expect(result).toMatchObject({ _tag: 'Branded', signing: 'outer', built: true });
        const copyCalls = spawner.calls.filter((call) => call.command === '/bin/cp');
        expect(copyCalls.map((call) => call.args.slice(0, 2))).toEqual([
          ['-c', '-R'],
          ['-R', '-P'],
        ]);
        expect(appFolders(root)).toHaveLength(1);
      }).pipe(Effect.scoped),
    );

    it.effect('is unavailable when a plist edit fails, and leaves no folder', () =>
      Effect.gen(function* () {
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner((call) => call.command === '/usr/bin/plutil');
        const result = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        expect(result._tag).toBe('Unavailable');
        expect(appFolders(root)).toEqual([]);
      }).pipe(Effect.scoped),
    );

    it.effect('gives one bundle to two builds at once', () =>
      Effect.gen(function* () {
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner();
        const results = yield* Effect.all(
          [
            ensureBrandedApp(root, electronDir, 'darwin'),
            ensureBrandedApp(root, electronDir, 'darwin'),
          ],
          { concurrency: 2 },
        ).pipe(Effect.provide(spawner.layer));
        expect(results.map((result) => result._tag)).toEqual(['Branded', 'Branded']);
        expect(appFolders(root)).toHaveLength(1);
      }).pipe(Effect.scoped),
    );

    it.effect('keeps recently used key folders and removes ones untouched for 30 days', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root, electronDir } = yield* scratch;
        const outDir = brandedAppsDir(root);
        const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
        for (const name of ['0123456789abcdef', '1123456789abcdef']) {
          yield* fs.makeDirectory(path.join(outDir, name, 'Deckster.app'), { recursive: true });
        }

        yield* fs.utimes(path.join(outDir, '0123456789abcdef'), old, old);
        yield* fs.makeDirectory(path.join(outDir, 'fedcba9876543210'), { recursive: true });
        yield* fs.utimes(path.join(outDir, 'fedcba9876543210'), old, old);
        yield* fs.makeDirectory(path.join(outDir, 'notes'), { recursive: true });
        yield* fs.utimes(path.join(outDir, 'notes'), old, old);
        const spawner = fakeToolSpawner();
        yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(Effect.provide(spawner.layer));
        const names = appFolders(root);
        expect(names).not.toContain('0123456789abcdef');
        expect(names).toContain('1123456789abcdef');
        expect(names).toContain('fedcba9876543210');
        expect(names).toContain('notes');
        expect(names).toHaveLength(4);
      }).pipe(Effect.scoped),
    );

    it.effect('keeps a bundle in use, which every run touches, though ps shows nothing', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner();
        const first = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        if (first._tag !== 'Branded') {
          return;
        }

        const keyFolder = path.resolve(first.executable, '../../../..');
        const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
        yield* fs.utimes(keyFolder, old, old);
        yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(Effect.provide(spawner.layer));
        const touched = statSync(keyFolder).mtimeMs;
        expect(Date.now() - touched).toBeLessThan(60_000);

        // A new Electron version makes a new key and a build, which prunes.
        yield* fs.writeFileString(path.join(electronDir, 'dist', 'version'), '45.3.3\n');
        const second = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        expect(second).toMatchObject({ _tag: 'Branded', built: true });
        expect(existsSync(first.executable)).toBe(true);
        expect(appFolders(root)).toHaveLength(2);
      }).pipe(Effect.scoped),
    );

    it.effect('replaces a key folder that is there without its app, once', () =>
      Effect.gen(function* () {
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner();
        const first = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        if (first._tag !== 'Branded') {
          return;
        }

        rmSync(first.executable);
        const second = yield* ensureBrandedApp(root, electronDir, 'darwin').pipe(
          Effect.provide(spawner.layer),
        );
        expect(second).toMatchObject({ _tag: 'Branded', built: true });
        expect(existsSync(first.executable)).toBe(true);
        expect(appFolders(root)).toHaveLength(1);
      }).pipe(Effect.scoped),
    );

    it.effect('gives up on a tool that never exits, so the fallback takes over', () =>
      Effect.gen(function* () {
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner(
          () => false,
          (call) => call.command === '/bin/cp',
        );
        const fiber = yield* Effect.forkChild(
          ensureBrandedApp(root, electronDir, 'darwin').pipe(Effect.provide(spawner.layer)),
        );
        yield* untilCalled(spawner.calls, '/bin/cp');
        yield* TestClock.adjust('31 seconds');
        const result = yield* Fiber.join(fiber);
        expect(result._tag).toBe('Unavailable');
        if (result._tag === 'Unavailable') {
          expect(result.reason).toContain('timed out');
        }

        expect(appFolders(root)).toEqual([]);
      }).pipe(Effect.scoped),
    );

    it.effect('times out a plutil that never exits', () =>
      Effect.gen(function* () {
        const { root, electronDir } = yield* scratch;
        const spawner = fakeToolSpawner(
          () => false,
          (call) => call.command === '/usr/bin/plutil',
        );
        const fiber = yield* Effect.forkChild(
          ensureBrandedApp(root, electronDir, 'darwin').pipe(Effect.provide(spawner.layer)),
        );
        yield* untilCalled(spawner.calls, '/usr/bin/plutil');
        yield* TestClock.adjust('11 seconds');
        const result = yield* Fiber.join(fiber);
        expect(result._tag).toBe('Unavailable');
      }).pipe(Effect.scoped),
    );
  });
});

describe('applyPlistEdit, with the real plutil', () => {
  layer(NodeServices.layer)((it) => {
    it.effect('sets, adds and removes keys, and does not mind a key that is missing', () =>
      Effect.gen(function* () {
        if (process.platform !== 'darwin') {
          return;
        }

        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({
          directory: os.tmpdir(),
          prefix: 'deck-plist-',
        });
        const file = path.join(dir, 'Info.plist');
        yield* fs.writeFileString(
          file,
          '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>A</key><string>one</string><key>B</key><string>two</string></dict></plist>',
        );
        yield* applyPlistEdit(file, { op: 'replace', key: 'A', value: 'changed' });
        yield* applyPlistEdit(file, { op: 'replace', key: 'New', value: 'added' });
        yield* applyPlistEdit(file, { op: 'remove', key: 'B' });
        yield* applyPlistEdit(file, { op: 'remove', key: 'Missing' });
        const text = yield* fs.readFileString(file);
        expect(text).toContain('changed');
        expect(text).toContain('added');
        expect(text).not.toContain('two');
        const unreadable = yield* Effect.flip(
          applyPlistEdit(path.join(dir, 'nowhere.plist'), { op: 'remove', key: 'A' }),
        );
        expect(unreadable._tag).toBe('ShellError');
      }).pipe(Effect.scoped),
    );
  });
});
