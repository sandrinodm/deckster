import type { ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import path from 'node:path';
import { createServer, mergeConfig } from 'vite-plus';

import { deckViteConfig } from '#vite-config.ts';

import { BRANDS, brandPort } from './brands.ts';

/**
 * The workspace that holds the hello deck and both brands.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * Starts one dev server per brand, all serving the hello deck, before the suite's first test and
 * closes them after its last; the brand is the only difference between them. A port that is taken
 * fails the suite instead of moving to another port.
 */
export function useBrandServers(): void {
  const servers: ViteDevServer[] = [];
  beforeAll(async () => {
    for (const brand of BRANDS) {
      const config = deckViteConfig({ workspaceRoot: WORKSPACE_ROOT, deck: 'hello', brand });
      const port = brandPort(brand);
      const server = await createServer(
        mergeConfig(config, { logLevel: 'error', server: { port, strictPort: true } }),
      );
      servers.push(server);
      await server.listen();
    }
  });
  afterAll(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });
}
