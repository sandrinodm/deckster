import type { DeckLocation } from '@deckster/vite-plugin';

import { Effect, FileSystem, type Scope } from 'effect';
import os from 'node:os';
import path from 'node:path';

import type { LimitSlide } from '#layouts/limit-deck.ts';

import { fileSystemError, type FileSystemError } from '#cli-error.ts';
import { limitDeckConfig } from '#layouts/limit-deck.ts';

/**
 * The start of the temporary workspace's folder name.
 */
const TEMP_PREFIX = 'deckster-layouts-check-';

/**
 * The workspace files a deck or brand's own `tsconfig.json` extends, linked into the temporary
 * workspace when the real one has them.
 */
const LINKED_ROOT_FILES = ['tsconfig.base.json'] as const;

/**
 * The folder of installed packages, linked rather than copied: pnpm's links inside it are relative.
 */
const NODE_MODULES = 'node_modules';

/**
 * The folder in `node_modules` where the deck server caches what it builds. It is the one entry of
 * the real `node_modules` that is not linked into the temporary workspace, so the server writes its
 * cache in the temporary workspace and never in the real one.
 */
const SERVER_CACHE_DIR = '.vite';

/**
 * What a copied deck leaves behind: its slides and config (the generated ones replace them), its
 * build output and its installed packages (linked instead).
 */
const SKIPPED_DECK_ENTRIES: ReadonlySet<string> = new Set([
  'slides',
  'deck.config.ts',
  'dist',
  NODE_MODULES,
]);

/**
 * The fix for a temporary workspace that cannot be written.
 */
const TEMP_FIX = 'Check that the temporary folder is writable and has room, then run it again.';

/**
 * What goes into the temporary workspace.
 */
export type CheckWorkspaceOptions = {
  /**
   * The absolute root of the workspace the layouts belong to. Nothing is written to it.
   */
  readonly root: string;

  /**
   * The brand folder to copy, when the workspace has it; a brand the framework brings (`default` in
   * an installed CLI's workspace) is found without a copy.
   */
  readonly brandDir: string | undefined;

  /**
   * The deck whose folder is copied (its layouts, components and assets, not its slides), or
   * `undefined` to write a deck of its own.
   */
  readonly deck: DeckLocation | undefined;

  /**
   * The id of the generated deck: the copied deck's own, so its layouts keep their source.
   */
  readonly deckId: string;

  /**
   * The slides to write.
   */
  readonly slides: readonly LimitSlide[];

  /**
   * The brand the generated deck names.
   */
  readonly brand: string;
};

/**
 * Writes a workspace in the temporary folder with one deck of generated slides, for `deckster
 * layouts check` to render through the lint server. The brand's folder and the deck's folder (all
 * but its slides, config, build output, packages and hidden entries) are copied, so the code
 * layouts render from files under the temporary workspace as they do from the real one; installed
 * packages (each entry of the root `node_modules`, in a folder of the workspace's own, so the deck
 * server's cache never lands in the real one) and the shared TypeScript config are linked. The
 * workspace is removed when the scope closes.
 *
 * @param options - The real workspace, what to copy and the slides.
 * @returns The temporary workspace root, a real path (Vite resolves real paths).
 * @throws FileSystemError in the error channel when a folder, copy or link cannot be made.
 */
