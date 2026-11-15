import { findBrandedApp } from '@deckster/shell/bundle';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Stream } from 'effect';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { ensureBrandedApp } from '#present/branded-app.ts';
import { DeckShell, shellConfig, type ShellOptions } from '#present/deck-shell.ts';
import { resolveShellBinary } from '#present/shell-binary.ts';
import { Workspace, WORKSPACE_ROOT } from '#workspace.ts';

/**
 * The ports the tests' static pages use.
 */
const PAGE_PORTS = { shell: 5770, parentDeath: 5771, names: 5772 } as const;

/**
 * The folder under which Electron would create a profile named after the app: the user's
 * Application Support on macOS, `%APPDATA%` on Windows, `~/.config` on Linux.
 */
const APP_DATA = appDataFolder(process.platform);

/**
 * Electron's `appData` folder for a platform.
 *
 * @param platform - `process.platform`.
 */
function appDataFolder(platform: string): string {
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }

  return platform === 'win32'
    ? (process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming'))
    : (process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config'));
}

/**
 * The profile folders these tests would create there without the fix: one per title the tests use,
 * the default title, and Electron's own name.
 */
const WATCHED_PROFILES = ['Tiny deck', 'parent death', 'Deck', 'Electron', 'shell entry'];

/**
 * The newest modification time in a folder tree, or `undefined` when it does not exist.
 *
 * @param folder - The folder.
 */
function newestChange(folder: string): number | undefined {
  if (!existsSync(folder)) {
    return undefined;
  }

  let newest = statSync(folder).mtimeMs;
  for (const entry of readdirSync(folder, { withFileTypes: true, recursive: true })) {
    try {
      newest = Math.max(newest, statSync(path.join(entry.parentPath, entry.name)).mtimeMs);
    } catch {
      // A file Chromium removed while the tree was read.
    }
  }

  return newest;
}

/**
 * The names in the app data folder, and the newest change in each profile the tests could create.
 */
function appDataSnapshot(): { names: string[]; watched: Record<string, number | undefined> } {
  return {
    names: existsSync(APP_DATA) ? readdirSync(APP_DATA) : [],
    watched: Object.fromEntries(
      WATCHED_PROFILES.map((name) => [name, newestChange(path.join(APP_DATA, name))]),
    ),
  };
}

/**
 * The app data folder before any shell of this file ran.
 */
const appDataBefore = appDataSnapshot();

/**
 * The shell package's app module that throws on import.
 */
const THROWING_APP = path.join(
  path.dirname(createRequire(import.meta.url).resolve('@deckster/shell/package.json')),
  'src/main/throwing-app.fixture.ts',
);

/**
 * The shell package's entry stand-in that awaits at the top level and records `app.isReady()`.
 */
const SLOW_ENTRY = path.join(
  path.dirname(createRequire(import.meta.url).resolve('@deckster/shell/package.json')),
  'src/main/slow-entry.fixture.ts',
);

/**
 * A page that stands in for a deck: a title and a `window.__deck` the shell waits for.
 */
const PAGE = `<!doctype html><title>Tiny deck</title><body style="background:#123456">hello
<script>window.__deck = { ready: async () => {} };</script>`;

/**
 * Whether Electron's binary is downloaded; every test here is skipped without it, so the suite
 * passes on a machine that never ran `install-electron`.
 */
const binary = await Effect.runPromise(
  resolveShellBinary(WORKSPACE_ROOT).pipe(Effect.provide(NodeServices.layer), Effect.option),
);
const available = binary._tag === 'Some';

/**
 * The `electron` package folder of `@deckster/shell`.
 */
function electronPackage(): string {
  const shellPackage = createRequire(import.meta.url).resolve('@deckster/shell/package.json');
  return path.dirname(createRequire(shellPackage).resolve('electron/package.json'));
}

/**
 * Serves the tiny page on a port until the returned function is called.
 *
 * @param port - The port.
 */
async function servePage(port: number): Promise<() => Promise<void>> {
  const server = http.createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return () => new Promise((resolve) => server.close(() => resolve()));
}

/**
 * Whether a process is alive.
 *
 * @param pid - The process id.
 */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every descendant of a process, from `ps`.
 *
 * @param root - The ancestor's pid.
 */
function descendants(root: number): number[] {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number) as [number, number]);
  const found = new Set<number>();
  let frontier = [root];
  while (frontier.length > 0) {
    const next = rows.filter(([, parent]) => frontier.includes(parent)).map(([pid]) => pid);
    frontier = next.filter((pid) => !found.has(pid));
    for (const pid of frontier) {
      found.add(pid);
    }
  }

  return [...found];
}

