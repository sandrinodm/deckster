import type { ClientMessage } from '@deckster/agent/protocol/events';
import type { Browser, WebApp } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PANEL_SERVERS, panelUrl, useAgentPanelServers } from './support/agent-panel-servers.ts';
import { FIXTURE_WORKSPACE } from './support/case-servers.ts';
import { isMarkedDocument, markDocument } from './support/marked-document.ts';
import { test, type PageProblems } from './support/page-problems.ts';
import { openDeck } from './support/presenter-deck.ts';

/**
 * How long a fake turn and the hot reload after it may take, in milliseconds.
 */
const TURN_TIMEOUT_MS = 20_000;

/**
 * The default-brand server, docked right.
 */
const RIGHT = panelUrl(PANEL_SERVERS.right);

/**
 * The nocturne server, docked below.
 */
const BOTTOM = panelUrl(PANEL_SERVERS.bottom);

/**
 * The selector of the heading on the slide on screen.
 */
const HEADING = '.deck-main .deck-slide[data-slide-active="true"] h1';

useAgentPanelServers();

/**
 * What each test gets.
 */
type Fixtures = {
  /**
   * The app under test.
   */
  readonly app: WebApp;

  /**
   * The browser.
   */
  readonly browser: Browser;

  /**
   * The console problems the page logged.
   */
  readonly problems: PageProblems;
};

/**
 * Records every message the page sends over a WebSocket into `window.__sent`, kept in session
 * storage so it survives the reload a deck config change causes. Installing it twice is harmless.
 * It runs in every document of the page, including the blank one a new tab starts with, whose
 * opaque origin has no storage (reading `sessionStorage` there throws); such a document records in
 * memory only.
 */
function recordSentMessages(): void {
  const key = 'e2e-sent-messages';
  let storage: Storage | undefined;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = undefined;
  }

  const sent: unknown[] = JSON.parse(storage?.getItem(key) ?? '[]') as unknown[];
  Reflect.set(window, '__sent', sent);
  if (Reflect.get(WebSocket.prototype, '__recording') === true) {
    return;
  }

  Reflect.set(WebSocket.prototype, '__recording', true);
  const original = Reflect.get(WebSocket.prototype, 'send') as WebSocket['send'];
  WebSocket.prototype.send = function send(this: WebSocket, data) {
    if (typeof data === 'string' && data.startsWith('{')) {
      sent.push(JSON.parse(data));
      storage?.setItem(key, JSON.stringify(sent));
    }

    Reflect.apply(original, this, [data]);
  };
}

/**
 * The prompts the panel sent.
 *
 * @param browser - The page.
 */
async function sentPrompts(browser: Browser): Promise<ClientMessage[]> {
  const text = await browser.evaluate(() =>
    JSON.stringify(
      ((Reflect.get(window, '__sent') as { type?: string }[] | undefined) ?? []).filter(
        (message) => message.type === 'prompt',
      ),
    ),
  );
  return JSON.parse(text) as ClientMessage[];
}

/**
 * How many turns the page has heard end (`turn-done` events), counting the replay a newly loaded
 * page receives.
 *
 * @param browser - The page.
 */
function turnsDone(browser: Browser): Promise<number> {
  return browser.evaluate(
    () =>
      (
        (Reflect.get(window, '__deckAgent') as { events?: { type: string }[] } | undefined)
          ?.events ?? []
      ).filter((event) => event.type === 'turn-done').length,
  );
}

/**
 * Opens a deck page once the panel is connected, starting from a fresh conversation and dock.
 *
 * @param fixtures - The test fixtures.
 * @param url - The page.
 */
async function openPanel(fixtures: Fixtures, url: string): Promise<void> {
  await fixtures.browser.addInitScript(recordSentMessages);
  await openDeck(fixtures, url);
  await expect
    .poll(() =>
      fixtures.browser.evaluate(
        () => (Reflect.get(window, '__deckAgent') as { state?: string } | undefined)?.state ?? '',
      ),
    )
    .toBe('open');
}

