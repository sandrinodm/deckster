import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
  createDevSession,
  DEV_SESSION_CODE_HEADER,
  type DevSession,
  issueDevSession,
  requestUrl,
} from '#vite/dev-session.ts';

/**
 * A browser navigation to the deck's page, as Chromium sends it.
 */
const NAVIGATION = { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none' };

let server: Server | undefined;

afterEach(async () => {
  await new Promise((resolve) =>
    server === undefined ? resolve(undefined) : server.close(resolve),
  );
  server = undefined;
});

/**
 * Serves `/` (which issues the cookie) and `/__deck/x` (which needs it) on a free loopback port.
 *
 * @param session - The session.
 */
async function serve(session: DevSession): Promise<string> {
  server = createServer((request, response) => {
    if ((request.url ?? '').startsWith('/__deck/')) {
      const refused = session.refusal(request);
      response.statusCode = refused === undefined ? 200 : 403;
      response.end(refused ?? 'ok');
      return;
    }

    session.issue(request, response);
    response.end('<html></html>');
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
}

/**
 * The cookie a response set, as a request would send it back.
 *
 * @param response - The response.
 */
function cookieOf(response: Response): string {
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

describe('the dev session', () => {
  it('sets an HttpOnly, SameSite=Strict cookie on a navigation to the deck, and the endpoint needs it', async () => {
    const base = await serve(createDevSession());
    const page = await fetch(`${base}/?presenter`, { headers: NAVIGATION });
    const header = page.headers.get('set-cookie') ?? '';
    expect(header).toMatch(
      /^deck-session-\d+=[\w-]{20,}; HttpOnly; SameSite=Strict; Path=\/__deck$/,
    );
    expect((await fetch(`${base}/__deck/x`)).status).toBe(403);
    expect((await fetch(`${base}/__deck/x`, { headers: { cookie: cookieOf(page) } })).status).toBe(
      200,
    );
    const forged = cookieOf(page).replace(/=.*/, '=forged');
    expect((await fetch(`${base}/__deck/x`, { headers: { cookie: forged } })).status).toBe(403);
    const foreign = await fetch(`${base}/__deck/x`, {
      headers: { cookie: cookieOf(page), origin: 'http://localhost:3000' },
    });
    expect(foreign.status).toBe(403);
  });

  it('issues nothing to a module request, a cross-site navigation or another path', async () => {
    const base = await serve(createDevSession());
    for (const [path, headers] of [
      ['/', {}],
      ['/', { 'sec-fetch-dest': 'script', 'sec-fetch-site': 'same-origin' }],
      ['/', { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'cross-site' }],
      ['/', { ...NAVIGATION, origin: 'http://evil.example' }],
      ['/@id/__x00__virtual:deck/agent', NAVIGATION],
      ['/%2F', NAVIGATION],
    ] as const) {
      const response = await fetch(`${base}${path}`, { headers });
      expect(response.headers.get('set-cookie'), `${path} ${JSON.stringify(headers)}`).toBeNull();
    }
  });

  it('in strict mode issues the cookie once, to the navigation that carries the one-time code', async () => {
    const session = createDevSession();
    session.setStrict(true);
    session.addCode('a-one-time-code-of-the-shell');
    const base = await serve(session);
    expect((await fetch(base, { headers: NAVIGATION })).headers.get('set-cookie')).toBeNull();
    const wrong = await fetch(base, {
      headers: { ...NAVIGATION, [DEV_SESSION_CODE_HEADER]: 'guessed-code-0000' },
    });
    expect(wrong.headers.get('set-cookie')).toBeNull();
    const first = await fetch(base, {
      headers: { ...NAVIGATION, [DEV_SESSION_CODE_HEADER]: 'a-one-time-code-of-the-shell' },
    });
    expect(first.headers.get('set-cookie')).toContain('HttpOnly');
    const again = await fetch(base, {
      headers: { ...NAVIGATION, [DEV_SESSION_CODE_HEADER]: 'a-one-time-code-of-the-shell' },
    });
    expect(again.headers.get('set-cookie')).toBeNull();
  });
});

/**
 * Sends a GET with a raw request target, which `fetch` would normalise, and returns the status and
 * whether a cookie was set.
 *
 * @param base - The server's base URL.
 * @param target - The request target as sent.
 */
function rawNavigation(base: string, target: string): Promise<{ status: number; cookie: boolean }> {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      { hostname, port, path: target, method: 'GET', headers: NAVIGATION },
      (answer) => {
        answer.resume();
        resolve({
          status: answer.statusCode ?? 0,
          cookie: answer.headers['set-cookie'] !== undefined,
        });
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

describe('request targets that are not plain paths', () => {
  it('requestUrl reads only origin-form paths', () => {
    expect(requestUrl('/?presenter')?.pathname).toBe('/');
    expect(requestUrl(undefined)?.pathname).toBe('/');
    for (const target of ['//', '//evil', '//evil/x', 'http://evil.example/', '*', '']) {
      expect(requestUrl(target), target).toBeUndefined();
    }
  });

  it('a `//` or `//evil` target answers 400 from the session middleware instead of throwing', async () => {
    const session = createDevSession();
    const middleware = issueDevSession(session);
    server = createServer((request, response) => {
      middleware(request, response, () => {
        response.end('next');
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
    expect(await rawNavigation(base, '//')).toEqual({ status: 400, cookie: false });
    expect(await rawNavigation(base, '//evil')).toEqual({ status: 400, cookie: false });
    expect(await rawNavigation(base, '/')).toEqual({ status: 200, cookie: true });
  });
});
