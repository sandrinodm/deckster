import type { PreviewServer, ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import { existsSync } from 'node:fs';
import { rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { build, createServer, mergeConfig, preview } from 'vite-plus';

import { deckViteConfig } from '#vite-config.ts';

import { FIXTURE_WORKSPACE, fixtureConfig } from './case-servers.ts';

/**
 * The workspace that holds the hello deck, which the CLI works on.
 */
export const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The comment fixture deck's folder.
 */
export const COMMENTS_DECK_DIR = path.join(FIXTURE_WORKSPACE, 'decks', 'comments');

/**
 * The hello deck's folder, whose comments the CLI resolves.
 */
export const HELLO_DECK_DIR = path.join(WORKSPACE_ROOT, 'decks', 'hello');

/**
 * Where each server of the comment suite listens.
 */
export const COMMENT_URLS = {
  /**
   * The comment fixture deck's dev server.
   */
  dev: 'http://localhost:5361/',

  /**
   * The comment fixture deck's production build, through `vite preview`.
   */
  build: 'http://localhost:5362/',

  /**
   * The hello deck's dev server, for the round trip through the CLI.
   */
  hello: 'http://localhost:5363/',
} as const;

/**
 * Removes the comments the suite leaves in a deck.
 *
 * @param deckDir - The deck folder.
 */
export async function removeFeedback(deckDir: string): Promise<void> {
  await rm(path.join(deckDir, '.feedback'), { recursive: true, force: true });
}

/**
 * Removes a deck's `.feedback` folder if the suite emptied it, leaving any comments a person left.
 *
 * @param deckDir - The deck folder.
 */
export async function removeEmptyFeedback(deckDir: string): Promise<void> {
  await rmdir(path.join(deckDir, '.feedback')).catch(() => undefined);
}

/**
 * Serves what the comment suite needs before its first test and closes it after its last: the
 * comment fixture deck from a dev server and as a production build, and the hello deck from a dev
 * server. The fixture deck starts and ends without comments; in the hello deck the suite deletes
 * the comments it adds and never touches others.
 */
export function useCommentServers(): void {
  const servers: (ViteDevServer | PreviewServer)[] = [];
  let helloHadFeedback = true;
  beforeAll(async () => {
    await removeFeedback(COMMENTS_DECK_DIR);
    helloHadFeedback = existsSync(path.join(HELLO_DECK_DIR, '.feedback'));
    const config = fixtureConfig('comments');
    const dev = await createServer(
      mergeConfig(config, { server: { port: 5361, strictPort: true } }),
    );
    servers.push(dev);
    await dev.listen();
    await build(config);
    servers.push(await preview(mergeConfig(config, { preview: { port: 5362, strictPort: true } })));
    const hello = deckViteConfig({ workspaceRoot: WORKSPACE_ROOT, deck: 'hello' });
    const helloDev = await createServer(
      mergeConfig(hello, { logLevel: 'error', server: { port: 5363, strictPort: true } }),
    );
    servers.push(helloDev);
    await helloDev.listen();
  });
  afterAll(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
    await removeFeedback(COMMENTS_DECK_DIR);
    // A hello deck that had no feedback before the suite gets none after it, even when a screenshot
    // or a write the suite started lands after the comment that owned it was deleted.
    await (helloHadFeedback ? removeEmptyFeedback(HELLO_DECK_DIR) : removeFeedback(HELLO_DECK_DIR));
  });
}