/**
 * Clears the conversation and the remembered dock, then reloads.
 *
 * @param fixtures - The test fixtures.
 * @param url - The page.
 */
async function freshPanel(fixtures: Fixtures, url: string): Promise<void> {
  await openPanel(fixtures, url);
  await fixtures.browser.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('deck-agent-panel:')) {
        window.localStorage.removeItem(key);
      }
    }

    (Reflect.get(window, '__deckAgent') as { send: (message: ClientMessage) => void }).send({
      type: 'new-conversation',
    });
    return null;
  });
  await expect(fixtures.browser.locator('.da-empty')).toBeVisible();
  await openPanel(fixtures, url);
}

/**
 * Clicks the middle of an element the way a person does: in pick mode the capture layer takes the
 * click.
 *
 * @param browser - The page.
 * @param selector - The element.
 */
async function clickMiddle(browser: Browser, selector: string): Promise<void> {
  const box = await browser.locator(selector).boundingBox();
  if (box === null) {
    throw new Error(`Nothing at ${selector}.`);
  }

  await browser.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await browser.mouse.down();
  await browser.mouse.up();
}

/**
 * Types a prompt in the composer and sends it with Enter.
 *
 * @param browser - The page.
 * @param text - The prompt.
 */
async function ask(browser: Browser, text: string): Promise<void> {
  const field = browser.locator('.da-textarea');
  await field.fill(text);
  await field.press('Enter');
}

/**
 * The box of an element, or zeros.
 *
 * @param browser - The page.
 * @param selector - The element.
 */
function boxOf(
  browser: Browser,
  selector: string,
): Promise<{ left: number; right: number; top: number; bottom: number; width: number }> {
  return browser.evaluate((query: string) => {
    const box = document.querySelector(query)?.getBoundingClientRect();
    return {
      left: box?.left ?? 0,
      right: box?.right ?? 0,
      top: box?.top ?? 0,
      bottom: box?.bottom ?? 0,
      width: box?.width ?? 0,
    };
  }, selector);
}

/**
 * The hello deck's config with one slide fewer and a statement that is not data: what an agent
 * might write to the config, which the turn guard puts back.
 *
 * @param marker - The value the statement sets.
 */
const heldConfig = (marker: string) => `import { defineDeck } from '@deckster/engine/config';

globalThis.deckPanelProbe = '${marker}';

export default defineDeck({
  title: 'Hello, deck',
  brand: 'default',
  slides: ['title', 'steps', 'live-counter'],
});
`;

/**
 * A prompt that makes the fake agent retitle the slide in its working copy and write
 * {@link heldConfig} as a `deck.config.ts` and a stylesheet into the working copy too.
 *
 * @param marker - The config's marker.
 */
function escapePrompt(marker: string): string {
  return `Drop the closing slide [fake:escape] [fake-title:Hello, kept] [fake-config:${Buffer.from(heldConfig(marker)).toString('base64')}]`;
}

/**
 * How many slides the live deck has.
 *
 * @param browser - The page.
 */
function slideCount(browser: Browser): Promise<number> {
  return browser.evaluate(
    () =>
      (Reflect.get(window, '__deck') as { slides?: unknown[] } | undefined)?.slides?.length ?? 0,
  );
}

