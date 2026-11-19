import { brandLocation, BRANDS_DIR } from '@deckster/brand/node';
import { Console, Effect, FileSystem, Result } from 'effect';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { cliError, fileSystemError, type CliError, type FileSystemError } from '#cli-error.ts';

/**
 * What to check when a filesystem operation fails.
 */
const INSTALL_FIX = 'Check that the brands folder is writable, then try again.';

/**
 * Milliseconds between nonblocking attempts to take an already-held lock.
 */
const LOCK_RETRY_MS = 50;

/**
 * The SQLite result code for an operation blocked by another connection.
 */
const SQLITE_BUSY = 5;

/**
 * The paths owned by an installer while it holds the lock for this brand. They live under `brands/`
 * so a workspace that mounts `brands/` on another filesystem can still publish by rename.
 */
type InstallPaths = {
  /**
   * The persistent SQLite lock file for this brand.
   */
  lock: string;

  /**
   * The temporary workspace used to stage and validate the brand.
   */
  stageRoot: string;

  /**
   * The staged brand directory, consumed by publication.
   */
  staged: string;

  /**
   * The final brand directory in the real workspace.
   */
  target: string;

  /**
   * The intact backup of the previous brand during publication and recovery.
   */
  previous: string;

  /**
   * The previous brand after publication, safe to delete with the staging tree.
   */
  retired: string;
};

/**
 * The source and whether it may replace a brand found at publication time.
 */
type InstallOptions = {
  /**
   * The source as the author wrote it, for the replacement error.
   */
  source: string;

  /**
   * Whether this install may replace an existing target.
   */
  force: boolean;
};

/**
 * Serializes installation of a validated brand name across CLI processes. `prepare` populates and
 * validates the staged `brands/<name>/` under the supplied root. The completed directory is then
 * published by rename. On error or interruption, any previous brand is restored or retained for
 * recovery, and the lock is released.
 *
 * @param root - The workspace root.
 * @param name - A validated brand name.
 * @param options - The source and replacement permission.
 * @param prepare - The effect that writes and validates the staged brand.
 * @returns The preparation result and whether the installation replaced an existing brand.
 * @throws CliError when replacement is refused, the lock cannot be taken, or recovery needs help;
 *   FileSystemError for file operations; errors from `prepare` as-is.
 */
export function installBrand<A, E, R>(
  root: string,
  name: string,
  options: InstallOptions,
  prepare: (stageRoot: string) => Effect.Effect<A, E, R>,
): Effect.Effect<
  { prepared: A; replaced: boolean },
  CliError | FileSystemError | E,
  FileSystem.FileSystem | R
> {
  return Effect.scoped(
    Effect.gen(function* () {
      const paths = installPaths(root, name);
      yield* createInstallDirectory(root, name);
      yield* acquireInstallLock(paths.lock);
      yield* recoverInstall(paths);
      yield* Effect.addFinalizer(() => cleanStaging(paths));
      yield* checkTarget(paths, name, options);
      const prepared = yield* prepare(paths.stageRoot);
      const replaced = yield* publishBrand(paths, name, options);
      return { prepared, replaced };
    }),
  );
}

/**
 * Builds the transaction paths for a validated brand name.
 *
 * @param root - The workspace root.
 * @param name - The validated brand name.
 */
function installPaths(root: string, name: string): InstallPaths {
  const directory = path.join(root, BRANDS_DIR, '.deck', 'brand-add', name);
  const stageRoot = path.join(directory, 'stage');
  return {
    lock: path.join(directory, 'lock.sqlite'),
    stageRoot,
    staged: brandLocation(stageRoot, name).dir,
    target: brandLocation(root, name).dir,
    previous: path.join(directory, 'previous'),
    retired: path.join(stageRoot, 'retired'),
  };
}

/**
 * Creates only real directories below the workspace's brands folder. The brands folder itself may
 * point to another filesystem, but transaction paths must not redirect recovery or cleanup.
 *
 * @param root - The workspace root.
 * @param name - The validated brand name.
 */
