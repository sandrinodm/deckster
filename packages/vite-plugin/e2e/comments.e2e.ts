import type { Browser } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  COMMENT_URLS,
  COMMENTS_DECK_DIR,
  HELLO_DECK_DIR,
  useCommentServers,
  WORKSPACE_ROOT,
} from './support/comment-servers.ts';
import { test } from './support/page-problems.ts';
import { openDeck } from './support/presenter-deck.ts';

/**
 * Runs a command line and resolves with its output.
 */
const run = promisify(execFile);

/**
 * How long a comment's screenshot may take: Chromium starts on the first one.
 */
const SCREENSHOT_TIMEOUT_MS = 30_000;

/**
 * A stored comment, as much of it as the tests read.
 */
type StoredComment = {
  /**
   * The comment id.
   */
  id: string;

  /**
   * `open` or `resolved`.
   */
  status: string;

  /**
   * What the reviewer wrote.
   */
  text: string;

  /**
   * Where to edit.
   */
  source: { file: string; line: number; column: number } | null;

  /**
   * How to find the element again.
   */
  anchor: { stamp: string | null; tag: string; lineText: string | null } | null;
};

useCommentServers();

/**
 * Selects the element with a stamp in comment mode by clicking its middle, as a reviewer does: the
 * capture layer takes the click, so the element itself is never clicked.
 *
 * @param browser - The browser fixture.
 * @param stamp - The element's `data-deck-source`.
 */
async function clickStamped(browser: Browser, stamp: string): Promise<void> {
  const box = await browser.locator(`.deck-main [data-deck-source="${stamp}"]`).boundingBox();
  if (box === null) {
    throw new Error(`No element is stamped ${stamp}.`);
  }

  await browser.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await browser.mouse.down();
  await browser.mouse.up();
}

/**
 * Writes a comment in the open composer and saves it with Cmd or Ctrl+Enter.
 *
 * @param browser - The browser fixture.
 * @param text - The comment.
 */
async function writeComment(browser: Browser, text: string): Promise<void> {
  const field = browser.locator('.dc-composer textarea');
  await expect(field).toBeVisible();
  await field.fill(text);
  await field.press('ControlOrMeta+Enter');
  await expect(browser.locator('.dc-composer')).toHaveCount(0);
}

/**
 * The comments stored for a slide.
 *
 * @param deckDir - The deck folder.
 * @param slide - The slide id.
 */
async function storedComments(deckDir: string, slide: string): Promise<StoredComment[]> {
  const text = await readFile(path.join(deckDir, '.feedback', `${slide}.json`), 'utf8');
  return (JSON.parse(text) as { comments: StoredComment[] }).comments;
}

/**
 * One line of a fixture slide file.
 *
 * @param file - The file relative to the deck folder.
 * @param line - The 1-based line.
 */
async function sourceLine(file: string, line: number): Promise<string> {
  const text = await readFile(path.join(COMMENTS_DECK_DIR, file), 'utf8');
  return text.split('\n')[line - 1] ?? '';
}