export const writeCheckWorkspace = Effect.fn('writeCheckWorkspace')(function* (
  options: CheckWorkspaceOptions,
): Effect.fn.Return<string, FileSystemError, FileSystem.FileSystem | Scope.Scope> {
  const fs = yield* FileSystem.FileSystem;
  const temp = yield* fs.makeTempDirectoryScoped({ prefix: TEMP_PREFIX }).pipe(
    Effect.flatMap((dir) => fs.realPath(dir)),
    Effect.mapError((error) =>
      fileSystemError('create a temporary folder in', os.tmpdir(), error, TEMP_FIX),
    ),
  );
  for (const name of LINKED_ROOT_FILES) {
    yield* linkIfPresent(path.join(options.root, name), path.join(temp, name));
  }

  yield* linkInstalledPackages(
    path.join(options.root, NODE_MODULES),
    path.join(temp, NODE_MODULES),
  );

  if (options.brandDir !== undefined) {
    const target = path.join(temp, 'brands', path.basename(options.brandDir));
    yield* copyFolder(options.brandDir, target, new Set([NODE_MODULES]));
  }

  const deckDir = path.join(temp, 'decks', options.deckId);
  if (options.deck !== undefined) {
    yield* copyFolder(options.deck.dir, deckDir, SKIPPED_DECK_ENTRIES);
  }

  const files: Record<string, string> = {
    [path.join(deckDir, 'deck.config.ts')]: limitDeckConfig(
      'Layout check',
      options.slides,
      options.brand,
    ),
  };
  for (const slide of options.slides) {
    files[path.join(deckDir, 'slides', `${slide.id}.mdx`)] = slide.mdx;
  }

  for (const [file, content] of Object.entries(files)) {
    yield* fs
      .makeDirectory(path.dirname(file), { recursive: true })
      .pipe(Effect.mapError((error) => fileSystemError('create', file, error, TEMP_FIX)));
    yield* fs
      .writeFileString(file, content)
      .pipe(Effect.mapError((error) => fileSystemError('write', file, error, TEMP_FIX)));
  }

  return temp;
});

/**
 * Copies a folder's entries except the skipped ones and hidden ones (screenshots and review
 * comments in `.deck/`, an ejected layout's `.eject/`), and links its `node_modules` by absolute
 * path when it has one.
 *
 * @param from - The absolute folder to copy.
 * @param to - The absolute folder to create.
 * @param skipped - Entry names not to copy.
 */
const copyFolder = Effect.fn('copyFolder')(function* (
  from: string,
  to: string,
  skipped: ReadonlySet<string>,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .makeDirectory(to, { recursive: true })
    .pipe(Effect.mapError((error) => fileSystemError('create', to, error, TEMP_FIX)));
  const names = yield* fs
    .readDirectory(from)
    .pipe(Effect.mapError((error) => fileSystemError('read', from, error, TEMP_FIX)));
  for (const name of names.filter((entry) => !skipped.has(entry) && !entry.startsWith('.'))) {
    yield* fs
      .copy(path.join(from, name), path.join(to, name))
      .pipe(
        Effect.mapError((error) => fileSystemError('copy', path.join(from, name), error, TEMP_FIX)),
      );
  }

  yield* linkIfPresent(path.join(from, NODE_MODULES), path.join(to, NODE_MODULES));
});

/**
 * Links `to` to `from` by absolute path when `from` exists.
 *
 * @param from - The absolute path to link to.
 * @param to - The absolute path of the link.
 */
const linkIfPresent = Effect.fn('linkIfPresent')(function* (
  from: string,
  to: string,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(from).pipe(Effect.orElseSucceed(() => false)))) {
    return;
  }

  yield* fs
    .symlink(from, to)
    .pipe(Effect.mapError((error) => fileSystemError('link', to, error, TEMP_FIX)));
});

/**
 * Makes `to` a real folder with a link to each entry of the folder of installed packages `from`,
 * except the deck server's cache folder, when `from` exists. Linking the whole folder would let the
 * server write its cache through the link into the real workspace.
 *
 * @param from - The absolute folder of installed packages to link.
 * @param to - The absolute folder to create.
 */
const linkInstalledPackages = Effect.fn('linkInstalledPackages')(function* (
  from: string,
  to: string,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(from).pipe(Effect.orElseSucceed(() => false)))) {
    return;
  }

  yield* fs
    .makeDirectory(to, { recursive: true })
    .pipe(Effect.mapError((error) => fileSystemError('create', to, error, TEMP_FIX)));
  const names = yield* fs
    .readDirectory(from)
    .pipe(Effect.mapError((error) => fileSystemError('read', from, error, TEMP_FIX)));
  for (const name of names.filter((entry) => entry !== SERVER_CACHE_DIR)) {
    yield* linkIfPresent(path.join(from, name), path.join(to, name));
  }
});
