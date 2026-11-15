import type { IncomingMessage, ServerResponse } from 'node:http';

import { originRefusal, sameSecret } from '@deckster/comments/dev-session';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';

import type { DeckToolsApi } from '#mcp/deck-tools.ts';

import { createDeckMcpServer } from '#mcp/register-tools.ts';

/**
 * The HTTP status for an unexpected tool-server failure.
 */
const HTTP_INTERNAL_ERROR = 500;

/**
 * The JSON-RPC code for an unexpected tool-server failure.
 */
const RPC_INTERNAL_ERROR = -32603;

/**
 * The authorization header grammar accepted by the MCP endpoint.
 */
const BEARER_TOKEN_PATTERN = /^Bearer (.+)$/;

/**
 * The largest request body accepted, in bytes. A tool call is a few hundred bytes.
 */
export const MAX_BODY_BYTES = 64 * 1024;

/**
 * The HTTP status for a request without a valid token.
 */
const HTTP_UNAUTHORIZED = 401;

/**
 * The HTTP status for a request from somewhere that may not use the endpoint.
 */
const HTTP_FORBIDDEN = 403;

/**
 * The HTTP status for a method the endpoint does not take.
 */
const HTTP_METHOD_NOT_ALLOWED = 405;

/**
 * The HTTP status for a body over the size cap.
 */
const HTTP_PAYLOAD_TOO_LARGE = 413;

/**
 * The HTTP status for a body that is not JSON.
 */
const HTTP_BAD_REQUEST = 400;

/**
 * The JSON-RPC code of a request the server refuses for who sent it.
 */
const RPC_REFUSED = -32001;

/**
 * The JSON-RPC code of a request that is not valid.
 */
const RPC_INVALID_REQUEST = -32600;

/**
 * The JSON-RPC code of a body that does not parse.
 */
const RPC_PARSE_ERROR = -32700;

/**
 * Options for {@link createDeckMcpRequestHandler}.
 */
export type DeckMcpHandlerOptions = {
  /**
   * The operations behind the tools.
   */
  readonly tools: DeckToolsApi;

  /**
   * The bearer token every request must carry.
   */
  readonly token: string;

  /**
   * The body size cap in bytes. Default: {@link MAX_BODY_BYTES}.
   */
  readonly maxBodyBytes?: number;
};

/**
 * A Node request handler for the deck MCP endpoint, and the way to stop it.
 */
export type DeckMcpRequestHandler = {
  /**
   * Handles one request; never throws.
   */
  readonly handle: (request: IncomingMessage, response: ServerResponse) => void;

  /**
   * Aborts in-flight requests.
   */
  readonly close: () => Promise<void>;
};

/**
 * Answers a request with a JSON-RPC shaped error.
 *
 * @param response - The response.
 * @param status - The HTTP status.
 * @param code - The JSON-RPC error code.
 * @param message - What is wrong and what to do.
 * @param headers - Extra response headers.
 */
function reject(
  response: ServerResponse,
  status: number,
  code: number,
  message: string,
  headers: Record<string, string> = {},
): void {
  if (response.headersSent) {
    response.end();
    return;
  }

  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

/**
 * Whether two secrets are equal, in constant time.
 *
 * @param given - What the client sent.
 * @param expected - The token.
 */
export function sameToken(given: string, expected: string): boolean {
  return sameSecret(given, expected);
}

/**
 * Checks where a request comes from: a loopback connection, a loopback `Host` (against DNS
 * rebinding) and, when a browser sent one, an `Origin` that is this very server. The same check
 * guards every page-facing dev endpoint (`@deckster/comments/dev-session`).
 *
 * @param request - The request.
 * @returns A reason to refuse it, or undefined.
 */
export function refusal(request: IncomingMessage): string | undefined {
  return originRefusal(request, 'The deck MCP endpoint');
}

/**
 * Reads a request body up to a cap.
 *
 * @param request - The request.
 * @param limit - The cap in bytes.
 * @returns The body, or undefined when it is larger than the cap.
 */
async function readBody(request: IncomingMessage, limit: number): Promise<Buffer | undefined> {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (declared > limit) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += piece.length;
    if (size > limit) {
      return undefined;
    }

    chunks.push(piece);
  }

  return Buffer.concat(chunks);
}

/**
 * Handles one request after the transport checks.
 *
 * @param options - The handler options.
 * @param serve - The SDK's Node handler.
 * @param request - The request.
 * @param response - The response.
 */
async function serveRequest(
  options: DeckMcpHandlerOptions,
  serve: ReturnType<typeof toNodeHandler>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const reason = refusal(request);
  if (reason !== undefined) {
    return reject(response, HTTP_FORBIDDEN, RPC_REFUSED, reason);
  }

  const match = BEARER_TOKEN_PATTERN.exec(request.headers.authorization ?? '');
  if (match?.[1] === undefined || !sameToken(match[1], options.token)) {
    return reject(
      response,
      HTTP_UNAUTHORIZED,
      RPC_REFUSED,
      'Missing or wrong bearer token. Send `Authorization: Bearer <token>`; ' +
        'run `deck mcp <deck>` for the configuration.',
      { 'www-authenticate': 'Bearer realm="deck"' },
    );
  }

  if (request.method !== 'POST') {
    return reject(
      response,
      HTTP_METHOD_NOT_ALLOWED,
      RPC_INVALID_REQUEST,
      'The deck MCP endpoint takes POST only.',
      { allow: 'POST' },
    );
  }

  const body = await readBody(request, options.maxBodyBytes ?? MAX_BODY_BYTES);
  if (body === undefined) {
    return reject(
      response,
      HTTP_PAYLOAD_TOO_LARGE,
      RPC_INVALID_REQUEST,
      `The request body is larger than ${options.maxBodyBytes ?? MAX_BODY_BYTES} bytes.`,
      { connection: 'close' },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    return reject(response, HTTP_BAD_REQUEST, RPC_PARSE_ERROR, 'The body is not valid JSON.');
  }

  // The POST check above makes `method` a string, which the adapter's looser type cannot see.
  return serve(request as Parameters<typeof serve>[0], response, parsed);
}

/**
 * Builds the Node request handler of the deck MCP endpoint. It is stateless: every request gets its
 * own server with the deck tools. A request must come from a loopback connection, carry a loopback
 * `Host`, have no foreign `Origin`, present the bearer token and fit the size cap; otherwise it is
 * answered with a JSON-RPC shaped error before any MCP code runs.
 *
 * @param options - The tools, the token and the size cap.
 */
export function createDeckMcpRequestHandler(options: DeckMcpHandlerOptions): DeckMcpRequestHandler {
  const sdk = createMcpHandler(() => createDeckMcpServer(options.tools));
  const serve = toNodeHandler(sdk);
  return {
    handle: (request, response) => {
      serveRequest(options, serve, request, response).catch(() => {
        reject(
          response,
          HTTP_INTERNAL_ERROR,
          RPC_INTERNAL_ERROR,
          'The deck MCP server failed. Check the dev server terminal.',
        );
      });
    },
    close: () => sdk.close(),
  };
}
