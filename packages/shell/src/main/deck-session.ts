import { randomBytes } from 'node:crypto';

/**
 * Random bytes in each in-memory session partition identifier.
 */
const PARTITION_RANDOM_BYTES = 16;

/**
 * The `sandbox` tokens of a frame from another origin than the deck server: it may run scripts,
 * keep its own origin and submit forms, as `<AppFrame>` frames do, but never open a window or the
 * user's browser (`allow-popups`), show a native dialog (`allow-modals`) or navigate the deck
 * (`allow-top-navigation`), whatever tokens the slide gave its `<iframe>`.
 */
export const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms';

/**
 * The response header that carries the sandbox.
 */
const CSP_HEADER = 'Content-Security-Policy';

/**
 * A new session partition name for one run of the shell: `deck-` and 128 random bits, with no
 * `persist:` prefix, so Electron keeps the session in memory. The run gets an empty session, and a
 * deck's service workers, storage, caches and cookies end with the run instead of running in the
 * next deck served on the same `127.0.0.1:<port>` origin.
 *
 * @param random - Sixteen random bytes as hex; `crypto.randomBytes` by default.
 */
export function freshPartition(
  random: () => string = () => randomBytes(PARTITION_RANDOM_BYTES).toString('hex'),
): string {
  return `deck-${random()}`;
}

/**
 * The part of an Electron `Session` that clears storage.
 */
export type ClearableSessionLike = {
  /**
   * Clears every kind of stored data: service workers, storage, caches, cookies.
   */
  clearStorageData: () => Promise<void>;
};

/**
 * Clears a session's stored data (cookies, storage, service workers, cache storage; not the HTTP or
 * code cache) and ignores a failure.
 *
 * @param session - The session.
 */
export async function clearSession(session: ClearableSessionLike): Promise<void> {
  await session.clearStorageData().catch(() => undefined);
}

/**
 * The part of a response `onHeadersReceived` sees.
 */
export type HeadersDetails = {
  /**
   * The response URL.
   */
  url: string;

  /**
   * The response headers, if any.
   */
  responseHeaders?: Record<string, string[]>;
};

/**
 * The response headers of a sub-frame document with the frame sandbox added, or `undefined` to keep
 * them as they are (a frame of the deck server). An existing `Content-Security-Policy` header keeps
 * its policies and gains the sandbox as one more, so the page's policy and the sandbox both apply;
 * a page cannot loosen a sandbox set by a header.
 *
 * @param details - The response.
 * @param appOrigin - The deck server's origin.
 */
export function frameSandboxHeaders(
  details: HeadersDetails,
  appOrigin: string,
): Record<string, string[]> | undefined {
  if (URL.canParse(details.url) && new URL(details.url).origin === appOrigin) {
    return undefined;
  }

  const headers = { ...details.responseHeaders };
  const name =
    Object.keys(headers).find((key) => key.toLowerCase() === CSP_HEADER.toLowerCase()) ??
    CSP_HEADER;
  headers[name] = [...(headers[name] ?? []), `sandbox ${FRAME_SANDBOX}`];
  return headers;
}

/**
 * The part of an Electron `Session` the frame sandbox listens on.
 */
export type HeadersSessionLike = {
  /**
   * Electron's `webRequest`.
   */
  webRequest: {
    /**
     * Sets the listener that may rewrite response headers.
     *
     * @param filter - Which responses the listener sees.
     * @param listener - Called with each response; `callback` sends the headers to use.
     */
    onHeadersReceived: (
      filter: { urls: string[]; types: Array<'subFrame'> },
      listener: (
        details: HeadersDetails,
        callback: (response: { responseHeaders?: Record<string, string[]> }) => void,
      ) => void,
    ) => void;
  };
};

/**
 * Sandboxes every frame document that does not come from the deck server with
 * {@link frameSandboxHeaders}, so a frame of another origin (an `<AppFrame src>`, an embed, an
 * `<iframe>` a slide wrote) never opens a window or the user's browser, whatever its `sandbox`
 * attribute says. The window-open handler refuses such frames' calls too (`isDeckOpener`).
 *
 * @param session - The run's session.
 * @param appOrigin - The deck server's origin.
 */
export function installFrameSandbox(session: HeadersSessionLike, appOrigin: string): void {
  session.webRequest.onHeadersReceived(
    { urls: ['<all_urls>'], types: ['subFrame'] },
    (details, callback) => {
      const responseHeaders = frameSandboxHeaders(details, appOrigin);
      callback(responseHeaders === undefined ? {} : { responseHeaders });
    },
  );
}
