import type { ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import path from 'node:path';
import { build, createServer, mergeConfig } from 'vite-plus';

import { deckViteConfig } from '#vite-config.ts';

import { FIXTURE_WORKSPACE } from './case-servers.ts';

/**
 * The fixture deck whose slides use the brand layouts.
 */
const DECK = 'brand-layouts';

/**
 * The brands the deck is served in: its own (`fx-brand`) and the one that has the `fx-hero` layout
 * the deck's second slide uses.
 */
export const LAYOUT_BRANDS = ['fx-brand', 'fx-other'] as const;

/**
 * One of {@link LAYOUT_BRANDS}.
 */
export type LayoutBrand = (typeof LAYOUT_BRANDS)[number];

/**
 * The port of the first brand's server; each later brand takes the next port.
 */
const FIRST_PORT = 5451;

/**
 * Where the deck's production build is written.
 */
export const BRAND_LAYOUTS_DIST = path.join(FIXTURE_WORKSPACE, 'decks', DECK, 'dist');

/**
 * The base URL of a brand's dev server, with a trailing slash.
 *
 * @param brand - The brand.
 */
export function layoutBrandUrl(brand: LayoutBrand): string {
  return `http://localhost:${FIRST_PORT + LAYOUT_BRANDS.indexOf(brand)}/`;
}

/**
 * Starts one dev server per brand, all serving the brand-layouts deck, and builds the deck in its
 * own brand to {@link BRAND_LAYOUTS_DIST}. Everything starts before the suite's first test and
 * closes after its last; a taken port fails the suite.
 */
export function useBrandLayoutServers(): void {
  const servers: ViteDevServer[] = [];
  beforeAll(async () => {
    for (const [index, brand] of LAYOUT_BRANDS.entries()) {
      const config = deckViteConfig({ workspaceRoot: FIXTURE_WORKSPACE, deck: DECK, brand });
      const server = await createServer(
        mergeConfig(config, {
          logLevel: 'error',
          server: { port: FIRST_PORT + index, strictPort: true },
        }),
      );
      servers.push(server);
      await server.listen();
    }

    const config = deckViteConfig({ workspaceRoot: FIXTURE_WORKSPACE, deck: DECK });
    await build(mergeConfig(config, { logLevel: 'silent' }));
  });
  afterAll(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });
}
