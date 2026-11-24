import type { PreviewServer, ViteDevServer } from 'vite-plus';

import { afterAll, beforeAll } from 'e2e';
import { cp, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, createServer, mergeConfig, preview } from 'vite-plus';

import { deckViteConfig } from '#vite-config.ts';

import { FIXTURE_WORKSPACE } from './case-servers.ts';

/**
 * The fixture deck with a brand code layout, a deck code layout and a layout that fails to load.
 */
const DECK = 'code-layouts';

/**
 * The fixture brand whose `layouts/` folder holds a code layout.
 */
const BRAND = 'fx-code';

/**
 * The port of the fixture deck's dev server.
 */
const DEV_PORT = 5461;

/**
 * The port the fixture deck's production build is previewed on.
 */
const PREVIEW_PORT = 5462;

/**
 * The port of the dev server over the copy of the deck the tests edit.
 */
const EDIT_PORT = 5463;

/**
 * Where each way of serving the fixture deck listens.
 */
export const CODE_LAYOUT_TARGETS = [
  { name: 'dev server', url: `http://localhost:${DEV_PORT}/` },
  { name: 'production build', url: `http://localhost:${PREVIEW_PORT}/` },
] as const;

/**
 * The base URL of the dev server over the copy the tests edit, with a trailing slash.
 */
export const EDIT_URL = `http://localhost:${EDIT_PORT}/`;

/**
 * The copy of the deck and its brand that the tests edit, in a temporary workspace.
 */
export type EditableWorkspace = {
  /**
   * The absolute path of a file of the copy.
   *
   * @param file - The path relative to the workspace, with forward slashes.
   */
  readonly file: (file: string) => string;

  /**
   * Replaces text in a file of the copy, which the dev server's watcher then reports.
   *
   * @param file - The path relative to the workspace, with forward slashes.
   * @param from - The text to replace; the edit fails when the file does not contain it.
   * @param to - Its replacement.
   */
  readonly edit: (file: string, from: string, to: string) => Promise<void>;
};

/**
 * Serves the code-layouts deck three ways for the suite: from a dev server and as a production
 * build through `vite preview`, both over the fixtures, and from a dev server with hot updates over
 * a copy in a temporary workspace, so tests can edit layouts without touching the repository.
 * Everything starts before the suite's first test and closes after its last; a taken port fails the
 * suite.
 *
 * @returns The copy the tests edit; its methods work once the suite has started.
 */
export function useCodeLayoutServers(): EditableWorkspace {
  const servers: (ViteDevServer | PreviewServer)[] = [];
  let root: string | undefined;
  /**
   * The absolute path of a file of the copy.
   *
   * @param file - The path relative to the workspace.
   */
  const fileOf = (file: string): string => path.join(root ?? '', ...file.split('/'));
  beforeAll(async () => {
    const config = mergeConfig(deckViteConfig({ workspaceRoot: FIXTURE_WORKSPACE, deck: DECK }), {
      logLevel: 'silent',
    });
    const dev = await createServer(
      mergeConfig(config, { server: { port: DEV_PORT, strictPort: true } }),
    );
    servers.push(dev);
    await dev.listen();
    await build(config);
    servers.push(
      await preview(mergeConfig(config, { preview: { port: PREVIEW_PORT, strictPort: true } })),
    );

    root = await copyWorkspace();
    const editable = await createServer(
      mergeConfig(deckViteConfig({ workspaceRoot: root, deck: DECK }), {
        logLevel: 'silent',
        server: { port: EDIT_PORT, strictPort: true },
      }),
    );
    servers.push(editable);
    await editable.listen();
  });
  afterAll(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true });
    }
  });
  return {
    file: fileOf,
    edit: async (file, from, to) => {
      const text = await readFile(fileOf(file), 'utf8');
      if (!text.includes(from)) {
        throw new Error(`${file} does not contain ${JSON.stringify(from)}`);
      }

      await writeFile(fileOf(file), text.replace(from, to));
    },
  };
}

/**
 * Copies the fixture deck and its brand into a new temporary workspace, without build output.
 *
 * @returns The absolute workspace root, with symlinks resolved, as the watcher reports paths.
 */
async function copyWorkspace(): Promise<string> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'deck-code-layouts-')));
  for (const folder of [path.join('decks', DECK), path.join('brands', BRAND)]) {
    await cp(path.join(FIXTURE_WORKSPACE, folder), path.join(root, folder), {
      recursive: true,
      filter: (file) => !['dist', 'node_modules'].includes(path.basename(file)),
    });
  }

  // Node imports the copy's deck config and brand, which find the framework through this link.
  await symlink(
    path.resolve(import.meta.dirname, '../../node_modules'),
    path.join(root, 'node_modules'),
  );
  return root;
}