const createInstallDirectory = Effect.fn('createInstallDirectory')(function* (
  root: string,
  name: string,
) {
  const fs = yield* FileSystem.FileSystem;
  let directory = path.join(root, BRANDS_DIR);
  yield* fs
    .makeDirectory(directory, { recursive: true })
    .pipe(Effect.mapError((error) => fileSystemError('create', directory, error, INSTALL_FIX)));

  for (const component of ['.deck', 'brand-add', name]) {
    directory = path.join(directory, component);
    yield* fs.makeDirectory(directory).pipe(
      Effect.catch((error) => {
        if (error.reason._tag === 'AlreadyExists') {
          return Effect.void;
        }

        return Effect.fail(fileSystemError('create', directory, error, INSTALL_FIX));
      }),
    );
    const entry = yield* fs
      .lstat(directory)
      .pipe(Effect.mapError((error) => fileSystemError('inspect', directory, error, INSTALL_FIX)));
    if (entry.type !== 'Directory') {
      return yield* cliError(
        `Brand installation requires a real directory at ${directory}. ` +
          'Move the existing entry somewhere safe before trying again.',
      );
    }
  }
});

/**
 * Holds SQLite’s write lock until the scope closes; waiting for the lock is interruptible.
 *
 * @param file - The persistent file shared by installers of this brand.
 */
const acquireInstallLock = Effect.fn('acquireInstallLock')(function* (file: string) {
  // Keep the file in place: removing it could let two processes lock different inodes. SQLite
  // releases the lock when the connection closes or the process dies, with no stale PID to steal.
  const database = yield* Effect.acquireRelease(
    Effect.try({
      try: () => new DatabaseSync(file, { timeout: 0 }),
      catch: (error) => lockError(file, error),
    }),
    (connection) => Effect.sync(() => connection.close()),
  );
  for (;;) {
    const locked = yield* Effect.try({
      try: () => database.exec('BEGIN IMMEDIATE'),
      catch: (error) => error,
    }).pipe(Effect.result);
    if (Result.isSuccess(locked)) {
      return;
    }

    const error = locked.failure;
    if (!(error instanceof Error && 'errcode' in error && error.errcode === SQLITE_BUSY)) {
      return yield* lockError(file, error);
    }

    yield* Effect.sleep(LOCK_RETRY_MS);
  }
});

/**
 * Reports a lock failure with its path and cause.
 *
 * @param file - The lock file.
 * @param error - The SQLite error.
 */
function lockError(file: string, error: unknown): CliError {
  const detail = error instanceof Error ? error.message : String(error);
  return cliError(`Could not lock brand installation at ${file}: ${detail}.\n${INSTALL_FIX}`);
}

/**
 * Resolves an interrupted transaction before a new staging tree is created.
 *
 * @param paths - The transaction paths, protected by the held lock.
 */
const recoverInstall = Effect.fn('recoverInstall')(function* (paths: InstallPaths) {
  if (yield* entryExists(paths.previous)) {
    const fix = recoveryFix(paths);
    if (!(yield* entryExists(paths.target, fix))) {
      yield* restorePrevious(paths);
    } else {
      // Publishing consumes the staged directory in the same rename that creates the target.
      // If both exist then the destination was created outside this transaction. Keep the backup.
      if (yield* entryExists(paths.staged, fix)) {
        return yield* blockedRecovery(paths);
      }

      yield* retirePrevious(paths);
    }
  }

  yield* removeStaging(paths);
}, Effect.uninterruptible);

/**
 * Checks the live destination and refuses to replace it without permission.
 *
 * @param paths - The transaction paths, protected by the held lock.
 * @param name - The validated brand name.
 * @param options - The source and replacement permission.
 */
const checkTarget = Effect.fn('checkTarget')(function* (
  paths: InstallPaths,
  name: string,
  options: InstallOptions,
) {
  const exists = yield* entryExists(paths.target);
  if (exists && !options.force) {
    return yield* cliError(
      `The workspace already has ${BRANDS_DIR}/${name}/.\n` +
        `Pass --force to replace it with the brand from ${options.source}.`,
    );
  }

  return exists;
});

/**
 * Swaps in a completed brand. Defer interruption until publication or restoration completes.
 *
 * @param paths - The transaction paths, protected by the held lock.
 * @param name - The validated brand name.
 * @param options - The source and replacement permission.
 */
