import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, FileSystem, Scope } from 'effect';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  devServersDir,
  findRunningDevServers,
  registerDevServer,
  runningDevServerWarning,
} from '#server/dev-registry.ts';

/**
 * The pid of a process that has exited, so no live process has it (until the OS reuses it).
 */
function deadPid(): number {
  return spawnSync(process.execPath, ['-e', '']).pid ?? 0;
}

describe('dev server records', () => {
  it.effect('lists the live dev servers of other processes and removes stale records', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'dev-registry-' });
      const dir = devServersDir(root);
      yield* fs.makeDirectory(dir, { recursive: true });
      const parent = process.ppid;
      const dead = deadPid();
      yield* fs.writeFileString(
        path.join(dir, `${parent}.json`),
        JSON.stringify({ pid: parent, url: 'http://127.0.0.1:5173/', deck: 'talk' }),
      );
      yield* fs.writeFileString(
        path.join(dir, `${dead}.json`),
        JSON.stringify({ pid: dead, url: 'http://127.0.0.1:5174/' }),
      );
      yield* fs.writeFileString(path.join(dir, 'broken.json'), 'not json');

      const running = yield* findRunningDevServers(root);
      expect(running).toEqual([{ pid: parent, url: 'http://127.0.0.1:5173/', deck: 'talk' }]);
      expect(yield* fs.exists(path.join(dir, `${dead}.json`))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('skips its own record and removes it when the scope closes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'dev-registry-' });
      const file = path.join(devServersDir(root), `${process.pid}.json`);
      const scope = yield* Scope.make();
      yield* registerDevServer(root, { url: 'http://127.0.0.1:5173/' }).pipe(Scope.provide(scope));

      expect(yield* fs.exists(file)).toBe(true);
      expect(yield* findRunningDevServers(root)).toEqual([]);
      yield* Scope.close(scope, Exit.void);
      expect(yield* fs.exists(file)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it('names the deck, or the chooser, in the warning', () => {
    expect(runningDevServerWarning({ pid: 7, url: 'http://127.0.0.1:5173/', deck: 'talk' })).toBe(
      'Warning: a dev server for "talk" is still running at http://127.0.0.1:5173/ (process 7). ' +
        'This presentation uses its own server; stop the dev server if you no longer need it.',
    );
    expect(runningDevServerWarning({ pid: 7, url: 'http://127.0.0.1:5173/' })).toContain(
      'for the deck chooser',
    );
  });
});
