import type { IncomingMessage, ServerResponse } from 'node:http';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The path every page-facing dev endpoint lives under, and the cookie's `Path`: `/__deck/comments`,
 * `/__deck/reorder`, `/__deck/agent`.
 */
export const DEV_SESSION_PATH = '/__deck';

/**
 * The request header that carries a one-time code. In strict mode (`deck present`'s window) the
 * cookie is issued only to the document request that presents an unused code.
 */
export const DEV_SESSION_CODE_HEADER = 'x-deck-agent-code';

/**
 * The prefix of the cookie name; the server's port follows, because browsers share cookies between
 * the ports of one host.
 */
const COOKIE_PREFIX = 'deck-session-';

/**
 * The bytes of randomness in the session secret.
 */
const SECRET_BYTES = 32;

/**
 * The hostnames a loopback request may use, as they appear in `Host` and `Origin`.
 */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The remote addresses of a loopback connection.
 */
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * The `Sec-Fetch-Site` values of a navigation the person made: typed or opened (`none`) or from the
 * deck's own pages (`same-origin`).
 */
const NAVIGATION_SITES = new Set(['none', 'same-origin']);

/**
 * The paths of the deck's top-level document.
 */
const DOCUMENT_PATHS = new Set(['/', '/index.html']);

/**
 * The HTTP status of a request whose target is not a plain path.
 */
const HTTP_BAD_REQUEST = 400;

/**
 * The base a request's path is resolved against; only the path and query of the result are read.
 */
const PATH_BASE = 'http://localhost';

/**
 * Parses a request's target as a path with an optional query. Only the origin form (`/x?y`) is
 * accepted: a target that does not start with one `/` (an absolute URL, `*`, or `//host`, which a
 * URL parser reads as another host or rejects outright) gives `undefined`, so a handler answers 400
 * instead of throwing or reading a path that is not the one requested.
 *
 * @param target - The request's `url`, as Node gives it.
 */
export function requestUrl(target: string | undefined): URL | undefined {
  const raw = target ?? '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) {
    return undefined;
  }

  return URL.parse(`${PATH_BASE}${raw}`) ?? undefined;
}

/**
 * The page-facing dev endpoints' authentication: a per-server secret in an `HttpOnly;
 * SameSite=Strict; Path=/__deck` cookie, set on the deck's document, plus the loopback, `Host` and
 * `Origin` checks.
 */
export type DevSession = {
  /**
   * Sets the session cookie on the response when the request is the deck's top-level document,
   * navigated to by the person in a browser on this machine: `GET /`, a loopback connection and
   * `Host`, no foreign `Origin`, `Sec-Fetch-Dest: document` and `Sec-Fetch-Site` `none` or
   * `same-origin`. In strict mode the request must also carry an unused one-time code.
   *
   * @returns Whether the cookie was set.
   */
  readonly issue: (request: IncomingMessage, response: ServerResponse) => boolean;

  /**
   * Why a request to a page-facing endpoint is refused (where it comes from, or a missing or wrong
   * session cookie), or undefined when it may proceed.
   */
  readonly refusal: (request: IncomingMessage) => string | undefined;

  /**
   * Strict mode: the cookie is issued only to a document request that carries a one-time code from
   * {@link DevSession.addCode}. `deck present` turns it on for its window.
   */
  readonly setStrict: (strict: boolean) => void;

  /**
   * Adds a one-time code; the first document request that presents it gets the cookie.
   */
  readonly addCode: (code: string) => void;

  /**
   * The `Cookie` header value that authenticates, for tests and tools in this process.
   *
   * @param port - The server's port.
   */
  readonly cookieHeader: (port: number) => string;
};

/**
 * The sessions of the dev servers in this process, by server.
 */
const SESSIONS = new WeakMap<object, DevSession>();

/**
 * The hostname part of a `Host` header value, with an IPv6 address kept in brackets.
 *
 * @param host - The header value.
 */
export function hostnameOf(host: string): string {
  return host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : (host.split(':')[0] ?? '');
}

/**
 * Checks where a request comes from: a loopback connection, a loopback `Host` (against DNS
 * rebinding) and, when a browser sent one, an `Origin` that is this very server.
 *
 * @param request - The request.
 * @param what - The endpoint, for the message.
 * @returns A reason to refuse it, or undefined.
 */
