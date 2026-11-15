import type { ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import { createServer, mergeConfig } from 'vite-plus';

import { fixtureConfig } from './case-servers.ts';

/**
 * The port of the app cases deck's dev server. The `no-bridge` slide loads a page from the same
 * port under another host name, which makes it another origin.
 */
const APPS_CASES_PORT = 5441;

/**
 * The base URL of the app cases deck, on `127.0.0.1` so that `localhost` is another origin.
 */
export const APPS_CASES_URL = `http://127.0.0.1:${APPS_CASES_PORT}/`;

/**
 * Starts a dev server for the app cases fixture deck before the suite's first test and closes it
 * after its last. A taken port fails the suite.
 */
export function useAppsCasesServer(): void {
  let server: ViteDevServer | undefined;
  beforeAll(async () => {
    server = await createServer(
      mergeConfig(fixtureConfig('apps-cases'), {
        server: { host: '127.0.0.1', port: APPS_CASES_PORT, strictPort: true },
      }),
    );
    await server.listen();
  });
  afterAll(async () => {
    await server?.close();
  });
}
