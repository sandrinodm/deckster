import { Effect, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { exportError, type ExportError } from '#export-error.ts';

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
 * Runs a program to completion and collects its output. A non-zero exit is a result, not a failure;
 * callers decide what it means.
 *
 * @param command - The program, such as `docker`.
 * @param args - Its arguments.
 * @param fix - What to do when it cannot be started, for the error.
 * @returns The exit code and output.
 * @throws ExportError in the error channel when the program cannot be started.
 */
export const runProcess = Effect.fn('runProcess')(function* (
  command: string,
  args: readonly string[],
  fix: string,
): Effect.fn.Return<ProcessResult, ExportError, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(ChildProcess.make(command, [...args]));
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
  ).pipe(Effect.mapError((cause) => exportError(`run ${command}`, cause, fix)));
});