const publishBrand = Effect.fn('publishBrand')(function* (
  paths: InstallPaths,
  name: string,
  options: InstallOptions,
) {
  const fs = yield* FileSystem.FileSystem;
  const replaced = yield* checkTarget(paths, name, options);
  if (replaced) {
    yield* fs
      .rename(paths.target, paths.previous)
      .pipe(
        Effect.mapError((error) => fileSystemError('preserve', paths.target, error, INSTALL_FIX)),
      );
  }

  const published = yield* fs.rename(paths.staged, paths.target).pipe(Effect.result);
  if (Result.isFailure(published)) {
    if (replaced) {
      yield* restorePrevious(paths);
    }

    return yield* fileSystemError('install', paths.target, published.failure, INSTALL_FIX);
  }

  if (replaced) {
    yield* retirePrevious(paths);
  }

  return replaced;
}, Effect.uninterruptible);

/**
 * Restores the intact backup when the target is empty and reports where it remains on failure.
 *
 * @param paths - The transaction paths, protected by the held lock.
 */
const restorePrevious = Effect.fn('restorePrevious')(function* (paths: InstallPaths) {
  const fs = yield* FileSystem.FileSystem;
  const fix = recoveryFix(paths);
  if (yield* entryExists(paths.target, fix)) {
    return yield* blockedRecovery(paths);
  }

  yield* fs
    .rename(paths.previous, paths.target)
    .pipe(
      Effect.mapError((error) =>
        fileSystemError('restore the previous brand to', paths.target, error, fix),
      ),
    );
});

/**
 * Moves the backup out of recovery once the staged brand has been published.
 *
 * @param paths - The transaction paths, protected by the held lock.
 */
const retirePrevious = Effect.fn('retirePrevious')(function* (paths: InstallPaths) {
  const fs = yield* FileSystem.FileSystem;
  // Rename before recursive cleanup so a process killed during deletion cannot leave a partially
  // deleted tree at the recovery path.
  yield* fs
    .rename(paths.previous, paths.retired)
    .pipe(
      Effect.mapError((error) =>
        fileSystemError('clean up the previous brand at', paths.previous, error, INSTALL_FIX),
      ),
    );
});

/**
 * Reports the conflict when recovery finds an unexpected destination.
 *
 * @param paths - The transaction paths, including the retained backup.
 */
function blockedRecovery(paths: InstallPaths): CliError {
  return cliError(
    `Could not restore the previous brand because ${paths.target} exists.\n` + recoveryFix(paths),
  );
}

/**
 * Tells the author how to resolve a recovery conflict without losing the original brand.
 *
 * @param paths - The transaction paths, including the retained backup.
 */
function recoveryFix(paths: InstallPaths): string {
  return (
    `The previous brand is preserved at ${paths.previous}. ` +
    `Restore it to ${paths.target} or move it somewhere safe before trying again.`
  );
}

/**
 * Removes staging on scope exit if there is no backup awaiting recovery.
 *
 * @param paths - The transaction paths, protected by the held lock.
 */
const cleanStaging = Effect.fn('cleanStaging')(
  function* (paths: InstallPaths) {
    // Leave the staged directory in place while a backup needs recovery. Its presence tells the
    // next process that publication did not happen, even if another writer created a target.
    if (!(yield* entryExists(paths.previous))) {
      yield* removeStaging(paths);
    }
  },
  (effect) =>
    effect.pipe(
      Effect.tapError((error) => Console.error(error.message)),
      Effect.ignore,
    ),
);

/**
 * Removes staging and any retired backup, reporting an error if cleanup fails.
 *
 * @param paths - The transaction paths, protected by the held lock.
 */
const removeStaging = Effect.fn('removeStaging')(function* (paths: InstallPaths) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .remove(paths.stageRoot, { recursive: true, force: true })
    .pipe(
      Effect.mapError((error) =>
        fileSystemError('clean up staging at', paths.stageRoot, error, INSTALL_FIX),
      ),
    );
});

/**
 * Checks for any directory entry, including a dangling symbolic link.
 *
 * @param file - The path to inspect.
 * @param fix - What to tell the author if the path is inaccessible.
 */
const entryExists = Effect.fn('brandInstallEntryExists')(function* (
  file: string,
  fix = INSTALL_FIX,
) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.lstat(file).pipe(
    Effect.as(true),
    Effect.catch((error) => {
      if (error.reason._tag === 'NotFound') {
        return Effect.succeed(false);
      }

      return Effect.fail(fileSystemError('inspect', file, error, fix));
    }),
  );
});
