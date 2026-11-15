import type { PreviewServer, ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import path from 'node:path';
import { build, createServer, mergeConfig, preview } from 'vite-plus';

import { deckViteConfig } from '#vite-config.ts';

/**
 * The repository workspace, which holds the apps-demo deck and links both brands.
 */
export const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The deck folder the mini-app tests serve.
 */
export const APPS_DECK = 'apps-demo';

/**
 * The port of the dev server in the default brand.
 */
const DEFAULT_PORT = 5381;

/**
 * The port of the dev server in the nocturne brand.
 */
const NOCTURNE_PORT = 5382;

/**
 * The port the production build is previewed on.
 */
const PREVIEW_PORT = 5383;

/**
 * The base URLs of the three servers, with a trailing slash.
 */
export const APPS_URLS = {
  /**
   * The dev server in the default brand.
   */
  default: `http://localhost:${DEFAULT_PORT}/`,

  /**
   * The dev server in the nocturne brand.
   */
  nocturne: `http://localhost:${NOCTURNE_PORT}/`,

  /**
   * The production build under `vite preview`.
   */
  built: `http://localhost:${PREVIEW_PORT}/`,
} as const;

/**
 * Serves the apps-demo deck three ways before the suite's first test, and closes them after its
 * last: a dev server in each brand, and the deck's production build through `vite preview`. A taken
 * port fails the suite.
 */
export function useAppsServers(): void {
  const servers: (ViteDevServer | PreviewServer)[] = [];
  beforeAll(async () => {
    const options = { workspaceRoot: WORKSPACE_ROOT, deck: APPS_DECK };
    const ports = { default: DEFAULT_PORT, nocturne: NOCTURNE_PORT };
    for (const brand of ['default', 'nocturne'] as const) {
      const config = deckViteConfig({ ...options, brand });
      const server = await createServer(
        mergeConfig(config, {
          logLevel: 'error',
          server: { port: ports[brand], strictPort: true },
        }),
      );
      servers.push(server);
      await server.listen();
    }

    const config = mergeConfig(deckViteConfig(options), { logLevel: 'error' });
    await build(config);
    servers.push(
      await preview(mergeConfig(config, { preview: { port: PREVIEW_PORT, strictPort: true } })),
    );
  });
  afterAll(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });
}
