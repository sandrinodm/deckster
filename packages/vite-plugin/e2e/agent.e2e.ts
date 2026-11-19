import type { AgentEvent, ClientMessage } from '@deckster/agent/protocol/events';
import type { Browser } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AGENT_DECK, AGENT_URL, useAgentServer } from './support/agent-server.ts';
import { FIXTURE_WORKSPACE } from './support/case-servers.ts';
import { isMarkedDocument, markDocument } from './support/marked-document.ts';
import { test } from './support/page-problems.ts';
import { openDeck } from './support/presenter-deck.ts';

/**
 * How long a fake turn and the hot reload after it may take, in milliseconds.
 */
const TURN_TIMEOUT_MS = 20_000;

useAgentServer();

/**
 * The page's agent handle, as the runtime plugin exposes it.
 */
type AgentWindow = {
  /**
   * The handle, once connected.
   */
  readonly __deckAgent?: {
    readonly send: (message: ClientMessage) => void;
    readonly events: AgentEvent[];
    readonly state: string;
  };
};

/**
 * Sends a message through `window.__deckAgent`.
 *
 * @param browser - The page.
 * @param message - The message.
 */
async function send(browser: Browser, message: ClientMessage): Promise<void> {
  await browser.evaluate((payload: ClientMessage) => {
    (window as AgentWindow).__deckAgent?.send(payload);
    return true;
  }, message);
}

/**
 * The types of the events the page received, with their turn.
 *
 * @param browser - The page.
 */
function eventTypes(browser: Browser): Promise<string[]> {
  return browser.evaluate(() =>
    ((window as AgentWindow).__deckAgent?.events ?? []).map(
      (event) => `${event.turn}:${event.type}`,
    ),
  );
}

/**
 * The text of the slide's main heading.
 *
 * @param browser - The page.
 */
function heading(browser: Browser): Promise<string> {
  return browser.evaluate(() => document.querySelector('.deck-main h1')?.textContent?.trim() ?? '');
}

/**
 * How many turns the page has heard start but not end; the replay a newly loaded page receives
 * counts too.
 *
 * @param browser - The page.
 */
function turnsRunning(browser: Browser): Promise<number> {
  return browser.evaluate(() => {
    const events = (window as AgentWindow).__deckAgent?.events ?? [];
    /**
     * How many events of a type the page has.
     *
     * @param type - The event type.
     */
    const count = (type: string) => events.filter((event) => event.type === type).length;
    return count('turn-started') - count('turn-done');
  });
}

/**
 * Waits until the page shows the deck and its agent connection is open, as after a reload.
 *
 * @param browser - The page.
 */
async function deckReady(browser: Browser): Promise<void> {
  await expect
    .poll(
      () =>
        browser.evaluate(
          () =>
            window.__deck !== undefined && (window as AgentWindow).__deckAgent?.state === 'open',
        ),
      { timeout: TURN_TIMEOUT_MS },
    )
    .toBe(true);
}

/**
 * The page's `turn-done` event, as JSON text, or `null` before it has arrived. A page that loaded
 * again starts with no events, until the server replays them.
 *
 * @param browser - The page.
 */
async function turnDone(browser: Browser): Promise<unknown> {
  const text = await browser.evaluate(
    () =>
      JSON.stringify(
        (window as AgentWindow).__deckAgent?.events.find((event) => event.type === 'turn-done'),
      ) ?? 'null',
  );
  return JSON.parse(text) as unknown;
}

describe('agent chat with the fake provider', () => {
  test('a prompt streams events, the title changes on hot reload, undo changes it back', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${AGENT_URL}#/1/0`);
    await expect
      .poll(() => browser.evaluate(() => (window as AgentWindow).__deckAgent?.state ?? ''))
      .toBe('open');
    await expect.poll(() => heading(browser)).toBe('Hello, deck');
    await markDocument(browser);

    await send(browser, {
      type: 'prompt',
      text: 'Make the title friendlier [fake-title:Hello, fake agent]',
      slide: { id: 'title', step: 0 },
    });
    await expect
      .poll(() => eventTypes(browser), { timeout: TURN_TIMEOUT_MS })
      .toEqual(expect.arrayContaining(['1:turn-started', '1:tool', '1:text', '1:turn-done']));
    await expect
      .poll(() => heading(browser), { timeout: TURN_TIMEOUT_MS })
      .toBe('Hello, fake agent');
    await expect
      .poll(() => turnDone(browser), { timeout: TURN_TIMEOUT_MS })
      .toMatchObject({
        status: 'completed',
        changedFiles: [{ path: 'decks/agent-hello/slides/title.mdx', kind: 'update' }],
      });

    await send(browser, { type: 'undo' });
    await expect.poll(() => heading(browser), { timeout: TURN_TIMEOUT_MS }).toBe('Hello, deck');
    await expect
      .poll(() => eventTypes(browser), { timeout: TURN_TIMEOUT_MS })
      .toContain('null:history');
    // The turn and its undo changed only a slide, which hot reloads: the page never loaded again.
    expect(await isMarkedDocument(browser)).toBe(true);
  });

  test('a page that loaded the deck during a turn loads it again after the turn', async (fixtures) => {
    const { browser } = fixtures;
    const configFile = path.join(FIXTURE_WORKSPACE, 'decks', AGENT_DECK, 'deck.config.ts');
    await openDeck(fixtures, `${AGENT_URL}#/1/0`);
    await deckReady(browser);
    await send(browser, { type: 'prompt', text: 'Talk for a while [fake:long]' });
    await expect.poll(() => turnsRunning(browser), { timeout: TURN_TIMEOUT_MS }).toBe(1);

    // Saving the config unchanged reloads the page while the turn holds it.
    await markDocument(browser);
    await writeFile(configFile, await readFile(configFile, 'utf8'));
    await expect.poll(() => isMarkedDocument(browser), { timeout: TURN_TIMEOUT_MS }).toBe(false);
    await deckReady(browser);
    await markDocument(browser);

    await send(browser, { type: 'cancel' });
    await expect.poll(() => isMarkedDocument(browser), { timeout: TURN_TIMEOUT_MS }).toBe(false);
    await deckReady(browser);
    await expect.poll(() => turnsRunning(browser), { timeout: TURN_TIMEOUT_MS }).toBe(0);
  });
});
