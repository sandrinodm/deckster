import type { AgentSessionsApi } from '@deckster/agent/sessions';

import { devSessionOf } from '@deckster/comments/dev-session';
import { DEV_RUNTIME_PLUGINS, deckViteConfig } from '@deckster/vite-plugin';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Cause, Console, Deferred, Effect, type FileSystem, type Scope } from 'effect';
import { createServer, mergeConfig, type ViteDevServer } from 'vite-plus';

import type { DeckBrowser } from '#browser/deck-browser.ts';
import type { Workspace } from '#workspace.ts';

import { cliError, ViteError, type CliError } from '#cli-error.ts';
import { closeDevServer, deckCompiler } from '#server/deck-server-live.ts';
import { withoutViteExitHandlers } from '#server/shutdown.ts';

/**
 * The `--agent*` flags of `deck dev` and `deck present`, as given. Parsing and validating them, and
 * what they switch on, belong to the agent feature; the commands only pass them along.
 */
export type AgentFlags = {
  /**
   * `--agent`: the provider, `claude` or `codex`.
   */
  provider: string;

  /**
   * `--agent-panel`: `right` or `bottom`.
   */
  panel: string | undefined;

  /**
   * `--agent-model`: the model name.
   */
  model: string | undefined;

  /**
   * `--agent-web`: whether the agent may search the web.
   */
  web: boolean;
};

/**
 * What a dev server for one deck is started with. `deck dev` and `deck present` build the same
 * object from their flags.
 */
export type DevServerOptions = {
  /**
   * The workspace root.
   */
  workspaceRoot: string;

  /**
   * The deck folder name under `decks/`.
   */
  deck: string;

  /**
   * A brand folder that replaces the deck config's `brand`; `undefined` keeps it.
   */
  brand: string | undefined;

  /**
   * The port to use, failing when taken; `undefined` takes the first free one from 5173.
   */
  port: number | undefined;

  /**
   * Whether to listen on all network interfaces.
   */
  host: boolean;

  /**
   * Whether to serve the deck's MCP tools at `/__deck/mcp`.
   */
  mcp: boolean;

  /**
   * The `--agent*` flags; `undefined` when no agent was asked for. An agent implies `mcp`: it gets
   * the same token, page link and tools, and its WebSocket at `/__deck/agent`.
   */
  agent: AgentFlags | undefined;

  /**
   * Whether to print Vite's URL list when the server is listening.
   */
  printUrls: boolean;

  /**
   * The command that starts the server, named in usage errors (`dev`, `present`).
   */
  command?: string;

  /**
   * Vite's log level: `info` (default) prints every hot update, `warn` only problems, for the short
   * status `deck present` keeps in the terminal.
   */
  logLevel?: 'info' | 'warn';

  /**
   * A one-time code for the dev session (`deck present`'s window): the session becomes strict, so
   * only the page request that carries this code gets the session cookie the agent and comment
   * endpoints need.
   */
  agentCode?: string;
};

/**
 * A listening dev server.
 */
export type StartedDevServer = {
  /**
   * The Vite server; it closes when the caller's scope closes.
   */
  server: ViteDevServer;

  /**
   * The URL of the deck page, such as `http://localhost:5173/`.
   */
  url: string;

  /**
   * The agent host, with `--agent`.
   */
  sessions: AgentSessionsApi | undefined;
};

/**
 * Imports everything `--mcp` and `--agent` need, in one go: the agent packages, the MCP and agent
 * Vite plugins and the CLI's live tools. A plain `deck dev` never loads any of it.
 */
