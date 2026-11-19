import { isSafeName } from '@deckster/brand';
import { hostnameOf, originRefusal, requestUrl } from '@deckster/comments/dev-session';
import { discoverDecks, loadDeck, type DeckLocation } from '@deckster/vite-plugin';
import { Effect, FileSystem, type Scope } from 'effect';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isIP } from 'node:net';

import type { DeckBrowser } from '#browser/deck-browser.ts';
import type { DeckServer } from '#server/deck-server.ts';

import { CHOOSER_PATH } from '#chooser/chooser-link.ts';
import { renderChooser } from '#chooser/chooser-page.ts';
import { HTTP_CONFLICT, HTTP_START_FAILED, SELECTION_HEADER } from '#chooser/chooser-protocol.ts';
import {
  makeChooserSelection,
  type ChooserDeck,
  type OpenChooserDeck,
} from '#chooser/chooser-selection.ts';
import { makeCoverPreviews } from '#chooser/cover-previews.ts';
import { cliError, type CliError } from '#cli-error.ts';

/**
 * The first port to try when the operator did not specify one.
 */
const DEFAULT_PORT = 5173;

/**
 * The largest TCP port the fallback loop can try.
 */
const LAST_PORT = 65535;

/**
 * The launcher cookie starts with this prefix and ends in its port because browsers share cookies
 * across ports on the same hostname.
 */
const COOKIE_PREFIX = 'deck-chooser-';

/**
 * The confirmation presented before stopping a running or queued agent turn.
 */
const BUSY = 'The agent is working on this deck. Stop the turn and leave the deck?';

/**
 * The HTTP port browsers omit from the Host header.
 */
const HTTP_DEFAULT_PORT = 80;

/**
 * An open action completed with a deck URL.
 */
const HTTP_OK = 200;

/**
 * The request completed without a cover or navigation URL.
 */
const HTTP_NO_CONTENT = 204;

/**
 * The browser should follow the launcher or active deck URL.
 */
const HTTP_SEE_OTHER = 303;

/**
 * The requester supplied an invalid Host header or request target.
 */
const HTTP_BAD_REQUEST = 400;

/**
 * The requester did not have a local launcher session.
 */
const HTTP_FORBIDDEN = 403;

/**
 * The deck or chooser route is missing.
 */
const HTTP_NOT_FOUND = 404;

/**
 * The operator tried to act on a selection that has since changed.
 */
const HTTP_STALE = 412;

/**
 * An unexpected chooser request failure.
 */
const HTTP_SERVER_ERROR = 500;

/**
 * IPv6 brackets to remove before parsing a Host header as an IP address.
 */
const IP_BRACKETS = /^\[|\]$/g;

/**
 * Literal loopback hostnames the browser can use to open the chooser.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Document navigations that may initialize a local chooser session.
 */
const DOCUMENT_SITES = new Set(['none', 'same-origin', 'same-site']);

/**
 * The file, server and Chromium services that render cover images.
 */
type ChooserServices = FileSystem.FileSystem | DeckServer | DeckBrowser;

/**
 * The workspace, listener, and deck launch strategy.
 */
type ChooserOptions<R> = {
  /**
   * The absolute workspace root that holds the deck folders.
   */
  readonly workspaceRoot: string;

  /**
   * The brand override for previews, or undefined to use each deck’s brand.
   */
  readonly brand: string | undefined;

  /**
   * The fixed TCP port, or undefined to use the first free one.
   */
  readonly port: number | undefined;

  /**
   * Whether networking devices may follow the active deck URL.
   */
  readonly host: boolean;

  /**
   * Whether opening a deck leaves the chooser in its own window.
   */
  readonly desktop?: boolean;

  /**
   * The command action that opens a discovered deck using a fresh scope.
   */
  readonly open: OpenChooserDeck<R>;
};

/**
 * Serves a stable launcher URL and opens each selected deck in a separate scope. Other devices can
 * view the current deck with `host`, while only the local chooser can select or close it. Fails if
 * the listener cannot bind.
 */
