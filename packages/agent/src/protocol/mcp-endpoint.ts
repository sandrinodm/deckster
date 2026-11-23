import { Schema } from 'effect';
import path from 'node:path';

/**
 * The dev-server path the deck MCP server is mounted at. Only a dev server started with `--mcp`
 * serves it; a build, a preview or an export has no such endpoint.
 */
export const MCP_PATH = '/__deck/mcp';

/**
 * Where to reach a deck MCP server and how to prove who is asking: what an agent host gives to a
 * provider it spawns.
 */
export type McpEndpoint = {
  /**
   * The full URL of the endpoint, such as `http://127.0.0.1:5621/__deck/mcp`.
   */
  readonly url: string;

  /**
   * The per-run bearer token every request must carry in `Authorization: Bearer <token>`.
   */
  readonly token: string;
};

/**
 * What a running dev server writes to `.deck/agent/<deck>/server.json` so `deckster mcp` and other
 * tools can find it. The file holds the token, so it is created with mode 0600 and removed when the
 * server stops.
 */
export const ServerInfo = Schema.Struct({
  /**
   * The deck folder name the server serves.
   */
  deck: Schema.String,

  /**
   * The dev server's port.
   */
  port: Schema.Number,

  /**
   * The dev server's origin, such as `http://127.0.0.1:5621`.
   */
  origin: Schema.String,

  /**
   * The full URL of the MCP endpoint.
   */
  mcpUrl: Schema.String,

  /**
   * The per-run bearer token.
   */
  token: Schema.String,

  /**
   * The process id of the CLI that owns the server, to tell a stale file from a live one.
   */
  pid: Schema.Number,

  /**
   * When the server started, as an ISO timestamp.
   */
  startedAt: Schema.String,
});

/**
 * The decoded form of {@link ServerInfo}.
 */
export type ServerInfo = typeof ServerInfo.Type;

/**
 * The folder the agent tooling keeps a deck's files in, relative to the workspace root.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
export function agentDir(workspaceRoot: string, deck: string): string {
  return path.join(workspaceRoot, '.deck', 'agent', deck);
}

/**
 * The file a running dev server publishes its port and token in.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
export function serverInfoFile(workspaceRoot: string, deck: string): string {
  return path.join(agentDir(workspaceRoot, deck), 'server.json');
}

/**
 * The folder `deck_screenshot` writes PNGs to.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
export function agentShotsDir(workspaceRoot: string, deck: string): string {
  return path.join(agentDir(workspaceRoot, deck), 'shots');
}
