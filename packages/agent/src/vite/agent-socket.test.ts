import { createDevSession, originRefusal } from '@deckster/comments/dev-session';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { createServer, type Server } from 'node:http';
import { connect as connectTcp } from 'node:net';
import { WebSocket } from 'ws';

import type { AgentEvent } from '#protocol/agent-events.ts';

import { AGENT_PATH, AGENT_PROTOCOL } from '#protocol/agent-events.ts';
import { scratchWorkspace, startFakeHost } from '#session/sessions.fixture.ts';
import { createAgentSocketServer } from '#vite/agent-socket.ts';

/**
 * How long one test may take, in milliseconds.
 */
const TEST_TIMEOUT_MS = 30_000;

/**
 * Serves the agent socket on a free loopback port for the test's scope, guarded by a dev session.
 *
 * @param options - The connection cap, and a gate the host's lint waits on.
 */
const serveSocket = (
  options: {
    readonly maxConnections?: number;
    readonly lintGate?: { readonly open: boolean };
  } = {},
) =>
  Effect.gen(function* () {
    const { maxConnections, lintGate } = options;
    const root = yield* scratchWorkspace;
    const { sessions, calls } = yield* startFakeHost(
      root,
      lintGate === undefined ? {} : { lintGate },
    );
    const session = createDevSession();
    const sockets = createAgentSocketServer({
      sessions,
      guard: {
        origin: (request) => originRefusal(request, 'The agent socket'),
        session: (request) => session.refusal(request),
      },
      ...(maxConnections === undefined ? {} : { maxConnections }),
    });
    const server: Server = createServer((_request, response) => response.end());
    server.on('upgrade', sockets.upgrade);
    yield* Effect.acquireRelease(
      Effect.promise(() => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))),
      () =>
        Effect.promise(async () => {
          await sockets.close();
          await new Promise((resolve) => server.close(resolve));
        }),
    );
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    return {
      url: `ws://127.0.0.1:${port}${AGENT_PATH}`,
      origin: `http://127.0.0.1:${port}`,
      cookie: session.cookieHeader(port),
      calls,
    };
  });

/**
 * A client connection and what it received.
 */
type Client = {
  /**
   * The socket.
   */
  readonly socket: WebSocket;

  /**
   * Every event received.
   */
  readonly events: AgentEvent[];
};

/**
 * Connects a client, resolving once open, or failing with the HTTP status of a refused handshake.
 *
 * @param url - The endpoint.
 * @param options - The session cookie (none when left out) and Origin to send.
 */
function connect(
  url: string,
  options: { readonly cookie?: string; readonly origin?: string } = {},
): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, [AGENT_PROTOCOL], {
      ...(options.origin === undefined ? {} : { origin: options.origin }),
      ...(options.cookie === undefined ? {} : { headers: { cookie: options.cookie } }),
    });
    const events: AgentEvent[] = [];
    socket.on('message', (data) =>
      events.push(JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : '{}') as AgentEvent),
    );
    socket.on('open', () => resolve({ socket, events }));
    socket.on('unexpected-response', (_request, response) =>
      reject(new Error(`HTTP ${response.statusCode}`)),
    );
    socket.on('error', reject);
  });
}

/**
 * Sends a WebSocket upgrade that passes the deck's own checks (loopback, cookie, subprotocol) but
 * that `ws` refuses (an unsupported `Sec-WebSocket-Version`), and resolves with the first line of
 * the answer once the server closes the connection.
 *
 * @param port - The server's port.
 * @param cookie - The dev session cookie header.
 */
