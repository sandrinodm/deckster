import type { DeckToolsApi } from '@deckster/agent/mcp';
import type { AgentPanelPosition } from '@deckster/agent/protocol/events';
import type { ViteDevServer } from 'vite-plus';

import { AGENT_RUNTIME_PLUGIN, deckAgentPlugin } from '@deckster/agent/agent-vite';
import { agentError } from '@deckster/agent/errors';
import { DeckTools } from '@deckster/agent/mcp';
import { PROVIDERS } from '@deckster/agent/providers';
import { makeAgentSessions } from '@deckster/agent/sessions';
import { NodeServices } from '@effect/platform-node';
import { afterAll, beforeAll } from 'e2e';
import { Effect, Exit, FileSystem, Scope } from 'effect';
import { cp, lstat, mkdir, rm, rmdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { createServer, mergeConfig } from 'vite-plus';

import { DEV_RUNTIME_PLUGINS } from '#plugin.ts';
import { deckViteConfig } from '#vite-config.ts';

import { FIXTURE_WORKSPACE } from './case-servers.ts';

/**
 * One dev server of the panel suite: a copy of hello with the agent panel and the fake provider.
 */
export type AgentPanelServer = {
  /**
   * The copy's deck folder name.
   */
  readonly deck: string;

  /**
   * The port.
   */
  readonly port: number;

  /**
   * The brand it renders in.
   */
  readonly brand: 'default' | 'nocturne';

  /**
   * Where the panel docks first (`--agent-panel`).
   */
  readonly panel: AgentPanelPosition;
};

/**
 * The suite's two servers: the default brand with the panel on the right, nocturne with it below.
 */
export const PANEL_SERVERS = {
  /**
   * The default brand, docked right.
   */
  right: { deck: 'agent-panel', port: 5388, brand: 'default', panel: 'right' },

  /**
   * Nocturne, docked below.
   */
  bottom: { deck: 'agent-panel-b', port: 5389, brand: 'nocturne', panel: 'bottom' },
} as const satisfies Record<string, AgentPanelServer>;

/**
 * The URL of a server's deck page.
 *
 * @param server - The server.
 */
export function panelUrl(server: AgentPanelServer): string {
  return `http://127.0.0.1:${server.port}/`;
}

/**
 * The real hello deck, copied without its build output and dependencies.
 */
const HELLO_DIR = path.resolve(import.meta.dirname, '../../../../decks/hello');

/**
 * The real nocturne brand, which the fixture workspace lacks (only the default brand has a
 * framework fallback); the suite links it in for its run.
 */
const NOCTURNE_DIR = path.resolve(import.meta.dirname, '../../../../brands/nocturne');

/**
 * Where the link goes in the fixture workspace.
 */
const NOCTURNE_LINK = path.join(FIXTURE_WORKSPACE, 'brands/nocturne');

/**
 * Links the nocturne brand into the fixture workspace unless something is there already.
 *
 * @returns Whether it made the link (and so removes it afterwards).
 */
async function linkNocturne(): Promise<boolean> {
  const existing = await lstat(NOCTURNE_LINK).catch(() => undefined);
  if (existing !== undefined) {
    return false;
  }

  await mkdir(path.dirname(NOCTURNE_LINK), { recursive: true });
  await symlink(NOCTURNE_DIR, NOCTURNE_LINK, 'dir');
  return true;
}

/**
 * The per-run token of the suite's servers.
 */
const TOKEN = 'agent-panel-e2e-token';

/**
 * What the tools the suite does not use answer.
 */
const unused = Effect.fail(agentError('Not part of this suite.'));

/**
 * The deck tools of a server: lint reads the title slide and reports an error while it says
 * `LINT-ERROR` (the fake's `lint-error` scenario), the host finds slides on disk, and there are no
 * comments or screenshots.
 *
 * @param deckDir - The copy's folder.
 * @param deck - The copy's name.
 */
function suiteTools(deckDir: string, deck: string): DeckToolsApi {
  return {
    currentSlide: Effect.succeed({ connected: false, message: 'Not part of this suite.' }),
    deckOutline: unused,
    slideFile: () => Effect.succeed(undefined),
    brandName: Effect.succeed('default'),
    deckLint: () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const text = yield* fs
          .readFileString(path.join(deckDir, 'slides/title.mdx'))
          .pipe(Effect.orElseSucceed(() => ''));
        const failing = text.includes('LINT-ERROR');
        return {
          ok: !failing,
          findings: failing
            ? [
                {
                  slide: 'title',
                  file: `decks/${deck}/slides/title.mdx`,
                  step: null,
                  rule: 'title-length',
                  severity: 'error',
                  message: 'The title says LINT-ERROR.',
                  fix: 'Write a real title.',
                  selector: null,
                },
              ]
            : [],
        };
      }).pipe(Effect.provide(NodeServices.layer)),
    deckScreenshot: () => unused,
    catalog: () => unused,
    comments: () => unused,
    goto: () => unused,
    newSlide: () => unused,
    reorderSlides: () => unused,
    removeSlide: () => unused,
  };
}

