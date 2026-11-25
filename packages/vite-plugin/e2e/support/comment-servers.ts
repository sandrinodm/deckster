import type { Dirent } from 'node:fs';
import type { PreviewServer, ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import { readdir, rm, rmdir } from 'node:fs/promises';
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
 * Clears the disposable comment fixture before and after the suite.
 */
async function clearFixtureFeedback(): Promise<void> {
  await rm(path.join(COMMENTS_DECK_DIR, '.feedback'), { recursive: true, force: true });
}

/**
 * Lists the entries before or after the tests. A missing directory has no snapshot.
 */
async function feedbackEntries(dir: string): Promise<Dirent[] | undefined> {
  try {
    return await readdir(dir, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

/**
 * Removes files absent at setup, then prunes empty directories the suite created.
 */
async function removeNewFeedback(dir: string, before: Dirent[] | undefined): Promise<void> {
  const after = await feedbackEntries(dir);
  if (after === undefined) {
    return;
  }

  const existing = new Set(before?.map((entry) => path.join(entry.parentPath, entry.name)));
  const folders = before === undefined ? [dir] : [];
  for (const entry of after) {
    const file = path.join(entry.parentPath, entry.name);
    if (existing.has(file)) {
      continue;
    }

    if (entry.isDirectory()) {
      folders.push(file);
    } else {
      await rm(file, { force: true });
    }
  }

  for (const folder of folders.sort((a, b) => b.length - a.length)) {
    await rmdir(folder).catch(() => undefined);
  }
}

/**
 * Serves what the comment suite needs before its first test and closes it after its last: the
 * comment fixture deck from a dev server and as a production build, and the hello deck from a dev
 * server. The fixture deck starts and ends without comments. Teardown prunes only new feedback
 * files from the hello deck.
 */
export function useCommentServers(): void {
  const servers: (ViteDevServer | PreviewServer)[] = [];
  const helloFeedback = path.join(HELLO_DECK_DIR, '.feedback');
  let snapshot: { entries: Dirent[] | undefined } | undefined;
  beforeAll(async () => {
    await clearFixtureFeedback();
    snapshot = { entries: await feedbackEntries(helloFeedback) };
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
    await clearFixtureFeedback();
    if (snapshot !== undefined) {
      await removeNewFeedback(helloFeedback, snapshot.entries);
    }
  });
}
