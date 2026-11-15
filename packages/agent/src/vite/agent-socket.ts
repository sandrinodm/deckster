import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { Effect, Fiber, Result, Stream } from 'effect';
import { WebSocketServer, type WebSocket } from 'ws';

import type { AgentEvent, ClientMessage } from '#protocol/agent-events.ts';
import type { AgentSessionsApi } from '#session/agent-sessions.ts';

import { AGENT_PATH, AGENT_PROTOCOL } from '#protocol/agent-events.ts';
import { decodeClientMessage } from '#protocol/events.ts';

/**
 * The largest message a client may send, in bytes.
 */
export const MAX_MESSAGE_BYTES = 256 * 1024;

/**
 * How many pages may hold the agent socket open at once: the audience window, a presenter window, a
 * browser tab or two. More are refused with 503 until one closes.
 */
export const MAX_AGENT_CONNECTIONS = 8;

/**
 * The HTTP status for a handshake without the dev session cookie.
 */
const HTTP_UNAUTHORIZED = 401;

/**
 * The HTTP status for a handshake from somewhere that may not connect.
 */
const HTTP_FORBIDDEN = 403;

/**
 * The HTTP status for a handshake over the connection cap.
 */
const HTTP_UNAVAILABLE = 503;

/**
 * The reason phrases of the statuses a handshake can be refused with.
 */
const REASON_PHRASES: Readonly<Record<number, string>> = {
  /**
   * No or a wrong session cookie, or no `deck-agent.v1` subprotocol.
   */
  [HTTP_UNAUTHORIZED]: 'Unauthorized',

  /**
   * Not loopback, a foreign `Host` or `Origin`.
   */
  [HTTP_FORBIDDEN]: 'Forbidden',

  /**
   * Too many connections.
   */
  [HTTP_UNAVAILABLE]: 'Service Unavailable',
};

/**
 * The agent WebSocket on the dev server's own HTTP server.
 */
export type AgentSocketServer = {
  /**
   * Handles an HTTP upgrade: requests for other paths (Vite's HMR among them) are left alone.
   */
  readonly upgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

  /**
   * Closes every connection and stops their subscriptions.
   */
  readonly close: () => Promise<void>;
};

/**
 * Who may open the socket.
 */
export type AgentSocketGuard = {
  /**
   * Why a request comes from somewhere that may not connect (not loopback, a foreign `Host` or
   * `Origin`), or undefined.
   */
  readonly origin: (request: IncomingMessage) => string | undefined;

  /**
   * Why a request is not authenticated (no or a wrong dev session cookie), or undefined.
   */
  readonly session: (request: IncomingMessage) => string | undefined;
};

/**
 * Options for {@link createAgentSocketServer}.
 */
export type AgentSocketOptions = {
  /**
   * The agent host.
   */
  readonly sessions: AgentSessionsApi;

  /**
   * The checks every handshake must pass.
   */
  readonly guard: AgentSocketGuard;

  /**
   * The connection cap. Default: {@link MAX_AGENT_CONNECTIONS}.
   */
  readonly maxConnections?: number;
};

/**
 * Builds the `/__deck/agent` endpoint. A handshake must come from this machine (a loopback
 * connection, a loopback `Host`, no `Origin` other than the server's own), carry the dev session
 * cookie the server set on the deck's page (`HttpOnly`, so page scripts never see it), offer the
 * `deck-agent.v1` subprotocol and fit under the connection cap; anything else is answered with 401,
 * 403 or 503 before a WebSocket exists. Each connection receives the conversation so far and then
 * every event; what it sends is decoded against the message schema, and a malformed message gets an
 * error event (with `seq` 0) on that connection only. The agent host runs state-changing messages
 * one at a time, whichever connection sent them.
 *
 * @param options - The agent host, the guard and the cap.
 */
