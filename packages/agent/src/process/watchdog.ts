import { nodeHookArguments } from '@deckster/brand/node';
import { type Cause, Effect, Option, Queue, Scope, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { fileURLToPath } from 'node:url';

import { watchCleanup } from '#process/cleanup-registry.ts';

/**
 * The watchdog script.
 */
export const WATCHDOG_SCRIPT = fileURLToPath(new URL('./watchdog-main.ts', import.meta.url));

/**
 * How long a clean shutdown waits for the watchdog to exit, in milliseconds.
 */
const EXIT_WAIT_MS = 1000;

/**
 * Starts the watchdog in the caller's scope and mirrors the cleanup registry to it: every provider
 * process group and token file the CLI tracks is also known to a separate process, which kills the
 * groups and removes the files if the CLI dies without running its finalizers (SIGKILL, a crash in
 * native code). When the scope closes normally, the watchdog is told the shutdown is clean and
 * exits without touching anything. Starting it never fails the caller: without a watchdog the
 * `exit` hook and the finalizers still clean up.
 */
export const startWatchdog = Effect.fn('startWatchdog')(function* (): Effect.fn.Return<
  void,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const lines = yield* Queue.unbounded<Uint8Array, Cause.Done>();
  const encoder = new TextEncoder();
  const spawned = yield* spawner
    .spawn(
      ChildProcess.make(process.execPath, [...nodeHookArguments(process.env), WATCHDOG_SCRIPT], {
        detached: true,
        shell: false,
        stdin: { stream: Stream.fromQueue(lines), endOnDone: true },
        stdout: 'ignore',
        stderr: 'ignore',
      }),
    )
    .pipe(Effect.option);
  if (Option.isNone(spawned)) {
    return;
  }

  const stop = watchCleanup((message) => {
    Queue.offerUnsafe(lines, encoder.encode(`${JSON.stringify(message)}\n`));
  });
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      stop();
      Queue.offerUnsafe(lines, encoder.encode(`${JSON.stringify({ done: true })}\n`));
      yield* Queue.end(lines);
      yield* spawned.value.exitCode.pipe(Effect.timeoutOption(EXIT_WAIT_MS), Effect.ignore);
    }),
  );
});
