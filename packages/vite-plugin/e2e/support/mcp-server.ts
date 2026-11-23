import type { ViteDevServer } from 'vite-plus';

import { agentError } from '@deckster/agent/errors';
import { createPageLink } from '@deckster/agent/page-link';
import { MCP_PATH } from '@deckster/agent/protocol';
import { deckMcpPlugin, MCP_RUNTIME_PLUGIN } from '@deckster/agent/vite';
import { afterAll, beforeAll } from 'e2e';
import { Effect } from 'effect';
import path from 'node:path';
import { createServer, mergeConfig } from 'vite-plus';

import { DEV_RUNTIME_PLUGINS } from '#plugin.ts';
import { deckViteConfig } from '#vite-config.ts';

/**
 * The workspace that holds the hello deck.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The port of the hello deck's dev server with the MCP endpoint.
 */
export const MCP_PORT = 5381;

/**
 * The token the suite's server expects.
 */
export const MCP_TOKEN = 'e2e-token';

/**
 * Where the suite's server and its MCP endpoint are.
 */
export const MCP_URLS = {
  /**
   * The deck page.
   */
  page: `http://127.0.0.1:${MCP_PORT}/`,

  /**
   * The MCP endpoint.
   */
  mcp: `http://127.0.0.1:${MCP_PORT}${MCP_PATH}`,
} as const;

/**
 * Fails an operation the suite does not use.
 */
const unused = () => Effect.fail(agentError('Not part of this suite.'));

/**
 * Serves the hello deck with the MCP endpoint and the page link, as `deckster dev --mcp` does, but
 * with tools that only know the page: `current_slide` and `goto` are real, the others fail. The
 * server closes after the last test.
 */
export function useMcpServer(): void {
  let server: ViteDevServer | undefined;
  beforeAll(async () => {
    const pageLink = createPageLink();
    const tools = {
      currentSlide: pageLink.current.pipe(
        Effect.map((page) =>
          page === undefined
            ? { connected: false as const, message: 'No deck window is open.' }
            : {
                connected: true as const,
                slide: {
                  id: page.slide.id,
                  number: page.slide.index + 1,
                  file: page.slide.file,
                  layout: page.slide.layout,
                  title: page.slide.title,
                },
                step: page.step,
                stepCount: page.stepCount,
                brand: page.brand,
                selection: page.selection,
                pages: page.pages,
              },
        ),
      ),
      deckOutline: unused(),
      slideFile: () => unused(),
      brandName: Effect.succeed('default'),
      deckLint: unused,
      deckScreenshot: unused,
      catalog: unused,
      comments: unused,
      goto: (input: { slide: string; step?: number }) =>
        pageLink
          .goto(input.slide, input.step ?? 0)
          .pipe(Effect.map((done) => ({ slide: done.slide, step: done.step }))),
      newSlide: unused,
      reorderSlides: unused,
      removeSlide: unused,
    };
    const base = deckViteConfig({
      workspaceRoot: WORKSPACE_ROOT,
      deck: 'hello',
      devRuntimePlugins: [...DEV_RUNTIME_PLUGINS, MCP_RUNTIME_PLUGIN],
    });
    server = await createServer(
      mergeConfig(base, {
        logLevel: 'error',
        plugins: [deckMcpPlugin({ tools, token: MCP_TOKEN, pageLink })],
        server: { host: '127.0.0.1', port: MCP_PORT, strictPort: true },
      }),
    );
    await server.listen();
  });
  afterAll(async () => {
    await server?.close();
  });
}
