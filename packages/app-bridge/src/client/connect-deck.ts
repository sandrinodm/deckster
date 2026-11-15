import type { DeckAppState } from '#client/app-state.ts';
import type { AppPayload } from '#protocol/messages.ts';

import { CONNECTING_STATE, reduceDeckMessage, STANDALONE_STATE } from '#client/app-state.ts';
import { applyTheme } from '#client/apply-theme.ts';
import { acceptDeckMessage } from '#protocol/message-guard.ts';
import { envelope } from '#protocol/messages.ts';

/**
 * The longest error message sent to the deck, in characters; a stack trace beyond it is cut.
 */
export const MAX_ERROR_LENGTH = 500;

/**
 * The text sent to the deck when an error has no message to show.
 */
const NO_MESSAGE_TEXT = 'The app failed without a message.';

/**
 * Options for {@link connectDeck}.
 */
export type ConnectOptions = {
  /**
   * The deck page's origin, which messages must come from and are posted to. Defaults to the origin
   * of `document.referrer`, else this page's own origin. An app served from another origin than the
   * deck must set it.
   */
  hostOrigin?: string;

  /**
   * Send `release` when the user presses Escape, so the deck takes the keyboard back. Defaults to
   * `true`.
   */
  escapeReleases?: boolean;

  /**
   * Set the brand's custom properties, color scheme and font faces on the page. Defaults to `true`.
   */
  applyTheme?: boolean;

  /**
   * Report uncaught errors and unhandled promise rejections to the deck as `error`, so it shows its
   * fallback (the recorded video or the poster) instead of a frozen app. Defaults to `true`.
   */
  reportErrors?: boolean;
};

/**
 * The app's end of the bridge: the deck's state and the messages an app can send.
 */
export type DeckConnection = {
  /**
   * The latest state; the same object until something changes.
   */
  getState: () => DeckAppState;

  /**
   * Calls `listener` after every state change; returns the function that stops it.
   */
  subscribe: (listener: () => void) => () => void;

  /**
   * Tells the deck the first complete frame is drawn, so it can release the slide's `ready()`.
   */
  ready: () => void;

  /**
   * Asks the deck to give the slide `count` steps (0 to 64) that the app drives; `step` messages
   * and `getState().step` then count 0 to `count`.
   */
  requestSteps: (count: number) => void;

  /**
   * Goes to the deck's next step or slide.
   */
  next: () => void;

  /**
   * Goes to the deck's previous step or slide.
   */
  prev: () => void;

  /**
   * Tells the deck the size the app would like, in CSS pixels.
   */
  resize: (size: { width?: number; height?: number }) => void;

  /**
   * Reports a failure; the deck shows its fallback and the poster.
   *
   * @param message - What went wrong, as a sentence.
   */
  error: (message: string) => void;

  /**
   * Gives the keyboard back to the deck.
   */
  release: () => void;

  /**
   * Removes every listener the connection added.
   */
  dispose: () => void;
};

/**
 * Connects an app to the deck that embeds it. It listens for the deck's messages (from the parent
 * window and the host origin only, validated against the protocol), applies the brand to the page,
 * keeps the state and says `hello` so the deck replies with `init`. Uncaught errors and unhandled
 * rejections are reported to the deck as `error`, so it can fall back. Outside a deck (the page is
 * its own top window) it stays `standalone` and sends nothing, so an app can be developed on its
 * own.
 *
 * ```ts
 * const deck = connectDeck();
 * deck.subscribe(() => render(deck.getState()));
 * deck.requestSteps(5);
 * deck.ready();
 * ```
 *
 * @param options - The host origin and what to do automatically.
 * @returns The connection; call `dispose` to detach.
 */
export function connectDeck(options: ConnectOptions = {}): DeckConnection {
  const embedded = window.parent !== window;
  let state: DeckAppState = embedded ? CONNECTING_STATE : STANDALONE_STATE;
  const listeners = new Set<() => void>();
  const hostOrigin = options.hostOrigin ?? referrerOrigin() ?? window.location.origin;
  /**
   * Posts a message to the deck; nothing happens outside a deck.
   */
  const post = (payload: AppPayload): void => {
    if (embedded) {
      window.parent.postMessage(envelope(payload), hostOrigin);
    }
  };
  /**
   * Validates a message from the deck and applies it to the state.
   */
  const onMessage = (event: MessageEvent): void => {
    const message = acceptDeckMessage(event, { origin: hostOrigin, window: window.parent });
    if (message === undefined) {
      return;
    }

    if (message.type === 'init' && options.applyTheme !== false) {
      applyTheme(document.documentElement, message);
    }

    const next = reduceDeckMessage(state, message);
    if (next !== state) {
      state = next;
      listeners.forEach((listener) => listener());
    }
  };
  /**
   * Gives the keyboard back to the deck on Escape.
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      post({ type: 'release' });
    }
  };
  /**
   * Tells the deck the page gained focus.
   */
  const onFocus = (): void => post({ type: 'focus', focused: true });
  /**
   * Tells the deck the page lost focus.
   */
  const onBlur = (): void => post({ type: 'focus', focused: false });
  /**
   * Reports an uncaught error to the deck.
   */
  const onError = (event: ErrorEvent): void => {
    post({ type: 'error', message: errorText(event.error ?? event.message) });
  };
  /**
   * Reports a promise rejection nothing handled.
   */
  const onRejection = (event: PromiseRejectionEvent): void => {
    post({ type: 'error', message: errorText(event.reason) });
  };
  window.addEventListener('message', onMessage);
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  if (options.escapeReleases !== false) {
    window.addEventListener('keydown', onKeyDown);
  }

  if (options.reportErrors !== false) {
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
  }

  post({ type: 'hello' });
  if (document.hasFocus()) {
    onFocus();
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ready: () => post({ type: 'ready' }),
    requestSteps: (count) => post({ type: 'requestSteps', count }),
    next: () => post({ type: 'next' }),
    prev: () => post({ type: 'prev' }),
    resize: (size) => post({ type: 'resize', ...size }),
    error: (message) => post({ type: 'error', message: errorText(message) }),
    release: () => post({ type: 'release' }),
    dispose: () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      listeners.clear();
    },
  };
}

/**
 * The text of an error for the deck: an `Error`'s name and message, or the value as a string,
 * trimmed and cut to {@link MAX_ERROR_LENGTH} characters. Blank text becomes a fixed sentence, so
 * the deck always has something to show.
 *
 * @param error - Whatever was thrown or rejected, or a message.
 * @returns The text to send.
 */
export function errorText(error: unknown): string {
  const text = (error instanceof Error ? describeError(error) : String(error)).trim();
  if (text === '') {
    return NO_MESSAGE_TEXT;
  }

  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH - 1)}…` : text;
}

/**
 * The origin of the page that embeds this one, from `document.referrer`.
 */
function referrerOrigin(): string | undefined {
  if (document.referrer === '') {
    return undefined;
  }

  try {
    return new URL(document.referrer).origin;
  } catch {
    return undefined;
  }
}

/**
 * An `Error` as text: its message, prefixed by its name unless the name is the plain `Error`.
 *
 * @param error - The error to describe.
 */
function describeError(error: Error): string {
  const prefix = error.name === 'Error' ? '' : `${error.name}: `;
  return `${prefix}${error.message}`;
}
