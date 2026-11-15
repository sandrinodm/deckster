import type { Plugin } from 'vite-plus';

import { fileURLToPath } from 'node:url';

import type { DeckToolsApi } from '#mcp/deck-tools.ts';
import type { PageChannel, PageLink, PageListener } from '#mcp/page-link.ts';

import { createDeckMcpRequestHandler } from '#mcp/mcp-handler.ts';
import { MCP_PATH } from '#protocol/mcp-endpoint.ts';

/**
 * The runtime plugin that reports the page's slide and applies `goto`, as an absolute path for the
 * `devRuntimePlugins` option of `@deckster/vite-plugin`, so that package needs no dependency on
 * this one.
 */
export const MCP_RUNTIME_PLUGIN = fileURLToPath(
  new URL('../runtime/page-link.ts', import.meta.url),
);

/**
 * Options for {@link deckMcpPlugin}.
 */
export type McpPluginOptions = {
  /**
   * The operations behind the tools.
   */
  readonly tools: DeckToolsApi;

  /**
   * The per-run bearer token.
   */
  readonly token: string;

  /**
   * The registry the page-link events are recorded in, shared with the tools.
   */
  readonly pageLink: PageLink;
};

/**
 * Mounts the deck MCP server at `/__deck/mcp` on the dev server and listens for the page link's
 * events on its WebSocket. It applies only while serving.
 *
 * @param options - The tools, the token and the page registry.
 */
export function deckMcpPlugin(options: McpPluginOptions): Plugin {
  return {
    name: 'deck:mcp',
    apply: 'serve',

    configureServer(server) {
      const mcp = createDeckMcpRequestHandler({ tools: options.tools, token: options.token });
      server.middlewares.use(MCP_PATH, (request, response) => mcp.handle(request, response));
      const wrapped = new Map<PageListener, Parameters<typeof server.ws.on<string>>[1]>();
      const channel: PageChannel = {
        on: (event, listener) => {
          /**
           * Hands the page's event to the registry's listener.
           *
           * @param data - What the page sent.
           * @param client - The page's connection.
           */
          const wrapper: Parameters<typeof server.ws.on<string>>[1] = (data, client) =>
            listener(data, client);
          wrapped.set(listener, wrapper);
          server.ws.on(event, wrapper);
        },
        off: (event, listener) => {
          const wrapper = wrapped.get(listener);
          if (wrapper !== undefined) {
            server.ws.off(event, wrapper);
          }
        },
      };
      const detach = options.pageLink.attach(channel);
      server.httpServer?.once('close', () => {
        detach();
        void mcp.close();
      });
    },
  };
}
