import type { Plugin } from 'vite';

import { devSessionOf, originRefusal } from '@deckster/comments/dev-session';
import { fileURLToPath } from 'node:url';

import type { AgentClientConfig, AgentPanelPosition, ProviderId } from '#protocol/agent-events.ts';
import type { AgentSessionsApi } from '#session/agent-sessions.ts';

import { AGENT_PATH, AGENT_VIRTUAL_ID } from '#protocol/agent-events.ts';
import { createAgentSocketServer } from '#vite/agent-socket.ts';

/**
 * The runtime plugin that connects a deck page to the agent endpoint, as an absolute path for the
 * `devRuntimePlugins` option of `@deckster/vite-plugin`. Only a dev server started with `--agent`
 * lists it.
 */
export const AGENT_RUNTIME_PLUGIN = fileURLToPath(
  new URL('../runtime/agent-plugin.tsx', import.meta.url),
);

/**
 * The id Vite gives the resolved virtual module.
 */
const RESOLVED_VIRTUAL_ID = `\0${AGENT_VIRTUAL_ID}`;

/**
 * Options for {@link deckAgentPlugin}.
 */
export type AgentPluginOptions = {
  /**
   * The agent host.
   */
  readonly sessions: AgentSessionsApi;

  /**
   * The provider, for the panel.
   */
  readonly provider: ProviderId;

  /**
   * Where the panel docks.
   */
  readonly panel: AgentPanelPosition;
};

/**
 * Mounts the agent WebSocket at `/__deck/agent` on the dev server's HTTP server (beside Vite's HMR
 * socket, which keeps its own upgrades) and serves `virtual:deck/agent`, which holds no secret: the
 * path, the provider and the panel position. The socket is authenticated by the dev session cookie
 * (`@deckster/comments/dev-session`), which the server sets `HttpOnly` on the deck's own page; the
 * MCP token never reaches a page. It applies only while serving.
 *
 * @param options - The agent host, the provider and the panel position.
 */
export function deckAgentPlugin(options: AgentPluginOptions): Plugin {
  const config: AgentClientConfig = {
    path: AGENT_PATH,
    provider: options.provider,
    panel: options.panel,
  };
  return {
    name: 'deck:agent',
    apply: 'serve',

    resolveId(id) {
      return id === AGENT_VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : undefined;
    },

    load(id) {
      return id === RESOLVED_VIRTUAL_ID ? `export default ${JSON.stringify(config)};\n` : undefined;
    },

    configureServer(server) {
      const session = devSessionOf(server);
      const sockets = createAgentSocketServer({
        sessions: options.sessions,
        guard: {
          origin: (request) => originRefusal(request, 'The deck agent endpoint'),
          session: (request) => session.refusal(request),
        },
      });
      server.httpServer?.on('upgrade', sockets.upgrade);
      server.httpServer?.once('close', () => {
        server.httpServer?.off('upgrade', sockets.upgrade);
        void sockets.close();
      });
    },
  };
}