async function importAgentHost() {
  const [
    agentVite,
    mcp,
    pageLink,
    protocol,
    serverInfo,
    sessions,
    mcpVite,
    watchdog,
    agentFlags,
    agentStatus,
    toolsLive,
  ] = await Promise.all([
    import('@deckster/agent/agent-vite'),
    import('@deckster/agent/mcp'),
    import('@deckster/agent/page-link'),
    import('@deckster/agent/protocol'),
    import('@deckster/agent/server-info'),
    import('@deckster/agent/sessions'),
    import('@deckster/agent/vite'),
    import('@deckster/agent/watchdog'),
    import('#agent/agent-flags.ts'),
    import('#agent/agent-status.ts'),
    import('#agent/deck-tools-live.ts'),
  ]);
  return {
    AGENT_RUNTIME_PLUGIN: agentVite.AGENT_RUNTIME_PLUGIN,
    deckAgentPlugin: agentVite.deckAgentPlugin,
    DeckTools: mcp.DeckTools,
    createPageLink: pageLink.createPageLink,
    MCP_PATH: protocol.MCP_PATH,
    makeToken: serverInfo.makeToken,
    publishServerInfo: serverInfo.publishServerInfo,
    makeAgentSessions: sessions.makeAgentSessions,
    deckMcpPlugin: mcpVite.deckMcpPlugin,
    MCP_RUNTIME_PLUGIN: mcpVite.MCP_RUNTIME_PLUGIN,
    startWatchdog: watchdog.startWatchdog,
    resolveAgentSetup: agentFlags.resolveAgentSetup,
    reportAgentStatus: agentStatus.reportAgentStatus,
    deckToolsLive: toolsLive.deckToolsLive,
  };
}

/**
 * The agent and MCP code, loaded the first time a dev server asks for it.
 */
type AgentHost = Awaited<ReturnType<typeof importAgentHost>>;

/**
 * Loads the agent host's modules.
 *
 * @throws CliError in the error channel when one of them does not load.
 */
