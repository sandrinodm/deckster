import type { ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import path from 'node:path';
import { createServer, mergeConfig } from 'vite-plus';

import { DEFAULT_RUNTIME_PLUGINS } from '#plugin.ts';
import { deckViteConfig } from '#vite-config.ts';

/**
 * The workspace that holds the hello deck and both brands.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The port of the hello deck served without the presenter tools.
 */
const BASELINE_PORT = 5325;

/**
 * The base URL of the baseline server, with a trailing slash.
 */
export const BASELINE_URL = `http://localhost:${BASELINE_PORT}/`;

/**
 * Serves the hello deck with every default runtime plugin except the presenter tools, before the
 * suite's first test, and closes it after the last. It is what `?static` output is compared with.
 */
export function useBaselineServer(): void {
  const servers: ViteDevServer[] = [];
  beforeAll(async () => {
    const config = deckViteConfig({
      workspaceRoot: WORKSPACE_ROOT,
      deck: 'hello',
      runtimePlugins: DEFAULT_RUNTIME_PLUGINS.filter(
        (plugin) => plugin !== '@deckster/presenter/runtime',
      ),
    });
    const server = await createServer(
      mergeConfig(config, { logLevel: 'error', server: { port: BASELINE_PORT, strictPort: true } }),
    );
    servers.push(server);
    await server.listen();
  });
  afterAll(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });
}
