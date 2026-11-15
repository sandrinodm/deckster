/**
 * How long a page may take to define `window.__deck` before the shell reports `hasDeck: false`.
 */
export const DECK_APPEARS_MS = 8000;

/**
 * How long `window.__deck.ready()` may take before the shell reports `ready` anyway.
 */
export const DECK_READY_MS = 20000;

/**
 * How long one in-page wait may last. A reload or navigation drops the page's promise without
 * settling it, so each attempt is short and asked again until the deadline.
 */
const ATTEMPT_MS = 500;

/**
 * How long past its own time the shell waits for one attempt before it counts as dropped.
 */
const ATTEMPT_SLACK_MS = 150;

/**
 * How long to wait before asking again after an attempt that did not find the deck.
 */
const RETRY_MS = 50;

/**
 * How often the page checks, inside itself, for `window.__deck`.
 */
const PAGE_CHECK_MS = 16;

/**
 * The part of Electron's `WebContents` the wait uses.
 */
export type DeckContents = {
  /**
   * Runs a script in the page and resolves with its result.
   *
   * @param code - The script.
   */
  executeJavaScript: (code: string) => Promise<unknown>;

  /**
   * Whether the contents are gone.
   */
  isDestroyed: () => boolean;
};

/**
 * The times the wait uses; tests shorten them.
 */
export type WaitTimes = {
  /**
   * How long the deck may take to appear.
   */
  appearsMs: number;

  /**
   * How long `ready()` may take.
   */
  readyMs: number;

  /**
   * How long one in-page attempt lasts.
   */
  attemptMs: number;

  /**
   * The pause between attempts.
   */
  retryMs: number;
};

/**
 * The times the shell uses.
 */
const DEFAULT_TIMES: WaitTimes = {
  /**
   * The deck may take this long to appear.
   */
  appearsMs: DECK_APPEARS_MS,

  /**
   * `ready()` may take this long.
   */
  readyMs: DECK_READY_MS,

  /**
   * One in-page attempt lasts this long.
   */
  attemptMs: ATTEMPT_MS,

  /**
   * The pause between attempts.
   */
  retryMs: RETRY_MS,
};

/**
 * The script that resolves `true` as soon as the page defines `window.__deck.ready`, or `false`
 * after the given time.
 *
 * @param timeoutMs - How long the page may take.
 */
export function deckAppearsScript(timeoutMs: number): string {
  return `new Promise((resolve) => {
  const end = Date.now() + ${Math.max(0, Math.round(timeoutMs))};
  const check = () => {
    if (typeof window.__deck?.ready === 'function') {
      resolve(true);
    } else if (Date.now() >= end) {
      resolve(false);
    } else {
      setTimeout(check, ${PAGE_CHECK_MS});
    }
  };
  check();
})`;
}

/**
 * Resolves with the value after a time, or with the fallback when the time runs out first, and
 * always clears its timer.
 *
 * @param work - The promise to wait for.
 * @param ms - How long to wait.
 * @param fallback - The value when time runs out.
 */
async function within<Value, Fallback>(
  work: Promise<Value>,
  ms: number,
  fallback: Fallback,
): Promise<Value | Fallback> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<Fallback>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Waits for a pause.
 *
 * @param ms - How long.
 */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until the page publishes `window.__deck`, then until its `ready()` settles. Each wait in
 * the page is short and repeated until the deadline, so a reload or a navigation (a dependency
 * reload on a cold start) never costs more than one attempt. A script that fails to run is retried
 * the same way.
 *
 * @param contents - The audience page's contents.
 * @param times - The times to use.
 * @returns Whether `window.__deck` appeared.
 */
export async function waitForDeck(
  contents: DeckContents,
  times: WaitTimes = DEFAULT_TIMES,
): Promise<boolean> {
  const deadline = Date.now() + times.appearsMs;
  while (Date.now() < deadline && !contents.isDestroyed()) {
    const attempt = Math.min(times.attemptMs, deadline - Date.now());
    const present = await within(
      contents.executeJavaScript(deckAppearsScript(attempt)).catch(() => false),
      attempt + ATTEMPT_SLACK_MS,
      false,
    );
    if (present === true) {
      await within(
        contents.executeJavaScript('window.__deck.ready().then(() => true)').catch(() => false),
        times.readyMs,
        false,
      );
      return true;
    }

    await pause(times.retryMs);
  }

  return false;
}