const loadAgentHost = Effect.fn('loadAgentHost')(function* (): Effect.fn.Return<
  AgentHost,
  CliError
> {
  return yield* Effect.tryPromise({
    try: importAgentHost,
    catch: (cause) =>
      cliError(
        `Could not load the agent code: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
  });
});

/**
 * Starts the Vite dev server of a deck in the caller's scope and, with `mcp`, publishes the MCP
 * endpoint and its token. With `agent`, it also starts the agent host (its running turn is killed
 * when the scope closes), mounts `/__deck/agent`, loads the page's agent plugin, and checks the
 * provider with its doctor, printing a problem and its fix without failing. The server closes when
 * the scope does.
 *
 * @param options - The deck, the brand and how to listen.
 * @throws ViteError in the error channel when the server cannot start; CliError when the MCP server
 *   information cannot be written.
 */
export const startDevServer = Effect.fn('startDevServer')(function* (
  options: DevServerOptions,
): Effect.fn.Return<
  StartedDevServer,
  ViteError | CliError,
  Scope.Scope | DeckBrowser | Workspace | FileSystem.FileSystem
> {
  const { workspaceRoot, deck, brand, port } = options;
  const mcp = options.mcp || options.agent !== undefined;
  const host = mcp ? yield* loadAgentHost() : undefined;
  const agent =
    options.agent === undefined || host === undefined
      ? undefined
      : yield* host.resolveAgentSetup(options.command ?? 'dev', options.agent);
  if (host !== undefined) {
    yield* host.startWatchdog().pipe(Effect.provide(NodeServices.layer));
  }

  const pageLink = host?.createPageLink();
  const token = host?.makeToken();
  let running: ViteDevServer | undefined;
  const listening = Deferred.makeUnsafe<void>();
  const tools =
    host === undefined || pageLink === undefined
      ? undefined
      : yield* host
          .deckToolsLive({
            deck,
            brand,
            pageLink,
            server: {
              url: () => `http://127.0.0.1:${listeningPort(running)}/`,
              listening: Deferred.await(listening),
              compile: (file) =>
                running === undefined ? Effect.succeed([]) : deckCompiler(running)(file),
            },
          })
          .pipe(Effect.provide(NodeServices.layer));
  const sessions =
    host === undefined || agent === undefined || tools === undefined || token === undefined
      ? undefined
      : yield* host
          .makeAgentSessions({
            workspaceRoot,
            deck,
            brand,
            provider: agent.provider,
            model: agent.model,
            web: agent.web,
            panel: agent.panel,
            mcp: () => ({
              url: `http://127.0.0.1:${listeningPort(running)}${host.MCP_PATH}`,
              token,
            }),
          })
          .pipe(
            Effect.provide([NodeServices.layer, host.DeckTools.layerFrom(tools)]),
            Effect.mapError((error) => cliError(error.message)),
          );
  const runtimePlugins = [
    ...DEV_RUNTIME_PLUGINS,
    ...(host === undefined ? [] : [host.MCP_RUNTIME_PLUGIN]),
    ...(host === undefined || sessions === undefined ? [] : [host.AGENT_RUNTIME_PLUGIN]),
  ];
  const base = deckViteConfig(
    {
      workspaceRoot,
      deck,
      ...(brand === undefined ? {} : { brand }),
      ...(mcp ? { devRuntimePlugins: runtimePlugins } : {}),
    },
    { warmup: true },
  );
  const plugins = [];
  if (host !== undefined && tools !== undefined && token !== undefined && pageLink !== undefined) {
    plugins.push(host.deckMcpPlugin({ tools, token, pageLink }));
    if (sessions !== undefined && agent !== undefined) {
      plugins.push(
        host.deckAgentPlugin({
          sessions,
          provider: agent.provider.id,
          panel: agent.panel,
        }),
      );
    }
  }

  const config = mergeConfig(base, {
    ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel, clearScreen: false }),
    server: {
      port,
      strictPort: port !== undefined,
      host: options.host || (mcp ? '127.0.0.1' : false),
    },
    ...(plugins.length === 0 ? {} : { plugins }),
  });
  const server = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => withoutViteExitHandlers(() => createServer(config)),
      catch: (cause) => new ViteError({ cause }),
    }),
    closeDevServer,
  );
  running = server;
  if (options.agentCode !== undefined) {
    const session = devSessionOf(server);
    session.setStrict(true);
    session.addCode(options.agentCode);
  }

  yield* Effect.tryPromise({
    try: () => server.listen(),
    catch: (cause) => new ViteError({ cause }),
  });
  yield* Deferred.succeed(listening, undefined);
  if (options.printUrls) {
    server.printUrls();
  }

  if (host !== undefined && token !== undefined) {
    const origin = `http://127.0.0.1:${listeningPort(server)}`;
    const published = host.publishServerInfo(workspaceRoot, {
      deck,
      port: listeningPort(server),
      origin,
      mcpUrl: `${origin}${host.MCP_PATH}`,
      token,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    yield* published.pipe(Effect.mapError((error) => cliError(error.message)));
    yield* Console.log(`  MCP:     ${origin}${host.MCP_PATH}`);
    yield* Console.log(
      `  Run \`pnpm deck mcp ${deck}\` for the configuration of Claude Code and Codex.`,
    );
  }

  if (host !== undefined && agent !== undefined && sessions !== undefined) {
    const doctor = Effect.gen(function* () {
      const status = yield* agent.provider
        .doctor(process.env)
        .pipe(Effect.provide(NodeServices.layer));
      yield* sessions.setProviderStatus(status);
      yield* host.reportAgentStatus(agent, status);
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.void
          : Console.error(
              `  Agent:   the ${agent.provider.id} check failed: ${String(Cause.squash(cause))}`,
            ),
      ),
    );
    yield* Effect.forkScoped(doctor);
  }

  const url = server.resolvedUrls?.local[0] ?? `http://localhost:${listeningPort(server)}/`;
  return { server, url, sessions };
});

/**
 * The port a running dev server listens on.
 *
 * @param server - The dev server, or undefined before it exists.
 */
function listeningPort(server: ViteDevServer | undefined): number {
  const address = server?.httpServer?.address();
  return typeof address === 'object' && address !== null ? address.port : 0;
}
