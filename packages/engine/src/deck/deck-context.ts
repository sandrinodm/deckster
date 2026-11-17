import { createContext, useContext } from 'react';

import type { DeckManifest } from '#contract/manifest.ts';
import type { SlideSummary } from '#deck/slide-summary.ts';
import type { Position } from '#navigation/navigation.ts';

/**
 * The moves that change the slide or step on screen. The deck's controls send them through a morph
 * where one applies, and `window.__deck` sends them at once.
 */
export type MoveActions = Pick<DeckControls, 'next' | 'prev' | 'first' | 'last' | 'goto'>;

/**
 * The deck's state and controls, for chrome, overlays and plugins. A move between two neighbouring
 * slides that share a morph applies one frame later, when the morph's view transition starts; every
 * other move applies with the next render.
 */
export type DeckControls = {
  /**
   * The deck being shown.
   */
  manifest: DeckManifest;

  /**
   * The slide and step on screen.
   */
  position: Position;

  /**
   * Step count of the slide on screen, once it has registered its steps.
   */
  stepCount: number | undefined;

  /**
   * Every slide with its title, notes and step count (once known).
   */
  slides: readonly SlideSummary[];

  /**
   * Whether the deck runs in static mode.
   */
  isStatic: boolean;

  /**
   * Shows the next step, or the next slide after the last step; does nothing at the end.
   */
  next: () => void;

  /**
   * Shows the previous step, or the previous slide at its last step; does nothing at the start.
   */
  prev: () => void;

  /**
   * Shows the first slide at step 0.
   */
  first: () => void;

  /**
   * Shows the last slide at step 0.
   */
  last: () => void;

  /**
   * Moves to a slide by zero-based index or id, at `step` (default 0, clamped to the slide's steps
   * once known).
   *
   * @throws RangeError when the slide does not exist.
   */
  goto: (slide: number | string, step?: number) => void;
};

/**
 * The deck's controls; provided by `<Deck>`.
 */
export const DeckContext = createContext<DeckControls | undefined>(undefined);

/**
 * Reads the deck's state and controls. Chrome (page numbers, progress), overlays (sidebar,
 * presenter tools) and plugins build on this.
 *
 * @throws Error when called outside `<Deck>`.
 */
export function useDeck(): DeckControls {
  const deck = useContext(DeckContext);
  if (deck === undefined) {
    throw new Error('useDeck() was used outside <Deck>. Render the component inside a deck.');
  }

  return deck;
}
