/**
 * A URL scheme such as `https:` or `mailto:`, which marks a link as pointing outside the deck.
 */
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/**
 * A web URL: `http:`, `https:` or protocol-relative.
 */
const WEB_URL_PATTERN = /^(?:https?:)?\/\//i;

/**
 * The `mailto:` scheme, which a readable address leaves out.
 */
const MAILTO_PATTERN = /^mailto:/i;

/**
 * The scheme and the slashes after it, plus `www.`, which a readable link leaves out.
 */
const READABLE_PREFIX_PATTERN = /^(?:[a-z][a-z0-9+.-]*:)?\/\/(?:www\.)?/i;

/**
 * Trailing slashes on a URL.
 */
const TRAILING_SLASHES_PATTERN = /\/+$/;

/**
 * The schemes a slide may link to: the web, mail and phone. Anything else with a scheme, such as
 * `javascript:` or `data:`, is refused.
 */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * The attributes a link to `href` needs.
 */
export type LinkAttributes = {
  /**
   * The destination.
   */
  href: string;

  /**
   * `_blank` for a link that leaves the deck, so the deck stays open; absent for `#` and relative
   * links.
   */
  target?: '_blank';

  /**
   * Stops a new tab from reaching back into the deck's window; present with `target`.
   */
  rel?: 'noopener noreferrer';
};

/**
 * Whether a link leaves the deck: it has a scheme (`https:`, `mailto:`) or is protocol-relative.
 *
 * @param href - The link destination.
 */
export function isExternalLink(href: string): boolean {
  return SCHEME_PATTERN.test(href) || href.startsWith('//');
}

/**
 * The anchor attributes for a destination: external links open in a new tab.
 *
 * @param href - The link destination.
 */
export function linkAttributes(href: string): LinkAttributes {
  if (!isExternalLink(href)) {
    return { href };
  }

  return { href, target: '_blank', rel: 'noopener noreferrer' };
}

/**
 * A URL as people say it aloud: no scheme, no `www.`, no trailing slash. A destination that is not
 * an absolute URL (`mailto:`, a hash) is returned as written.
 *
 * @param href - The link destination.
 */
export function displayUrl(href: string): string {
  if (!WEB_URL_PATTERN.test(href)) {
    return href.replace(MAILTO_PATTERN, '');
  }

  return href.replace(READABLE_PREFIX_PATTERN, '').replace(TRAILING_SLASHES_PATTERN, '');
}

/**
 * The base relative destinations are resolved against to see where they go: an origin no deck is
 * served from, so a destination that resolves to another origin leaves the deck.
 */
const PLACEHOLDER_BASE = 'https://deck.invalid/';

/**
 * ASCII tab, line feed and carriage return, which a browser removes anywhere in a URL before
 * parsing it.
 */
const URL_STRIPPED_PATTERN = /[\t\n\r]/g;

/**
 * C0 control characters and spaces at either end of a URL, which a browser trims before parsing it.
 */
// eslint-disable-next-line no-control-regex
const URL_TRIMMED_PATTERN = /^[\u0000-\u0020]+|[\u0000-\u0020]+$/g;

/**
 * A control character left inside a destination after trimming, which no link a person writes
 * holds.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;

/**
 * A destination that starts with a host instead of a path (`//host`, or `\\host` and `/\host`,
 * which browsers read the same way for web URLs).
 */
const NETWORK_PATH_PATTERN = /^[/\\]{2}/;

/**
 * A prefix that makes a download destination absolute, a fragment or a query.
 */
const NON_RELATIVE_DOWNLOAD_PATTERN = /^[/\\#?]/;

/**
 * A destination as a browser reads it, or `undefined` when a slide may not link to it. The value is
 * normalised the way a browser normalises `href` before parsing (tab, line feed and carriage return
 * removed anywhere, C0 controls and spaces trimmed from both ends), then parsed with `URL`, so the
 * scheme that is checked is the one a click would follow. Allowed: `http:`, `https:`, `mailto:` and
 * `tel:` URLs, paths and `#` fragments. A protocol-relative destination (`//host/x`, or `\\host`)
 * becomes an explicit `https:` URL, so a deck opened from `file://` does not turn it into a file
 * link. Every other scheme (`javascript:`, `vbscript:`, `data:`, `blob:`, `file:`) and any value
 * with a control character inside is refused: a link on a slide runs in the deck's page.
 *
 * @param href - The destination as written.
 * @returns What to render in `href`.
 */
export function safeHref(href: string): string | undefined {
  const normalized = href.replace(URL_STRIPPED_PATTERN, '').replace(URL_TRIMMED_PATTERN, '');
  if (normalized === '' || CONTROL_PATTERN.test(normalized)) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(normalized, PLACEHOLDER_BASE);
  } catch {
    return undefined;
  }

  if (!SAFE_SCHEMES.has(url.protocol)) {
    return undefined;
  }

  return NETWORK_PATH_PATTERN.test(normalized) ? url.href : normalized;
}

/**
 * Whether a destination is safe to put in a slide's link (see {@link safeHref}, which also gives the
 * value to render).
 *
 * @param href - The link destination.
 */
export function isSafeHref(href: string): boolean {
  return safeHref(href) !== undefined;
}

/**
 * A download's file as a browser reads it, or `undefined` unless it is safe (see {@link safeHref})
 * and a relative path: no scheme, no host and no leading slash, so it names a file beside the built
 * deck wherever the deck is hosted.
 *
 * @param file - The file as written.
 * @returns What to render in `href`.
 */
export function safeDownloadPath(file: string): string | undefined {
  const href = safeHref(file);
  if (href === undefined || SCHEME_PATTERN.test(href) || NON_RELATIVE_DOWNLOAD_PATTERN.test(href)) {
    return undefined;
  }

  return href;
}

/**
 * The destination of a link component as a browser reads it (see {@link safeHref}), refused with the
 * fix when its scheme is not safe.
 *
 * @param component - The component, for the message, such as `Button`.
 * @param href - The link destination.
 * @throws Error naming the component, the destination and the schemes it may use.
 */
export function assertSafeHref(component: string, href: string): string {
  const safe = safeHref(href);
  if (safe === undefined) {
    throw new Error(
      `<${component} href=${JSON.stringify(href)}> is refused: a slide may link only to http:, ` +
        'https:, mailto: or tel: URLs, paths and #fragments.',
    );
  }

  return safe;
}
