import { Effect } from 'effect';

/**
 * Who waits in {@link awaitShutdown}, to be woken by {@link requestShutdown}.
 */
const WAITERS = new Set<() => void>();

/**
 * Asks every long-running command to stop: `q` in the terminal and the end of standard input call
 * it. The command's wait ends, its scope closes and every finalizer runs (agent turns are killed,
 * `server.json` is removed), instead of the `process.exit()` Vite would call.
 */
export function requestShutdown(): void {
  for (const wake of WAITERS) {
    wake();
  }
}

/**
 * Waits until the person asks to stop: {@link requestShutdown} (the `q` shortcut) or the end of
 * standard input. Ctrl+C, SIGTERM and SIGHUP interrupt the command itself (see `cliProgram`).
 */
export const awaitShutdown: Effect.Effect<void> = Effect.callback<void>((resume) => {
  /**
   * Ends the wait.
   */
  const done = () => resume(Effect.void);
  WAITERS.add(done);
  process.stdin.once('end', done);
  return Effect.sync(() => {
    WAITERS.delete(done);
    process.stdin.off('end', done);
  });
});

/**
 * Waits for a signal, for as long as the effect runs; the listener is removed when it is
 * interrupted.
 *
 * @param signal - The signal, such as `SIGHUP`.
 */
export function awaitSignal(signal: NodeJS.Signals): Effect.Effect<void> {
  return Effect.callback<void>((resume) => {
    /**
     * Ends the wait.
     */
    const done = () => resume(Effect.void);
    process.once(signal, done);
    return Effect.sync(() => {
      process.off(signal, done);
    });
  });
}

/**
 * Runs Vite's `createServer` or `preview` and takes back the shutdown handlers they install: Vite
 * adds a `SIGTERM` listener and a standard-input `end` listener that call `process.exit()` as soon
 * as the server has closed, before the command's finalizers (the agent's process groups,
 * `server.json`) have run. The CLI's own handlers interrupt the command instead.
 *
 * @param create - Creates the server.
 */
export async function withoutViteExitHandlers<A>(create: () => Promise<A>): Promise<A> {
  const signals = new Set(process.listeners('SIGTERM'));
  const input = new Set(process.stdin.listeners('end'));
  try {
    return await create();
  } finally {
    for (const listener of process.listeners('SIGTERM')) {
      if (!signals.has(listener)) {
        process.off('SIGTERM', listener);
      }
    }

    for (const listener of process.stdin.listeners('end')) {
      if (!input.has(listener)) {
        process.stdin.off('end', listener as (...args: unknown[]) => void);
      }
    }
  }
}
