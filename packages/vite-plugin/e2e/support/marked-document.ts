import type { Browser } from '@e2e-dev/web';

/**
 * The window property that marks a document.
 */
const DOCUMENT_MARK = '__e2eDocumentMark';

/**
 * Marks the page's current document, so {@link isMarkedDocument} can tell later whether the page
 * loaded again in between. A change of the URL's hash keeps the document, and the mark.
 *
 * @param browser - The page.
 */
export async function markDocument(browser: Browser): Promise<void> {
  await browser.evaluate((key: string) => {
    Reflect.set(window, key, true);
    return null;
  }, DOCUMENT_MARK);
}

/**
 * Whether the page still shows the document {@link markDocument} marked: `false` once it has
 * reloaded or navigated to another page, or when nothing was marked.
 *
 * @param browser - The page.
 */
export function isMarkedDocument(browser: Browser): Promise<boolean> {
  return browser.evaluate((key: string) => Reflect.get(window, key) === true, DOCUMENT_MARK);
}
