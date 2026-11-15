import type { ChildProcessSpawner } from 'effect/process';

import { Effect, FileSystem, type Scope } from 'effect';
import os from 'node:os';
import path from 'node:path';

import {
  cliError,
  fileSystemError,
  firstLine,
  type CliError,
  type FileSystemError,
} from '#cli-error.ts';
import { linkNodeModules } from '#diff/link-node-modules.ts';
import { runGit, runProcess } from '#diff/run-git.ts';

/**
 * Extracts a git revision of the workspace into a temporary folder and prepares it to run: the
 * files come from `git archive`, so the repository itself is never touched (no worktree, no
 * checkout, no stash), and the folder gets the workspace's installed dependencies by link, so
 * nothing is installed. The folder is deleted when the scope closes.
 *
 * @param root - The workspace root, inside a git work tree.
 * @param ref - A branch, tag or commit.
 * @returns The absolute path of the extracted workspace.
 * @throws CliError in the error channel when git does not know the ref, cannot archive it or `tar`
 *   cannot extract it; FileSystemError when the temporary folder cannot be created.
 */
export const checkoutRef = Effect.fn('checkoutRef')(function* (
  root: string,
  ref: string,
): Effect.fn.Return<
  string,
  CliError | FileSystemError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const fs = yield* FileSystem.FileSystem;
  yield* requireKnownRef(root, ref);
  const prefix = (yield* runGit(root, ['rev-parse', '--show-prefix'])).stdout.trim();
  const temporary = yield* makeBaseFolder();
  const target = path.join(temporary, 'workspace');
  yield* fs
    .makeDirectory(target)
    .pipe(Effect.mapError((error) => fileSystemError('create', target, error, 'Try again.')));
  yield* extractRef(root, ref, prefix, temporary, target);

  yield* linkNodeModules(root, target);
  return target;
});

/**
 * Fails unless git knows the ref as a commit in this workspace.
 *
 * @param root - The workspace root.
 * @param ref - A branch, tag or commit.
 * @throws CliError in the error channel when git does not know the ref.
 */
const requireKnownRef = Effect.fn('requireKnownRef')(function* (
  root: string,
  ref: string,
): Effect.fn.Return<void, CliError, ChildProcessSpawner.ChildProcessSpawner> {
  const known = yield* runGit(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (known.code !== 0) {
    return yield* cliError(
      `Git does not know "${ref}" in this workspace.\n` +
        'Pass a branch, tag or commit, or a folder of baseline pictures ' +
        'with `--base <dir>`. In CI, fetch the base branch first ' +
        '(`git fetch origin <branch>` or `fetch-depth: 0`).',
    );
  }
});

/**
 * Creates the temporary folder the revision is extracted into. Its name is its real path, because
 * Vite resolves symlinks and the deck plugin matches files by the real path.
 */
const makeBaseFolder = Effect.fn('makeBaseFolder')(function* (): Effect.fn.Return<
  string,
  FileSystemError,
  FileSystem.FileSystem | Scope.Scope
> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'deck-diff-base-' }).pipe(
    Effect.flatMap((dir) => fs.realPath(dir)),
    Effect.mapError((error) =>
      fileSystemError(
        'create a temporary folder in',
        os.tmpdir(),
        error,
        'Free some disk space, or compare against a folder of pictures with `--base <dir>`.',
      ),
    ),
  );
});

/**
 * Archives the ref's files with `git archive` (the workspace's subfolder only, when the workspace
 * is not the repository root) and unpacks them into the target folder.
 *
 * @param root - The workspace root.
 * @param ref - A branch, tag or commit.
 * @param prefix - The workspace's folder inside the repository, empty at the root.
 * @param temporary - The temporary folder that holds the archive.
 * @param target - The folder to unpack into.
 * @throws CliError in the error channel when git cannot archive the ref or `tar` cannot extract it.
 */
const extractRef = Effect.fn('extractRef')(function* (
  root: string,
  ref: string,
  prefix: string,
  temporary: string,
  target: string,
): Effect.fn.Return<void, CliError, ChildProcessSpawner.ChildProcessSpawner> {
  const archive = path.join(temporary, 'base.tar');
  const treeish = prefix === '' ? ref : `${ref}:${prefix}`;
  const packed = yield* runGit(root, ['archive', '--format=tar', '--output', archive, treeish]);
  if (packed.code !== 0) {
    return yield* cliError(`git could not archive "${ref}": ${firstLine(packed.stderr.trim())}`);
  }

  const unpacked = yield* runProcess('tar', temporary, ['-xf', archive, '-C', target]);
  if (unpacked.code !== 0) {
    return yield* cliError(`tar could not extract "${ref}": ${firstLine(unpacked.stderr.trim())}`);
  }
});