export function createAgentSocketServer(options: AgentSocketOptions): AgentSocketServer {
  const server = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
    handleProtocols: (protocols) => (protocols.has(AGENT_PROTOCOL) ? AGENT_PROTOCOL : false),
  });
  const connections = new Set<() => void>();
  const cap = options.maxConnections ?? MAX_AGENT_CONNECTIONS;
  let handshakes = 0;

  /**
   * Serves one connection until it closes.
   *
   * @param socket - The WebSocket.
   */
  const serve = (socket: WebSocket): void => {
    const subscription = Effect.runFork(
      Effect.scoped(
        Effect.gen(function* () {
          const events = yield* options.sessions.subscribe;
          yield* Stream.runForEach(events, (event) => Effect.sync(() => send(socket, event)));
        }),
      ),
    );
    /**
     * Stops the subscription.
     */
    const stop = () => {
      connections.delete(stop);
      Effect.runFork(Fiber.interrupt(subscription));
    };
    connections.add(stop);
    socket.on('close', stop);
    socket.on('error', () => socket.terminate());
    socket.on('message', (data, binary) => {
      const decoded = binary ? undefined : decodeClientMessage(rawText(data));
      if (decoded === undefined || Result.isFailure(decoded)) {
        send(socket, {
          type: 'error',
          kind: 'bad-request',
          message: 'The agent endpoint did not understand that message.',
          fix: 'Send one JSON message: prompt, cancel, undo, redo, new-conversation, set-model or diff.',
          seq: 0,
          at: Date.now(),
          turn: null,
        });
        return;
      }

      Effect.runFork(handle(options.sessions, decoded.success, (event) => send(socket, event)));
    });
  };

  return {
    upgrade: (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== AGENT_PATH) {
        return;
      }

      const where = options.guard.origin(request);
      if (where !== undefined) {
        return rejectUpgrade(socket, HTTP_FORBIDDEN, where);
      }

      const offered = String(request.headers['sec-websocket-protocol'] ?? '')
        .split(',')
        .map((protocol) => protocol.trim());
      const unauthenticated =
        options.guard.session(request) ??
        (offered.includes(AGENT_PROTOCOL)
          ? undefined
          : `Offer the ${AGENT_PROTOCOL} WebSocket subprotocol.`);
      if (unauthenticated !== undefined) {
        return rejectUpgrade(socket, HTTP_UNAUTHORIZED, unauthenticated);
      }

      if (connections.size + handshakes >= cap) {
        return rejectUpgrade(
          socket,
          HTTP_UNAVAILABLE,
          `${cap} deck pages are already connected to the agent. Close one and reload this page.`,
        );
      }

      // `ws` calls back only for a completed handshake; one it aborts (a bad key or version, a
      // socket gone mid-way) only closes the socket. The count drops once, whichever comes first.
      handshakes += 1;
      let counted = true;
      /**
       * Takes this handshake off the count, once.
       */
      const settle = () => {
        if (counted) {
          counted = false;
          handshakes -= 1;
        }
      };
      socket.once('close', settle);
      socket.once('error', settle);
      server.handleUpgrade(request, socket, head, (connected) => {
        settle();
        serve(connected);
      });
    },

    close: () =>
      new Promise((resolve) => {
        for (const stop of connections) {
          stop();
        }

        for (const client of server.clients) {
          client.terminate();
        }

        server.close(() => resolve());
      }),
  };
}

/**
 * Carries out one message from a client.
 *
 * @param sessions - The agent host.
 * @param message - The decoded message.
 * @param reply - Sends an event to the asking connection only.
 */
function handle(
  sessions: AgentSessionsApi,
  message: ClientMessage,
  reply: (event: AgentEvent) => void,
): Effect.Effect<void> {
  switch (message.type) {
    case 'diff':
      return sessions.diff(message.turn).pipe(
        Effect.match({
          onFailure: (error) => ({ available: false, message: error.message, files: [] }),
          onSuccess: (files) => ({ available: true, message: '', files }),
        }),
        Effect.map((answer) =>
          reply({ type: 'diff', ...answer, seq: 0, at: Date.now(), turn: message.turn }),
        ),
      );
    case 'prompt': {
      const { type: _type, ...input } = message;
      return Effect.asVoid(sessions.submit(input));
    }

    case 'cancel':
      return sessions.cancel;
    case 'undo':
      return message.turn === undefined
        ? sessions.undo
        : sessions.moveHistory('undo', message.turn);
    case 'redo':
      return message.turn === undefined
        ? sessions.redo
        : sessions.moveHistory('redo', message.turn);
    case 'new-conversation':
      return sessions.newConversation;
    case 'set-model':
      return sessions.setModel(message.model ?? undefined);
    default:
      return Effect.void;
  }
}

/**
 * Sends an event when the socket is open.
 *
 * @param socket - The WebSocket.
 * @param event - The event.
 */
function send(socket: WebSocket, event: AgentEvent): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}

/**
 * The text of a received message.
 *
 * @param data - What `ws` delivered.
 */
function rawText(data: Buffer | ArrayBuffer | Buffer[]): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }

  return Buffer.isBuffer(data)
    ? data.toString('utf8')
    : Buffer.from(new Uint8Array(data)).toString('utf8');
}

/**
 * Answers a handshake with an HTTP error and closes the socket.
 *
 * @param socket - The raw socket.
 * @param status - The HTTP status.
 * @param message - Why.
 */
function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  const body = JSON.stringify({ error: message });
  socket.end(
    `HTTP/1.1 ${status} ${REASON_PHRASES[status] ?? 'Error'}\r\n` +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n\r\n' +
      body,
  );
}
