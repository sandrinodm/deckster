import { classifyNavigation } from '#main/navigation.ts';

/**
 * The optional query marker before mailto header fields.
 */
const QUERY_PREFIX_PATTERN = /^\?/;

/**
 * Maximum raw URL characters included in an external-open refusal note.
 */
const REPORTED_URL_CHARACTERS = 200;

/**
 * Milliseconds in one second, for the external-open rate limit note.
 */
const MS_PER_SECOND = 1000;

/**
 * How many links the shell may open in the user's browser within {@link EXTERNAL_OPEN_WINDOW_MS},
 * counted across all its windows.
 */
export const EXTERNAL_OPEN_LIMIT = 3;

/**
 * The span the external-open limit counts over, in milliseconds.
 */
export const EXTERNAL_OPEN_WINDOW_MS = 10_000;

/**
 * The longest link the shell hands to the system, in characters of its normalised form.
 */
export const MAX_EXTERNAL_URL = 2048;

/**
 * The schemes that may leave the app for the user's browser or mail client.
 */
const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * The `mailto:` header fields a link may prefill; every other field (`attach`, `cc`, `bcc`, ...) is
 * dropped, so a slide cannot make the mail client attach a local file or copy someone in.
 */
const MAIL_FIELDS = new Set(['subject', 'body']);

/**
 * The query of a `mailto:` link with only {@link MAIL_FIELDS} kept. It is split by hand: in a
 * `mailto:` URL a `+` is a plus sign, not a space (RFC 6068), and a field that does not decode is
 * dropped.
 *
 * @param search - The URL's `search`, with or without its `?`.
 */
function mailQuery(search: string): string {
  const kept: string[] = [];
  for (const part of search.replace(QUERY_PREFIX_PATTERN, '').split('&')) {
    const equals = part.indexOf('=');
    const name = (equals === -1 ? part : part.slice(0, equals)).toLowerCase();
    if (!MAIL_FIELDS.has(name)) {
      continue;
    }

    try {
      const value = decodeURIComponent(equals === -1 ? '' : part.slice(equals + 1));
      kept.push(`${name}=${encodeURIComponent(value)}`);
    } catch {
      // A malformed escape: the field is dropped.
    }
  }

  return kept.length === 0 ? '' : `?${kept.join('&')}`;
}

/**
 * The form of a link the shell hands to the system: parsed by the WHATWG URL parser (which strips
 * tabs and newlines anywhere and control characters and spaces at the ends, as browsers do), of an
 * allowed scheme, a `mailto:` cut down to its recipients, subject and body, and at most
 * {@link MAX_EXTERNAL_URL} characters. What is checked is what is opened.
 *
 * @param raw - The URL the page asked for.
 * @returns The normalised URL, or why it is refused.
 */
export function normaliseExternalUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  if (!URL.canParse(raw)) {
    return { ok: false, reason: 'it is not a URL' };
  }

  const url = new URL(raw);
  if (!EXTERNAL_SCHEMES.has(url.protocol)) {
    return { ok: false, reason: `${url.protocol} links stay closed` };
  }

  const href =
    url.protocol === 'mailto:' ? `mailto:${url.pathname}${mailQuery(url.search)}` : url.href;
  return href.length > MAX_EXTERNAL_URL
    ? { ok: false, reason: `it is longer than ${MAX_EXTERNAL_URL} characters` }
    : { ok: true, url: href };
}

/**
 * Opens links in the user's browser, at most {@link EXTERNAL_OPEN_LIMIT} within
 * {@link EXTERNAL_OPEN_WINDOW_MS} for the whole shell, so a slide script cannot open unlimited
 * tabs, not even by opening them from several windows.
 *
 * @param url - The link.
 * @returns Whether the link was handed to the system.
 */
export type ExternalOpener = (url: string) => boolean;

/**
 * What an {@link ExternalOpener} needs.
 */
export type ExternalOpenerDeps = {
  /**
   * Electron's `shell.openExternal`.
   */
  openExternal: (url: string) => Promise<void>;

  /**
   * Where a note about a dropped link goes; standard error in the shell.
   */
  report: (message: string) => void;

  /**
   * The current time in milliseconds; `Date.now` by default.
   */
  now?: () => number;
};

/**
 * Creates the rate-limited {@link ExternalOpener}; the shell makes one and shares it between its
 * windows. Only `http:`, `https:` and `mailto:` links are opened, in the form
 * {@link normaliseExternalUrl} gives; the rest, and every link over the limit, are dropped with a
 * note.
 *
 * @param deps - The system opener, the reporter and the clock.
 */
