import { Effect, Option, Redacted, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/**
 * How long a check such as `claude --version` may take, in milliseconds.
 */
const CHECK_TIMEOUT_MS = 20_000;

/**
 * What a short command printed and exited with, or `missing` when the binary is not on the path.
 */
export type CommandResult =
  | {
      /**
       * The command ran.
       */
      readonly kind: 'ran';

      /**
       * The exit code, or null when it was killed or timed out.
       */
      readonly code: number | null;

      /**
       * Standard output.
       */
      readonly stdout: string;

      /**
       * Standard error.
       */
      readonly stderr: string;
    }
  | {
      /**
       * The binary was not found.
       */
      readonly kind: 'missing';
    };

/**
 * Runs a short command, such as a version or login check, to completion with an explicit
 * environment and a time limit. It never fails: a missing binary is `missing`, anything else that
 * goes wrong is a run with code null.
 *
 * @param command - The program.
 * @param args - Its arguments.
 * @param env - The complete environment.
 * @param cwd - The working directory.
 */
export const runCommand = Effect.fn('runCommand')(function* (
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string>>,
  cwd?: string,
): Effect.fn.Return<CommandResult, never, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const run = Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, [...args], {
          env: Object.fromEntries(
            Object.entries(env).map(([name, value]) => [name, Redacted.make(value)]),
          ),
          extendEnv: false,
          stdin: 'ignore',
          ...(cwd === undefined ? {} : { cwd }),
        }),
      );
      const [stdout, stderr, code] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode.pipe(
            Effect.map(Number),
            Effect.orElseSucceed(() => null),
          ),
        ],
        { concurrency: 'unbounded' },
      );
      return { kind: 'ran', code, stdout, stderr } as const;
    }),
  );
  const result = yield* run.pipe(
    Effect.timeoutOption(CHECK_TIMEOUT_MS),
    Effect.map(
      Option.getOrElse((): CommandResult => ({
        kind: 'ran',
        code: null,
        stdout: '',
        stderr: 'timed out',
      })),
    ),
    Effect.catch((error) =>
      Effect.succeed<CommandResult>(
        error.reason._tag === 'NotFound'
          ? { kind: 'missing' }
          : { kind: 'ran', code: null, stdout: '', stderr: error.message },
      ),
    ),
  );
  return result;
});
