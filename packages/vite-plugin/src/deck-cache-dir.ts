import type { PlatformError } from 'effect';
import type { ConfigEnv, Plugin } from 'vite-plus';

import { Config, Effect, FileSystem, Option, Predicate } from 'effect';
import path from 'node:path';

import { makeRunEffect } from '#run-effect.ts';

/**
 * What a deck's Vite instance does. Each mode gets its own cache folder.
 */
export type CacheMode = 'dev' | 'build' | 'preview';

/**
 * Everything that names a deck's cache folder.
 */
export type CacheKeyInput = {
  /**
   * The deck folder name under `decks/`.
   */
  deck: string;

  /**
   * The brand that overrides the deck config's, when there is one.
   */
  brand?: string;

  /**
   * Whether Vite serves, builds or previews the deck.
   */
  mode: CacheMode;

  /**
   * Whether the server runs inside a test runner, so tests never warm or empty the cache of a dev
   * server someone is using.
   */
  test: boolean;
};

/**
 * Options for {@link deckCacheDirPlugin}.
 */
export type DeckCacheDirOptions = {
  /**
   * The absolute workspace root; caches go to its `node_modules/.vite`.
   */
  workspaceRoot: string;

  /**
   * The deck folder name under `decks/`.
   */
  deck: string;

  /**
   * The brand that overrides the deck config's, when there is one.
   */
  brand?: string;
};

/**
 * How old, in milliseconds, a dependency optimizer temp folder must be before a starting server
 * removes it. A temp folder that recent may belong to a server optimizing right now.
 */
export const STALE_TEMP_AGE_MS = 60_000;

/**
 * The part of a folder name that marks Vite's dependency optimizer output in progress
 * (`deps_temp_<hash>`); Vite renames it to `deps` when the optimization is done.
 */
const TEMP_MARKER = '_temp_';

/**
 * The file in a cache folder that names the process whose dev server uses it.
 */
export const CACHE_LOCK_FILE = 'deck-server.lock';

/**
 * How many cache folders one key may have: one per dev server running at the same time.
 */
const MAX_SLOTS = 32;

/**
 * The `VITEST` environment variable, set in every test worker.
 */
const TEST_RUNNER_FROM_ENV = Config.option(Config.String('VITEST'));

/**
 * The cache folders this process's dev servers hold. The lock file says which process holds a
 * folder; this says that a server of this process still uses it.
 */
const claimedDirs = new Set<string>();

/**
 * The name of a deck's cache folder, such as `deck-hello-dev`, `deck-hello@acme-preview` or
 * `deck-hello-dev-test`. Every configuration that pre-bundles differently has its own, so servers
 * never re-bundle into each other's folder, and the same configuration finds its folder again on
 * the next run.
 *
 * @param input - The deck, brand, mode and whether a test runs it.
 */
export function cacheKey(input: CacheKeyInput): string {
  const deck = input.brand === undefined ? input.deck : `${input.deck}@${input.brand}`;
  return ['deck', deck, input.mode, ...(input.test ? ['test'] : [])].join('-');
}

/**
 * The cache folder for one slot of a key: the first is the key itself, later ones count from 2
 * (`deck-hello-dev-2`).
 *
 * @param cacheRoot - The folder that holds every deck cache.
 * @param key - The key, from {@link cacheKey}.
 * @param slot - The slot, from 0.
 */
export function slotDir(cacheRoot: string, key: string, slot: number): string {
  return path.join(cacheRoot, slot === 0 ? key : `${key}-${slot + 1}`);
}

/**
 * The mode of a Vite run, from the environment its config hooks get.
 *
 * @param env - Vite's config environment.
 */
export function cacheMode(env: ConfigEnv): CacheMode {
  if (env.command === 'build') {
    return 'build';
  }

  return env.isPreview === true ? 'preview' : 'dev';
}

