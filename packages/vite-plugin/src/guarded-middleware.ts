import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * A connect middleware that may reject.
 */
export type AsyncMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => Promise<void>;

/**
 * Wraps an async middleware so a rejection becomes `next(error)`, which connect answers with a 500,
 * instead of an unhandled rejection that ends the dev server's process. Node 24 exits on those, so
 * every async middleware of this package goes through here.
 *
 * @param handler - The middleware.
 */
export function guarded(handler: AsyncMiddleware): AsyncMiddleware {
  return async (request, response, next) => {
    try {
      await handler(request, response, next);
    } catch (error) {
      next(error);
    }
  };
}
