import { createContext, useContext } from 'react';

import type { DeckManifest } from '#contract/manifest.ts';
import type { DeckRuntime } from '#plugins/compose-plugins.ts';
import type { ReadinessRegistry } from '#readiness/readiness-registry.ts';

/**
 * What every slide needs to render, wherever it renders (the deck's stage, a sidebar thumbnail, a
 * presenter pane). It changes only when the deck or its plugins change, so a `SlideView` does not
 * re-render when the deck moves.
 */
export type DeckRuntimeValue = {
  /**
   * The deck being shown.
   */
  manifest: DeckManifest;

  /**
   * The merged layouts, components, chrome, overlays and key handlers of every plugin.
   */
  runtime: DeckRuntime;

  /**
   * Whether the deck runs in static mode.
   */
  isStatic: boolean;

  /**
   * The holds on each slide's readiness, which `window.__deck.ready()` waits for.
   */
  readiness: ReadinessRegistry;

  /**
   * Records a slide's step count with the deck, from any mounted copy of the slide, and whether it
   * is final (the slide has settled and nothing holds its readiness).
   */
  reportStepCount: (slide: number, count: number, final: boolean) => void;
};

/**
 * The deck runtime; provided by `<Deck>`.
 */
export const DeckRuntimeContext = createContext<DeckRuntimeValue | undefined>(undefined);

/**
 * Reads the deck runtime.
 *
 * @param caller - The component or hook name, used in the error message.
 * @throws Error naming the fix when called outside `<Deck>`.
 */
export function useDeckRuntime(caller: string): DeckRuntimeValue {
  const deck = useContext(DeckRuntimeContext);
  if (deck === undefined) {
    throw new Error(
      `${caller} was used outside <Deck>. ` +
        "Render it inside a deck, as a plugin's chrome or overlay.",
    );
  }

  return deck;
}
