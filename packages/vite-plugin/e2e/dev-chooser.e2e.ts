import { test, type Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { startChooser } from './support/chooser-workspace.ts';

/**
 * The fixed port the browser suite reserves for the chooser.
 */
const PORT = 5389;

/**
 * The allowance for the full browser workflow on a cold Vite cache, in milliseconds.
 */
const WORKFLOW_MS = 180_000;

/**
 * The maximum time for an individual cold render, in milliseconds.
 */
const CONTENT_MS = 45_000;

/**
 * An undiscovered and unselectable folder.
 */
const NON_DECK_ID = 'absent';

/**
 * The HTTP status of a request from a foreign origin.
 */
const REFUSED = 403;

test(
  'picks a deck, updates its cover, and switches without leaving the previous session running',
  {
    timeout: WORKFLOW_MS,
  },
  async ({ app, screen, browser }) => {
    const workspace = await startChooser(PORT);
    try {
      await app.open(workspace.url);
      const chooser = screen.getByRole('heading', 'Choose a deck');
      const first = screen.getByRole('button', 'First deck hello');
      const second = screen.getByRole('button', 'Second deck second');
      await expect(chooser).toBeVisible();
      await expect(first).toBeVisible();
      await expect(second).toBeVisible();

      const picture = browser.locator('button[data-deck="hello"] img');
      await expect(picture).toBeVisible({ timeout: CONTENT_MS });
      const initialCover = await cover(browser);
      expect(initialCover.width).toBe(480);
      expect(initialCover.height).toBe(270);
      expect(initialCover.ratio).toBeCloseTo(16 / 9);
      expect(initialCover.objectFit).toBe('contain');

      const secondPicture = browser.locator('button[data-deck="second"] img');
      await expect(secondPicture).toBeVisible({ timeout: CONTENT_MS });
      const secondCover = await cover(browser, 'second');

      await first.press('Enter');
      await expect(screen.getByRole('heading', 'First deck opening')).toBeVisible({
        timeout: CONTENT_MS,
      });
      await expect(screen.getByText('Later content')).toBeHidden();
      await browser.keyboard.press('ArrowRight');
      await expect(screen.getByText('Later content')).toBeVisible();
      const firstUrl = await browser.url();
      expect(new URL(firstUrl).port).not.toBe(String(PORT));
      expect(await hasPublishedSession(workspace.root, 'hello')).toBe(true);

      await browser.reload();
      await expect(screen.getByRole('heading', 'First deck opening')).toBeVisible({
        timeout: CONTENT_MS,
      });
      await app.back();
      await expect(chooser).toBeVisible();
      await first.tap();
      await expect(screen.getByRole('heading', 'First deck opening')).toBeVisible({
        timeout: CONTENT_MS,
      });
      expect(new URL(await browser.url()).origin).toBe(new URL(firstUrl).origin);
      await screen.getByRole('link', 'Back to decks').tap();
      await expect(chooser).toBeVisible();
      await expect(screen.getByRole('button', 'Close deck')).toBeHidden({ timeout: CONTENT_MS });
      expect(await hasPublishedSession(workspace.root, 'hello')).toBe(false);
      expect(await serverClosed(firstUrl)).toBe(true);

      await second.tap();
      await expect(screen.getByRole('heading', 'Second deck opening')).toBeVisible({
        timeout: CONTENT_MS,
      });
      const secondUrl = await browser.url();
      expect(new URL(secondUrl).origin).not.toBe(new URL(firstUrl).origin);
      await workspace.updateOpening('second', 'Updated deck opening');
      const updatedTitle = screen.getByRole('heading', 'Updated deck opening');
      await expect(updatedTitle).toBeVisible({ timeout: CONTENT_MS });
      expect(await hasPublishedSession(workspace.root, 'second')).toBe(true);

      const foreignSelection = await fetch(`${workspace.url}open/${NON_DECK_ID}`, {
        method: 'POST',
        headers: { origin: new URL(secondUrl).origin },
      });
      expect(foreignSelection.status).toBe(REFUSED);

      const editor = browser.locator('.da-textarea');
      await editor.fill('Show a long response [fake:long]');
      await editor.press('Enter');
      await expect(browser.locator('.da-send[data-variant="stop"]')).toBeVisible({
        timeout: CONTENT_MS,
      });

      const returnLink = screen.getByRole('link', 'Back to decks');
      let confirmed = false;
      const dismiss = await browser.onDialog(async (dialog) => {
        confirmed = dialog.type === 'confirm' && dialog.message.includes('Stop the turn');
        await dialog.dismiss();
      });
      await returnLink.tap();
      await expect(screen.getByRole('button', 'Close deck')).toBeVisible({ timeout: CONTENT_MS });
      await expect.poll(() => confirmed, { timeout: CONTENT_MS }).toBe(true);
      await dismiss();
      expect(await hasPublishedSession(workspace.root, 'second')).toBe(true);

      const accept = await browser.onDialog('accept');
      await screen.getByRole('button', 'Close deck').tap();
      await expect(screen.getByRole('button', 'Close deck')).toBeHidden({ timeout: CONTENT_MS });
      await accept();
      expect(await hasPublishedSession(workspace.root, 'second')).toBe(false);
      await expect(picture).toBeVisible({ timeout: CONTENT_MS });
      await expect(secondPicture).toBeVisible({ timeout: CONTENT_MS });
      expect((await cover(browser)).pixels).toBe(initialCover.pixels);
      expect((await cover(browser, 'second')).pixels).not.toBe(secondCover.pixels);

      await second.tap();
      await expect(updatedTitle).toBeVisible({ timeout: CONTENT_MS });
      const lastUrl = await browser.url();
      await workspace.stop();
      expect(await hasPublishedSession(workspace.root, 'second')).toBe(false);
      expect(await serverClosed(lastUrl)).toBe(true);
      expect(await serverClosed(workspace.url)).toBe(true);
    } finally {
      await workspace.stop();
      await rm(workspace.root, { recursive: true, force: true });
    }
  },
);

/**
 * Records the cover's uncropped dimensions and pixels once the real image is visible.
 */
async function cover(browser: Browser, deck = 'hello') {
  return browser.evaluate((id) => {
    const image = document.querySelector<HTMLImageElement>(`button[data-deck="${id}"] img`);
    if (image === null) {
      throw new Error('The cover image is missing.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    const frame = image.getBoundingClientRect();
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      ratio: frame.width / frame.height,
      objectFit: getComputedStyle(image).objectFit,
      pixels: canvas.toDataURL(),
    };
  }, deck);
}

/**
 * Shows whether the active deck's MCP endpoint is still published on disk.
 */
async function hasPublishedSession(workspace: string, deck: string): Promise<boolean> {
  const file = path.join(workspace, '.deck', 'agent', deck, 'server.json');
  return stat(file, { throwIfNoEntry: false }).then((info) => info !== undefined);
}

/**
 * Checks whether the HTTP listener has closed.
 */
async function serverClosed(url: string): Promise<boolean> {
  return fetch(url).then(
    () => false,
    () => true,
  );
}
