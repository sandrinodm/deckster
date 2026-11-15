import type { ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import path from 'node:path';
import { createServer, mergeConfig } from 'vite-plus';

import { deckViteConfig } from '#vite-config.ts';

import { BRANDS, type Brand } from './brands.ts';

/**
 * The repository workspace, which holds the diagrams deck and links both brands.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The port of the first brand's diagrams server; the next brand takes the next port.
 */
const FIRST_PORT = 5345;

/**
 * The base URL of the diagrams deck served in a brand, with a trailing slash.
 *
 * @param brand - The brand.
 */
export function diagramsUrl(brand: Brand): string {
  return `http://localhost:${FIRST_PORT + BRANDS.indexOf(brand)}/`;
}

/**
 * Starts one dev server per brand for the diagrams deck before the suite's first test and closes
 * them after its last. A taken port fails the suite instead of moving to another port.
 */
export function useDiagramsServers(): void {
  const servers: ViteDevServer[] = [];
  beforeAll(async () => {
    for (const brand of BRANDS) {
      const config = deckViteConfig({
        workspaceRoot: WORKSPACE_ROOT,
        deck: 'diagrams-demo',
        brand,
      });
      const server = await createServer(
        mergeConfig(config, {
          logLevel: 'error',
          server: { port: FIRST_PORT + BRANDS.indexOf(brand), strictPort: true },
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
