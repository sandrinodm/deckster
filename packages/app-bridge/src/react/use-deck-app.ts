import { useMemo, useSyncExternalStore } from 'react';

import type { DeckAppState } from '#client/app-state.ts';
import type { ConnectOptions, DeckConnection } from '#client/connect-deck.ts';

import { connectDeck } from '#client/connect-deck.ts';

/**
 * What {@link useDeckApp} returns: the deck's state and the messages the app can send.
 */
export type DeckApp = DeckAppState &
  Pick<DeckConnection, 'ready' | 'requestSteps' | 'next' | 'prev' | 'resize' | 'error' | 'release'>;

/**
 * The connection this page shares, created on first use.
 */
let shared: DeckConnection | undefined;

/**
 * The page's one connection to the deck. A page has one parent, so every component shares it.
 *
 * @param options - Used only by the first call.
 */
function sharedConnection(options: ConnectOptions): DeckConnection {
  shared ??= connectDeck(options);
  return shared;
}

/**
 * The React hook for mini apps. It connects to the deck once per page, re-renders when the deck's
 * state changes and returns the state with the messages the app can send. Brand tokens are already
 * on the page as CSS custom properties; read `brand` for values in code.
 *
 * ```tsx
 * function App() {
 *   const { brand, active, step, ready, requestSteps } = useDeckApp();
 *   useEffect(() => {
 *     requestSteps(4);
 *     ready();
 *   }, [ready, requestSteps]);
 *   return <main style={{ color: brand?.roles['fg'] }}>Step {step}</main>;
 * }
 * ```
 *
 * @param options - The connection options of the page's first call.
 * @returns The deck's state and senders; `status` is `standalone` outside a deck.
 */
export function useDeckApp(options: ConnectOptions = {}): DeckApp {
  const connection = sharedConnection(options);
  const state = useSyncExternalStore(connection.subscribe, connection.getState);
  return useMemo(
    () => ({
      ...state,
      ready: connection.ready,
      requestSteps: connection.requestSteps,
      next: connection.next,
      prev: connection.prev,
      resize: connection.resize,
      error: connection.error,
      release: connection.release,
    }),
    [state, connection],
  );
}
