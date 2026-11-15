import { fileExists } from '@deckster/brand/node';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

/**
 * The folder inside a deck that holds one folder per mini app.
 */
export const APPS_DIR = 'apps';

/**
 * The file every app folder contains: the app's own HTML entry.
 */
export const APP_ENTRY_FILE = 'index.html';

/**
 * Where a mini app lives on disk.
 */
export type AppLocation = {
  /**
   * The folder name under the deck's `apps/`, the name `<AppFrame app>` uses.
   */
  name: string;

  /**
   * The absolute app folder.
   */
  dir: string;

  /**
   * The absolute path of the app's `index.html`.
   */
  entry: string;
};

/**
 * Lists a deck's mini apps: each folder under `decks/<deck>/apps/` that contains an `index.html`.
 * Other folders and files are ignored.
 *
 * @param deckDir - The absolute deck folder.
 * @returns Apps sorted by name; an empty list when the deck has no `apps/` folder.
 */
export const discoverApps = Effect.fn('discoverApps')(function* (
  deckDir: string,
): Effect.fn.Return<AppLocation[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const appsDir = path.join(deckDir, APPS_DIR);
  const entries = yield* fs.readDirectoryEntries(appsDir).pipe(Effect.orElseSucceed(() => []));
  const candidates = entries
    .filter((entry) => entry.type === 'Directory')
    .map((entry): AppLocation => {
      const dir = path.join(appsDir, entry.name);
      return { name: entry.name, dir, entry: path.join(dir, APP_ENTRY_FILE) };
    });
  const present = yield* Effect.forEach(candidates, (app) => fileExists(app.entry), {
    concurrency: 'unbounded',
  });
  return candidates
    .filter((_, index) => present[index])
    .sort((a, b) => a.name.localeCompare(b.name));
});