/**
 * Whether a process is running. A process of another user counts as running.
 *
 * @param pid - The process id.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Predicate.hasProperty(error, 'code') && error.code === 'EPERM';
  }
}

/**
 * Claims a cache folder for a dev server of this process: the first slot of the key that no other
 * running process and no other server of this one holds. A lock file left by a process that ended
 * is taken over, so a key keeps its first folder from run to run while concurrent servers each get
 * their own. Release it with {@link releaseCacheDir} when the server closes.
 *
 * @param cacheRoot - The folder that holds every deck cache.
 * @param key - The key, from {@link cacheKey}.
 * @returns The absolute cache folder.
 */
export const claimCacheDir = Effect.fn('claimCacheDir')(function* (
  cacheRoot: string,
  key: string,
): Effect.fn.Return<string, PlatformError.PlatformError, FileSystem.FileSystem> {
  for (let slot = 0; slot < MAX_SLOTS; slot += 1) {
    const dir = slotDir(cacheRoot, key, slot);
    if (!claimedDirs.has(dir) && (yield* lockCacheDir(dir))) {
      claimedDirs.add(dir);
      return dir;
    }
  }

  const fallback = path.join(cacheRoot, `${key}-pid${process.pid}-${claimedDirs.size}`);
  claimedDirs.add(fallback);
  return fallback;
});

/**
 * Gives up a folder {@link claimCacheDir} returned, so the next server can use it.
 *
 * @param dir - The cache folder.
 */
export const releaseCacheDir = Effect.fn('releaseCacheDir')(function* (
  dir: string,
): Effect.fn.Return<void, never, FileSystem.FileSystem> {
  claimedDirs.delete(dir);
  const fs = yield* FileSystem.FileSystem;
  const lock = path.join(dir, CACHE_LOCK_FILE);
  if ((yield* lockHolder(lock)) === process.pid) {
    yield* fs.remove(lock, { force: true }).pipe(Effect.ignore);
  }
});

/**
 * Removes the dependency optimizer temp folders (`deps_temp_*`) older than `maxAgeMs` from a cache
 * folder. Vite leaves one behind when a server stops mid-optimization or when two servers re-bundle
 * into the same folder; it removes them itself only after a day. Younger ones are kept, since
 * another server may be writing them. It never fails: a folder that cannot be read or removed is
 * left alone.
 *
 * @param dir - The cache folder.
 * @param maxAgeMs - The age above which a temp folder is stale.
 * @returns The names of the removed folders.
 */
export const removeStaleTemps = Effect.fn('removeStaleTemps')(function* (
  dir: string,
  maxAgeMs = STALE_TEMP_AGE_MS,
): Effect.fn.Return<string[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed((): string[] => []));
  const now = Date.now();
  const removed: string[] = [];
  for (const name of names.filter((entry) => entry.includes(TEMP_MARKER))) {
    const temp = path.join(dir, name);
    const info = yield* fs.stat(temp).pipe(Effect.option);
    const modified = Option.getOrUndefined(Option.flatMap(info, (found) => found.mtime));
    if (
      Option.isNone(info) ||
      info.value.type !== 'Directory' ||
      modified === undefined ||
      now - modified.getTime() <= maxAgeMs
    ) {
      continue;
    }

    const gone = yield* fs.remove(temp, { recursive: true, force: true }).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
    if (gone) {
      removed.push(name);
    }
  }

  return removed;
});

/**
 * Picks the cache folder of a deck's Vite run and clears the stale optimizer temp folders out of
 * it. A dev server claims a folder of its own (see {@link claimCacheDir}); a build or preview,
 * which pre-bundle nothing, use the key's folder. When the folder cannot be claimed, such as on a
 * read-only `node_modules`, it falls back to the key's folder, as Vite would.
 *
 * @param cacheRoot - The folder that holds every deck cache.
 * @param input - The deck, brand and mode.
 * @returns The absolute cache folder.
 */
