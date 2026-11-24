import type { Scope } from 'effect';

import { Effect, FileSystem, Schema } from 'effect';
import { rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Spaces of indentation in a record file.
 */
const JSON_INDENT_SPACES = 2;

/**
 * What a running `deckster dev` writes to `.deck/dev-servers/<pid>.json`, so `deckster present` can
 * say that one is still running. It holds no secret and is removed when the server stops.
 */
export const DevServerRecord = Schema.Struct({
  /**
   * The process id of the CLI that owns the server, to tell a stale file from a live one.
   */
  pid: Schema.Number,

  /**
   * The URL it serves: the deck page, or the deck chooser.
   */
  url: Schema.String,

  /**
   * The deck it serves, or undefined for the deck chooser.
   */
  deck: Schema.optional(Schema.String),
});

/**
 * The decoded form of {@link DevServerRecord}.
 */
export type DevServerRecord = typeof DevServerRecord.Type;

/**
 * Decodes the text of a record file.
 */
const decodeRecord = Schema.decodeUnknownEffect(Schema.fromJsonString(DevServerRecord));

/**
 * The folder the records live in.
 *
 * @param workspaceRoot - The absolute workspace root.
 */
export function devServersDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.deck', 'dev-servers');
}

/**
 * Writes this process's record and removes it when the scope closes, or at the latest when the
 * process exits. Best effort: the record only feeds a warning, so a write failure is ignored.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param record - What the server serves, without the pid.
 */
export const registerDevServer = Effect.fn('registerDevServer')(function* (
  workspaceRoot: string,
  record: Omit<DevServerRecord, 'pid'>,
): Effect.fn.Return<void, never, FileSystem.FileSystem | Scope.Scope> {
  const fs = yield* FileSystem.FileSystem;
  const file = path.join(devServersDir(workspaceRoot), `${process.pid}.json`);
  /**
   * Removes the record when the process exits without closing the scope.
   */
  const removeOnExit = (): void => rmSync(file, { force: true });
  const content = `${JSON.stringify({ pid: process.pid, ...record }, null, JSON_INDENT_SPACES)}\n`;
  yield* Effect.acquireRelease(
    fs
      .makeDirectory(path.dirname(file), { recursive: true })
      .pipe(
        Effect.andThen(fs.writeFileString(file, content)),
        Effect.andThen(Effect.sync(() => process.once('exit', removeOnExit))),
        Effect.ignore,
      ),
    () =>
      fs
        .remove(file, { force: true })
        .pipe(Effect.ignore, Effect.andThen(Effect.sync(() => process.off('exit', removeOnExit)))),
  );
});

/**
 * The dev servers other processes run in the workspace. Records of processes that are gone are
 * removed; unreadable ones are skipped.
 *
 * @param workspaceRoot - The absolute workspace root.
 */
export const findRunningDevServers = Effect.fn('findRunningDevServers')(function* (
  workspaceRoot: string,
): Effect.fn.Return<DevServerRecord[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const dir = devServersDir(workspaceRoot);
  const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed((): string[] => []));
  const records: DevServerRecord[] = [];
  for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    const record = yield* fs.readFileString(file).pipe(
      Effect.flatMap((text) => decodeRecord(text)),
      Effect.orElseSucceed(() => undefined),
    );
    if (record === undefined || record.pid === process.pid) {
      continue;
    }

    if (isAlive(record.pid)) {
      records.push(record);
    } else {
      yield* fs.remove(file, { force: true }).pipe(Effect.ignore);
    }
  }

  return records;
});

/**
 * The warning `deckster present` prints for each running dev server.
 *
 * @param record - The running server.
 */
export function runningDevServerWarning(record: DevServerRecord): string {
  const what = record.deck === undefined ? 'the deck chooser' : `"${record.deck}"`;
  return (
    `Warning: a dev server for ${what} is still running at ${record.url} (process ${record.pid}). ` +
    'This presentation uses its own server; stop the dev server if you no longer need it.'
  );
}

/**
 * Whether a process exists.
 *
 * @param pid - The process id.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}
