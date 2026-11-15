import type { ServerResponse } from 'node:http';
import type { Connect } from 'vite-plus';

import type { DeckLocation } from '#decks/deck-paths.ts';
import type { RunEffect } from '#run-effect.ts';

import { reorderDeck } from '#decks/reorder-deck.ts';
import { DeckBuildError } from '#errors.ts';

/**
 * The dev-server path the presenter's sidebar posts a new slide order to. Only `configureServer`
 * mounts it, so a production build, preview server or exported deck has no such endpoint.
 */
export const REORDER_ENDPOINT = '/__deck/reorder';

/**
 * The HTTP status for a reorder that was applied.
 */
const HTTP_NO_CONTENT = 204;

/**
 * The HTTP status for a request or config the reorder cannot apply.
 */
const HTTP_BAD_REQUEST = 400;

/**
 * The HTTP status for any method but `POST`.
 */
const HTTP_METHOD_NOT_ALLOWED = 405;

/**
 * The HTTP status of a request from somewhere that may not use the endpoint.
 */
const HTTP_FORBIDDEN = 403;

/**
 * The HTTP status for a body that is not JSON.
 */
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;

/**
 * The HTTP status for an unexpected failure, such as a config that cannot be written.
 */
const HTTP_SERVER_ERROR = 500;

/**
 * The largest request body the endpoint reads, in bytes; a list of slide ids is far smaller.
 */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * The media type of a reorder request; as a non-simple request it makes browsers preflight a
 * cross-origin post, which the dev server never allows.
 */
const JSON_TYPE = 'application/json';

/**
 * What the middleware needs from the plugin.
 */
export type ReorderMiddlewareOptions = {
  /**
   * The absolute workspace root.
   */
  workspaceRoot: string;

  /**
   * Finds the deck being served.
   */
  deck: () => Promise<DeckLocation>;

  /**
   * Runs the reorder effect.
   */
  run: RunEffect;

  /**
   * Why a request may not use the endpoint (where it comes from, no dev session cookie), or
   * undefined; the deck plugin passes the server's dev session check. Left out, every request may.
   */
  guard?: (request: Connect.IncomingMessage) => string | undefined;
};

/**
 * Builds the dev server middleware for {@link REORDER_ENDPOINT}: a `POST` with a JSON body `{
 * "slides": [...] }` rewrites the served deck's `slides` list. It answers 204 on success, 400 with
 * `{ "error": message }` for a request or config it cannot apply, 405 for other methods and 415 for
 * other content types.
 *
 * @param options - The workspace, the deck and the effect runner.
 */
export function reorderMiddleware(options: ReorderMiddlewareOptions): Connect.NextHandleFunction {
  return (request, response) => {
    const refused = options.guard?.(request);
    if (refused !== undefined) {
      reply(response, HTTP_FORBIDDEN, { error: refused });
      return;
    }

    if (request.method !== 'POST') {
      reply(response, HTTP_METHOD_NOT_ALLOWED, { error: 'Use POST.' });
      return;
    }

    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.startsWith(JSON_TYPE)) {
      reply(response, HTTP_UNSUPPORTED_MEDIA_TYPE, { error: `Send the body as ${JSON_TYPE}.` });
      return;
    }

    void handle(options, request, response);
  };
}

/**
 * Reads the body, applies the reorder and answers.
 *
 * @param options - The workspace, the deck and the effect runner.
 * @param request - The incoming request.
 * @param response - The response to answer on.
 */
async function handle(
  options: ReorderMiddlewareOptions,
  request: Connect.IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJson(request);
    await options.run(reorderDeck(options.workspaceRoot, await options.deck(), body));
    response.statusCode = HTTP_NO_CONTENT;
    response.end();
  } catch (error) {
    const isRequestProblem = error instanceof DeckBuildError || error instanceof SyntaxError;
    const message = error instanceof Error ? error.message : String(error);
    reply(response, isRequestProblem ? HTTP_BAD_REQUEST : HTTP_SERVER_ERROR, { error: message });
  }
}

/**
 * Reads and parses a JSON request body.
 *
 * @param request - The incoming request.
 * @throws SyntaxError when the body is not JSON or is larger than {@link MAX_BODY_BYTES}.
 */
async function readJson(request: Connect.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new SyntaxError(`The body is larger than ${MAX_BODY_BYTES} bytes.`);
    }

    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

/**
 * Answers with a status and a JSON body.
 *
 * @param response - The response.
 * @param status - The HTTP status.
 * @param body - The JSON body.
 */
function reply(response: ServerResponse, status: number, body: { error: string }): void {
  response.statusCode = status;
  response.setHeader('content-type', JSON_TYPE);
  response.end(JSON.stringify(body));
}