export const prepareCacheDir = Effect.fn('prepareCacheDir')(function* (
  cacheRoot: string,
  input: Omit<CacheKeyInput, 'test'>,
): Effect.fn.Return<string, never, FileSystem.FileSystem> {
  const runner = yield* Effect.orElseSucceed(TEST_RUNNER_FROM_ENV, () => Option.none<string>());
  const key = cacheKey({ ...input, test: Option.isSome(runner) });
  const dir =
    input.mode === 'dev'
      ? yield* claimCacheDir(cacheRoot, key).pipe(
          Effect.orElseSucceed(() => slotDir(cacheRoot, key, 0)),
        )
      : slotDir(cacheRoot, key, 0);
  yield* removeStaleTemps(dir);
  return dir;
});

/**
 * Sets the cache folder of a deck's Vite run to one that no concurrent server shares (see
 * {@link prepareCacheDir}) and releases a dev server's folder when the server closes. A `cacheDir`
 * the caller sets wins. A restart keeps the folder: Vite starts the new server from the same
 * plugins before it closes the old one.
 *
 * @param options - The workspace, the deck and the brand override.
 */
export function deckCacheDirPlugin(options: DeckCacheDirOptions): Plugin {
  const run = makeRunEffect();
  const cacheRoot = path.join(options.workspaceRoot, 'node_modules', '.vite');
  let claim: Promise<string> | undefined;
  let servers = 0;
  return {
    name: 'deck:cache-dir',

    async config(config, env) {
      if (config.cacheDir !== undefined) {
        return undefined;
      }

      const mode = cacheMode(env);
      const input = {
        deck: options.deck,
        mode,
        ...(options.brand === undefined ? {} : { brand: options.brand }),
      };
      if (mode !== 'dev') {
        return { cacheDir: await run(prepareCacheDir(cacheRoot, input)) };
      }

      servers += 1;
      claim ??= run(prepareCacheDir(cacheRoot, input));
      return { cacheDir: await claim };
    },

    async buildEnd() {
      if (this.environment.config.command !== 'serve' || claim === undefined) {
        return;
      }

      servers -= 1;
      if (servers > 0) {
        return;
      }

      const dir = await claim;
      claim = undefined;
      await run(releaseCacheDir(dir));
    },
  };
}

/**
 * Takes the lock of a cache folder for this process: creates it, or replaces one whose process
 * ended.
 *
 * @param dir - The cache folder.
 * @returns Whether this process now holds the folder.
 */
const lockCacheDir = Effect.fn('lockCacheDir')(function* (
  dir: string,
): Effect.fn.Return<boolean, PlatformError.PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(dir, { recursive: true });
  const lock = path.join(dir, CACHE_LOCK_FILE);
  if (yield* createLock(lock)) {
    return true;
  }

  const holder = yield* lockHolder(lock);
  if (holder !== undefined && holder !== process.pid && isProcessAlive(holder)) {
    return false;
  }

  yield* fs.remove(lock, { force: true });
  return yield* createLock(lock);
});

/**
 * Creates a lock file naming this process, unless one exists.
 *
 * @param lock - The lock file.
 * @returns Whether the file was created.
 */
const createLock = Effect.fn('createLock')(function* (
  lock: string,
): Effect.fn.Return<boolean, PlatformError.PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.writeFileString(lock, `${process.pid}\n`, { flag: 'wx' }).pipe(
    Effect.as(true),
    Effect.catchIf(
      (error) => error.reason._tag === 'AlreadyExists',
      () => Effect.succeed(false),
    ),
  );
});

/**
 * The process a lock file names, or `undefined` when it is missing or unreadable.
 *
 * @param lock - The lock file.
 */
const lockHolder = Effect.fn('lockHolder')(function* (
  lock: string,
): Effect.fn.Return<number | undefined, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(lock).pipe(Effect.option);
  const pid = Option.isSome(text) ? Number.parseInt(text.value, 10) : Number.NaN;
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
});
