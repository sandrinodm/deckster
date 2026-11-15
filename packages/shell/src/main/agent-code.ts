/**
 * The request header that carries the one-time agent code to the dev server.
 */
export const AGENT_CODE_HEADER = 'X-Deck-Agent-Code';

/**
 * What an agent code looks like: 16 to 128 URL-safe characters.
 */
const AGENT_CODE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Whether a value is a well-formed agent code.
 *
 * @param value - The value to check.
 */
export function isAgentCode(value: unknown): value is string {
  return typeof value === 'string' && AGENT_CODE_PATTERN.test(value);
}

/**
 * The `loadURL` options that send the agent code as a request header, never in the URL.
 *
 * @param code - The one-time code.
 */
export function agentCodeLoadOptions(code: string): { extraHeaders: string } {
  return { extraHeaders: `${AGENT_CODE_HEADER}: ${code}\n` };
}

/**
 * Hands the agent code out once: the audience window's first load gets it, every later load
 * (another `open`, the presenter window) gets nothing.
 */
export type AgentCodeOnce = {
  /**
   * The `loadURL` options for the next load: the header the first time, `undefined` afterwards and
   * when there is no code.
   */
  take: () => { extraHeaders: string } | undefined;
};

/**
 * Creates an {@link AgentCodeOnce}.
 *
 * @param code - The code from the shell's configuration, if any.
 */
export function agentCodeOnce(code: string | undefined): AgentCodeOnce {
  let pending = code;
  return {
    take: () => {
      const next = pending;
      pending = undefined;
      return next === undefined ? undefined : agentCodeLoadOptions(next);
    },
  };
}

/**
 * The part of a request `onBeforeSendHeaders` sees.
 */
export type HeaderRequest = {
  /**
   * The request URL.
   */
  url: string;

  /**
   * The headers about to be sent.
   */
  requestHeaders: Record<string, string>;
};

/**
 * The part of an Electron `Session` the agent code guard uses.
 */
export type AgentCodeSessionLike = {
  /**
   * Electron's `webRequest`.
   */
  webRequest: {
    /**
     * Sets the listener that may rewrite request headers.
     *
     * @param filter - Which requests the listener sees.
     * @param listener - Called with each request; `callback` sends the headers to use.
     */
    onBeforeSendHeaders: (
      filter: { urls: string[]; types: Array<'mainFrame' | 'subFrame'> },
      listener: (
        details: HeaderRequest,
        callback: (response: { requestHeaders: Record<string, string> }) => void,
      ) => void,
    ) => void;
  };
};

/**
 * Makes sure the agent code leaves the shell exactly once. Chromium keeps a load's extra headers in
 * the navigation entry and sends them again on a reload, a redirect or a history navigation; this
 * guard lets the first request that carries the header through when it goes to the deck server, and
 * strips the header from every other request.
 *
 * @param session - The session the windows use.
 * @param appOrigin - The deck server's origin.
 */
export function installAgentCodeGuard(session: AgentCodeSessionLike, appOrigin: string): void {
  let sent = false;
  const header = AGENT_CODE_HEADER.toLowerCase();
  session.webRequest.onBeforeSendHeaders(
    { urls: ['<all_urls>'], types: ['mainFrame', 'subFrame'] },
    (details, callback) => {
      const names = Object.keys(details.requestHeaders).filter(
        (name) => name.toLowerCase() === header,
      );
      if (names.length === 0) {
        callback({ requestHeaders: details.requestHeaders });
        return;
      }

      const toDeck = URL.canParse(details.url) && new URL(details.url).origin === appOrigin;
      if (!sent && toDeck) {
        sent = true;
        callback({ requestHeaders: details.requestHeaders });
        return;
      }

      const requestHeaders = { ...details.requestHeaders };
      for (const name of names) {
        delete requestHeaders[name];
      }

      callback({ requestHeaders });
    },
  );
}
