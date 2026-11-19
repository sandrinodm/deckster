import type { BrowserContext, Page } from 'playwright';

import { expect, test } from 'e2e';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { DESKTOP_READY_MS, startDesktopChooser } from './support/desktop-chooser.ts';
import { findShellFiles } from './support/shell-app.ts';

/**
 * Covers startup, two selected decks, and a closing agent turn on a cold cache.
 */
const WORKFLOW_MS = 180_000;

/**
 * Electron's standalone binary may be absent from an install that skipped its downloader.
 */
const shell = findShellFiles();

test(
  'presents two selections in hidden Electron and retires their windows and sessions',
  { timeout: WORKFLOW_MS, skip: shell === undefined },
  async () => {
    const workspace = await startDesktopChooser();
    try {
      const [context] = workspace.browser.contexts();
      if (context === undefined) {
        throw new Error('Electron did not report a Chromium context.');
      }

      const chooser = await pageAt(
        context,
        'chooser',
        (url) => url.pathname === '/__deck/chooser/',
      );
      await chooser.getByRole('heading', { name: 'Choose a deck' }).waitFor();
      const firstCard = chooser.getByRole('button', { name: 'First deck hello' });
      const secondCard = chooser.getByRole('button', { name: 'Second deck second' });
      await firstCard.locator('img').waitFor({ timeout: DESKTOP_READY_MS });
      await secondCard.locator('img').waitFor({ timeout: DESKTOP_READY_MS });
      expect(await chooser.evaluate(() => 'deckShell' in window)).toBe(false);

      const galleryOrigin = new URL(chooser.url()).origin;
      const openingFirst = chooser.waitForResponse((response) =>
        response.url().endsWith('/open/hello'),
      );
      await firstCard.click();
      const firstKey = (await openingFirst).headers()['x-deck-selection'];
      expect(typeof firstKey).toBe('string');
      const first = await presentation(context, galleryOrigin, 'first');
      await returnButton(chooser).waitFor({ timeout: DESKTOP_READY_MS });
      expect(await returnButton(first.audience).count()).toBe(0);
      await expect
        .poll(() => first.presenter.getByTestId('notes').textContent())
        .toContain('Speaker notes for First deck opening');
      await first.presenter.getByTestId('timer-toggle').click();
      await expect
        .poll(() => first.presenter.getByTestId('elapsed').getAttribute('data-running'))
        .toBe('true');
      await first.audience.keyboard.press('ArrowRight');
      await expect.poll(() => first.presenter.evaluate(() => window.__deck?.position.step)).toBe(1);

      await chooser.reload();
      await returnButton(chooser).waitFor();
      await firstCard.click();
      await expect.poll(() => chooser.getByRole('status').textContent()).toBe('');
      expect(context.pages()).toHaveLength(3);
      const firstUrl = first.audience.url();

      await checkAgentConfirmation(chooser, first);
      await expect.poll(() => context.pages().length, { timeout: DESKTOP_READY_MS }).toBe(1);
      await expect.poll(() => serverClosed(firstUrl)).toBe(true);
      expect(await published(workspace.root, 'hello')).toBe(false);
      await returnButton(chooser).waitFor({ state: 'hidden', timeout: DESKTOP_READY_MS });

      await secondCard.click();
      const second = await presentation(context, galleryOrigin, 'second');
      await returnButton(chooser).waitFor({ timeout: DESKTOP_READY_MS });
      await expect
        .poll(() => second.presenter.getByTestId('notes').textContent())
        .toContain('Speaker notes for Second deck opening');
      expect(await second.presenter.getByTestId('elapsed').getAttribute('data-running')).toBe(
        'false',
      );
      expect(await second.audience.evaluate(() => window.__deck?.position.step)).toBe(0);
      expect(new URL(second.audience.url()).origin).not.toBe(new URL(firstUrl).origin);
      const secondUrl = second.audience.url();
      const staleReturn = await chooser.evaluate(
        (selection) =>
          new Promise((resolve) => {
            window.dispatchEvent(
              new CustomEvent('deckster:return-to-chooser', {
                detail: { selection, done: resolve },
              }),
            );
          }),
        firstKey,
      );
      expect(staleReturn).toBe(false);
      expect(second.audience.isClosed()).toBe(false);
      await returnButton(chooser).click();
      await expect.poll(() => context.pages().length, { timeout: DESKTOP_READY_MS }).toBe(1);
      await expect.poll(() => serverClosed(secondUrl)).toBe(true);
      await secondCard.click();
      const reopened = await presentation(context, galleryOrigin, 'reopened');
      await returnButton(chooser).waitFor({ timeout: DESKTOP_READY_MS });
      const reopenedUrl = reopened.audience.url();
      const chooserUrl = chooser.url();
      await chooser.close().catch(() => undefined);
      expect(await workspace.exited).toBe(0);
      expect(await published(workspace.root, 'second')).toBe(false);
      expect(await serverClosed(reopenedUrl)).toBe(true);
      expect(await serverClosed(chooserUrl)).toBe(true);
    } catch (error) {
      const pages = workspace.browser.contexts().flatMap((context) => context.pages());
      const open = pages.map((page) => page.url()).join(', ');
      const gallery = pages.find((page) => page.url().includes('/__deck/chooser/'));
      const status = await gallery
        ?.getByRole('status')
        .textContent({ timeout: 1000 })
        .catch(() => undefined);
      throw new Error(
        `${String(error)}\nGallery status: ${status ?? ''}\nOpen windows: ${open}\n${workspace.diagnostics()}`,
        {
          cause: error,
        },
      );
    } finally {
      await workspace.cleanup();
    }
  },
);

