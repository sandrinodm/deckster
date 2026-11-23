import { Effect, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import path from 'node:path';

import { docsError, type DocsError } from '#docs-error.ts';

/**
 * The package script that builds the CLI's start files and stages the framework into
 * `packages/cli/dist`, exactly as `npm pack` and `npm publish` do.
 */
const PACK_SCRIPT = ['--filter', '@deckster/cli', 'run', 'prepack'] as const;

/**
 * The start file of the packed CLI, relative to the workspace root: the `deckster` binary of the
 * published package.
 */
const PACKED_BIN = path.join('packages', 'cli', 'dist', 'deckster.js');

/**
 * The command `deckster present --help` names only in the repository's wording; the packed CLI,
 * worded for an npm install, never prints it.
 */
const REPOSITORY_WORDING = 'pnpm --filter @deckster/shell exec install-electron';

/**
 * How to start one `deckster`: a program and the arguments that come before the command line.
 */
export type DeckBinary = {
  /**
   * The program to start, such as the workspace's `deckster` binary or `node`.
   */
  readonly executable: string;

  /**
   * The arguments before the `deckster` command line, such as the packed CLI's start file; empty
   * for a `deckster` binary.
   */
  readonly prefix: readonly string[];
};

/**
 * Runs one `deckster` command line to completion in the workspace and gives what it printed. The
 * child inherits the environment with `DECK_ROOT` pinned to the workspace, so a `DECK_ROOT`
 * exported in the shell cannot point it at another workspace's decks.
 *
 * @param deck - The `deckster` to start.
 * @param root - The absolute workspace root, the child's folder and `DECK_ROOT`.
 * @param args - The arguments after `deckster`.
 * @returns Its standard output.
 * @throws DocsError in the error channel when it cannot start or exits with a non-zero code,
 *   carrying its standard error.
 */
export const deckOutput = Effect.fn('deckOutput')(function* (
  deck: DeckBinary,
  root: string,
  args: readonly string[],
): Effect.fn.Return<string, DocsError, ChildProcessSpawner.ChildProcessSpawner> {
  const line = `deckster ${args.join(' ')}`;
  const command = ChildProcess.make(deck.executable, [...deck.prefix, ...args], {
    cwd: root,
    env: { DECK_ROOT: root },
    extendEnv: true,
  });
  return yield* runToCompletion(command, line);
});

/**
 * Packs the CLI as `npm pack` does (its start files and the staged framework, in
 * `packages/cli/dist`), so its output is what the published package prints: help in the wording of
 * an npm install, and the version of the framework it ships. `packages/cli/dist` is build output
 * and is replaced.
 *
 * @param root - The absolute workspace root.
 * @returns How to start the packed `deckster`.
 * @throws DocsError in the error channel when `pnpm` cannot start, the pack fails or the packed
 *   CLI's help is in the repository's wording ({@link checkInstalledWording}).
 */
export const packCli = Effect.fn('packCli')(function* (
  root: string,
): Effect.fn.Return<DeckBinary, DocsError, ChildProcessSpawner.ChildProcessSpawner> {
  const command = ChildProcess.make('pnpm', [...PACK_SCRIPT], { cwd: root });
  yield* runToCompletion(command, `pnpm ${PACK_SCRIPT.join(' ')}`);
  const packed = { executable: process.execPath, prefix: [path.join(root, PACKED_BIN)] };
  yield* checkInstalledWording(packed, root);
  return packed;
});

/**
 * Checks that a `deckster` prints help in the wording of an npm install, as the docs' readers see
 * it, by looking for the repository's Electron download command in `deckster present --help`.
 *
 * @param deck - The `deckster` to ask.
 * @param root - The absolute workspace root.
 * @throws DocsError in the error channel when the run fails or the help is in the repository's
 *   wording, as when the packed CLI does not count as installed.
 */
export const checkInstalledWording = Effect.fn('checkInstalledWording')(function* (
  deck: DeckBinary,
  root: string,
): Effect.fn.Return<void, DocsError, ChildProcessSpawner.ChildProcessSpawner> {
  const help = yield* deckOutput(deck, root, ['present', '--help']);
  if (help.includes(REPOSITORY_WORDING)) {
    return yield* docsError(
      `\`deckster present --help\` names \`${REPOSITORY_WORDING}\`, the repository's wording; ` +
        'the CLI reference needs the wording of an npm install.',
    );
  }
});

/**
 * Runs a command to completion and gives its standard output.
 *
 * @param command - The command.
 * @param line - The command line, for messages.
 */
const runToCompletion = Effect.fn('runToCompletion')(function* (
  command: ChildProcess.Command,
  line: string,
): Effect.fn.Return<string, DocsError, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const run = Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      return yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: 'unbounded' },
      );
    }),
  );
  const [stdout, stderr, code] = yield* run.pipe(
    Effect.mapError((error) => docsError(`Could not run \`${line}\`: ${error.message}`)),
  );
  if (Number(code) !== 0) {
    return yield* docsError(`\`${line}\` exited with ${Number(code)}:\n${stderr.trim()}`);
  }

  return stdout;
});
