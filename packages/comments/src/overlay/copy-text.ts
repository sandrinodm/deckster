import { showToast } from '#overlay/comments-state.ts';

/**
 * Puts text on the clipboard and says so, or says why it could not: the clipboard API needs a
 * focused page on `localhost` or HTTPS.
 *
 * @param text - The text.
 * @param done - The confirmation shown, such as `Copied for agent`.
 */
export async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(done);
  } catch {
    showToast('The browser refused the clipboard; click the page and try again.');
  }
}
