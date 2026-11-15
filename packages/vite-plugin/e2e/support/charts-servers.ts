import type { ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import path from 'node:path';
import { createServer, mergeConfig } from 'vite-plus';

import { deckViteConfig } from '#vite-config.ts';

/**
 * The repository workspace, which holds the data-stories deck and links both brands.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The deck the chart tests serve.
 */
const CHARTS_DECK = 'data-stories';

/**
 * The first of the two ports the servers take: 5375 unless `CHARTS_E2E_PORT` names another, for a
 * machine where that one is taken.
 */
const FIRST_PORT = Number(process.env['CHARTS_E2E_PORT'] ?? 5375);

/**
 * The port of the dev server in each brand.
 */
const PORTS = {
  /**
   * The default brand's server.
   */
  default: FIRST_PORT,

  /**
   * The nocturne brand's server.
   */
  nocturne: FIRST_PORT + 1,
} as const;

/**
 * The base URL of the data-stories deck in each brand, with a trailing slash.
 */
export const CHARTS_URLS = {
  /**
   * The default brand.
   */
  default: `http://localhost:${PORTS.default}/`,

  /**
   * The nocturne brand.
   */
  nocturne: `http://localhost:${PORTS.nocturne}/`,
} as const;

/**
 * Serves the data-stories deck in both brands before the suite's first test and closes the servers
 * after its last. A taken port fails the suite.
 */
export function useChartsServers(): void {
  const servers: ViteDevServer[] = [];
  beforeAll(async () => {
    for (const brand of ['default', 'nocturne'] as const) {
      const config = deckViteConfig({ workspaceRoot: WORKSPACE_ROOT, deck: CHARTS_DECK, brand });
      const server = await createServer(
        mergeConfig(config, {
          logLevel: 'error',
          server: { port: PORTS[brand], strictPort: true },
        }),
      );
      servers.push(server);
      await server.listen();
    }
  });
  afterAll(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });
}