function abortedHandshake(port: number, cookie: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connectTcp(port, '127.0.0.1', () => {
      socket.write(
        [
          `GET ${AGENT_PATH} HTTP/1.1`,
          `Host: 127.0.0.1:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version: 99',
          `Sec-WebSocket-Protocol: ${AGENT_PROTOCOL}`,
          `Cookie: ${cookie}`,
          '',
          '',
        ].join('\r\n'),
      );
    });
    let answer = '';
    socket.on('data', (chunk) => {
      answer += chunk.toString('utf8');
    });
    socket.on('close', () => resolve(answer.split('\r\n')[0] ?? ''));
    socket.on('error', reject);
  });
}

/**
 * Waits until a client received an event the predicate accepts.
 *
 * @param client - The client.
 * @param predicate - What to wait for.
 */
async function waitFor(client: Client, predicate: (event: AgentEvent) => boolean): Promise<void> {
  const deadline = Date.now() + TEST_TIMEOUT_MS;
  while (!client.events.some(predicate)) {
    if (Date.now() > deadline) {
      throw new Error('timed out');
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('agent WebSocket', () => {
  it.live(
    'refuses a missing or wrong session cookie and a foreign origin before the handshake completes',
    () =>
      Effect.gen(function* () {
        const { url, origin, cookie } = yield* serveSocket();
        /**
         * The outcome of one handshake.
         *
         * @param options - What to send.
         */
        const attempt = (options: { readonly cookie?: string; readonly origin?: string }) =>
          Effect.promise(() =>
            connect(url, options).then(
              (client) => {
                client.socket.close();
                return 'open';
              },
              (error: Error) => error.message,
            ),
          );
        expect(yield* attempt({})).toBe('HTTP 401');
        expect(yield* attempt({ cookie: cookie.replace(/=.*$/, '=forged') })).toBe('HTTP 401');
        expect(yield* attempt({ cookie, origin: 'http://evil.example' })).toBe('HTTP 403');
        expect(yield* attempt({ cookie, origin: 'http://localhost:1' })).toBe('HTTP 403');
        expect(yield* attempt({ cookie, origin })).toBe('open');
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'answers a malformed message with an error to that connection only',
    () =>
      Effect.gen(function* () {
        const { url, cookie } = yield* serveSocket();
        const one = yield* Effect.promise(() => connect(url, { cookie }));
        const two = yield* Effect.promise(() => connect(url, { cookie }));
        yield* Effect.promise(() => waitFor(two, (event) => event.type === 'status'));
        one.socket.send('{"type":"prompt"}');
        one.socket.send('not json');
        yield* Effect.promise(() =>
          waitFor(one, (event) => event.type === 'error' && event.kind === 'bad-request'),
        );
        expect(one.events.filter((event) => event.type === 'error')).toEqual([
          expect.objectContaining({ seq: 0, kind: 'bad-request' }),
          expect.objectContaining({ seq: 0, kind: 'bad-request' }),
        ]);
        expect(two.events.some((event) => event.type === 'error')).toBe(false);
        one.socket.close();
        two.socket.close();
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'streams a turn to every connection, and replays it to a late one',
    () =>
      Effect.gen(function* () {
        const { url, cookie } = yield* serveSocket();
        const one = yield* Effect.promise(() => connect(url, { cookie }));
        const two = yield* Effect.promise(() => connect(url, { cookie }));
        one.socket.send(
          JSON.stringify({ type: 'prompt', text: 'Retitle', slide: { id: 'title', step: 0 } }),
        );
        for (const client of [one, two]) {
          yield* Effect.promise(() => waitFor(client, (event) => event.type === 'turn-done'));
        }

        /**
         * The conversation events a client saw, statuses left out.
         *
         * @param client - The client.
         */
        const conversation = (client: Client) =>
          client.events.filter((event) => event.type !== 'status').map((event) => event.seq);
        expect(conversation(one)).toEqual(conversation(two));
        expect(one.events.some((event) => event.type === 'text-delta')).toBe(true);
        const late = yield* Effect.promise(() => connect(url, { cookie }));
        yield* Effect.promise(() => waitFor(late, (event) => event.type === 'turn-done'));
        expect(late.events.map((event) => event.type)).toContain('turn-started');

        one.socket.send(JSON.stringify({ type: 'diff', turn: 1 }));
        one.socket.send(JSON.stringify({ type: 'diff', turn: 9 }));
        for (const turn of [1, 9]) {
          yield* Effect.promise(() =>
            waitFor(one, (event) => event.type === 'diff' && event.turn === turn),
          );
        }

        const diffs = one.events
          .filter((event) => event.type === 'diff')
          .toSorted((left, right) => (left.turn ?? 0) - (right.turn ?? 0));
        expect(diffs).toEqual([
          expect.objectContaining({
            seq: 0,
            turn: 1,
            available: true,
            files: [
              expect.objectContaining({ path: 'decks/hello/slides/title.mdx', kind: 'update' }),
            ],
          }),
          expect.objectContaining({ seq: 0, turn: 9, available: false, files: [] }),
        ]);
        expect(two.events.some((event) => event.type === 'diff')).toBe(false);
        for (const client of [one, two, late]) {
          client.socket.close();
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'refuses a connection over the cap with 503 and accepts one again after a close',
    () =>
      Effect.gen(function* () {
        const { url, cookie } = yield* serveSocket({ maxConnections: 2 });
        const one = yield* Effect.promise(() => connect(url, { cookie }));
        const two = yield* Effect.promise(() => connect(url, { cookie }));
        const third = yield* Effect.promise(() =>
          connect(url, { cookie }).then(
            () => 'open',
            (error: Error) => error.message,
          ),
        );
        expect(third).toBe('HTTP 503');
        one.socket.close();
        yield* Effect.promise(() => new Promise((resolve) => one.socket.once('close', resolve)));
        yield* Effect.sleep(50);
        const again = yield* Effect.promise(() => connect(url, { cookie }));
        again.socket.close();
        two.socket.close();
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'handshake counter leak: handshakes ws aborts never lock out the next connection',
    () =>
      Effect.gen(function* () {
        const { url, cookie } = yield* serveSocket({ maxConnections: 2 });
        const { port } = new URL(url);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          // A bad Sec-WebSocket-Version passes the deck's checks, then `ws` aborts the handshake
          // with 400 and never calls handleUpgrade's callback.
          const answer = yield* Effect.promise(() => abortedHandshake(Number(port), cookie));
          expect(answer).toMatch(/^HTTP\/1\.1 400/);
        }

        const client = yield* Effect.promise(() => connect(url, { cookie }));
        client.socket.close();
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'runs three redo requests for the same turn once, in order, from two connections',
    () =>
      Effect.gen(function* () {
        // The host's baseline lint passes; the lint after the turn waits until it is released, so
        // the turn's chain ends well after its `turn-done`, as it can under load.
        let released = false;
        const lintCalls = { count: () => 0 };
        const { url, cookie, calls } = yield* serveSocket({
          lintGate: {
            get open() {
              return released || lintCalls.count() < 2;
            },
          },
        });
        lintCalls.count = () => calls.filter((call) => call === 'deckLint').length;
        const one = yield* Effect.promise(() => connect(url, { cookie }));
        const two = yield* Effect.promise(() => connect(url, { cookie }));
        one.socket.send(
          JSON.stringify({ type: 'prompt', text: 'Retitle', slide: { id: 'title', step: 0 } }),
        );
        yield* Effect.promise(() => waitFor(one, (event) => event.type === 'turn-done'));
        setTimeout(() => {
          released = true;
        }, 300);
        // Idle means a status after the turn's end: the one replayed on connecting says nothing
        // about the lint and follow-up that run after `turn-done`, and undo is refused meanwhile.
        const done = one.events.find((event) => event.type === 'turn-done')?.seq ?? 0;
        yield* Effect.promise(() =>
          waitFor(
            one,
            (event) => event.type === 'status' && event.running === null && event.seq > done,
          ),
        );
        one.socket.send(JSON.stringify({ type: 'undo', turn: 1 }));
        one.socket.send(JSON.stringify({ type: 'undo', turn: 1 }));
        yield* Effect.promise(() => waitFor(one, (event) => event.type === 'history'));
        one.socket.send(JSON.stringify({ type: 'redo', turn: 1 }));
        two.socket.send(JSON.stringify({ type: 'redo', turn: 1 }));
        one.socket.send(JSON.stringify({ type: 'redo', turn: 1 }));
        yield* Effect.promise(() =>
          waitFor(one, (event) => event.type === 'history' && event.action === 'redo'),
        );
        yield* Effect.sleep(300);
        const moves = one.events.filter((event) => event.type === 'history');
        expect(moves.map((event) => event.type === 'history' && event.action)).toEqual([
          'undo',
          'redo',
        ]);
        expect(one.events.some((event) => event.type === 'error')).toBe(false);
        one.socket.close();
        two.socket.close();
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );
});
