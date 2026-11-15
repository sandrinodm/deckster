import type { ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import path from 'node:path';
import { createServer, mergeConfig } from 'vite-plus';

import { deckViteConfig } from '#vite-config.ts';

/**
 * The repository workspace, which holds the components deck and links both brands.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The port of the components deck's dev server.
 */
const COMPONENTS_PORT = 5325;

/**
 * The base URL of the components deck's dev server, with a trailing slash.
 */
export const COMPONENTS_URL = `http://localhost:${COMPONENTS_PORT}/`;

/**
 * Starts a dev server for the components deck before the suite's first test and closes it after its
 * last. A taken port fails the suite instead of moving to another port.
 */
export function useComponentsServer(): void {
  let server: ViteDevServer | undefined;
  beforeAll(async () => {
    const config = deckViteConfig({ workspaceRoot: WORKSPACE_ROOT, deck: 'components' });
    server = await createServer(
      mergeConfig(config, {
        logLevel: 'error',
        server: { port: COMPONENTS_PORT, strictPort: true },
      }),
    );
    await server.listen();
  });
  afterAll(async () => {
    await server?.close();
  });
}