/**
 * Shell options for a hidden run against a local page.
 *
 * @param port - The page's port.
 */
function hiddenOptions(port: number): ShellOptions {
  return {
    url: `http://127.0.0.1:${port}/`,
    title: 'Tiny deck',
    backgroundColor: '#123456',
    stateKey: 'tiny',
    stateFile: undefined,
    flags: {
      fullscreen: true,
      kiosk: false,
      display: undefined,
      presenter: true,
      presenterDisplay: undefined,
    },
    startTimeout: '30 seconds',
    env: { DECK_SHELL_TEST_HIDDEN: '1' },
  };
}

describe.skipIf(!available)('the real Electron shell, hidden', { timeout: 60_000 }, () => {
  it.live('opens a page, lists displays and exits 0 on quit', () =>
    Effect.gen(function* () {
      const stop = yield* Effect.promise(() => servePage(PAGE_PORTS.shell));
      yield* Effect.addFinalizer(() => Effect.promise(stop));
      const shell = yield* DeckShell;
      const session = yield* shell.open(hiddenOptions(PAGE_PORTS.shell));
      expect(session.ready.title).toBe('Tiny deck');
      expect(session.ready.hasDeck).toBe(true);
      expect(session.ready.windows.map((window) => window.window)).toContain('audience');
      expect(session.displays.length).toBeGreaterThanOrEqual(1);
      expect(session.plan.plan.audience.displayId).toBe(
        session.displays.find((display) => display.primary)?.id,
      );
      const events = yield* session.events.pipe(Stream.take(1), Stream.runCollect);
      expect(events[0]?.type).toBe('displays');
      yield* session.quit;
      yield* session.closed;
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.provideMerge(DeckShell.layer, Layer.merge(NodeServices.layer, Workspace.layer)),
      ),
    ),
  );

  it.live('runs the branded Deckster app, verified and cached, and names no process Electron', () =>
    Effect.gen(function* () {
      if (process.platform !== 'darwin' || binary._tag !== 'Some') {
        return;
      }

      const executable = binary.value.executable;
      expect(binary.value.branded, 'the branded app was not built; see the warning above').toBe(
        true,
      );
      const app = path.resolve(executable, '../../..');
      const targets = [
        app,
        ...readdirSync(path.join(app, 'Contents', 'Frameworks'))
          .filter((name) => name.endsWith('.app'))
          .map((name) => path.join(app, 'Contents', 'Frameworks', name)),
      ];
      expect(targets).toHaveLength(5);
      for (const target of targets) {
        execFileSync('/usr/bin/codesign', ['--verify', '--strict', target]);
      }

      const again = yield* ensureBrandedApp(
        path.resolve(app, '../../../../..'),
        electronPackage(),
      ).pipe(Effect.provide(NodeServices.layer));
      expect(again).toMatchObject({ _tag: 'Branded', built: false, executable });
      expect(findBrandedApp(WORKSPACE_ROOT, electronPackage())).toBe(executable);

      const stop = yield* Effect.promise(() => servePage(PAGE_PORTS.names));
      yield* Effect.addFinalizer(() => Effect.promise(stop));
      const shell = yield* DeckShell;
      const session = yield* shell.open(hiddenOptions(PAGE_PORTS.names));
      expect(session.ready.hasDeck).toBe(true);
      const mine = new Set(descendants(process.pid));
      const names = execFileSync('ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' })
        .split('\n')
        .map((line) => /^\s*(\d+)\s+(.*)$/.exec(line))
        .filter((match) => match !== null && mine.has(Number(match[1])))
        .map((match) => path.basename(match?.[2] ?? ''));
      expect(names).toContain('Deckster');
      expect(names).toContain('Deckster Helper (Renderer)');
      expect(names.filter((name) => name.startsWith('Electron'))).toEqual([]);
      yield* session.quit;
      yield* session.closed;
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.provideMerge(DeckShell.layer, Layer.merge(NodeServices.layer, Workspace.layer)),
      ),
    ),
  );

  it.live('holds ready until the entry has run, however long its top-level await takes', () =>
    Effect.gen(function* () {
      if (process.platform !== 'darwin' || binary._tag !== 'Some' || !binary.value.branded) {
        return;
      }

      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({
        directory: os.tmpdir(),
        prefix: 'deck-slow-',
      });
      const out = path.join(dir, 'ready.txt');
      const child = spawn(binary.value.executable, [SLOW_ENTRY], {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: undefined,
          DECK_SLOW_ENTRY_DIR: dir,
          DECK_SLOW_ENTRY_OUT: out,
        },
      });
      yield* Effect.addFinalizer(() => Effect.sync(() => child.kill('SIGKILL')));
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      const code = yield* Effect.promise(
        () =>
          new Promise<number | null>((resolve) => {
            const timer = setTimeout(() => resolve(null), 20_000);
            child.once('exit', (exitCode) => {
              clearTimeout(timer);
              resolve(exitCode);
            });
          }),
      );
      expect(code, stderr).toBe(0);
      expect(yield* fs.readFileString(out), 'Electron was ready before the entry finished').toBe(
        'false',
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.live('quits a shell that was started and never opened when its scope closes', () =>
    Effect.gen(function* () {
      const shell = yield* DeckShell;
      const before = descendants(process.pid);
      const spawned = yield* Effect.scoped(
        Effect.gen(function* () {
          const started = yield* shell.start({
            stateKey: 'tiny',
            stateFile: undefined,
            startTimeout: '30 seconds',
            env: { DECK_SHELL_TEST_HIDDEN: '1' },
          });
          const displays = yield* started.displays;
          expect(displays.length).toBeGreaterThanOrEqual(1);
          return descendants(process.pid).filter((pid) => !before.includes(pid));
        }),
      );
      expect(spawned.length).toBeGreaterThan(0);
      for (let attempt = 0; attempt < 50 && spawned.some(alive); attempt += 1) {
        yield* Effect.sleep('100 millis');
      }

      expect(spawned.filter(alive)).toEqual([]);
    }).pipe(
      Effect.provide(
        Layer.provideMerge(DeckShell.layer, Layer.merge(NodeServices.layer, Workspace.layer)),
      ),
    ),
  );

  it.live('lists the displays without opening a window', () =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          process.env['DECK_SHELL_TEST_HIDDEN'] = '1';
        }),
        () =>
          Effect.sync(() => {
            delete process.env['DECK_SHELL_TEST_HIDDEN'];
          }),
      );
      const shell = yield* DeckShell;
      const displays = yield* shell.listDisplays('30 seconds');
      expect(displays.length).toBeGreaterThanOrEqual(1);
      expect(displays.filter((display) => display.primary)).toHaveLength(1);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.provideMerge(DeckShell.layer, Layer.merge(NodeServices.layer, Workspace.layer)),
      ),
    ),
  );

  it.live('exits within a second of its parent being killed and leaves no helpers behind', () =>
    Effect.gen(function* () {
      const stop = yield* Effect.promise(() => servePage(PAGE_PORTS.parentDeath));
      yield* Effect.addFinalizer(() => Effect.promise(stop));
      const resolved = binary._tag === 'Some' ? binary.value : undefined;
      if (resolved === undefined) {
        return;
      }

      const helper = spawn(
        process.execPath,
        [
          path.join(import.meta.dirname, 'parent-death.fixture.ts'),
          resolved.executable,
          resolved.entry,
          `http://127.0.0.1:${PAGE_PORTS.parentDeath}/`,
        ],
        { stdio: ['ignore', 'pipe', 'inherit'] },
      );
      const shellPid = yield* Effect.promise(
        () =>
          new Promise<number>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error('the helper never reported the shell')),
              40_000,
            );
            helper.stdout.on('data', (chunk: Buffer) => {
              const line = chunk
                .toString()
                .split('\n')
                .find((text) => text.includes('shellPid'));
              if (line !== undefined) {
                clearTimeout(timer);
                resolve((JSON.parse(line) as { shellPid: number }).shellPid);
              }
            });
          }),
      );
      const helpers = descendants(shellPid);
      expect(alive(shellPid)).toBe(true);
      expect(helpers.length).toBeGreaterThan(0);
      const killedAt = Date.now();
      helper.kill('SIGKILL');
      while (alive(shellPid) && Date.now() - killedAt < 5000) {
        yield* Effect.sleep('25 millis');
      }

      const elapsed = Date.now() - killedAt;
      expect(alive(shellPid)).toBe(false);
      expect(elapsed).toBeLessThanOrEqual(1000);
      yield* Effect.sleep('300 millis');
      expect(helpers.filter(alive)).toEqual([]);
      expect(alive(helper.pid ?? 0)).toBe(false);
    }).pipe(Effect.scoped),
  );
  it.live('exits non-zero on its own, without a dialog, when the app module fails to load', () =>
    Effect.gen(function* () {
      const resolved = binary._tag === 'Some' ? binary.value : undefined;
      if (resolved === undefined) {
        return;
      }

      const startedAt = Date.now();
      const child = spawn(resolved.executable, [resolved.entry], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: undefined,
          DECK_SHELL_TEST_HIDDEN: '1',
          DECK_SHELL_TEST_APP_MODULE: THROWING_APP,
          DECK_SHELL_CONFIG: JSON.stringify({
            url: `http://127.0.0.1:${PAGE_PORTS.shell}/`,
            title: 'shell entry',
            watchParent: false,
          }),
        },
      });
      yield* Effect.addFinalizer(() => Effect.sync(() => child.kill('SIGKILL')));
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      const code = yield* Effect.promise(
        () =>
          new Promise<number | null>((resolve) => {
            const timer = setTimeout(() => resolve(null), 10_000);
            child.once('exit', (exitCode) => {
              clearTimeout(timer);
              resolve(exitCode);
            });
          }),
      );
      const elapsed = Date.now() - startedAt;
      expect(code, 'the shell kept running: a dialog or the app is holding it').not.toBeNull();
      expect(code).not.toBe(0);
      expect(elapsed).toBeLessThanOrEqual(3000);
      expect(stderr).toContain('throwing-app.fixture.ts failed on import');
    }).pipe(Effect.scoped),
  );

  it('left nothing in the user app data folder: no profile named after a deck or Electron', () => {
    const after = appDataSnapshot();
    expect(after.names.filter((name) => !appDataBefore.names.includes(name))).toEqual([]);
    expect(after.watched).toEqual(appDataBefore.watched);
  });
});

describe('the shell configuration the CLI writes', () => {
  /**
   * Options with an optional agent code.
   *
   * @param agentCode - The code, if any.
   */
  const options = (agentCode?: string): ShellOptions => ({
    ...hiddenOptions(PAGE_PORTS.shell),
    stateFile: '/work/.deck/shell/windows.json',
    ...(agentCode === undefined ? {} : { agentCode }),
  });

  it('puts the profile in the workspace, never under the user folders', () => {
    expect(shellConfig('/work', options())).toEqual({
      stateKey: 'tiny',
      stateFile: '/work/.deck/shell/windows.json',
      profileDir: path.join('/work', '.deck', 'shell', 'profile'),
    });
  });

  it('says nothing about the deck: the url, title, colour and agent code go in the open target', () => {
    const config = shellConfig('/work', options('abcdefghijklmnop0123'));
    for (const key of ['url', 'title', 'backgroundColor', 'agentCode']) {
      expect(key in config).toBe(false);
    }
  });
});