describe('comments', () => {
  test('stamps slide, slot and deck component elements, and resolves kit elements to their use', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${COMMENT_URLS.dev}#/1/0`);
    for (const [tag, stamp] of [
      ['h2', 'slides/notes-mdx.mdx:7:1'],
      ['li', 'slides/notes-mdx.mdx:10:1'],
      ['aside', 'slides/parts/callout.tsx:8:5'],
    ]) {
      await expect(browser.locator(`.deck-main ${tag}[data-deck-source="${stamp}"]`)).toHaveCount(
        1,
      );
    }

    await browser.keyboard.press('c');
    await expect(browser.locator('.dc-toolbar')).toBeVisible();
    const link = await browser.locator('.deck-main a.kit-link-button').boundingBox();
    await browser.mouse.move((link?.x ?? 0) + 10, (link?.y ?? 0) + 10);
    await expect(browser.locator('.dc-outline-label')).toHaveText('a · slides/notes-mdx.mdx:16');
  });

  test('saves a comment on an MDX element at its source line, and shows its pin', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${COMMENT_URLS.dev}#/1/0`);
    await browser.keyboard.press('c');
    await clickStamped(browser, 'slides/notes-mdx.mdx:7:1');
    await expect(browser.locator('.dc-composer .dc-target-label')).toHaveText(
      'h2 · slides/notes-mdx.mdx:7',
    );
    await browser.locator('.dc-composer .dc-type[data-type="fix"]').click();
    await writeComment(browser, 'Make the MDX heading shorter.');

    const [comment] = await storedComments(COMMENTS_DECK_DIR, 'notes-mdx');
    expect(comment).toMatchObject({
      status: 'open',
      text: 'Make the MDX heading shorter.',
      source: { file: 'slides/notes-mdx.mdx', line: 7, column: 1 },
      anchor: { stamp: 'slides/notes-mdx.mdx:7:1', tag: 'h2', lineText: '## Feedback in MDX' },
    });
    expect(await sourceLine('slides/notes-mdx.mdx', comment?.source?.line ?? 0)).toBe(
      '## Feedback in MDX',
    );

    const pin = browser.locator(`.dc-pin[data-comment-id="${comment?.id ?? ''}"]`);
    await expect(pin).toHaveText('1');
    const heading = await browser
      .locator('.deck-main [data-deck-source="slides/notes-mdx.mdx:7:1"]')
      .boundingBox();
    const pinBox = await pin.boundingBox();
    expect(Math.abs((pinBox?.x ?? 0) - (heading?.x ?? 0))).toBeLessThan(24);
    expect(Math.abs((pinBox?.y ?? 0) - (heading?.y ?? 0))).toBeLessThan(24);
    await expect(browser.locator('.dp-sidebar')).toBeHidden();
    await browser.keyboard.press('Escape');
    await browser.keyboard.press('s');
    await expect(browser.locator('.dp-row[data-slide-index="0"] [data-badge]')).toHaveText('1');
    await browser.keyboard.press('s');
  });

  test('saves a comment on a TSX slot element, and walks to its parent with the arrow keys', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${COMMENT_URLS.dev}#/2/0`);
    await browser.keyboard.press('c');
    await clickStamped(browser, 'slides/parts/card.tsx:24:7');
    await expect(browser.locator('.dc-composer .dc-target-label')).toHaveText(
      'h3 · slides/parts/card.tsx:24',
    );
    await browser.locator('.dc-composer textarea').press('Alt+ArrowUp');
    await expect(browser.locator('.dc-composer .dc-target-label')).toHaveText(
      'section · slides/parts/card.tsx:23',
    );
    await browser.locator('.dc-composer textarea').press('Alt+ArrowDown');
    await expect(browser.locator('.dc-composer .dc-target-label')).toHaveText(
      'h3 · slides/parts/card.tsx:24',
    );
    await browser.keyboard.press('Escape');

    await clickStamped(browser, 'slides/cards-tsx.tsx:25:10');
    await writeComment(browser, 'Say what the left column claims.');
    const [comment] = await storedComments(COMMENTS_DECK_DIR, 'cards-tsx');
    expect(comment?.source).toEqual({ file: 'slides/cards-tsx.tsx', line: 25, column: 10 });
    expect(await sourceLine('slides/cards-tsx.tsx', 25)).toContain(
      '<p>A paragraph in the left slot</p>',
    );
    await expect
      .poll(() => readdir(path.join(COMMENTS_DECK_DIR, '.feedback', 'cards-tsx')).catch(() => []), {
        timeout: SCREENSHOT_TIMEOUT_MS,
      })
      .toEqual([`${comment?.id ?? ''}.png`]);
  });

  test('keeps a draft through Escape, picks elements by keyboard and discards on request', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${COMMENT_URLS.dev}#/1/0`);
    await browser.keyboard.press('c');
    const field = browser.locator('.dc-composer textarea');
    await clickStamped(browser, 'slides/notes-mdx.mdx:7:1');
    await field.fill('A draft worth keeping');
    await field.press('Escape');
    await expect(browser.locator('.dc-composer')).toHaveCount(0);
    await expect(browser.locator('.dc-toast')).toContainText('Draft kept');
    await clickStamped(browser, 'slides/parts/callout.tsx:8:5');
    await expect(field).toHaveValue('');
    await clickStamped(browser, 'slides/notes-mdx.mdx:7:1');
    await expect(field).toHaveValue('A draft worth keeping');
    await browser.locator('.dc-composer .dc-popover-foot .dp-button:not([data-variant])').click();
    await clickStamped(browser, 'slides/notes-mdx.mdx:7:1');
    await expect(field).toHaveValue('');
    await field.press('Escape');

    await browser.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      return null;
    });
    await browser.mouse.move(1, 1);
    await browser.keyboard.press('Tab');
    await expect(browser.locator('.dc-outline-label')).toContainText('slides/notes-mdx.mdx');
    await browser.keyboard.press('Enter');
    await expect(browser.locator('.dc-composer .dc-target-label')).toContainText(
      'slides/notes-mdx.mdx',
    );
    await field.press('Escape');
  });

  test('refuses blank text and steps a slide does not have, and lays out a long panel', async (fixtures) => {
    const { browser } = fixtures;
    const page = await fetch(COMMENT_URLS.dev, {
      headers: { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none' },
    });
    /**
     * The dev session cookie the server sets on the deck's page; the endpoint needs it.
     */
    const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    /**
     * Posts a comment on the fixture deck from the test, not the page, so the expected refusals are
     * not console errors.
     */
    const add = (comment: Record<string, unknown>) =>
      fetch(`${COMMENT_URLS.dev}__deck/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          action: 'add',
          comment: {
            slide: 'cards-tsx',
            step: 0,
            target: 'slide',
            source: null,
            anchor: null,
            box: null,
            region: null,
            text: 'e2e: whole-slide note',
            type: null,
            author: 'e2e',
            ...comment,
          },
        }),
      });
    const blank = await add({ text: ' \n ' });
    expect(blank.status).toBe(400);
    expect(await blank.text()).toContain('not only whitespace');
    const pastLastStep = await add({ step: 99 });
    expect(pastLastStep.status).toBe(400);
    expect(await pastLastStep.text()).toContain('so there is no step 99');
    for (let index = 0; index < 10; index += 1) {
      expect((await add({ text: `e2e: note ${index + 1}` })).status).toBe(200);
    }

    await openDeck(fixtures, `${COMMENT_URLS.dev}#/2/0`);
    await browser.keyboard.press('c');
    const pin = browser.locator('.dc-pin').first();
    await expect(pin).toBeVisible();
    expect(
      await browser.evaluate(() => {
        const element = document.querySelector('.dc-pin');
        return element === null ? '' : getComputedStyle(element).color;
      }),
    ).toBe('rgb(255, 255, 255)');
    await browser.locator('.dc-toolbar button[aria-pressed]').click();
    const panel = await browser.locator('.dc-panel').boundingBox();
    const toolbar = await browser.locator('.dc-toolbar').boundingBox();
    expect((toolbar?.x ?? 0) + (toolbar?.width ?? 0)).toBeLessThanOrEqual(panel?.x ?? 0);
    const filter = browser.locator('.dc-segmented');
    await expect.poll(() => filter.textContent()).toMatch(/Open \d\d/);
    expect(
      await browser.evaluate(() => {
        const element = document.querySelector('.dc-segmented');
        return element !== null && element.scrollWidth <= element.clientWidth + 1;
      }),
    ).toBe(true);
    const filterBox = await filter.boundingBox();
    expect((filterBox?.x ?? 0) + (filterBox?.width ?? 0)).toBeLessThanOrEqual(
      (panel?.x ?? 0) + (panel?.width ?? 0),
    );
  });

  test('shows a comment resolved with the CLI after a reload', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${COMMENT_URLS.hello}#/3/0`);
    const added = await browser.evaluate(async () => {
      const response = await fetch('/__deck/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          comment: {
            slide: 'live-counter',
            step: 0,
            target: 'element',
            source: { file: 'slides/live-counter.tsx', line: 21, column: 7 },
            anchor: {
              stamp: 'slides/live-counter.tsx:21:7',
              cssPath: 'h2',
              tag: 'h2',
              text: 'A TSX slide',
            },
            box: { x: 160, y: 160, width: 600, height: 80 },
            region: null,
            text: 'e2e: resolve me from the CLI',
            type: 'question',
            author: 'e2e',
          },
        }),
      });
      return ((await response.json()) as { comment: { id: string } }).comment.id;
    });
    const screenshot = path.join(HELLO_DECK_DIR, '.feedback', 'live-counter', `${added}.png`);
    await expect
      .poll(
        () =>
          readFile(screenshot).then(
            () => true,
            () => false,
          ),
        {
          timeout: SCREENSHOT_TIMEOUT_MS,
        },
      )
      .toBe(true);

    const { stdout } = await run(
      'node',
      ['packages/cli/src/bin.ts', 'comments', 'resolve', 'hello', added, '--note', 'Answered'],
      {
        cwd: WORKSPACE_ROOT,
      },
    );
    expect(stdout).toContain(`Resolved ${added}`);

    // A real reload: opening the same URL again only changes the hash, which keeps the page. The
    // marker is a property of the old page, so it is gone once the new one runs.
    await fixtures.problems.navigate(async () => {
      await browser.evaluate(() => {
        Reflect.set(window, 'e2eBeforeReload', true);
        location.reload();
        return null;
      });
    });
    await expect
      .poll(() =>
        browser.evaluate(
          () => !Reflect.has(window, 'e2eBeforeReload') && window.__deck !== undefined,
        ),
      )
      .toBe(true);
    await browser.keyboard.press('c');
    await browser.locator('.dc-toolbar button[aria-pressed]').click();
    await browser.locator('.dc-segmented button:nth-child(2)').click();
    const row = `.dc-item[data-comment-id="${added}"]`;
    await expect(browser.locator(row)).toHaveAttribute('data-status', 'resolved');
    await browser.locator(`${row} .dc-item-main`).click();
    await expect(browser.locator(`${row} .dc-resolution`)).toContainText('Answered');
    const stored = await storedComments(HELLO_DECK_DIR, 'live-counter');
    expect(stored.find((comment) => comment.id === added)?.status).toBe('resolved');
    await browser.locator(`${row} .dc-actions .dp-button:last-child`).click();
    await browser.locator(`${row} .dp-button[data-variant="danger"]`).click();
    await expect(browser.locator(row)).toHaveCount(0);
  });

  test('static mode has no stamps and no comment UI', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${COMMENT_URLS.dev}?static#/1/0`);
    await browser.evaluate(async () => {
      await window.__deck?.ready();
      return null;
    });
    expect(await browser.locator('[data-deck-source]').count()).toBe(0);
    await browser.keyboard.press('c');
    expect(await browser.locator('.dc-root, .dc-toolbar, .dc-pin').count()).toBe(0);
  });

  test('a production build has no stamps, no comment UI and no comment code', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${COMMENT_URLS.build}#/1/0`);
    await expect(browser.locator('.deck-main [data-slide-active="true"] h2')).toHaveText(
      'Feedback in MDX',
    );
    expect(await browser.locator('[data-deck-source]').count()).toBe(0);
    await browser.keyboard.press('c');
    expect(await browser.locator('.dc-root, .dc-toolbar').count()).toBe(0);
    const assets = path.join(COMMENTS_DECK_DIR, 'dist', 'assets');
    for (const file of await readdir(assets)) {
      const text = await readFile(path.join(assets, file), 'utf8');
      expect(text, file).not.toContain('data-deck-source');
      expect(text, file).not.toContain('__deck/comments');
      expect(text, file).not.toContain('dc-capture');
    }
  });
});
