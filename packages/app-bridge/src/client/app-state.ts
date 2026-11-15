import type { BridgeBrand, ColorScheme } from '#protocol/bridge-brand.ts';
import type { DeckMessage } from '#protocol/messages.ts';

/**
 * What an app knows about the deck it runs in.
 */
export type DeckAppState = {
  /**
   * `connecting` until the deck's `init` arrives; `connected` after; `standalone` when the page is
   * not inside a deck (opened directly, for development), where the app runs with its own CSS
   * fallbacks and is always active.
   */
  status: 'connecting' | 'connected' | 'standalone';

  /**
   * The brand of the slide's surface, once connected.
   */
  brand: BridgeBrand | undefined;

  /**
   * The color scheme of the slide's surface; `light` until connected.
   */
  scheme: ColorScheme;

  /**
   * The slide the app sits on, once connected.
   */
  slide: { index: number; id: string } | undefined;

  /**
   * The slide's current step, from 0.
   */
  step: number;

  /**
   * Whether the slide is on screen. Pause timers and media when it is not.
   */
  active: boolean;

  /**
   * Whether the deck renders in static mode; apps normally never see this, because the deck shows
   * the poster instead of the frame.
   */
  static: boolean;
};

/**
 * The state before the deck has said anything.
 */
export const CONNECTING_STATE: DeckAppState = {
  /**
   * Waiting for the deck's `init`.
   */
  status: 'connecting',

  /**
   * No brand yet.
   */
  brand: undefined,

  /**
   * Light until the deck says otherwise.
   */
  scheme: 'light',

  /**
   * No slide yet.
   */
  slide: undefined,

  /**
   * Step 0.
   */
  step: 0,

  /**
   * Not running until the deck activates the app.
   */
  active: false,

  /**
   * Not static.
   */
  static: false,
};

/**
 * The state of a page that is not inside a deck.
 */
export const STANDALONE_STATE: DeckAppState = {
  ...CONNECTING_STATE,

  /**
   * Not inside a deck.
   */
  status: 'standalone',

  /**
   * Always running when opened on its own.
   */
  active: true,
};

/**
 * Applies one deck message to the app's state. Messages that change nothing return the same object,
 * so subscribers do not re-render.
 *
 * @param state - The state before.
 * @param message - A validated message from the deck.
 * @returns The state after.
 */
export function reduceDeckMessage(state: DeckAppState, message: DeckMessage): DeckAppState {
  switch (message.type) {
    case 'init':
      return {
        status: 'connected',
        brand: message.brand,
        scheme: message.scheme,
        slide: message.slide,
        step: message.step,
        active: message.active,
        static: message.static,
      };
    case 'activate':
      return state.active ? state : { ...state, active: true };
    case 'deactivate':
      return state.active ? { ...state, active: false } : state;
    case 'step':
      return state.step === message.step ? state : { ...state, step: message.step };
    case 'static':
      return state.static === message.static ? state : { ...state, static: message.static };
  }
}
