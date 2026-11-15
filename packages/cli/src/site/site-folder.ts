import { Effect, FileSystem, Option, Result } from 'effect';
import path from 'node:path';

import {
  cliError,
  fileSystemError,
  usageError,
  type CliError,
  type FileSystemError,
} from '#cli-error.ts';

/**
 * The file the site builder writes into a site folder it made. A folder without it is never
 * replaced unless it is empty.
 */
export const SITE_MARKER = '.deck-site';

/**
 * What to do when the site folder cannot be written.
 */
const SITE_FIX = 'Pass `--out` a folder that can be written.';

/**
 * The workspace folders whose contents are sources. A site folder may not be one of them, contain
 * one or sit inside one.
 */
const SOURCE_FOLDERS = ['decks', 'brands', 'packages'] as const;

/**
 * Resolves a path through symbolic links as far as it exists, then appends the part that does not
 * exist yet.
 *
 * @param target - An absolute path that may not exist.
 */
export const resolveRealPath = Effect.fn('resolveRealPath')(function* (
  target: string,
): Effect.fn.Return<string, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  let current = target;
  const rest: string[] = [];
  for (;;) {
    const real = yield* fs.realPath(current).pipe(Effect.option);
    if (Option.isSome(real)) {
      return path.join(real.value, ...rest.toReversed());
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return target;
    }

    rest.push(path.basename(current));
    current = parent;
  }
});

/**
 * Whether `inner` is `outer` or inside it.
 *
 * @param outer - The enclosing absolute path.
 * @param inner - The absolute path to test.
 */
function isWithin(outer: string, inner: string): boolean {
  const relative = path.relative(outer, inner);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Refuses a site folder that would put sources at risk: the workspace root, a folder that contains
 * it, or the folder of `decks/`, `brands/` or `packages/`, anything inside them (a deck's own
 * folder included), and anything that contains them. Symbolic links are resolved first.
 *
 * @param workspaceRoot - The workspace root.
 * @param out - The absolute site folder, which need not exist.
 * @returns The site folder with its links resolved.
 * @throws CliError in the error channel when the folder is unsafe.
 */
export const checkSiteFolder = Effect.fn('checkSiteFolder')(function* (
  workspaceRoot: string,
  out: string,
): Effect.fn.Return<string, CliError, FileSystem.FileSystem> {
  const realOut = yield* resolveRealPath(out);
  const realRoot = yield* resolveRealPath(workspaceRoot);
  /**
   * The usage error for an unsafe folder.
   */
  const refuse = (why: string) =>
    usageError(
      `--out ${out} is not a safe site folder: ${why}. ` +
        'The build replaces the folder, so it would delete sources. ' +
        'Use a folder of its own such as `site`.',
      'build',
    );
  if (isWithin(realOut, realRoot)) {
    return yield* refuse('it is the workspace root or contains it');
  }

  for (const name of SOURCE_FOLDERS) {
    const folder = path.join(realRoot, name);
    if (isWithin(folder, realOut)) {
      return yield* refuse(`it is \`${name}/\` or inside it`);
    }

    if (isWithin(realOut, folder)) {
      return yield* refuse(`it contains \`${name}/\``);
    }
  }

  return realOut;
});

/**
 * Whether a folder may be replaced by a site: it is absent, empty, or carries the marker the site
 * builder writes.
 *
 * @param out - The absolute site folder.
 * @throws CliError in the error channel when the folder holds something that is not a site.
 */
export const checkReplaceable = Effect.fn('checkReplaceable')(function* (
  out: string,
): Effect.fn.Return<boolean, CliError | FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const info = yield* fs.lstat(out).pipe(
    Effect.map(Option.some),
    Effect.catch((error) =>
      error.reason._tag === 'NotFound'
        ? Effect.succeed(Option.none())
        : Effect.fail(fileSystemError('inspect the site folder', out, error, SITE_FIX)),
    ),
  );
  if (Option.isNone(info)) {
    return false;
  }

  if (info.value.type !== 'Directory') {
    return yield* cliError(`${out} is not a plain folder, so it is not replaced.`);
  }

  const names = yield* fs
    .readDirectory(out)
    .pipe(
      Effect.mapError((error) => fileSystemError('read the site folder', out, error, SITE_FIX)),
    );
  if (names.length === 0) {
    return true;
  }

  if (names.includes(SITE_MARKER)) {
    const marker = yield* fs
      .lstat(path.join(out, SITE_MARKER))
      .pipe(
        Effect.mapError((error) =>
          fileSystemError('inspect the site marker', out, error, SITE_FIX),
        ),
      );
    if (marker.type === 'File') {
      return true;
    }
  }

  return yield* cliError(
    `${out} already holds files that a site build did not write, so it is not replaced. ` +
      'Pass an empty or new `--out` folder, or delete this one first.',
  );
});

/**
 * The unique sibling folder owned by one site build and its unpublished and previous sites.
 */
