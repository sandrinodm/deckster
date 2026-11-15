import type { ShortcutWindow } from '#shortcuts/shortcut-registry.ts';

import { deckShell } from '#shell/deck-shell.ts';

/**
 * The query parameter that turns a deck page into the presenter window.
 */
const PRESENTER_PARAM = 'presenter';

/**
 * The name of the presenter window, so `p` focuses the open one instead of opening a second.
 */
const PRESENTER_WINDOW_NAME = 'deck-presenter';

/**
 * The features of the presenter popup.
 */
const PRESENTER_WINDOW_FEATURES = 'popup,width=1360,height=860';

/**
 * Which window this page is: the presenter window when the URL has `?presenter`, else the audience
 * window.
 *
 * @param search - `location.search`; defaults to the page's.
 */
export function windowKind(search: string = window.location.search): ShortcutWindow {
  return new URLSearchParams(search).has(PRESENTER_PARAM) ? 'presenter' : 'audience';
}

/**
 * The URL of the presenter window for the page's current position, relative to the page.
 *
 * @param location - The page's location; defaults to `window.location`.
 */
export function presenterUrl(
  location: Pick<Location, 'pathname' | 'hash'> = window.location,
): string {
  return `${location.pathname}?${PRESENTER_PARAM}${location.hash}`;
}

/**
 * Opens the presenter window, or focuses it when it is open already. Inside the desktop shell
 * (`deck present`) the shell opens it, on the display other than this window's when there is one.
 */
export function openPresenterWindow(): void {
  const shell = deckShell();
  if (shell !== undefined) {
    shell.openPresenter().catch(() => undefined);
    return;
  }

  const popup = window.open(presenterUrl(), PRESENTER_WINDOW_NAME, PRESENTER_WINDOW_FEATURES);
  popup?.focus();
}