export function originRefusal(request: IncomingMessage, what: string): string | undefined {
  if (!LOOPBACK_ADDRESSES.has(request.socket.remoteAddress ?? '')) {
    return `${what} answers only to the machine it runs on.`;
  }

  const host = request.headers.host ?? '';
  if (!LOOPBACK_HOSTNAMES.has(hostnameOf(host))) {
    return (
      `The Host header "${host}" is not a loopback address. ` +
      'Connect through 127.0.0.1 or localhost.'
    );
  }

  const { origin } = request.headers;
  if (origin !== undefined && origin !== `http://${host}`) {
    return 'Browser requests from another origin are not allowed. Open the deck from its own URL.';
  }

  return undefined;
}

/**
 * Whether two secrets are equal, in constant time.
 *
 * @param given - What the client sent.
 * @param expected - The secret.
 */
export function sameSecret(given: string, expected: string): boolean {
  const left = createHash('sha256').update(given).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

/**
 * The value of one cookie in a `Cookie` header.
 *
 * @param header - The header.
 * @param name - The cookie name.
 */
function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at !== -1 && part.slice(0, at).trim() === name) {
      return part.slice(at + 1).trim();
    }
  }

  return undefined;
}

/**
 * Creates the session of one dev server: a fresh secret, not strict, no codes.
 */
export function createDevSession(): DevSession {
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const codes = new Set<string>();
  let strict = false;

  /**
   * The cookie's name on the port a request arrived on.
   *
   * @param port - The local port.
   */
  const nameFor = (port: number | undefined) => `${COOKIE_PREFIX}${port ?? 0}`;

  return {
    issue: (request, response) => {
      const url = requestUrl(request.url);
      const isDocument =
        url !== undefined &&
        (request.method === 'GET' || request.method === 'HEAD') &&
        DOCUMENT_PATHS.has(url.pathname) &&
        request.headers['sec-fetch-dest'] === 'document' &&
        NAVIGATION_SITES.has(String(request.headers['sec-fetch-site'] ?? '')) &&
        originRefusal(request, 'The deck') === undefined;
      if (!isDocument) {
        return false;
      }

      if (strict) {
        const code = request.headers[DEV_SESSION_CODE_HEADER];
        if (typeof code !== 'string' || !codes.has(code)) {
          return false;
        }

        codes.delete(code);
      }

      const cookie =
        `${nameFor(request.socket.localPort)}=${secret}; ` +
        `HttpOnly; SameSite=Strict; Path=${DEV_SESSION_PATH}`;
      const existing = response.getHeader('set-cookie');
      const previous = existing === undefined ? [] : [existing].flat().map(String);
      response.setHeader('set-cookie', [...previous, cookie]);
      return true;
    },

    refusal: (request) => {
      const where = originRefusal(request, 'The deck dev endpoints');
      if (where !== undefined) {
        return where;
      }

      const given = cookieValue(request.headers.cookie, nameFor(request.socket.localPort));
      return given !== undefined && sameSecret(given, secret)
        ? undefined
        : 'Missing or wrong dev session cookie. Reload the deck page from its own URL.';
    },

    setStrict: (value) => {
      strict = value;
    },

    addCode: (code) => {
      codes.add(code);
    },

    cookieHeader: (port) => `${nameFor(port)}=${secret}`,
  };
}

/**
 * The session of one dev server, created on first use. Every plugin of the server (the deck
 * plugin's reorder endpoint, the comments endpoint, the agent socket) and the CLI that created it
 * get the same one: it is keyed by the server's resolved config, which the server object Vite
 * returns and the proxy it hands to plugins share.
 *
 * @param server - The Vite dev server, or the proxy of it a plugin receives.
 */
export function devSessionOf(server: { readonly config: object }): DevSession {
  const existing = SESSIONS.get(server.config);
  if (existing !== undefined) {
    return existing;
  }

  const created = createDevSession();
  SESSIONS.set(server.config, created);
  return created;
}

/**
 * A Connect middleware that issues the session cookie on the deck's document and passes every other
 * request on; a request whose target is not a plain path (see {@link requestUrl}) gets 400.
 *
 * @param session - The server's session.
 */
export function issueDevSession(
  session: DevSession,
): (request: IncomingMessage, response: ServerResponse, next: () => void) => void {
  return (request, response, next) => {
    if (requestUrl(request.url) === undefined) {
      response.statusCode = HTTP_BAD_REQUEST;
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.end('The request target is not a plain path.');
      return;
    }

    session.issue(request, response);
    next();
  };
}
