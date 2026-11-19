import { Effect, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import path from 'node:path';

import type { BrandSource } from '#brand-add/brand-source.ts';

import { cliError, type CliError } from '#cli-error.ts';

/**
 * The file a pnpm workspace keeps its version catalog in, fetched with the brand so its `catalog:`
 * dependencies can be given real versions.
 */
export const WORKSPACE_MANIFEST = 'pnpm-workspace.yaml';

/**
 * How git may reach a repository: over the network only. `file` is for tests that fetch from a
 * repository on disk.
 */
export type GitProtocol = 'https' | 'ssh' | 'file';

/**
 * The protocols a brand fetch allows: both network protocols, so a `url.<base>.insteadOf` rule that
 * turns an https address into an SSH one keeps working, and nothing that reads local paths or runs
 * commands (`file`, `ext`).
 */
export const NETWORK_PROTOCOLS: readonly GitProtocol[] = ['https', 'ssh'];

/**
 * A full SHA-1 or SHA-256 commit hash, which is fetched as it is instead of being looked up.
 */
const COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * The characters of a commit hash shown in messages.
 */
const SHORT_COMMIT_LENGTH = 7;

/**
 * How long one git command that talks to the repository may take, in seconds. It is generous, so an
 * SSH agent that asks for approval or a slow network has time, but a stalled connection does not
 * wait forever.
 */
const NETWORK_TIMEOUT_SECONDS = 120;

/**
 * The git commands that talk to the repository, which {@link NETWORK_TIMEOUT_SECONDS} bounds.
 */
const NETWORK_COMMANDS = new Set(['ls-remote', 'fetch', 'checkout']);

/**
 * The whitespace between the fields of a `git ls-tree` entry.
 */
const FIELD_SEPARATOR = /\s+/;

/**
 * The suffix `git ls-remote` gives the commit an annotated tag points at.
 */
const PEELED_SUFFIX = '^{}';

/**
 * The file mode git gives a symbolic link.
 */
const SYMLINK_MODE = '120000';

/**
 * Environment for every git command: never ask for a user name or password on the terminal, so a
 * private repository without credentials fails instead of waiting for input.
 */
const GIT_ENV = {
  /**
   * Turns off git's own prompts; SSH may still ask for a passphrase or a host key on the terminal.
   */
  GIT_TERMINAL_PROMPT: '0',
};

/**
 * What to tell the author when git cannot reach or read the repository.
 */
const ACCESS_FIX =
  'Check the address and the ref. For a private repository, make sure ' +
  '`git ls-remote <address>` works in this terminal: sign in with `gh auth login` for an https ' +
  'address, or load your SSH key for a git@ address.';

/**
 * One file of the fetched brand folder, as git lists it.
 */
export type FetchedFile = {
  /**
   * The path inside the brand folder, with `/` separators.
   */
  path: string;

  /**
   * The size in bytes.
   */
  bytes: number;

  /**
   * Whether git stores it as a symbolic link, which is never copied.
   */
  symlink: boolean;
};

/**
 * A brand folder fetched from its repository.
 */
export type FetchedBrand = {
  /**
   * The absolute folder of the checkout.
   */
  checkout: string;

  /**
   * The absolute brand folder inside the checkout.
   */
  dir: string;

  /**
   * The full commit hash the files come from.
   */
  commit: string;

  /**
   * Every file git keeps under the brand folder.
   */
  files: readonly FetchedFile[];
};

/**
 * A finished git command's status and data on standard output.
 */
type GitResult = {
  /**
   * The exit code.
   */
  code: number;

  /**
   * Standard output.
   */
  stdout: string;
};

/**
 * Fetches one folder of a repository at one commit into an empty folder, without its history and
 * without the blobs of any other folder: the ref is resolved to a commit with `git ls-remote`, that
 * commit alone is fetched with a partial clone, and a sparse checkout writes the brand folder and
 * the repository's `pnpm-workspace.yaml`. Git may use only the allowed protocols, writes symbolic
 * links as plain files and fetches no submodules. It runs the user's own git, so their credential
 * helper, SSH agent and `url.<base>.insteadOf` rules apply.
 *
 * @param source - The repository, folder and ref.
 * @param into - An empty folder for the checkout.
 * @param protocols - The protocols git may use; {@link NETWORK_PROTOCOLS} by default.
 * @returns The checkout, the brand folder, the commit and the folder's files.
 * @throws CliError in the error channel when git is not installed, cannot reach the repository,
 *   does not find the ref, or the commit has no such folder.
 */
export const fetchBrand = Effect.fn('fetchBrand')(function* (
  source: BrandSource,
  into: string,
  protocols: readonly GitProtocol[] = NETWORK_PROTOCOLS,
): Effect.fn.Return<FetchedBrand, CliError, ChildProcessSpawner.ChildProcessSpawner> {
  const git = gitIn(protocols);
  const commit = yield* resolveCommit(source, git(into));
  yield* checkoutFolder(source, commit, git(into));
  const files = yield* listFiles(source, commit, git(into));
  if (files.length === 0) {
    return yield* cliError(
      `There is no folder "${source.folder}" in ${source.remote} at ${shortCommit(commit)}.\n` +
        'Check the path after the repository, and the ref.',
    );
  }

  return { checkout: into, dir: path.join(into, source.folder), commit, files };
});

/**
 * Fails a git command that talks to the repository when it takes longer than
 * {@link NETWORK_TIMEOUT_SECONDS}; interrupting it ends the git process.
 *
 * @param run - The git command.
 * @param command - Its name, for the message.
 */
function withNetworkTimeout(
  run: Effect.Effect<GitResult, CliError, ChildProcessSpawner.ChildProcessSpawner>,
  command: string,
): Effect.Effect<GitResult, CliError, ChildProcessSpawner.ChildProcessSpawner> {
  return run.pipe(
    Effect.timeoutOrElse({
      duration: `${NETWORK_TIMEOUT_SECONDS} seconds`,
      orElse: () =>
        Effect.fail(
          cliError(
            `git ${command} got no answer in ${NETWORK_TIMEOUT_SECONDS} seconds.\n` +
              'For a git@ address, check that your SSH agent is unlocked and approves the key ' +
              '(`ssh -T git@github.com`); otherwise check the network and the address.',
          ),
        ),
    }),
  );
}

/**
 * The abbreviated form of a commit hash, for messages.
 *
 * @param commit - The full hash.
 * @returns Its first seven characters.
 */
export function shortCommit(commit: string): string {
  return commit.slice(0, SHORT_COMMIT_LENGTH);
}

/**
 * Runs git in a folder with the hardening every brand fetch uses.
 */
type Git = (
  args: readonly string[],
) => Effect.Effect<GitResult, CliError, ChildProcessSpawner.ChildProcessSpawner>;

/**
 * Builds the git runner for a fetch: every command gets `-c` options that allow only the given
 * protocols and turn off symbolic links and submodules.
 *
 * @param protocols - The protocols git may use.
 * @returns A function from a folder to the runner in that folder.
 */
function gitIn(protocols: readonly GitProtocol[]): (cwd: string) => Git {
  const config = [
    '-c',
    'protocol.allow=never',
    ...protocols.flatMap((protocol) => ['-c', `protocol.${protocol}.allow=always`]),
    '-c',
    'core.symlinks=false',
    '-c',
    'submodule.recurse=false',
  ];
  return (cwd) => (args) => {
    const run = runGit(cwd, [...config, ...args]);
    const command = args[0] ?? '';
    return NETWORK_COMMANDS.has(command) ? withNetworkTimeout(run, command) : run;
  };
}

/**
 * The commit a source's ref names: a full hash as it is; otherwise the tag (the commit it points
 * at, for an annotated tag) or the branch of that exact name, or the default branch without a ref.
 *
 * @param source - The repository and ref.
 * @param git - The git runner.
 * @throws CliError in the error channel when the repository cannot be read or has no such ref.
 */
const resolveCommit = Effect.fn('resolveCommit')(function* (
  source: BrandSource,
  git: Git,
): Effect.fn.Return<string, CliError, ChildProcessSpawner.ChildProcessSpawner> {
  const { ref } = source;
  if (ref !== undefined && COMMIT_PATTERN.test(ref)) {
    return ref;
  }

  const wanted =
    ref === undefined
      ? ['HEAD']
      : [`refs/tags/${ref}${PEELED_SUFFIX}`, `refs/tags/${ref}`, `refs/heads/${ref}`];
  const listed = yield* git(['ls-remote', '--', source.remote, ...wanted]);
  if (listed.code !== 0) {
    return yield* cliError(
      `git could not read ${source.remote} (git ls-remote exited with ${listed.code}).\n` +
        ACCESS_FIX,
    );
  }

  const commits = new Map<string, string>();
  for (const line of listed.stdout.split('\n')) {
    const [hash, name] = line.split('\t');
    if (hash !== undefined && name !== undefined && COMMIT_PATTERN.test(hash)) {
      commits.set(name, hash);
    }
  }

  const commit = wanted.map((name) => commits.get(name)).find((hash) => hash !== undefined);
  if (commit === undefined) {
    return yield* cliError(
      `${source.remote} has no branch or tag "${ref ?? 'HEAD'}".\n` +
        'Name a branch, a tag or a full commit hash after #.',
    );
  }

  return commit;
});

/**
 * Fetches one commit without history or blobs, then checks out the brand folder and the workspace
 * manifest only.
 *
 * @param source - The repository and folder.
 * @param commit - The full commit hash.
 * @param git - The git runner in the empty checkout folder.
 * @throws CliError in the error channel when any step fails.
 */
const checkoutFolder = Effect.fn('checkoutFolder')(function* (
  source: BrandSource,
  commit: string,
  git: Git,
): Effect.fn.Return<void, CliError, ChildProcessSpawner.ChildProcessSpawner> {
  const patterns = source.folder === '' ? ['/*'] : [`/${source.folder}/`, `/${WORKSPACE_MANIFEST}`];
  const steps: readonly (readonly [string, ...string[]])[] = [
    ['init', '--quiet'],
    ['remote', 'add', 'origin', source.remote],
    ['fetch', '--quiet', '--depth', '1', '--filter=blob:none', '--no-tags', 'origin', commit],
    ['sparse-checkout', 'set', '--no-cone', '--', ...patterns],
    ['checkout', '--quiet', commit],
  ];
  for (const step of steps) {
    const result = yield* git(step);
    if (result.code !== 0) {
      return yield* cliError(
        `git could not fetch ${source.remote} at ${shortCommit(commit)} ` +
          `(git ${step[0]} exited with ${result.code}).\n${ACCESS_FIX}`,
      );
    }
  }
});

/**
 * The files git keeps under the brand folder at the commit, with their sizes and whether each is a
 * symbolic link. Submodules are left out.
 *
 * @param source - The folder.
 * @param commit - The full commit hash.
 * @param git - The git runner in the checkout.
 * @throws CliError in the error channel when git cannot list the tree.
 */
const listFiles = Effect.fn('listFiles')(function* (
  source: BrandSource,
  commit: string,
  git: Git,
): Effect.fn.Return<FetchedFile[], CliError, ChildProcessSpawner.ChildProcessSpawner> {
  const scope = source.folder === '' ? [] : ['--', `${source.folder}/`];
  const listed = yield* git(['ls-tree', '-r', '-l', '-z', '--full-tree', commit, ...scope]);
  if (listed.code !== 0) {
    return yield* cliError(
      `git could not list the files of ${source.remote} (git ls-tree exited with ${listed.code}).`,
    );
  }

  const prefix = source.folder === '' ? '' : `${source.folder}/`;
  return listed.stdout.split('\0').flatMap((entry) => {
    const file = readTreeEntry(entry, prefix);
    return file === undefined ? [] : [file];
  });
});

/**
 * Reads one `git ls-tree -l` entry: `<mode> <type> <object> <size>\t<path>`.
 *
 * @param entry - The entry, without its NUL terminator.
 * @param prefix - The brand folder with a trailing `/`, cut from the path; empty at the root.
 * @returns The file, or `undefined` for an empty entry or one that is not a blob.
 */
function readTreeEntry(entry: string, prefix: string): FetchedFile | undefined {
  const tab = entry.indexOf('\t');
  if (tab === -1) {
    return undefined;
  }

  const [mode, type, , size] = entry.slice(0, tab).split(FIELD_SEPARATOR);
  const fullPath = entry.slice(tab + 1);
  if (type !== 'blob' || !fullPath.startsWith(prefix)) {
    return undefined;
  }

  return {
    path: fullPath.slice(prefix.length),
    bytes: Number(size),
    symlink: mode === SYMLINK_MODE,
  };
}

/**
 * Runs git in a folder to completion, with {@link GIT_ENV} added to the user's environment (which
 * keeps `PATH`, `HOME` and `SSH_AUTH_SOCK`). Git, its credential helpers and its transports can
 * include credentials in diagnostics, such as when `insteadOf` rewrites the address.
 *
 * @param cwd - The folder to run in.
 * @param args - The arguments after `git`.
 * @throws CliError in the error channel when git cannot be started.
 */
const runGit = Effect.fn('runGit')(function* (
  cwd: string,
  args: readonly string[],
): Effect.fn.Return<GitResult, CliError, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const command = ChildProcess.make('git', [...args], {
    cwd,
    env: GIT_ENV,
    extendEnv: true,
    stderr: 'ignore',
  });
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      const [stdout, code] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 'unbounded' },
      );
      return { code: Number(code), stdout };
    }),
  ).pipe(Effect.mapError(() => cliError('Could not run `git`. Install git, then try again.')));
});
