/**
 * The dev-server endpoint that rewrites the deck's `slides` list; `@deckster/vite-plugin` mounts it
 * only while serving, never in a build.
 */
const REORDER_URL = '/__deck/reorder';

/**
 * Asks the dev server to save a new slide order in `deck.config.ts`. The server watches the file
 * and reloads the page on success.
 *
 * @param ids - Every slide id, in the new order.
 * @returns A message saying why the order was not saved, or `undefined` when it was.
 */
export async function postReorder(ids: readonly string[]): Promise<string | undefined> {
  try {
    const response = await fetch(REORDER_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slides: ids }),
    });
    if (response.ok) {
      return undefined;
    }

    return `Could not reorder: ${await readError(response)}`;
  } catch {
    return 'Could not reorder: the dev server did not answer.';
  }
}

/**
 * The `error` field of a failed reorder response, else its status line.
 *
 * @param response - The failed response.
 */
async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const error: unknown =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
    return typeof error === 'string' ? error : response.statusText;
  } catch {
    return response.statusText;
  }
}
