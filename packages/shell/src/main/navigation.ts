/**
 * What to do with a URL a page tries to open.
 */
export type NavigationDecision = 'internal' | 'external' | 'blocked';

/**
 * What to do with a `window.open` call.
 */
export type WindowOpenDecision = 'presenter-popup' | 'focus-presenter' | NavigationDecision;

/**
 * The name the presenter popup is opened with, as in the presenter package.
 */
export const PRESENTER_FRAME_NAME = 'deck-presenter';

/**
 * Decides where a URL goes. Only the deck server's origin stays in the app; web and mail links go
 * to the user's browser; everything else (`file:`, `javascript:`, `data:` ...) is refused.
 *
 * @param target - The URL the page wants.
 * @param appOrigin - The deck server's origin, such as `http://127.0.0.1:5173`.
 */
export function classifyNavigation(target: string, appOrigin: string): NavigationDecision {
  if (!URL.canParse(target)) {
    return 'blocked';
  }

  const url = new URL(target);
  if (url.origin === appOrigin) {
    return 'internal';
  }

  return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:'
    ? 'external'
    : 'blocked';
}

/**
 * Decides what a `window.open` does. The presenter popup (`window.open(url, 'deck-presenter')`) on
 * the app's origin becomes the presenter window, or focuses it when it is open; every other call
 * leaves the app through {@link classifyNavigation}.
 *
 * @param target - The URL, possibly empty (`window.open('', 'deck-presenter')`).
 * @param frameName - The window name.
 * @param appOrigin - The deck server's origin.
 * @param presenterOpen - Whether the presenter window exists.
 */
export function decideWindowOpen(
  target: string,
  frameName: string,
  appOrigin: string,
  presenterOpen: boolean,
): WindowOpenDecision {
  if (frameName === PRESENTER_FRAME_NAME) {
    if (presenterOpen) {
      return 'focus-presenter';
    }

    const decision = target === '' ? 'internal' : classifyNavigation(target, appOrigin);
    return decision === 'internal' ? 'presenter-popup' : decision;
  }

  return classifyNavigation(target, appOrigin);
}

/**
 * Whether a `window.open` may proceed given the document that called it, as Electron reports it in
 * the handler's `referrer`. A call from the deck's own pages (the referrer on the deck server's
 * origin) or with no referrer at all (a link with `rel="noreferrer"`, as the kit's links have) may;
 * a call whose referrer is any other document (a frame of another origin, an opaque `null` origin,
 * `about:srcdoc`) may not, so a frame never opens a window or the user's browser. The shell also
 * removes `allow-popups` from such frames ({@link frameSandboxHeaders}), so this is the second
 * line, for the calls that still carry a referrer.
 *
 * @param referrerUrl - The handler's `referrer.url`.
 * @param appOrigin - The deck server's origin.
 */
export function isDeckOpener(referrerUrl: string, appOrigin: string): boolean {
  if (referrerUrl === '') {
    return true;
  }

  return URL.canParse(referrerUrl) && new URL(referrerUrl).origin === appOrigin;
}

/**
 * The presenter window's URL for an audience page: the same page with `?presenter`, keeping the
 * position in the hash.
 *
 * @param audienceUrl - The audience window's current URL.
 */
export function presenterUrlFor(audienceUrl: string): string {
  const url = new URL(audienceUrl);
  return `${url.origin}${url.pathname}?presenter${url.hash}`;
}

/**
 * The presenter window's URL once the audience window shows a page of the deck server, or
 * `undefined` before its first page has committed (`getURL()` is then empty) or when it shows
 * anything else.
 *
 * @param audienceUrl - The audience window's current URL, possibly empty.
 * @param appOrigin - The deck server's origin.
 */
export function presenterUrlOnDeck(audienceUrl: string, appOrigin: string): string | undefined {
  return URL.canParse(audienceUrl) && new URL(audienceUrl).origin === appOrigin
    ? presenterUrlFor(audienceUrl)
    : undefined;
}