describe('the agent panel with the fake provider', () => {
  test('picks the title, streams a turn, hot reloads, shows the footer and diff, and undoes it', async (fixtures) => {
    const { browser } = fixtures;
    await freshPanel(fixtures, `${RIGHT}#/1/0`);
    await expect(browser.locator('.da-panel')).toBeVisible();
    await expect(browser.locator('.dp-tool[data-tool="agent.panel"]')).toHaveCount(1);

    await browser.keyboard.press('a');
    await expect(browser.locator('.da-panel')).toHaveCount(0);
    await browser.keyboard.press('a');
    await expect(browser.locator('.da-panel')).toBeVisible();
    await expect(browser.locator('.da-textarea')).toBeFocused();
    await expect(browser.locator('.da-ctx[data-kind="slide"]')).toContainText('title.mdx');

    await browser.locator('.da-ctx-action').click();
    await expect(browser.locator('.dc-toolbar[data-pick]')).toBeVisible();
    await clickMiddle(browser, HEADING);
    await expect(browser.locator('.dc-toolbar')).toHaveCount(0);
    await expect(browser.locator('.dc-composer')).toHaveCount(0);
    const chip = browser.locator('.da-ctx[data-kind="element"]');
    await expect(chip).toContainText('h1');
    await expect(chip).toContainText('Hello, deck');
    await expect(chip).toContainText('title.mdx:7');
    await expect(browser.locator('.da-outline')).toBeVisible();

    await markDocument(browser);
    await ask(browser, 'Make the title friendlier [fake-title:Hello, fake agent]');
    await expect(browser.locator('.da-prompt-text')).toContainText('Make the title friendlier');
    // A finished turn folds its tool lines into one summary line, so a line may already be hidden
    // in it by the time it is read.
    await expect(browser.locator('.da-tool').first()).toBeAttached({ timeout: TURN_TIMEOUT_MS });
    await expect(
      browser.locator('.da-tool[data-icon="edit"][data-status="done"]').first(),
    ).toBeAttached({
      timeout: TURN_TIMEOUT_MS,
    });
    await expect(browser.locator('.da-answer')).toContainText('title', {
      timeout: TURN_TIMEOUT_MS,
    });
    await expect(browser.locator(HEADING)).toHaveText('Hello, fake agent', {
      timeout: TURN_TIMEOUT_MS,
    });
    const [prompt] = await sentPrompts(browser);
    expect(prompt).toMatchObject({
      type: 'prompt',
      slide: { id: 'title', step: 0 },
      selection: { text: 'Hello, deck', source: 'slides/title.mdx:7:1' },
      screenshot: true,
    });

    await expect(browser.locator('.da-file-path')).toHaveText('slides/title.mdx', {
      timeout: TURN_TIMEOUT_MS,
    });
    await expect(browser.locator('.da-lint[data-state="clean"]')).toBeVisible({
      timeout: TURN_TIMEOUT_MS,
    });
    await browser.locator('.da-file').click();
    await expect(browser.locator('.da-diff-line[data-sign="+"]').first()).toContainText(
      'Hello, fake agent',
    );
    await expect(browser.locator('.da-diff-line[data-sign="-"]').first()).toContainText(
      'Hello, deck',
    );

    await browser.locator('.da-footer [data-action="undo"]').click();
    await expect(browser.locator(HEADING)).toHaveText('Hello, deck', { timeout: TURN_TIMEOUT_MS });
    await expect(browser.locator('.da-footer [data-action="redo"]')).toBeVisible();
    // The turn changed only a slide, which hot reloads: the page never loaded again.
    expect(await isMarkedDocument(browser)).toBe(true);
  });

  test('keeps every key typed in the composer away from the deck, and Escape gives them back', async (fixtures) => {
    const { browser } = fixtures;
    await freshPanel(fixtures, `${RIGHT}#/2/0`);
    const field = browser.locator('.da-textarea');
    await field.click();
    for (const key of [
      'ArrowRight',
      'ArrowDown',
      ' ',
      'PageDown',
      'End',
      'a',
      's',
      'o',
      'g',
      'c',
      '?',
    ]) {
      await browser.keyboard.press(key);
    }

    await expect(browser).toHaveURL(/#\/2\/0$/);
    await expect(browser.locator('.da-panel')).toBeVisible();
    await expect(browser.locator('.dp-sidebar')).toHaveCount(0);
    await expect(browser.locator('.dp-overview')).toHaveCount(0);
    await expect(browser.locator('.dc-toolbar')).toHaveCount(0);
    await expect(field).toHaveValue(' asogc?');

    await browser.keyboard.press('Escape');
    await expect(field).not.toBeFocused();
    await browser.keyboard.press('ArrowRight');
    await expect(browser).toHaveURL(/#\/2\/1$/);
  });

  test('stops a long turn, which shows as stopped', async (fixtures) => {
    const { browser } = fixtures;
    await freshPanel(fixtures, `${RIGHT}#/2/0`);
    await ask(browser, 'Talk for a while [fake:long]');
    const stop = browser.locator('.da-send[data-variant="stop"]');
    await expect(stop).toBeVisible({ timeout: TURN_TIMEOUT_MS });
    await expect(browser.locator('.da-editing')).toHaveCount(1);
    await stop.click();
    await expect(browser.locator('.da-footer[data-quiet]')).toContainText('Stopped', {
      timeout: TURN_TIMEOUT_MS,
    });
    await expect(browser.locator('.da-send[data-variant="stop"]')).toHaveCount(0);
    await expect(browser.locator('.da-editing')).toHaveCount(0);
  });

  test('shows the sign-in command when the provider is not signed in, with a retry', async (fixtures) => {
    const { browser } = fixtures;
    await freshPanel(fixtures, `${RIGHT}#/2/0`);
    await markDocument(browser);
    await ask(browser, 'Hello [fake:not-signed-in]');
    const problem = browser.locator('.da-problem[data-kind="not-signed-in"]');
    await expect(problem).toBeVisible({ timeout: TURN_TIMEOUT_MS });
    await expect(problem).toContainText('Not signed in to Fake agent');
    await expect(
      browser.locator('.da-problem[data-kind="not-signed-in"] .da-command code'),
    ).toHaveText('claude');
    const retry = browser.locator('.da-problem[data-kind="not-signed-in"] [data-action="retry"]');
    await expect(retry).toBeVisible();
    await expect(browser.locator('.da-head-dot[data-state="problem"]')).toHaveCount(1);

    await retry.click();
    await expect.poll(() => turnsDone(browser), { timeout: TURN_TIMEOUT_MS }).toBe(2);
    await expect(problem).toHaveCount(2);
    expect((await sentPrompts(browser)).slice(-2)).toMatchObject([
      { text: 'Hello [fake:not-signed-in]' },
      { text: 'Hello [fake:not-signed-in]' },
    ]);
    // Neither turn changed a file, so the page never loaded again: nothing navigates away while
    // the test reads it.
    expect(await isMarkedDocument(browser)).toBe(true);
  });

  test('labels the automatic lint fix and links it to the failing turn', async (fixtures) => {
    const { browser } = fixtures;
    await freshPanel(fixtures, `${RIGHT}#/1/0`);
    await ask(browser, 'Retitle [fake:lint-error]');
    await expect(browser.locator('.da-lint[data-state="errors"]')).toContainText(
      'auto-fix follows',
      {
        timeout: TURN_TIMEOUT_MS,
      },
    );
    await expect(browser.locator('.da-autofix')).toContainText('Fixing the lint errors of turn', {
      timeout: TURN_TIMEOUT_MS,
    });
    await expect(browser.locator('.da-lint[data-state="clean"]')).toBeVisible({
      timeout: TURN_TIMEOUT_MS,
    });
    // The fix is undone first; only once it shows as undone does the one undo button left belong
    // to the failing turn.
    await browser.locator('.da-footer [data-action="undo"]').click();
    await expect(browser.locator('.da-footer [data-action="redo"]')).toBeVisible({
      timeout: TURN_TIMEOUT_MS,
    });
    await browser.locator('.da-footer [data-action="undo"]').click();
    await expect(browser.locator(HEADING)).toHaveText('Hello, deck', { timeout: TURN_TIMEOUT_MS });
  });

  test('scales the slide beside the panel at 1440 and 900 wide, and lays the panel over it at 700', async (fixtures) => {
    const { browser } = fixtures;
    for (const width of [1440, 900]) {
      await browser.setViewport({ width, height: 900 });
      await freshPanel(fixtures, `${RIGHT}#/3/0`);
      const area = await boxOf(browser, '.da-slide-area');
      const panel = await boxOf(browser, '.da-panel');
      expect(area.right).toBe(width - 400);
      expect(panel.left).toBe(width - 400);
    }

    await browser.setViewport({ width: 700, height: 900 });
    await freshPanel(fixtures, `${RIGHT}#/3/0`);
    expect((await boxOf(browser, '.da-slide-area')).width).toBe(700);
    await expect(browser.locator('.da-panel')).toBeVisible();
    await browser.locator('.da-ctx-action').click();
    await expect(browser.locator('.da-panel')).toBeHidden();
    await browser.keyboard.press('Escape');
    await expect(browser.locator('.da-panel')).toBeVisible();
    await browser.setViewport({ width: 1920, height: 1080 });
  });

  test('docks below the slide in nocturne, switches to the right and remembers it', async (fixtures) => {
    const { browser } = fixtures;
    await browser.setViewport({ width: 1440, height: 900 });
    await freshPanel(fixtures, `${BOTTOM}#/1/0`);
    await expect(browser.locator('.da-panel[data-dock="bottom"]')).toBeVisible();
    expect((await boxOf(browser, '.da-slide-area')).bottom).toBe(900 - 280);
    await expect(browser.locator('.deck-viewport')).toHaveAttribute('data-brand', 'nocturne');

    await browser.locator('.da-panel button[aria-label="Dock beside the slide"]').click();
    await expect(browser.locator('.da-panel[data-dock="right"]')).toBeVisible();
    await openPanel(fixtures, `${BOTTOM}#/1/0`);
    await expect(browser.locator('.da-panel[data-dock="right"]')).toBeVisible();
    await browser.locator('.da-panel button[aria-label="Dock below the slide"]').click();
    await expect(browser.locator('.da-panel[data-dock="bottom"]')).toBeVisible();
    await browser.setViewport({ width: 1920, height: 1080 });
  });

  test('ignores a deck.config.ts and a stylesheet in the turn’s working copy: the manifest never changes, the footer says so', async (fixtures) => {
    const { browser } = fixtures;
    await freshPanel(fixtures, `${RIGHT}#/1/0`);
    const configFile = path.join(
      FIXTURE_WORKSPACE,
      'decks',
      PANEL_SERVERS.right.deck,
      'deck.config.ts',
    );
    const before = await readFile(configFile, 'utf8');
    await ask(browser, escapePrompt('revert'));
    const reverted = browser.locator('.da-footer details.da-reverted');
    await expect(reverted).toBeVisible({ timeout: TURN_TIMEOUT_MS });
    await expect(browser.locator('.da-footer details.da-reverted > summary')).toHaveText(
      'Ignored 2 changes outside the slides: deck.config.ts, slides/styles.css',
    );
    await expect(browser.locator('.da-footer .da-file-path')).toHaveText(['slides/title.mdx']);
    expect(await readFile(configFile, 'utf8')).toBe(before);
    expect(existsSync(path.join(path.dirname(configFile), 'slides', 'styles.css'))).toBe(false);
    // The config the agent wrote was never loaded: the deck keeps all four slides.
    expect(await slideCount(browser)).toBe(4);
    await expect(browser.locator(HEADING)).toHaveText('Hello, kept', { timeout: TURN_TIMEOUT_MS });
    await browser.locator('.da-footer details.da-reverted > summary').click();
    await expect(reverted).toContainText('deck.config.ts not content');
    await expect(reverted).toContainText('slides/styles.css not content');
    expect(await slideCount(browser)).toBe(4);

    await browser.locator('.da-footer [data-action="undo"]').click();
    await expect(browser.locator(HEADING)).toHaveText('Hello, deck', { timeout: TURN_TIMEOUT_MS });
    expect(await slideCount(browser)).toBe(4);
  });

  test('draws nothing in static mode or in the presenter window', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${RIGHT}?static#/1/0`);
    await expect(browser.locator('.deck-slide[data-slide-active="true"] h1')).toBeVisible();
    await expect(browser.locator('.da-stage')).toHaveCount(0);
    await expect(browser.locator('.da-panel')).toHaveCount(0);
    await openDeck(fixtures, `${RIGHT}?presenter#/1/0`);
    await expect(browser.locator('.dp-presenter')).toBeVisible();
    await expect(browser.locator('.da-panel')).toHaveCount(0);
    await expect(browser.locator('.da-stage')).toHaveCount(0);
  });
});
