import type { Scope } from 'effect';

import { deckCommand } from '@deckster/engine/command';
import { Effect, FileSystem, Schema } from 'effect';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import { agentError, type AgentError } from '#errors.ts';
import { trackFile, untrackFile } from '#process/cleanup-registry.ts';
import { ServerInfo, serverInfoFile } from '#protocol/mcp-endpoint.ts';

/**
 * The file mode of `server.json`: it holds the token, so only its owner may read it.
 */
const SERVER_INFO_MODE = 0o600;

/**
 * The size of a token in bytes.
 */
const TOKEN_BYTES = 32;

/**
 * Spaces of indentation in `server.json`.
 */
const JSON_INDENT_SPACES = 2;

/**
 * Decodes the text of `server.json`.
 */
const decodeServerInfo = Schema.decodeUnknownEffect(Schema.fromJsonString(ServerInfo));

/**
 * Writes `.deck/agent/<deck>/server.json` for a running dev server and removes it when the scope
 * closes, so a stopped server leaves nothing behind; the cleanup registry (the `exit` hook and the
 * watchdog) removes it even when the scope never closes.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param info - Where the server listens and its token.
 * @throws AgentError in the error channel when the file cannot be written.
 */
export const publishServerInfo = Effect.fn('publishServerInfo')(function* (
  workspaceRoot: string,
  info: ServerInfo,
): Effect.fn.Return<string, AgentError, FileSystem.FileSystem | Scope.Scope> {
  const fs = yield* FileSystem.FileSystem;
  const file = serverInfoFile(workspaceRoot, info.deck);
  yield* Effect.acquireRelease(
    fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(
      Effect.andThen(
        fs.writeFileString(file, `${JSON.stringify(info, null, JSON_INDENT_SPACES)}\n`, {
          mode: SERVER_INFO_MODE,
        }),
      ),
      Effect.andThen(fs.chmod(file, SERVER_INFO_MODE)),
      Effect.andThen(Effect.sync(() => trackFile(file))),
      Effect.mapError((error) =>
        agentError(
          `Could not write ${file}: ${error.message}`,
          'Check that the workspace is writable, or start the server without --mcp.',
        ),
      ),
    ),
    () =>
      fs
        .remove(file, { force: true })
        .pipe(Effect.ignore, Effect.andThen(Effect.sync(() => untrackFile(file)))),
  );
  return file;
});

/**
 * Reads the file of a running dev server, and checks that the process that wrote it is alive.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 * @throws AgentError in the error channel, saying how to start a server, when there is no file, it
 *   is not readable, or its process is gone.
 */
export const readServerInfo = Effect.fn('readServerInfo')(function* (
  workspaceRoot: string,
  deck: string,
): Effect.fn.Return<ServerInfo, AgentError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const file = serverInfoFile(workspaceRoot, deck);
  const start = `Start one with \`${deckCommand()} dev ${deck} --mcp\`, then run this again.`;
  const text = yield* fs
    .readFileString(file)
    .pipe(
      Effect.mapError(() =>
        agentError(`No dev server with the MCP endpoint is running for "${deck}".`, start),
      ),
    );
  const info = yield* decodeServerInfo(text).pipe(
    Effect.mapError(() => agentError(`${file} is not a server file.`, `Delete it. ${start}`)),
  );
  if (!isAlive(info.pid)) {
    return yield* agentError(
      `The dev server for "${deck}" is not running any more (process ${info.pid} is gone).`,
      start,
    );
  }

  return info;
});

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

/**
 * Makes the per-run bearer token: 32 random bytes, URL safe.
 */
export function makeToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}
