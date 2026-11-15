import type { AppMessage, DeckPayload } from '#protocol/messages.ts';

import { acceptAppMessage } from '#protocol/message-guard.ts';
import { envelope } from '#protocol/messages.ts';

/**
 * Options for {@link createHostMessenger}.
 */
export type HostMessengerOptions = {
  /**
   * The app's frame. Its `contentWindow` is read on every message, so it can navigate.
   */
  frame: HTMLIFrameElement;

  /**
   * The origin the app is served from, such as `http://localhost:5300`. Messages from any other
   * origin are dropped, and messages to the app target only this origin.
   */
  origin: string;

  /**
   * Called with each valid message from the app.
   */
  onMessage: (message: AppMessage) => void;
};

/**
 * The deck's end of the bridge to one app.
 */
export type HostMessenger = {
  /**
   * Posts a message to the app. Does nothing while the frame has no window.
   */
  send: (payload: DeckPayload) => void;

  /**
   * Stops listening.
   */
  dispose: () => void;
};

/**
 * Connects the deck to one app frame. It listens on the deck's window, keeps only messages that
 * come from that frame's window and origin and match the protocol's shapes, and posts deck messages
 * with the app's origin as the target.
 *
 * @param options - The frame, its origin and the message handler.
 * @returns The messenger; call `dispose` when the frame goes away.
 */
export function createHostMessenger(options: HostMessengerOptions): HostMessenger {
  const { frame, origin, onMessage } = options;
  /**
   * Passes on the messages that come from the app.
   */
  const listener = (event: MessageEvent): void => {
    const message = acceptAppMessage(event, { origin, window: frame.contentWindow });
    if (message !== undefined) {
      onMessage(message);
    }
  };
  window.addEventListener('message', listener);
  return {
    send: (payload) => {
      frame.contentWindow?.postMessage(envelope(payload), origin);
    },
    dispose: () => window.removeEventListener('message', listener),
  };
}
