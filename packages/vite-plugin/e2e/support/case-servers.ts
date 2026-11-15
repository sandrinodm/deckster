import type { InlineConfig, PreviewServer, ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import path from 'node:path';
import { build, createServer, mergeConfig, preview } from 'vite-plus';

import { DEFAULT_LAYOUT_CATALOGS } from '#layouts/load-layout-catalog.ts';
import { DEFAULT_RUNTIME_PLUGINS } from '#plugin.ts';
import { deckViteConfig } from '#vite-config.ts';

/**
 * The fixture workspace: decks that exercise the engine, and a test layout with slots.
 */
export const FIXTURE_WORKSPACE = path.resolve(import.meta.dirname, '../fixtures');

/**
 * The port of the cases deck's dev server.
 */
const DEV_PORT = 5323;

/**
 * The port the cases deck's production build is previewed on.
 */
const PREVIEW_PORT = 5324;

/**
 * Where each way of serving the cases deck listens.
 */
export const CASE_TARGETS = [
  { name: 'dev server', url: `http://localhost:${DEV_PORT}/` },
  { name: 'production build', url: `http://localhost:${PREVIEW_PORT}/` },
] as const;

/**
 * The Vite config for a fixture deck, with the test layout's catalog and runtime plugin.
 *
 * @param deck - The fixture deck folder name.
 */
export function fixtureConfig(deck: string): InlineConfig {
  const layouts = path.join(FIXTURE_WORKSPACE, 'layouts');
  const config = deckViteConfig({
    workspaceRoot: FIXTURE_WORKSPACE,
    deck,
    runtimePlugins: [...DEFAULT_RUNTIME_PLUGINS, path.join(layouts, 'runtime.ts')],
    layoutCatalogs: [...DEFAULT_LAYOUT_CATALOGS, path.join(layouts, 'catalog.ts')],
  });
  return mergeConfig(config, { logLevel: 'silent' });
}

/**
 * Serves the cases deck twice for the suite: from a dev server, and as a production build through
 * `vite preview`. Both start before the suite's first test and close after its last; a taken port
 * fails the suite.
 */
export function useCaseServers(): void {
  const servers: (ViteDevServer | PreviewServer)[] = [];
  beforeAll(async () => {
    const config = fixtureConfig('cases');
    const dev = await createServer(
      mergeConfig(config, { server: { port: DEV_PORT, strictPort: true } }),
    );
    servers.push(dev);
    await dev.listen();
    await build(config);
    servers.push(
      await preview(mergeConfig(config, { preview: { port: PREVIEW_PORT, strictPort: true } })),
    );
  });
  afterAll(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });
}