export type SiteTransaction = {
  /**
   * The unique sibling directory owned by this build.
   */
  readonly directory: string;

  /**
   * The new site before publication, inside the owned directory.
   */
  readonly staging: string;

  /**
   * The previous site retained during publication and failed recovery.
   */
  readonly previous: string;
};

/**
 * Creates a unique sibling transaction; existing siblings are never removed or reused.
 *
 * @param out - The checked absolute destination.
 * @throws FileSystemError when the transaction cannot be created.
 */
export const createSiteTransaction = Effect.fn('createSiteTransaction')(function* (
  out: string,
): Effect.fn.Return<SiteTransaction, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const parent = path.dirname(out);
  yield* fs
    .makeDirectory(parent, { recursive: true })
    .pipe(
      Effect.mapError((error) =>
        fileSystemError('create the site parent', parent, error, SITE_FIX),
      ),
    );
  const directory = yield* fs
    .makeTempDirectory({
      directory: parent,
      prefix: `.${path.basename(out)}-`,
    })
    .pipe(
      Effect.mapError((error) =>
        fileSystemError('create the site transaction', out, error, SITE_FIX),
      ),
    );
  return {
    directory,
    staging: path.join(directory, 'new'),
    previous: path.join(directory, 'previous'),
  };
});

/**
 * Removes only the directory owned by this build, reporting its path if cleanup fails.
 *
 * @param transaction - The transaction created for this build.
 * @throws FileSystemError when cleanup fails; the retained path is included in the message.
 */
export const removeSiteTransaction = Effect.fn('removeSiteTransaction')(function* (
  transaction: SiteTransaction,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .remove(transaction.directory, { recursive: true, force: true })
    .pipe(
      Effect.mapError((error) =>
        fileSystemError(
          'clean up the site transaction',
          transaction.directory,
          error,
          `The site transaction remains at ${transaction.directory}; ` +
            'inspect it before removing it.',
        ),
      ),
    );
});

/**
 * Rechecks the destination and publishes a completed site without interruption between moving the
 * previous site and restoring it after a failed publication. A failed restore retains both sites.
 *
 * @param transaction - The owned transaction containing the completed new site.
 * @param out - The checked absolute destination.
 * @param workspaceRoot - The workspace whose sources must be protected.
 * @throws CliError for an unsafe destination or failed restore; FileSystemError for publication or
 *   cleanup failures. Failed restores include the recovery path and leave it untouched.
 */
export const swapSite = Effect.fn('swapSite')(function* (
  transaction: SiteTransaction,
  out: string,
  workspaceRoot: string,
): Effect.fn.Return<void, CliError | FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const hadOld = yield* checkDestination(workspaceRoot, out).pipe(
    Effect.tapError(() => removeSiteTransaction(transaction)),
  );
  if (hadOld) {
    yield* fs.rename(out, transaction.previous).pipe(
      Effect.mapError((error) =>
        fileSystemError('preserve the previous site', out, error, SITE_FIX),
      ),
      Effect.tapError(() => removeSiteTransaction(transaction)),
    );
  }

  const published = yield* fs.rename(transaction.staging, out).pipe(Effect.result);
  if (Result.isFailure(published)) {
    if (hadOld) {
      const restored = yield* restoreSite(transaction.previous, out);
      if (!restored) {
        return yield* cliError(
          `Could not publish ${out} or restore its previous site. ` +
            `The previous site is preserved at ${transaction.previous}; ` +
            `the new site is at ${transaction.staging}. Restore the previous site manually.`,
        );
      }
    }

    yield* removeSiteTransaction(transaction);
    return yield* fileSystemError('replace the site folder', out, published.failure, SITE_FIX);
  }

  yield* removeSiteTransaction(transaction);
}, Effect.uninterruptible);

/**
 * Revalidates source protection and replacement ownership immediately before publication.
 */
const checkDestination = Effect.fn('checkDestination')(function* (
  workspaceRoot: string,
  out: string,
): Effect.fn.Return<boolean, CliError | FileSystemError, FileSystem.FileSystem> {
  const checked = yield* checkSiteFolder(workspaceRoot, out);
  if (checked !== out) {
    return yield* cliError(
      `The site destination ${out} changed during the build, so it is not replaced.`,
    );
  }

  return yield* checkReplaceable(out);
});

/**
 * Restores the previous site only while the failed publication's destination is still absent.
 */
const restoreSite = Effect.fn('restoreSite')(function* (
  previous: string,
  out: string,
): Effect.fn.Return<boolean, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* Effect.gen(function* () {
    // A destination created after publication failed belongs to someone else.
    const destination = yield* fs.lstat(out).pipe(
      Effect.map(Option.some),
      Effect.catch((error) =>
        error.reason._tag === 'NotFound' ? Effect.succeed(Option.none()) : Effect.fail(error),
      ),
    );
    if (Option.isSome(destination)) {
      return false;
    }

    yield* fs.rename(previous, out);
    return true;
  }).pipe(Effect.orElseSucceed(() => false));
});
