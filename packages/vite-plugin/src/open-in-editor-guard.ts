import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The path Vite's dev server mounts its launch-editor middleware at, which opens any existing file
 * in the person's editor for any request that names it.
 */
export const OPEN_IN_EDITOR_ENDPOINT = '/__open-in-editor';

/**
 * The HTTP status of a path the deck server does not serve.
 */
const HTTP_NOT_FOUND = 404;

/**
 * A connect middleware that answers 404 to Vite's `/__open-in-editor`, mounted before Vite's own so
 * its middleware never runs. The dev session cookie is scoped to `/__deck` and cannot reach this
 * path, and the only other signal (`Sec-Fetch-Site: same-origin`) is also what a fetch from slide
 * code carries, so the endpoint is switched off: slide code cannot make the person's editor open a
 * file. The error overlay's click-to-open link stops working.
 *
 * @param _request - The request.
 * @param response - The response.
 */
export function refuseOpenInEditor(_request: IncomingMessage, response: ServerResponse): void {
  response.statusCode = HTTP_NOT_FOUND;
  response.setHeader('content-type', 'text/plain; charset=utf-8');
  response.end('Not found.');
}
