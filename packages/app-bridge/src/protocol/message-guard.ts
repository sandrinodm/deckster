import {
  isAppMessage,
  isDeckMessage,
  type AppMessage,
  type DeckMessage,
} from '#protocol/messages.ts';

/**
 * What a `message` event gives the guard.
 */
export type IncomingMessage = {
  /**
   * The origin of the sender, from the event.
   */
  origin: string;

  /**
   * The window that sent it, from the event.
   */
  source: unknown;

  /**
   * The payload, from the event. Anything can arrive here.
   */
  data: unknown;
};

/**
 * Who a receiver accepts messages from.
 */
export type Sender = {
  /**
   * The only origin accepted, such as `https://example.com`.
   */
  origin: string;

  /**
   * The only window accepted: the app's frame, or the deck's window.
   */
  window: unknown;
};

/**
 * Checks that a message came from the expected window and origin.
 *
 * @param event - The incoming event.
 * @param sender - The sender the receiver expects.
 */
function isFrom(event: IncomingMessage, sender: Sender): boolean {
  return event.source === sender.window && event.origin === sender.origin;
}

/**
 * Accepts a message an app sent to the deck: from the app's window and origin, on this channel and
 * protocol version, and matching one of the app's message shapes. Everything else is dropped
 * without a trace, since any page can post to a window.
 *
 * @param event - The incoming event.
 * @param sender - The app's frame window and origin.
 * @returns The message, or `undefined` when it is not a valid message from the app.
 */
export function acceptAppMessage(event: IncomingMessage, sender: Sender): AppMessage | undefined {
  return isFrom(event, sender) && isAppMessage(event.data) ? event.data : undefined;
}

/**
 * Accepts a message the deck sent to an app: from the deck's window and origin, on this channel and
 * protocol version, and matching one of the deck's message shapes.
 *
 * @param event - The incoming event.
 * @param sender - The deck's window and origin.
 * @returns The message, or `undefined` when it is not a valid message from the deck.
 */
export function acceptDeckMessage(event: IncomingMessage, sender: Sender): DeckMessage | undefined {
  return isFrom(event, sender) && isDeckMessage(event.data) ? event.data : undefined;
}
