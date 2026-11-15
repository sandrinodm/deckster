import { NodeFileSystem } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  CACHE_LOCK_FILE,
  STALE_TEMP_AGE_MS,
  cacheKey,
  cacheMode,
  claimCacheDir,
  isProcessAlive,
  prepareCacheDir,
  releaseCacheDir,
  removeStaleTemps,
  slotDir,
} from '#deck-cache-dir.ts';

/**
 * A process id that no running process has: a child that already exited.
 */
function endedPid(): number {
  const child = spawnSync(process.execPath, ['-e', '']);
  return child.pid ?? 0;
}

describe('cacheKey', () => {
  it('names the deck, the brand, the mode and a test run', () => {
    expect(cacheKey({ deck: 'hello', mode: 'dev', test: false })).toBe('deck-hello-dev');
    expect(cacheKey({ deck: 'hello', brand: 'acme', mode: 'dev', test: false })).toBe(
      'deck-hello@acme-dev',
    );
    expect(cacheKey({ deck: 'hello', mode: 'build', test: false })).toBe('deck-hello-build');
    expect(cacheKey({ deck: 'hello', mode: 'preview', test: true })).toBe(
      'deck-hello-preview-test',
    );
  });

  it('never gives a test server the folder of the dev server or the shared one of old', () => {
    const dev = cacheKey({ deck: 'hello', mode: 'dev', test: false });
    const test = cacheKey({ deck: 'hello', mode: 'dev', test: true });
    expect(new Set([dev, test, 'deck-hello']).size).toBe(3);
  });

  it('numbers the later slots of a key from 2', () => {
    expect(slotDir('/c', 'deck-hello-dev', 0)).toBe(path.join('/c', 'deck-hello-dev'));
    expect(slotDir('/c', 'deck-hello-dev', 1)).toBe(path.join('/c', 'deck-hello-dev-2'));
  });

  it('reads the mode from the config environment', () => {
    expect(cacheMode({ command: 'serve', mode: 'development' })).toBe('dev');
    expect(cacheMode({ command: 'serve', mode: 'production', isPreview: true })).toBe('preview');
    expect(cacheMode({ command: 'build', mode: 'production' })).toBe('build');
  });

  it('tells a running process from one that ended', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(endedPid())).toBe(false);
  });
});

layer(NodeFileSystem.layer)('claimCacheDir', (it) => {
  it.effect('gives concurrent servers their own folder and the first one back once released', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-cache-' });
        const first = yield* claimCacheDir(root, 'deck-hello-dev');
        const second = yield* claimCacheDir(root, 'deck-hello-dev');
        expect(first).toBe(path.join(root, 'deck-hello-dev'));
        expect(second).toBe(path.join(root, 'deck-hello-dev-2'));
        expect((yield* fs.readFileString(path.join(first, CACHE_LOCK_FILE))).trim()).toBe(
          String(process.pid),
        );

        yield* releaseCacheDir(first);
        expect(yield* fs.exists(path.join(first, CACHE_LOCK_FILE))).toBe(false);
        expect(yield* claimCacheDir(root, 'deck-hello-dev')).toBe(first);
        yield* releaseCacheDir(first);
        yield* releaseCacheDir(second);
      }),
    ),
  );

  it.effect('skips a folder another running process holds and takes over one that ended', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-cache-' });
        const held = slotDir(root, 'deck-hello-dev', 0);
        const abandoned = slotDir(root, 'deck-hello-dev', 1);
        yield* fs.makeDirectory(held, { recursive: true });
        yield* fs.makeDirectory(abandoned, { recursive: true });
        yield* fs.writeFileString(path.join(held, CACHE_LOCK_FILE), `${process.ppid}\n`);
        yield* fs.writeFileString(path.join(abandoned, CACHE_LOCK_FILE), `${endedPid()}\n`);

        const claimed = yield* claimCacheDir(root, 'deck-hello-dev');
        expect(claimed).toBe(abandoned);
        expect((yield* fs.readFileString(path.join(abandoned, CACHE_LOCK_FILE))).trim()).toBe(
          String(process.pid),
        );
        yield* releaseCacheDir(claimed);
        expect((yield* fs.readFileString(path.join(held, CACHE_LOCK_FILE))).trim()).toBe(
          String(process.ppid),
        );
      }),
    ),
  );
});

layer(NodeFileSystem.layer)('removeStaleTemps', (it) => {
  it.effect('removes only optimizer temp folders older than the limit', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-cache-' });
        const old = new Date(Date.now() - STALE_TEMP_AGE_MS * 2);
        for (const name of ['deps', 'deps_temp_old', 'deps_ssr_temp_old', 'deps_temp_new']) {
          yield* fs.makeDirectory(path.join(dir, name));
        }

        yield* fs.writeFileString(path.join(dir, 'deps_temp_file'), '');
        for (const name of ['deps', 'deps_temp_old', 'deps_ssr_temp_old', 'deps_temp_file']) {
          yield* fs.utimes(path.join(dir, name), old, old);
        }

        const removed = yield* removeStaleTemps(dir);
        expect(removed.toSorted()).toEqual(['deps_ssr_temp_old', 'deps_temp_old']);
        expect((yield* fs.readDirectory(dir)).toSorted()).toEqual([
          'deps',
          'deps_temp_file',
          'deps_temp_new',
        ]);
      }),
    ),
  );

  it.effect('does nothing for a folder that does not exist', () =>
    Effect.gen(function* () {
      expect(yield* removeStaleTemps(path.join('/nonexistent', 'deck-cache'))).toEqual([]);
    }),
  );
});

layer(NodeFileSystem.layer)('prepareCacheDir', (it) => {
  it.effect('marks a test run, claims a dev folder and clears its stale temps', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-cache-' });
        const stale = path.join(root, 'deck-hello-dev-test', 'deps_temp_stale');
        yield* fs.makeDirectory(stale, { recursive: true });
        const old = new Date(Date.now() - STALE_TEMP_AGE_MS * 2);
        yield* fs.utimes(stale, old, old);

        const dir = yield* prepareCacheDir(root, { deck: 'hello', mode: 'dev' });
        expect(dir).toBe(path.join(root, 'deck-hello-dev-test'));
        expect(yield* fs.exists(stale)).toBe(false);
        yield* releaseCacheDir(dir);
        expect(yield* prepareCacheDir(root, { deck: 'hello', brand: 'acme', mode: 'build' })).toBe(
          path.join(root, 'deck-hello@acme-build-test'),
        );
      }),
    ),
  );
});
