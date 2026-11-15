import type { AgentEvent, ClientMessage } from '@deckster/agent/protocol/events';
import type { Browser } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import { AGENT_URL, useAgentServer } from './support/agent-server.ts';
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

describe('agent chat with the fake provider', () => {
  test('a prompt streams events, the title changes on hot reload, undo changes it back', async (fixtures) => {
    const { browser } = fixtures;
    await openDeck(fixtures, `${AGENT_URL}#/1/0`);
    await expect
      .poll(() => browser.evaluate(() => (window as AgentWindow).__deckAgent?.state ?? ''))
      .toBe('open');
    await expect.poll(() => heading(browser)).toBe('Hello, deck');

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
    const done = await browser.evaluate(() =>
      JSON.stringify(
        (window as AgentWindow).__deckAgent?.events.find((event) => event.type === 'turn-done'),
      ),
    );
    expect(JSON.parse(done)).toMatchObject({
      status: 'completed',
      changedFiles: [{ path: 'decks/agent-hello/slides/title.mdx', kind: 'update' }],
    });

    await send(browser, { type: 'undo' });
    await expect.poll(() => heading(browser), { timeout: TURN_TIMEOUT_MS }).toBe('Hello, deck');
    await expect
      .poll(() => eventTypes(browser), { timeout: TURN_TIMEOUT_MS })
      .toContain('null:history');
  });
});
