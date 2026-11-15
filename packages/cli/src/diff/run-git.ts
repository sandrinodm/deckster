import { Effect, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { cliError, type CliError } from '#cli-error.ts';

/**
 * What a finished process printed and exited with.
 */
export type ProcessResult = {
  /**
   * The exit code.
   */
  code: number;

  /**
   * Standard output.
   */
  stdout: string;

  /**
   * Standard error.
   */
  stderr: string;
};

/**
 * Runs a program in a folder to completion. A non-zero exit is a result, not a failure; callers
 * decide what it means.
 *
 * @param command - The program, such as `git` or `tar`.
 * @param cwd - The folder to run in.
 * @param args - The arguments.
 * @throws CliError in the error channel when the program cannot be started.
 */
export const runProcess = Effect.fn('runProcess')(function* (
  command: string,
  cwd: string,
  args: readonly string[],
): Effect.fn.Return<ProcessResult, CliError, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(ChildProcess.make(command, [...args], { cwd }));
      const [stdout, stderr, code] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: 'unbounded' },
      );
      return { code: Number(code), stdout, stderr };
    }),
  ).pipe(
    Effect.mapError(() =>
      cliError(
        `Could not run \`${command}\`. ` +
          'Install it, or compare against a folder of pictures with `--base <dir>`.',
      ),
    ),
  );
});

/**
 * Runs `git` in a folder to completion.
 *
 * @param cwd - The folder to run in.
 * @param args - The arguments after `git`.
 * @throws CliError in the error channel when `git` cannot be started.
 */
export function runGit(
  cwd: string,
  args: readonly string[],
): Effect.Effect<ProcessResult, CliError, ChildProcessSpawner.ChildProcessSpawner> {
  return runProcess('git', cwd, args);
}

/**
 * Whether a folder is inside a git work tree. `false` when git is not installed.
 *
 * @param cwd - The folder.
 */
export const isGitWorkTree = Effect.fn('isGitWorkTree')(function* (
  cwd: string,
): Effect.fn.Return<boolean, never, ChildProcessSpawner.ChildProcessSpawner> {
  const result = yield* runGit(cwd, ['rev-parse', '--is-inside-work-tree']).pipe(
    Effect.orElseSucceed(() => undefined),
  );
  return result !== undefined && result.code === 0 && result.stdout.trim() === 'true';
});
