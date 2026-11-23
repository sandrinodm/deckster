import type { ElectronApplication, Page } from 'playwright';

import { afterAll, beforeAll, describe, expect, test } from 'e2e';
import { _electron as electron } from 'playwright';

import { findShellFiles, SHELL_URL, useShellServer } from './support/shell-app.ts';

/**
 * Electron's files, or `undefined` when the binary is not downloaded: the tests then skip.
 */
const files = findShellFiles();

useShellServer();

/**
 * The console errors and warnings and uncaught errors a window logged, to fail the test on any.
 *
 * @param page - A window of the app.
 * @param problems - Where they are collected.
 */
function watchProblems(page: Page, problems: string[]): void {
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
}

/**
 * The text of an element, or `null` while it is not there.
 *
 * @param page - A window.
 * @param selector - A CSS selector.
 */
function textOf(page: Page, selector: string): Promise<string | null> {
  return page.evaluate((css) => document.querySelector(css)?.textContent ?? null, selector);
}

/**
 * The first line of an error's message, for a skip reason.
 *
 * @param error - What was thrown.
 */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0]?.trim() || 'unknown error';
}

describe('the desktop shell, hidden, through Playwright', () => {
  let app: ElectronApplication | undefined;
  let audience: Page | undefined;
  let launchFailure: string | undefined;

  /**
   * Starts the shell hidden and waits until its window holds the deck. Throws when Electron or its
   * renderer does not survive that far.
   */
  const launch = async (shellFiles: NonNullable<typeof files>): Promise<void> => {
    app = await electron.launch({
      executablePath: shellFiles.executable,
      args: [shellFiles.entry],
      timeout: 30_000,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        DECK_SHELL_TEST_HIDDEN: '1',
        DECK_SHELL_CONFIG: JSON.stringify({
          url: SHELL_URL,
          title: 'Hello, deck',
          backgroundColor: '#ffffff',
          watchParent: false,
          plan: { audience: { displayId: 0, fullscreen: true }, kiosk: false },
        }),
      },
    });
    audience = await app.firstWindow();
    await audience.waitForFunction(() => window.__deck !== undefined, undefined, {
      timeout: 30_000,
    });
  };

  beforeAll(async () => {
    if (files === undefined) {
      return;
    }

    // Where no window server is reachable (a background job, an agent sandbox) Electron starts and
    // its renderer crashes at once. It also crashes under `vp run` with caching on: the task
    // runner's file tracer is injected into the sandboxed renderer and aborts it, which is why
    // `pnpm test:e2e` passes `--no-cache`. A shell that cannot show the deck twice is skipped.
    for (const attempt of [1, 2]) {
      try {
        await launch(files);
        launchFailure = undefined;
        return;
      } catch (error) {
        launchFailure = `attempt ${attempt}: ${firstLine(error)}`;
        await app?.close().catch(() => undefined);
        app = undefined;
        audience = undefined;
      }
    }
  });

  afterAll(async () => {
    await app?.close().catch(() => undefined);
  });

  test(
    'loads the hello deck, exposes window.deckShell, and keeps the presenter window in sync',
    {
      skip:
        files === undefined && 'Electron is not downloaded: run `pnpm deckster electron install`.',
    },
    async () => {
      if (files === undefined) {
        return;
      }

      if (launchFailure !== undefined) {
        test.skip(`Electron could not start here (${launchFailure}).`);
      }

      const launched = app;
      const audienceWindow = audience;
      if (launched === undefined || audienceWindow === undefined) {
        throw new Error('The shell was not launched.');
      }

      const problems: string[] = [];
      try {
        watchProblems(audienceWindow, problems);
        await audienceWindow.waitForFunction(() => window.__deck !== undefined);
        await audienceWindow.evaluate(() => window.__deck?.ready());
        expect(await textOf(audienceWindow, 'h1')).toContain('Hello, deck');
        expect(await audienceWindow.evaluate(() => window.deckShell?.isShell)).toBe(true);
        expect(
          await audienceWindow.evaluate(() => Object.keys(window.deckShell ?? {}).sort()),
        ).toEqual([
          'displays',
          'isFullscreen',
          'isShell',
          'moveToDisplay',
          'onFullscreenChange',
          'openPresenter',
          'setFullscreen',
        ]);
        const paths = await launched.evaluate(({ app: electronApp }) => ({
          userData: electronApp.getPath('userData'),
          sessionData: electronApp.getPath('sessionData'),
          crashDumps: electronApp.getPath('crashDumps'),
          logs: electronApp.getPath('logs'),
          appData: electronApp.getPath('appData'),
        }));
        expect(paths.userData).toMatch(/deck-shell-[^/\\]+$/);
        expect(paths.sessionData).toBe(paths.userData);
        for (const folder of [paths.userData, paths.crashDumps, paths.logs]) {
          expect(folder.startsWith(paths.userData), JSON.stringify(paths)).toBe(true);
          expect(folder.startsWith(paths.appData), JSON.stringify(paths)).toBe(false);
        }

        const displays = await audienceWindow.evaluate(() => window.deckShell?.displays());
        expect(displays?.length).toBeGreaterThanOrEqual(1);
        expect(await audienceWindow.evaluate(() => window.deckShell?.isFullscreen())).toBe(false);

        await audienceWindow.evaluate(() => window.deckShell?.openPresenter());
        await expect.poll(() => launched.windows().length).toBe(2);
        const presenter = launched.windows().find((window) => window !== audienceWindow);
        if (presenter === undefined) {
          throw new Error('The presenter window did not open.');
        }

        watchProblems(presenter, problems);
        expect(presenter.url()).toContain('?presenter');
        await expect
          .poll(() => textOf(presenter, '[data-testid="slide-count"]'))
          .toContain('Slide 1 of 4');
        expect(await textOf(presenter, '[data-testid="notes"]')).toContain('Welcome everyone');

        await audienceWindow.evaluate(() => window.__deck?.goto(1, 1));
        await expect
          .poll(() => textOf(presenter, '[data-testid="slide-count"]'))
          .toContain('Slide 2 of 4');
        await presenter.evaluate(() => window.__deck?.goto(3, 0));
        await expect
          .poll(() => audienceWindow.evaluate(() => window.__deck?.position.slide))
          .toBe(3);
        await expect
          .poll(() => textOf(presenter, '[data-testid="slide-count"]'))
          .toContain('Slide 4 of 4');

        await audienceWindow.evaluate(() => window.deckShell?.openPresenter());
        expect(launched.windows()).toHaveLength(2);
        expect(problems).toEqual([]);
      } finally {
        await launched.close();
        app = undefined;
      }
    },
  );
});