export function createExternalOpener(deps: ExternalOpenerDeps): ExternalOpener {
  const now = deps.now ?? Date.now;
  let opened: number[] = [];
  return (raw) => {
    const shown = JSON.stringify(raw.slice(0, REPORTED_URL_CHARACTERS));
    const normalised = normaliseExternalUrl(raw);
    if (!normalised.ok) {
      deps.report(`deck shell: refused to open ${shown} outside the app: ${normalised.reason}.`);
      return false;
    }

    const time = now();
    opened = opened.filter((at) => time - at < EXTERNAL_OPEN_WINDOW_MS);
    if (opened.length >= EXTERNAL_OPEN_LIMIT) {
      deps.report(
        `deck shell: dropped ${shown}: the shell opens at most ` +
          `${EXTERNAL_OPEN_LIMIT} links in ${EXTERNAL_OPEN_WINDOW_MS / MS_PER_SECOND} s.`,
      );
      return false;
    }

    opened.push(time);
    deps.openExternal(normalised.url).catch(() => undefined);
    return true;
  };
}

/**
 * What a sub-frame (a mini app's iframe, an embed) may load.
 */
export type SubFrameDecision = 'allow' | 'blocked';

/**
 * Decides a navigation inside a sub-frame. Pages of the deck server, web pages (`http:`, `https:`,
 * as `<AppFrame src="https://...">` shows) and `about:blank` / `about:srcdoc` load in the frame;
 * every other scheme (`file:`, `data:`, `javascript:`, custom protocols) is blocked. A sub-frame
 * never opens the user's browser: an external page in a frame stays a frame, gets no preload and is
 * refused by the shell's IPC, which checks the sender frame's origin.
 *
 * @param target - The URL the frame wants.
 * @param appOrigin - The deck server's origin.
 */
export function decideSubFrameNavigation(target: string, appOrigin: string): SubFrameDecision {
  if (target === 'about:blank' || target === 'about:srcdoc') {
    return 'allow';
  }

  if (!URL.canParse(target)) {
    return 'blocked';
  }

  const url = new URL(target);
  return url.origin === appOrigin || url.protocol === 'https:' || url.protocol === 'http:'
    ? 'allow'
    : 'blocked';
}

/**
 * The part of a navigation event the guards read: Electron 45 passes it as the first argument of
 * `will-navigate`, `will-frame-navigate` and `will-redirect`.
 */
export type NavigationEventLike = {
  /**
   * The URL the frame is navigating (or being redirected) to.
   */
  url: string;

  /**
   * Whether the navigation is in the main frame.
   */
  isMainFrame: boolean;

  /**
   * Stops the navigation.
   */
  preventDefault: () => void;
};

/**
 * The part of a `WebContents` the guards listen on.
 */
export type GuardedContents = {
  /**
   * Registers a listener for main-frame navigations.
   *
   * @param event - `will-navigate`.
   * @param listener - Called with the event's details.
   */
  on(event: 'will-navigate', listener: (details: NavigationEventLike) => void): unknown;

  /**
   * Registers a listener for navigations of any frame.
   *
   * @param event - `will-frame-navigate`.
   * @param listener - Called with the event's details.
   */
  on(event: 'will-frame-navigate', listener: (details: NavigationEventLike) => void): unknown;

  /**
   * Registers a listener for server redirects of any frame.
   *
   * @param event - `will-redirect`.
   * @param listener - Called with the event's details.
   */
  on(event: 'will-redirect', listener: (details: NavigationEventLike) => void): unknown;
};

/**
 * Applies the main-frame rule: the deck server stays, web and mail links go to the user's browser
 * through the rate-limited opener, everything else is stopped.
 *
 * @param details - The navigation.
 * @param appOrigin - The deck server's origin.
 * @param openExternal - The shell's rate-limited opener.
 */
function guardMainFrame(
  details: NavigationEventLike,
  appOrigin: string,
  openExternal: ExternalOpener,
): void {
  const decision = classifyNavigation(details.url, appOrigin);
  if (decision === 'internal') {
    return;
  }

  details.preventDefault();
  if (decision === 'external') {
    openExternal(details.url);
  }
}

/**
 * Applies {@link decideSubFrameNavigation}.
 *
 * @param details - The navigation.
 * @param appOrigin - The deck server's origin.
 */
function guardSubFrame(details: NavigationEventLike, appOrigin: string): void {
  if (decideSubFrameNavigation(details.url, appOrigin) === 'blocked') {
    details.preventDefault();
  }
}

/**
 * Keeps a window on the deck server. `will-navigate` (main frame) and server redirects of the main
 * frame (`will-redirect`) follow the main-frame rule, so a redirect cannot carry the window to
 * another origin; `will-frame-navigate` and sub-frame redirects follow
 * {@link decideSubFrameNavigation}. The main frame is handled once, by `will-navigate`, so no link
 * opens twice.
 *
 * @param contents - The window's web contents.
 * @param appOrigin - The deck server's origin.
 * @param openExternal - The shell's rate-limited opener.
 */
export function installNavigationGuards(
  contents: GuardedContents,
  appOrigin: string,
  openExternal: ExternalOpener,
): void {
  contents.on('will-navigate', (details) => guardMainFrame(details, appOrigin, openExternal));
  contents.on('will-frame-navigate', (details) => {
    if (!details.isMainFrame) {
      guardSubFrame(details, appOrigin);
    }
  });
  contents.on('will-redirect', (details) => {
    if (details.isMainFrame) {
      guardMainFrame(details, appOrigin, openExternal);
    } else {
      guardSubFrame(details, appOrigin);
    }
  });
}
