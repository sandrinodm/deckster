import type { AddressInfo } from 'node:net';

import http from 'node:http';
import { describe, expect, it } from 'vite-plus/test';

import { deckLocation } from '#decks/deck-paths.ts';
import { reorderMiddleware } from '#decks/reorder-middleware.ts';

/**
 * Sends one request to a real HTTP server running the middleware.
 *
 * @param options - How the middleware reacts, and the request to send.
 */
async function send(options: {
  run: () => Promise<never>;
  method: string;
  type: string | undefined;
  body: string;
}): Promise<number> {
  const middleware = reorderMiddleware({
    workspaceRoot: '/nowhere',
    deck: async () => deckLocation('/nowhere', 'demo'),
    run: options.run,
  });
  const server = http.createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404;
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    return await new Promise<number>((resolve, reject) => {
      const request = http.request(
        {
          host: '127.0.0.1',
          port,
          method: options.method,
          headers: options.type === undefined ? {} : { 'content-type': options.type },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      request.on('error', reject);
      request.end(options.body);
    });
  } finally {
    server.close();
  }
}

/**
 * A runner that must never be reached.
 */
const unreachable = (): Promise<never> => Promise.reject(new Error('unreachable'));

describe('reorderMiddleware', () => {
  it('answers a bad request without throwing out of the handler', async () => {
    const base = { run: unreachable, method: 'POST', type: 'application/json' };
    expect(await send({ ...base, body: '{nope' })).toBe(400);
    expect(await send({ ...base, body: 'x'.repeat(70 * 1024) })).toBe(400);
    expect(await send({ ...base, method: 'GET', body: '' })).toBe(405);
    expect(await send({ ...base, method: 'DELETE', body: '' })).toBe(405);
    expect(await send({ ...base, type: 'text/plain', body: '{}' })).toBe(415);
    expect(await send({ ...base, type: undefined, body: '{}' })).toBe(415);
    expect(await send({ ...base, body: '{"slides":[]}' })).toBe(500);
  });
});
