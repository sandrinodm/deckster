import { Effect, FileSystem, Option, type Scope } from 'effect';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { agentError, type AgentError } from '#errors.ts';

/**
 * The host lock is readable and writable only by its owner.
 */
const HOST_LOCK_MODE = 0o600;

/**
 * The lock file in a deck's agent folder.
 */
export const HOST_LOCK_FILE = 'host.lock';

/**
 * The lock files this process holds, absolute.
 */
const HELD = new Set<string>();

/**
 * Whether a process runs.
 *
 * @param pid - The process id.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { readonly code?: string }).code === 'EPERM';
  }
}

/**
 * Takes the deck's agent host lock for the caller's scope: one agent host per deck, across
 * processes, because the journal, the session file, the turn record and the MCP configuration file
 * of a deck are shared. A lock left by a process that has stopped is taken over.
 *
 * @param dir - The deck's agent folder.
 * @param deck - The deck folder name, for the message.
 * @throws AgentError in the error channel when another live host holds it.
 */
export const acquireHostLock = Effect.fn('acquireHostLock')(function* (
  dir: string,
  deck: string,
): Effect.fn.Return<void, AgentError, FileSystem.FileSystem | Scope.Scope> {
  const fs = yield* FileSystem.FileSystem;
  const file = path.join(dir, HOST_LOCK_FILE);
  const token = `${process.pid} ${randomUUID()}`;
  /**
   * The error for a lock another host holds.
   *
   * @param pid - The holder.
   */
  const held = (pid: number) =>
    agentError(
      `Another dev server already runs an agent for decks/${deck} (process ${pid}).`,
      'Use the chat panel of that dev server, or stop it before starting another with --agent.',
    );
  /**
   * Creates the lock file, failing when it exists.
   */
  const create = fs.writeFileString(file, `${token}\n`, { flag: 'wx', mode: HOST_LOCK_MODE });
  const acquire = Effect.gen(function* () {
    if (HELD.has(file)) {
      return yield* held(process.pid);
    }

    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(
        Effect.mapError((error) =>
          agentError(
            `The agent folder could not be made: ${error.message}`,
            'Check that .deck/ is writable.',
          ),
        ),
      );
    const first = yield* create.pipe(Effect.result);
    if (first._tag === 'Failure') {
      const text = yield* fs.readFileString(file).pipe(Effect.option);
      const pid = Number(Option.getOrElse(text, () => '').split(' ')[0]);
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && isAlive(pid)) {
        return yield* held(pid);
      }

      yield* fs.remove(file, { force: true }).pipe(Effect.ignore);
      yield* create.pipe(Effect.mapError(() => held(Number.isInteger(pid) ? pid : 0)));
    }

    HELD.add(file);
  });
  yield* Effect.acquireRelease(acquire, () =>
    Effect.gen(function* () {
      HELD.delete(file);
      const text = yield* fs.readFileString(file).pipe(Effect.option);
      if (Option.isSome(text) && text.value.trim() === token) {
        yield* fs.remove(file, { force: true }).pipe(Effect.ignore);
      }
    }),
  );
});
