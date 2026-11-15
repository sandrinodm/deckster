import type { ViteDevServer } from 'vite-plus';

import { findBrandedApp } from '@deckster/shell/bundle';
import { afterAll, beforeAll } from 'e2e';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer, mergeConfig } from 'vite-plus';

import { deckViteConfig } from '#vite-config.ts';

/**
 * The workspace that holds the hello deck.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The port of the hello deck's dev server for the shell suite.
 */
export const SHELL_PORT = 5384;

/**
 * The deck URL the shell window loads.
 */
export const SHELL_URL = `http://127.0.0.1:${SHELL_PORT}/`;

/**
 * Where Electron's executable and the shell's entry file are.
 */
export type ShellFiles = {
  /**
   * The Electron executable.
   */
  executable: string;

  /**
   * The shell's main file.
   */
  entry: string;
};

/**
 * Finds the executable `deck present` starts and the shell's entry file, without loading `electron`
 * (which would download the binary): the branded `Deckster.app` when the CLI or its tests already
 * built it (this never builds it), else the Electron binary `@deckster/shell` installed.
 * `undefined` when the binary is not downloaded, so the suite skips instead of failing.
 */
export function findShellFiles(): ShellFiles | undefined {
  try {
    const require = createRequire(import.meta.url);
    const shellPackage = require.resolve('@deckster/shell/package.json');
    const electronDir = path.dirname(createRequire(shellPackage).resolve('electron/package.json'));
    const executable = path.join(
      electronDir,
      'dist',
      readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim(),
    );
    if (!existsSync(executable)) {
      return undefined;
    }

    return {
      executable: findBrandedApp(WORKSPACE_ROOT, electronDir) ?? realpathSync(executable),
      entry: require.resolve('@deckster/shell/main'),
    };
  } catch {
    return undefined;
  }
}

/**
 * Serves the hello deck on {@link SHELL_PORT} for the suite and closes the server afterwards.
 */
export function useShellServer(): void {
  let server: ViteDevServer | undefined;
  beforeAll(async () => {
    const config = deckViteConfig({ workspaceRoot: WORKSPACE_ROOT, deck: 'hello' });
    server = await createServer(
      mergeConfig(config, {
        logLevel: 'error',
        server: { host: '127.0.0.1', port: SHELL_PORT, strictPort: true },
      }),
    );
    await server.listen();
  });
  afterAll(async () => {
    await server?.close();
  });
}