test(
  'moves the sole-display return control when a presenter opens and closes',
  { timeout: WORKFLOW_MS, skip: shell === undefined },
  async () => {
    const workspace = await startDesktopChooser([]);
    try {
      const [context] = workspace.browser.contexts();
      if (context === undefined) {
        throw new Error('Electron did not report a Chromium context.');
      }

      const chooser = await pageAt(
        context,
        'chooser',
        (url) => url.pathname === '/__deck/chooser/',
      );
      await chooser.getByRole('button', { name: 'First deck hello' }).click();
      const origin = new URL(chooser.url()).origin;
      const audience = await pageAt(context, 'audience', (url) => url.origin !== origin);
      const displays = await audience.evaluate(() => window.deckShell?.displays());
      if (displays?.length === 1) {
        await returnButton(audience).waitFor();
      }

      await audience.evaluate(() => window.deckShell?.openPresenter());
      const presenter = await pageAt(context, 'presenter', (url) =>
        url.searchParams.has('presenter'),
      );
      await returnButton(presenter).waitFor();
      await returnButton(audience).waitFor({ state: 'detached' });
      await presenter.close();
      if (displays?.length === 1) {
        await returnButton(audience).waitFor();
        await returnButton(audience).click();
      } else {
        await returnButton(chooser).click();
      }

      await expect.poll(() => context.pages().length, { timeout: DESKTOP_READY_MS }).toBe(1);
    } finally {
      await workspace.cleanup();
    }
  },
);

test(
  'keeps built kiosk controls on the chooser and closes the preview server',
  { timeout: WORKFLOW_MS, skip: shell === undefined },
  async () => {
    const workspace = await startDesktopChooser(['--built', '--kiosk']);
    try {
      const [context] = workspace.browser.contexts();
      if (context === undefined) {
        throw new Error('Electron did not report a Chromium context.');
      }

      const chooser = await pageAt(
        context,
        'chooser',
        (url) => url.pathname === '/__deck/chooser/',
      );
      await chooser.getByRole('button', { name: 'First deck hello' }).click();
      const origin = new URL(chooser.url()).origin;
      const audience = await pageAt(context, 'audience', (url) => url.origin !== origin);
      await audience.waitForFunction(() => window.__deck !== undefined);
      await returnButton(chooser).waitFor({ timeout: DESKTOP_READY_MS });
      expect(await returnButton(audience).count()).toBe(0);
      expect(await audience.locator('#deck-chooser-link').count()).toBe(0);
      expect(await audience.locator('.da-textarea').count()).toBe(0);
      const url = audience.url();
      await returnButton(chooser).click();
      await expect.poll(() => context.pages().length, { timeout: DESKTOP_READY_MS }).toBe(1);
      await expect.poll(() => serverClosed(url)).toBe(true);
    } finally {
      await workspace.cleanup();
    }
  },
);

/**
 * Starts a long fake turn, verifies cancellation keeps its windows, then confirms closing it.
 */
async function checkAgentConfirmation(
  chooser: Page,
  { audience, presenter }: { audience: Page; presenter: Page },
): Promise<void> {
  const editor = audience.locator('.da-textarea');
  await editor.fill('Show a long response [fake:long]');
  await editor.press('Enter');
  await audience.locator('.da-send[data-variant="stop"]').waitFor();
  await returnButton(presenter).click();
  const keep = chooser.getByRole('button', { name: 'Keep presenting' });
  await keep.click();
  await keep.waitFor({ state: 'hidden' });
  expect(audience.isClosed()).toBe(false);
  expect(presenter.isClosed()).toBe(false);

  await returnButton(presenter).click();
  await chooser.getByRole('button', { name: 'Stop agent and leave deck' }).click();
}

/**
 * Locates the operator control in a chooser or presenter window.
 */
function returnButton(page: Page) {
  return page.getByRole('button', { name: 'Back to decks', exact: true });
}

/**
 * Finds the audience and presenter windows belonging to the active deck rather than the chooser.
 */
async function presentation(
  context: BrowserContext,
  galleryOrigin: string,
  name: string,
): Promise<{ audience: Page; presenter: Page }> {
  const audience = await pageAt(
    context,
    name + ' audience',
    (url) => url.origin !== galleryOrigin && !url.searchParams.has('presenter'),
  );
  const presenter = await pageAt(
    context,
    name + ' presenter',
    (url) => url.origin !== galleryOrigin && url.searchParams.has('presenter'),
  );
  await audience.waitForFunction(() => window.__deck !== undefined);
  await presenter.waitForFunction(() => window.__deck !== undefined);
  return { audience, presenter };
}

/**
 * Waits for a native window to navigate to its role instead of matching a transient blank page.
 */
async function pageAt(
  context: BrowserContext,
  role: string,
  matches: (url: URL) => boolean,
): Promise<Page> {
  let found: Page | undefined;
  await expect
    .poll(
      () => {
        found = context.pages().find((page) => {
          const url = URL.parse(page.url());
          return url?.protocol === 'http:' && matches(url);
        });
        return found === undefined ? `waiting for ${role}` : role;
      },
      { timeout: DESKTOP_READY_MS },
    )
    .toBe(role);
  if (found === undefined) {
    throw new Error('The expected Electron window did not open.');
  }

  return found;
}

/**
 * Checks the workspace's session publication once the selection has closed.
 */
function published(workspace: string, deck: string): Promise<boolean> {
  const file = path.join(workspace, '.deck', 'agent', deck, 'server.json');
  return stat(file).then(
    () => true,
    () => false,
  );
}

/**
 * A retired server refuses new HTTP requests.
 */
function serverClosed(url: string): Promise<boolean> {
  return fetch(url).then(
    () => false,
    () => true,
  );
}
