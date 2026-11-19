import type { Browser } from 'playwright';

import { expect } from 'e2e';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

import { createChooserWorkspace } from './chooser-workspace.ts';

/**
 * Time allowed for Electron startup and cold compilation of the fixture decks.
 */
export const DESKTOP_READY_MS = 45_000;

/**
 * The Electron test app that publishes the temporary profile path for Playwright.
 */
const TEST_APP = path.join(import.meta.dirname, 'desktop-chooser-app.fixture.mjs');

/**
 * The CLI entry as used directly from a checkout.
 */
const CLI_ENTRY = path.resolve(import.meta.dirname, '../../../cli/src/bin.ts');

/**
 * The hidden browser connection, workspace paths and cleanup for one CLI presentation.
 */
type DesktopChooser = {
  /**
   * The real Chromium instances in the Electron app.
   */
  readonly browser: Browser;

  /**
   * The workspace root, for checking cleanup of deck sessions.
   */
  readonly root: string;

  /**
   * Completes with the CLI exit code, or null if a signal terminated it directly.
   */
  readonly exited: Promise<number | null>;

  /**
   * Stops the command and removes the temporary test workspace.
   */
  readonly cleanup: () => Promise<void>;

  /**
   * The CLI output, including startup and selection errors.
   */
  readonly diagnostics: () => string;
};

/**
 * Runs the real CLI with two decks and connects only to the hidden Electron window server. Rejects
 * with the CLI's diagnostics if startup or the CDP connection fails.
 */
export async function startDesktopChooser(): Promise<DesktopChooser> {
  const root = await createChooserWorkspace();
  const marker = path.join(root, 'test-electron-profile');
  const child = spawn(process.execPath, [CLI_ENTRY, 'present', '--presenter', '--agent', 'fake'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DECK_ROOT: root,
      DECK: '',
      DECK_SHELL_TEST_APP_MODULE: TEST_APP,
      DECK_SHELL_TEST_HIDDEN: '1',
      DECK_CHOOSER_TEST_PROFILE: marker,
      DECK_TEST_FAKE_AGENT: '1',
      DECK_FAKE_DELAY_MS: '100',
    },
  });
  const exited = once(child, 'exit').then(([code]: unknown[]) =>
    typeof code === 'number' ? code : null,
  );
  let output = '';
  let browser: Browser | undefined;
  /**
   * Retains the CLI's terminal output for diagnosing a missing or crashed window.
   */
  const record = (chunk: Buffer): void => {
    output += chunk.toString();
  };
  child.stdout.on('data', record);
  child.stderr.on('data', record);

  /**
   * Leaves the running selection's finalizers enough time to retire the Electron app and server.
   */
  const cleanup = async (): Promise<void> => {
    await browser?.close().catch(() => undefined);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }

    await exited.catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  };

  try {
    const endpoint = await Promise.race([
      readEndpoint(marker, () => output.includes('Choose a deck in Deckster.')),
      exited.then((code) => {
        throw new Error(`The presentation exited with code ${String(code)}. ${output}`);
      }),
    ]);
    browser = await chromium.connectOverCDP(endpoint, { timeout: DESKTOP_READY_MS });
    return { browser, root, exited, cleanup, diagnostics: () => output };
  } catch (error) {
    await cleanup();
    throw new Error(`Could not connect to the hidden Electron chooser. ${output}`, {
      cause: error,
    });
  }
}

/**
 * Waits for Chromium to publish the actual loopback port in the shell's temporary profile.
 */
async function readEndpoint(marker: string, chooserReady: () => boolean): Promise<string> {
  let port: string | undefined;
  await expect
    .poll(
      async () => {
        if (!chooserReady()) {
          return false;
        }

        try {
          const folder = await readFile(marker, 'utf8');
          const address = await readFile(path.join(folder, 'DevToolsActivePort'), 'utf8');
          port = address.split('\n')[0];
          return Number(port) > 0;
        } catch {
          return false;
        }
      },
      { timeout: DESKTOP_READY_MS },
    )
    .toBe(true);
  return `http://127.0.0.1:${port ?? ''}`;
}
