import type { DeckToolsApi } from '@deckster/agent/mcp';
import type { ViteDevServer } from 'vite-plus';

import { AGENT_RUNTIME_PLUGIN, deckAgentPlugin } from '@deckster/agent/agent-vite';
import { agentError } from '@deckster/agent/errors';
import { DeckTools } from '@deckster/agent/mcp';
import { PROVIDERS } from '@deckster/agent/providers';
import { makeAgentSessions } from '@deckster/agent/sessions';
import { NodeServices } from '@effect/platform-node';
import { afterAll, beforeAll } from 'e2e';
import { Effect, Exit, Scope } from 'effect';
import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { createServer, mergeConfig } from 'vite-plus';

import { DEV_RUNTIME_PLUGINS } from '#plugin.ts';
import { deckViteConfig } from '#vite-config.ts';

import { FIXTURE_WORKSPACE } from './case-servers.ts';

/**
 * The port of the agent suite's dev server.
 */
export const AGENT_PORT = 5386;

/**
 * The deck page of the agent suite.
 */
export const AGENT_URL = `http://127.0.0.1:${AGENT_PORT}/`;

/**
 * The fixture deck the suite serves: a copy of hello made before the first test, so the fake
 * agent's edits never touch the real deck.
 */
export const AGENT_DECK = 'agent-hello';

/**
 * The copy's folder.
 */
const AGENT_DECK_DIR = path.join(FIXTURE_WORKSPACE, 'decks', AGENT_DECK);

/**
 * The real hello deck, copied without its build output and dependencies.
 */
const HELLO_DIR = path.resolve(import.meta.dirname, '../../../../decks/hello');

/**
 * The per-run token of the suite's server.
 */
const TOKEN = 'agent-e2e-token';

/**
 * What the tools the suite does not use answer.
 */
const unused = Effect.fail(agentError('Not part of this suite.'));

/**
 * The deck tools of the suite: lint is always clean, and the host finds slides on disk.
 */
const TOOLS: DeckToolsApi = {
  /**
   * No page is connected.
   */
  currentSlide: Effect.succeed({ connected: false, message: 'Not part of this suite.' }),

  /**
   * Unknown, so slides are found on disk.
   */
  deckOutline: unused,

  /**
   * Not in a manifest, so slides are found on disk.
   */
  slideFile: () => Effect.succeed(undefined),

  /**
   * The default brand.
   */
  brandName: Effect.succeed('default'),

  /**
   * Always clean.
   */
  deckLint: () => Effect.succeed({ ok: true, findings: [] }),

  /**
   * Not used.
   */
  deckScreenshot: () => unused,

  /**
   * Not used.
   */
  catalog: () => unused,

  /**
   * Not used.
   */
  comments: () => unused,

  /**
   * Not used.
   */
  goto: () => unused,

  /**
   * Not used.
   */
  newSlide: () => unused,

  /**
   * Not used.
   */
  reorderSlides: () => unused,

  /**
   * Not used.
   */
  removeSlide: () => unused,
};

/**
 * Serves a copy of the hello deck with the agent endpoint and the fake provider, as `deckster dev
 * --agent fake` does, before the first test; closes it and removes the copy and the agent's files
 * after the last.
 */
export function useAgentServer(): void {
  let server: ViteDevServer | undefined;
  let scope: Scope.Closeable | undefined;
  beforeAll(async () => {
    await rm(AGENT_DECK_DIR, { recursive: true, force: true });
    await cp(HELLO_DIR, AGENT_DECK_DIR, {
      recursive: true,
      // Its tsconfig extends the workspace's by a relative path, and its package.json would make
      // it a package; neither is needed to serve it.
      filter: (source) =>
        !/[/\\](node_modules|dist|\.feedback|tsconfig\.json|package\.json)([/\\]|$)/.test(source),
    });
    const opened = Effect.runSync(Scope.make());
    scope = opened;
    const sessions = await Effect.runPromise(
      makeAgentSessions({
        workspaceRoot: FIXTURE_WORKSPACE,
        deck: AGENT_DECK,
        brand: undefined,
        provider: PROVIDERS.fake,
        model: undefined,
        panel: 'right',
        mcp: () => ({ url: `${AGENT_URL}__deck/mcp`, token: TOKEN }),
        environment: { ...process.env, DECK_FAKE_DELAY_MS: '2' },
      }).pipe(
        Scope.provide(opened),
        Effect.provide([NodeServices.layer, DeckTools.layerFrom(TOOLS)]),
      ),
    );
    const config = deckViteConfig({
      workspaceRoot: FIXTURE_WORKSPACE,
      deck: AGENT_DECK,
      devRuntimePlugins: [...DEV_RUNTIME_PLUGINS, AGENT_RUNTIME_PLUGIN],
    });
    server = await createServer(
      mergeConfig(config, {
        logLevel: 'error',
        plugins: [deckAgentPlugin({ sessions, provider: 'fake', panel: 'right' })],
        server: { host: '127.0.0.1', port: AGENT_PORT, strictPort: true },
      }),
    );
    await server.listen();
  });
  afterAll(async () => {
    await server?.close();
    if (scope !== undefined) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }

    await rm(AGENT_DECK_DIR, { recursive: true, force: true });
    await rm(path.join(FIXTURE_WORKSPACE, '.deck'), { recursive: true, force: true });
  });
}