/**
 * Serves the panel suite's two decks, as `deckster dev --agent fake [--agent-panel bottom] [--brand
 * nocturne]` does, before the first test; closes them and removes the copies and their agent files
 * after the last.
 */
export function useAgentPanelServers(): void {
  const servers: ViteDevServer[] = [];
  const scopes: Scope.Closeable[] = [];
  let linked = false;
  beforeAll(async () => {
    linked = await linkNocturne();
    for (const setup of Object.values(PANEL_SERVERS)) {
      const deckDir = path.join(FIXTURE_WORKSPACE, 'decks', setup.deck);
      await rm(deckDir, { recursive: true, force: true });
      await rm(path.join(FIXTURE_WORKSPACE, '.deck/agent', setup.deck), {
        recursive: true,
        force: true,
      });
      await cp(HELLO_DIR, deckDir, {
        recursive: true,
        // Its tsconfig extends the workspace's by a relative path, and its package.json would make
        // it a package; neither is needed to serve it.
        filter: (source) =>
          !/[/\\](node_modules|dist|\.feedback|tsconfig\.json|package\.json)([/\\]|$)/.test(source),
      });
      const scope = Effect.runSync(Scope.make());
      scopes.push(scope);
      const url = panelUrl(setup);
      const sessions = await Effect.runPromise(
        makeAgentSessions({
          workspaceRoot: FIXTURE_WORKSPACE,
          deck: setup.deck,
          brand: setup.brand,
          provider: PROVIDERS.fake,
          model: undefined,
          panel: setup.panel,
          mcp: () => ({ url: `${url}__deck/mcp`, token: TOKEN }),
          environment: { ...process.env, DECK_FAKE_DELAY_MS: '6' },
        }).pipe(
          Scope.provide(scope),
          Effect.provide([
            NodeServices.layer,
            DeckTools.layerFrom(suiteTools(deckDir, setup.deck)),
          ]),
        ),
      );
      const config = deckViteConfig({
        workspaceRoot: FIXTURE_WORKSPACE,
        deck: setup.deck,
        brand: setup.brand,
        devRuntimePlugins: [...DEV_RUNTIME_PLUGINS, AGENT_RUNTIME_PLUGIN],
      });
      const server = await createServer(
        mergeConfig(config, {
          logLevel: 'error',
          plugins: [deckAgentPlugin({ sessions, provider: 'fake', panel: setup.panel })],
          server: { host: '127.0.0.1', port: setup.port, strictPort: true },
        }),
      );
      servers.push(server);
      await server.listen();
    }
  });
  afterAll(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
    for (const scope of scopes.splice(0)) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }

    if (linked) {
      await rm(NOCTURNE_LINK, { force: true });
      await rmdir(path.dirname(NOCTURNE_LINK)).catch(() => undefined);
    }

    for (const setup of Object.values(PANEL_SERVERS)) {
      await rm(path.join(FIXTURE_WORKSPACE, 'decks', setup.deck), { recursive: true, force: true });
      await rm(path.join(FIXTURE_WORKSPACE, '.deck/agent', setup.deck), {
        recursive: true,
        force: true,
      });
    }

    // The agent folders, when nothing else is left in them.
    await rmdir(path.join(FIXTURE_WORKSPACE, '.deck/agent')).catch(() => undefined);
    await rmdir(path.join(FIXTURE_WORKSPACE, '.deck')).catch(() => undefined);
  });
}
