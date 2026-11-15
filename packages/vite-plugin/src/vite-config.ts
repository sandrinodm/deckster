import type { InlineConfig } from 'vite-plus';

import { commentsVitePlugin } from '@deckster/comments/vite';
import { KIT_SCAN_ENTRY, kitVitePlugins } from '@deckster/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deckAppsPlugin } from '#apps/apps-plugin.ts';
import { deckCacheDirPlugin } from '#deck-cache-dir.ts';
import { deckCssGuardPlugin, refuseStylesheetCode } from '#deck-css-guard.ts';
import { deckStateGuardPlugin } from '#deck-state-guard.ts';
import { deckLocation } from '#decks/deck-paths.ts';
import { deckPlugin, type DeckPluginOptions } from '#plugin.ts';

/**
 * The framework's own checkout: the folder that contains `packages/`. Its packages, brand fonts and
 * dependencies stay readable when the workspace is another folder, such as `e2e/fixtures/`.
 */
const FRAMEWORK_ROOT = path.resolve(import.meta.dirname, '../../..');

/**
 * The engine's app shell (`index.html` and `main.tsx`), served as the Vite root.
 */
const ENGINE_APP_DIR = path.dirname(fileURLToPath(import.meta.resolve('@deckster/engine/app')));

/**
 * Files the React plugin compiles, MDX output included so slides get Fast Refresh.
 */
const REACT_FILES_PATTERN = /\.(?:mdx|[jt]sx?)$/;

/**
 * Dependencies to pre-bundle up front, so the first page load never reloads mid-test.
 */
const PREBUNDLED_DEPENDENCIES = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
];

/**
 * Vite's own default `server.fs.deny`, which setting the option replaces.
 */
const VITE_FS_DENY = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**'];

/**
 * The files the dev server transforms at start when asked to warm up, relative to the engine's app
 * root.
 */
const WARMUP_FILES = ['./main.tsx', './start-errors.ts'];

/**
 * How the server a config is for is used.
 */
export type DeckServingOptions = {
  /**
   * Transform the engine's entry files at start (`server.warmup`), so the first page load finds
   * them ready. Only a server that stays up for people (`deck dev`, `deck present`) wants it.
   */
  warmup?: boolean;
};

/**
 * The complete Vite configuration for serving, building or previewing one deck. The engine's app
 * shell is the root; the deck's `public/` folder is served as static files, and a build goes to
 * `decks/<deck>/dist` with relative URLs so it can be hosted under any path. Tailwind v4 compiles
 * the brand's stylesheet (`virtual:deck/brand.css`). Each deck, brand and mode caches pre-bundled
 * dependencies in its own `node_modules/.vite/deck-*` folder, and concurrent dev servers each claim
 * their own (`deckCacheDirPlugin`). The dev server transforms the engine's `main.tsx`,
 * `start-errors.ts` and their imports at start (`server.warmup`, with `serving.warmup`), so the
 * first page load finds them ready. While serving, `@deckster/comments/vite` stamps the deck's own
 * elements with their source location and serves `/__deck/comments`. The dev server never serves
 * `.deck/` (the agent's MCP token, journal, screenshots and turn working copies live there) and no
 * module is ever loaded from it (`deckStateGuardPlugin`), answers no cross-origin request (no
 * CORS), and no stylesheet may load Node code through Tailwind (`@plugin`, `@config`:
 * `deckCssGuardPlugin` closes Tailwind's module loader for the process).
 *
 * @param options - The workspace, the deck and the runtime plugins.
 * @param serving - How the server is used; the warm-up is off unless asked for, so short-lived
 *   servers (shots, lint, export, tests) neither pay for it nor race it when they close.
 * @returns An inline config for `createServer`, `build` or `preview`; it ignores any
 *   `vite.config.ts` on disk.
 */
export function deckViteConfig(
  options: DeckPluginOptions,
  serving: DeckServingOptions = {},
): InlineConfig {
  const deck = deckLocation(options.workspaceRoot, options.deck);
  const deckVitePlugin = deckPlugin(options);
  refuseStylesheetCode();
  return {
    configFile: false,
    root: ENGINE_APP_DIR,
    base: './',
    publicDir: path.join(deck.dir, 'public'),
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: PREBUNDLED_DEPENDENCIES, entries: ['index.html', KIT_SCAN_ENTRY] },
    server: {
      fs: {
        allow: [options.workspaceRoot, FRAMEWORK_ROOT],
        deny: [...VITE_FS_DENY, '**/.deck/**'],
      },
      cors: false,
      ...(serving.warmup === true ? { warmup: { clientFiles: WARMUP_FILES } } : {}),
    },
    build: { outDir: path.join(deck.dir, 'dist'), emptyOutDir: true },
    plugins: [
      deckStateGuardPlugin(options.workspaceRoot),
      deckCacheDirPlugin(options),
      deckVitePlugin,
      deckAppsPlugin(options),
      ...kitVitePlugins(),
      deckCssGuardPlugin(),
      tailwindcss(),
      react({ include: REACT_FILES_PATTERN }),
      commentsVitePlugin({
        workspaceRoot: options.workspaceRoot,
        deck: deckVitePlugin.api.activeDeck,
      }),
    ],
  };
}
