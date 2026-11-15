import { Effect, FileSystem, Option } from 'effect';
import path from 'node:path';

import { cliError, fileSystemError, type CliError, type FileSystemError } from '#cli-error.ts';

/**
 * The workspace folders whose children are workspace packages and so have their own `node_modules`.
 */
const PACKAGE_PARENTS = ['packages', 'brands', 'decks'] as const;

/**
 * Entries of a `node_modules` folder that are caches, not dependencies: the copy gets its own, so
 * it never shares or overwrites the cache of the checkout it was made from.
 */
const CACHE_ENTRIES = new Set(['.vite', '.cache', '.vite-temp']);

/**
 * What to do when a link cannot be made.
 */
const LINK_FIX = 'Check the temporary folder is writable and has room, then run the command again.';

/**
 * Gives a checkout of another revision the dependencies of the workspace it was made from, without
 * installing anything: for the root and every package, brand and deck folder that exists in both,
 * it makes a real `node_modules` folder whose entries link to the original's. A link that points to
 * a workspace package (`@deckster/engine` and the like) is made to point to the same package in the
 * checkout, so the old revision runs its own packages, with the original's third-party
 * dependencies. Caches are not linked. The checkout holds the base revision's own files, which may
 * include symbolic links, so no folder or link is ever created through one.
 *
 * @param sourceRoot - The workspace with installed dependencies.
 * @param targetRoot - The checkout to prepare.
 * @throws CliError in the error channel when the checkout has a symbolic link where a folder of
 *   `node_modules` would go; FileSystemError when a folder or link cannot be created.
 */
export const linkNodeModules = Effect.fn('linkNodeModules')(function* (
  sourceRoot: string,
  targetRoot: string,
): Effect.fn.Return<void, CliError | FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const folders = ['.'];
  for (const parent of PACKAGE_PARENTS) {
    const names = yield* fs
      .readDirectory(path.join(sourceRoot, parent))
      .pipe(Effect.orElseSucceed(() => []));
    folders.push(...names.map((name) => path.join(parent, name)));
  }

  for (const folder of folders) {
    const source = path.join(sourceRoot, folder, 'node_modules');
    const target = path.join(targetRoot, folder);
    const present =
      (yield* fs.exists(source).pipe(Effect.orElseSucceed(() => false))) &&
      (yield* fs.exists(target).pipe(Effect.orElseSucceed(() => false)));
    if (present) {
      yield* linkFolder(source, path.join(target, 'node_modules'), sourceRoot, targetRoot);
    }
  }
});

/**
 * Makes `target` a real folder whose entries mirror `source`'s.
 *
 * @param source - The installed `node_modules` (or scope folder inside it).
 * @param target - The folder to fill.
 * @param sourceRoot - The workspace root of the source.
 * @param targetRoot - The workspace root of the checkout.
 */
const linkFolder = Effect.fn('linkFolder')(function* (
  source: string,
  target: string,
  sourceRoot: string,
  targetRoot: string,
): Effect.fn.Return<void, CliError | FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* assertNoLinkOnPath(targetRoot, target);
  yield* fs
    .makeDirectory(target, { recursive: true })
    .pipe(Effect.mapError((error) => fileSystemError('create', target, error, LINK_FIX)));
  const names = yield* fs
    .readDirectory(source)
    .pipe(Effect.mapError((error) => fileSystemError('read', source, error, LINK_FIX)));
  for (const name of names.filter((entry) => !CACHE_ENTRIES.has(entry))) {
    const from = path.join(source, name);
    const to = path.join(target, name);
    const linked = yield* fs.readLink(from).pipe(Effect.option);
    if (Option.isSome(linked)) {
      const destination = retarget(path.resolve(source, linked.value), sourceRoot, targetRoot);
      yield* fs
        .symlink(destination, to)
        .pipe(Effect.mapError((error) => fileSystemError('link', to, error, LINK_FIX)));
      continue;
    }

    const isScope =
      name.startsWith('@') &&
      (yield* fs.stat(from).pipe(
        Effect.map((info) => info.type === 'Directory'),
        Effect.orElseSucceed(() => false),
      ));
    if (isScope) {
      yield* linkFolder(from, to, sourceRoot, targetRoot);
    } else {
      yield* fs
        .symlink(from, to)
        .pipe(Effect.mapError((error) => fileSystemError('link', to, error, LINK_FIX)));
    }
  }
});

/**
 * Fails when the target, or any folder between the checkout's root and it, is a symbolic link.
 * Nothing is created through a link: the base revision's code is untrusted, and a link it commits
 * would send the new folders and links outside the checkout.
 *
 * @param targetRoot - The workspace root of the checkout.
 * @param target - The folder about to be created or filled.
 * @throws CliError in the error channel naming the link.
 */
const assertNoLinkOnPath = Effect.fn('assertNoLinkOnPath')(function* (
  targetRoot: string,
  target: string,
): Effect.fn.Return<void, CliError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  let current = targetRoot;
  for (const segment of path.relative(targetRoot, target).split(path.sep)) {
    current = path.join(current, segment);
    const info = yield* fs.lstat(current).pipe(Effect.option);
    if (Option.isSome(info) && info.value.type === 'SymbolicLink') {
      return yield* cliError(
        `The base revision has a symbolic link at ${path.relative(targetRoot, current)}, ` +
          'where the diff would link node_modules. The base revision is not rendered.\n' +
          'Remove the link from that revision, or compare against a folder of pictures with ' +
          '`--base <dir>`.',
      );
    }
  }
});

/**
 * Where a link should point in the checkout: a workspace package maps to the same folder under the
 * checkout; anything else (the package store) keeps its place.
 *
 * @param destination - The absolute path the original link resolves to.
 * @param sourceRoot - The workspace root of the source.
 * @param targetRoot - The workspace root of the checkout.
 */
function retarget(destination: string, sourceRoot: string, targetRoot: string): string {
  const relative = path.relative(sourceRoot, destination);
  const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (inside && !relative.split(path.sep).includes('node_modules')) {
    return path.join(targetRoot, relative);
  }

  return destination;
}
