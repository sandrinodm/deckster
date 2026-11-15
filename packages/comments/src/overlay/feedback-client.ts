import type { FeedbackRequest } from '#node/comment-request.ts';

import { FEEDBACK_ENDPOINT, SCREENSHOT_PATH, type FeedbackAnswer } from '#model/feedback-api.ts';
import { commentsState, showToast, updateComments } from '#overlay/comments-state.ts';

/**
 * How long after adding a comment the overlay loads the comments again, in milliseconds, to pick up
 * the screenshot the dev server takes in the background.
 */
const SCREENSHOT_RELOAD_MS = 6000;

/**
 * The localStorage key of the name the reviewer signs comments with.
 */
const AUTHOR_KEY = 'deck-comments:author';

/**
 * Loads every comment of the deck from the dev server into the overlay's state. A failure is shown
 * in the panel instead of thrown, so a dev server without the endpoint (a preview) leaves the deck
 * working.
 */
export async function loadComments(): Promise<void> {
  try {
    const response = await fetch(FEEDBACK_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) {
      updateComments({ problem: `Could not load comments: ${await readError(response)}` });
      return;
    }

    const answer: FeedbackAnswer = await response.json();
    updateComments({ answer, problem: undefined });
  } catch {
    updateComments({ problem: 'Could not load comments: the dev server did not answer.' });
  }
}

/**
 * Sends a change to the dev server, then reloads the comments.
 *
 * @param request - The change; a comment or resolution is signed with the reviewer's saved name.
 * @returns `true` when the server applied it; otherwise the problem is in the state.
 */
export async function sendFeedback(request: FeedbackRequest): Promise<boolean> {
  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(signed(request)),
    });
    if (!response.ok) {
      updateComments({ problem: `Could not save: ${await readError(response)}` });
      return false;
    }

    await loadComments();
    if ((await readChanged(response)) === false) {
      showToast(request.action === 'reopen' ? 'Already open' : 'Already resolved');
    }

    if (request.action === 'add') {
      window.setTimeout(() => void loadComments(), SCREENSHOT_RELOAD_MS);
    }

    return true;
  } catch {
    updateComments({ problem: 'Could not save: the dev server did not answer.' });
    return false;
  }
}

/**
 * The URL of a comment's screenshot, changing when the comment does so the browser reloads it.
 *
 * @param id - The comment id.
 * @param version - The comment's `updatedAt`.
 */
export function screenshotUrl(id: string, version: string): string {
  const query = `id=${encodeURIComponent(id)}&v=${encodeURIComponent(version)}`;
  return `${FEEDBACK_ENDPOINT}${SCREENSHOT_PATH}?${query}`;
}

/**
 * The name the reviewer saved in the panel, or `undefined` to let the server use `DECK_AUTHOR` or
 * git's `user.name`.
 */
export function savedAuthor(): string | undefined {
  try {
    const name = window.localStorage.getItem(AUTHOR_KEY)?.trim();
    return name === undefined || name === '' ? undefined : name;
  } catch {
    return undefined;
  }
}

/**
 * Saves the name the reviewer signs with; an empty name goes back to the server's.
 *
 * @param name - The name.
 */
export function saveAuthor(name: string): void {
  try {
    if (name.trim() === '') {
      window.localStorage.removeItem(AUTHOR_KEY);
    } else {
      window.localStorage.setItem(AUTHOR_KEY, name.trim());
    }
  } catch {
    // Storage can be blocked; comments are then signed with the server's name.
  }

  updateComments({ answer: commentsState().answer });
}

/**
 * The request with the reviewer's saved name, when there is one.
 *
 * @param request - The request.
 */
function signed(request: FeedbackRequest): FeedbackRequest {
  const author = savedAuthor();
  if (author === undefined) {
    return request;
  }

  if (request.action === 'add') {
    return { ...request, comment: { ...request.comment, author } };
  }

  return request.action === 'resolve' ? { ...request, author } : request;
}

/**
 * The `error` field of a failed answer, else its status line.
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

/**
 * The `changed` field of a successful answer: `false` when the comment was already in the state
 * asked for.
 *
 * @param response - The successful response.
 */
async function readChanged(response: Response): Promise<boolean | undefined> {
  try {
    const body: unknown = await response.json();
    const changed: unknown =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'changed') : undefined;
    return typeof changed === 'boolean' ? changed : undefined;
  } catch {
    return undefined;
  }
}