export const startDeckChooser = Effect.fn('startDeckChooser')(function* <R>(
  options: ChooserOptions<R>,
): Effect.fn.Return<{ readonly url: string }, CliError, ChooserServices | R | Scope.Scope> {
  const readCover = yield* makeCoverPreviews(options);
  const context = yield* Effect.context<FileSystem.FileSystem | R>();
  const run = Effect.runPromiseWith(context);
  const secret = randomUUID();
  const requests = new Map<AbortController, Promise<void>>();
  let port = 0;
  const selection = yield* makeChooserSelection(options.open, () => port);

  const server = yield* Effect.acquireRelease(
    Effect.sync(() => createServer(handleRequest)),
    (running) =>
      Effect.promise(() => closeServer(running, requests)).pipe(Effect.andThen(selection.close)),
  );
  port = yield* Effect.uninterruptible(startListener(server, options));
  return { url: `http://127.0.0.1:${port}${CHOOSER_PATH}` };

  /**
   * Runs the request in a cancellable fiber so navigation and shutdown can abort a render.
   */
  function handleRequest(request: IncomingMessage, response: ServerResponse): void {
    const controller = new AbortController();
    response.once('close', () => {
      if (!response.writableFinished) {
        controller.abort();
      }
    });

    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    const action = route(request, response);
    const handled = run(action, { signal: controller.signal })
      .catch((cause: unknown) => {
        if (!response.destroyed && !response.headersSent) {
          reply(response, HTTP_SERVER_ERROR, describe(cause));
        }
      })
      .finally(() => requests.delete(controller));
    requests.set(controller, handled);
  }

  /**
   * Matches the chooser route after checking the address and launcher session.
   */
  function route(request: IncomingMessage, response: ServerResponse) {
    return Effect.gen(function* () {
      const url = requestUrl(request.url);
      const host = request.headers.host ?? '';
      if (url === undefined || !validHost(host, port, options.host)) {
        return reply(response, HTTP_BAD_REQUEST, 'Invalid chooser address.');
      }

      const operator = originRefusal(request, 'The deck chooser') === undefined;
      const { pathname } = url;
      const active = selection.current();
      if (request.method === 'GET') {
        if (pathname === '/' || pathname === CHOOSER_PATH) {
          return yield* showPage(request, response, url, operator);
        }

        if (pathname === `${CHOOSER_PATH}current` && active !== undefined) {
          return redirect(response, deckUrl(active.deck.url, request));
        }

        if (pathname.startsWith(`${CHOOSER_PATH}cover/`)) {
          if (!operator || !hasSession(request, port, secret)) {
            return refuse(response);
          }

          return yield* showCover(response, pathname);
        }
      }

      if (request.method === 'POST' && pathname.startsWith(CHOOSER_PATH)) {
        if (
          !operator ||
          !hasSession(request, port, secret) ||
          request.headers.origin !== `http://${host}`
        ) {
          return refuse(response);
        }

        return yield* mutate(request, response, url);
      }

      return reply(response, HTTP_NOT_FOUND, 'There is no page at this address.');
    });
  }

  /**
   * Builds a fresh inventory so decks created or deleted since startup appear correctly.
   */
  function showPage(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    operator: boolean,
  ) {
    return Effect.gen(function* () {
      if (url.pathname === '/') {
        return redirect(response, CHOOSER_PATH);
      }

      const decks = operator ? yield* discoverDecks(options.workspaceRoot) : [];
      const cards = yield* Effect.forEach(decks.filter(safeDeck), (deck) =>
        loadDeck(options.workspaceRoot, deck).pipe(
          Effect.map((loaded) => ({ id: deck.id, title: loaded.config.title })),
          Effect.orElseSucceed(() => ({ id: deck.id, title: deck.id })),
        ),
      );
      const nonce = randomUUID();
      const active = selection.current();
      const returning = requestedReturn(request, url, active);
      if (operator && isChooserDocument(request)) {
        const cookie = `${COOKIE_PREFIX}${port}=${secret}`;
        response.setHeader(
          'set-cookie',
          `${cookie}; HttpOnly; SameSite=Strict; Path=${CHOOSER_PATH}`,
        );
      }

      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('referrer-policy', 'strict-origin');
      response.setHeader(
        'content-security-policy',
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; ` +
          "img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
      );
      response.end(
        renderChooser({
          base: CHOOSER_PATH,
          decks: cards,
          active: active?.name,
          selection: active?.key,
          operator,
          returning,
          desktop: options.desktop === true,
          nonce,
        }),
      );
    });
  }

  /**
   * Returns a cached or newly rendered cover for a currently discovered deck.
   */
  function showCover(response: ServerResponse, pathname: string) {
    return Effect.gen(function* () {
      const name = pathName(pathname.slice(`${CHOOSER_PATH}cover/`.length));
      const deck = yield* discover(name);
      const cover = deck === undefined ? undefined : yield* readCover(deck);
      if (cover === undefined) {
        return reply(response, HTTP_NO_CONTENT, '');
      }

      response.setHeader('content-type', 'image/png');
      response.end(cover);
    });
  }

  /**
   * Looks up a name in the current workspace inventory rather than reading a request path.
   */
  function discover(name: string | undefined) {
    return discoverDecks(options.workspaceRoot).pipe(
      Effect.map((decks) => decks.find((deck) => deck.id === name)),
    );
  }

  /**
   * Resolves an operator action and returns the outcome of the serialized switch.
   */
  function mutate(request: IncomingMessage, response: ServerResponse, url: URL) {
    return Effect.gen(function* () {
      const action = url.pathname.slice(CHOOSER_PATH.length);
      if (action !== 'close' && !action.startsWith('open/')) {
        return reply(response, HTTP_NOT_FOUND, 'There is no chooser action at this address.');
      }

      const name = pathName(action.slice('open/'.length));
      if (action !== 'close' && (yield* discover(name)) === undefined) {
        return reply(response, HTTP_NOT_FOUND, 'That deck no longer exists. Reload the chooser.');
      }

      const confirm = request.headers[SELECTION_HEADER];
      const change = yield* selection.change({
        name,
        expected: url.searchParams.get('selection') ?? undefined,
        confirmation: typeof confirm === 'string' ? confirm : undefined,
      });
      switch (change.kind) {
        case 'opened':
          response.setHeader(SELECTION_HEADER, change.key);
          return replyOpened(response, request, change.deck);
        case 'closed':
          return reply(response, HTTP_NO_CONTENT, '');
        case 'busy':
          response.setHeader(SELECTION_HEADER, change.key);
          return reply(response, HTTP_CONFLICT, BUSY);
        case 'stale':
          return reply(response, HTTP_STALE, 'The selected deck has changed. Reload the chooser.');
        case 'failed':
          return reply(response, HTTP_START_FAILED, describe(change.cause));
      }
    });
  }
});

/**
 * Starts listening and reports bind errors through the CLI.
 */
function startListener<R>(
  server: Server,
  options: ChooserOptions<R>,
): Effect.Effect<number, CliError> {
  return Effect.tryPromise({
    try: () => listen(server, options.port, options.host),
    catch: (cause) => cliError(`Could not start the deck chooser: ${describe(cause)}`),
  });
}

/**
 * Binds the requested port, or tries unused ports beginning at the default.
 */
async function listen(
  server: Server,
  requested: number | undefined,
  host: boolean,
): Promise<number> {
  const address = host ? '0.0.0.0' : '127.0.0.1';
  for (let port = requested ?? DEFAULT_PORT; port <= LAST_PORT; port += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, address, () => {
          server.off('error', reject);
          resolve();
        });
      });
      return port;
    } catch (error) {
      if (requested !== undefined || !inUse(error)) {
        throw error;
      }
    }
  }

  throw new Error('There are no free ports for the chooser.');
}

/**
 * Identifies a taken port, the only listen error for which to try a new port.
 */
function inUse(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
}

/**
 * Stops new connections and waits for request cleanup before closing the active deck scope.
 */
async function closeServer(
  server: Server,
  requests: ReadonlyMap<AbortController, Promise<void>>,
): Promise<void> {
  const pending = [...requests];
  for (const [request] of pending) {
    request.abort();
  }

  const closed = new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
  await Promise.allSettled([closed, ...pending.map(([, handled]) => handled)]);
}

/**
 * Accepts only loopback hostname or literal IP addresses to prevent DNS rebinding.
 */
function validHost(host: string, port: number, allowNetwork: boolean): boolean {
  const name = hostnameOf(host);
  const hasPort = host === `${name}:${port}` || (port === HTTP_DEFAULT_PORT && host === name);
  if (!hasPort) {
    return false;
  }

  return LOOPBACK_HOSTS.has(name) || (allowNetwork && isIP(name.replace(IP_BRACKETS, '')) !== 0);
}

/**
 * Checks that the same-origin browser request carries this chooser’s session cookie.
 */
function hasSession(request: IncomingMessage, port: number, secret: string): boolean {
  const cookie = `${COOKIE_PREFIX}${port}=${secret}`;
  return (
    request.headers['sec-fetch-site'] === 'same-origin' &&
    (request.headers.cookie ?? '').split(';').some((value) => value.trim() === cookie)
  );
}

/**
 * Checks browser navigation metadata so API or frame requests cannot start a session.
 */
function isChooserDocument(request: IncomingMessage): boolean {
  return (
    request.headers['sec-fetch-dest'] === 'document' &&
    DOCUMENT_SITES.has(String(request.headers['sec-fetch-site'] ?? ''))
  );
}

/**
 * Accepts return navigations from the origin of the current selection only.
 */
function requestedReturn(
  request: IncomingMessage,
  url: URL,
  active: { readonly key: string; readonly deck: ChooserDeck } | undefined,
): string | undefined {
  const key = url.searchParams.get('return');
  if (key === null || key !== active?.key || !isChooserDocument(request)) {
    return undefined;
  }

  const referrer = URL.parse(request.headers.referer ?? '');
  const current = URL.parse(deckUrl(active.deck.url, request));
  return referrer?.origin === current?.origin ? key : undefined;
}

/**
 * Determines whether the discovered folder name is usable by the CLI.
 */
function safeDeck(deck: DeckLocation): boolean {
  return isSafeName(deck.id);
}

/**
 * Decodes one folder name found in a URL. Invalid escape sequences or names give undefined.
 */
function pathName(part: string): string | undefined {
  try {
    const name = decodeURIComponent(part);
    return isSafeName(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Uses the same hostname that the operator or viewer used to reach the chooser.
 */
function deckUrl(value: string, request: IncomingMessage): string {
  const url = new URL(value);
  url.hostname = hostnameOf(request.headers.host ?? '');
  return url.href;
}

/**
 * Sends the deck URL, or keeps the launcher open when the selection opened its own window.
 */
function replyOpened(response: ServerResponse, request: IncomingMessage, deck: ChooserDeck): void {
  if (deck.stayOnChooser === true) {
    return reply(response, HTTP_NO_CONTENT, '');
  }

  return reply(response, HTTP_OK, deckUrl(deck.url, request));
}

/**
 * Sends a navigation to the local chooser or the active deck.
 */
function redirect(response: ServerResponse, target: string): void {
  response.writeHead(HTTP_SEE_OTHER, { location: target }).end();
}

/**
 * Writes a plain-text response so errors cannot insert HTML.
 */
function reply(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(message);
}

/**
 * Extracts a printable message from an error or an unknown failure.
 */
function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Explains why the request needs a session on the chooser origin.
 */
function refuse(response: ServerResponse): void {
  reply(response, HTTP_FORBIDDEN, 'Open the chooser from its own URL on this computer.');
}
