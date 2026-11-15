import { describe } from '@e2e-dev/web';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect } from 'e2e';

import { MCP_TOKEN, MCP_URLS, useMcpServer } from './support/mcp-server.ts';
import { test } from './support/page-problems.ts';
import { openDeck } from './support/presenter-deck.ts';

/**
 * How long a static page is given to report, if it wrongly did, in milliseconds.
 */
const STATIC_WAIT_MS = 800;

useMcpServer();

/**
 * Connects an MCP client to the suite's endpoint.
 */
async function connect(): Promise<Client> {
  const client = new Client({ name: 'e2e', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(MCP_URLS.mcp), {
      requestInit: { headers: { authorization: `Bearer ${MCP_TOKEN}` } },
    }),
  );
  return client;
}

/**
 * The text of a tool result.
 *
 * @param client - The connected client.
 * @param name - The tool.
 * @param args - Its arguments.
 */
async function callText(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as { type: string; text?: string }[];
  return first?.text ?? '';
}

describe('deck MCP page link', () => {
  test('current_slide follows the page and goto moves it', async (fixtures) => {
    const { browser } = fixtures;
    const client = await connect();
    try {
      await openDeck(fixtures, `${MCP_URLS.page}#/1/0`);
      await expect
        .poll(async () => JSON.parse(await callText(client, 'current_slide')).slide?.id)
        .toBe('title');

      await browser.keyboard.press('ArrowRight');
      await browser.keyboard.press('ArrowRight');
      await expect
        .poll(async () => {
          const current = JSON.parse(await callText(client, 'current_slide'));
          return [current.slide?.id, current.step];
        })
        .toEqual(['steps', 1]);

      const moved = JSON.parse(await callText(client, 'goto', { slide: 'closing' }));
      expect(moved).toEqual({ slide: 'closing', step: 0 });
      await expect.poll(() => browser.evaluate(() => window.__deck?.position.slide ?? -1)).toBe(3);

      const failed = await client.callTool({ name: 'goto', arguments: { slide: 'nope' } });
      expect(failed.isError).toBe(true);
      expect(JSON.stringify(failed.content)).toContain('nope');
    } finally {
      await client.close();
    }
  });

  test('reports the selected text', async (fixtures) => {
    const { browser } = fixtures;
    const client = await connect();
    try {
      await openDeck(fixtures, `${MCP_URLS.page}#/1/0`);
      await browser.evaluate(() => {
        const heading = document.querySelector('.deck-main h1, .deck-main h2');
        if (heading !== null) {
          window.getSelection()?.selectAllChildren(heading);
        }

        return heading !== null;
      });
      await expect
        .poll(async () => JSON.parse(await callText(client, 'current_slide')).selection)
        .not.toBe('');
    } finally {
      await client.close();
    }
  });

  test('reports nothing from a static page', async (fixtures) => {
    const client = await connect();
    try {
      await openDeck(fixtures, `${MCP_URLS.page}?static#/2/0`);
      await new Promise((resolve) => setTimeout(resolve, STATIC_WAIT_MS));
      expect(JSON.parse(await callText(client, 'current_slide')).connected).toBe(false);
    } finally {
      await client.close();
    }
  });
});
