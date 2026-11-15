import type { DeckControls } from '@deckster/engine';

import { createStore, useStore } from '#state/store.ts';

/**
 * One button in the tool cluster, the small control strip that appears near the bottom-left corner
 * of the audience window when the pointer moves there or a finger taps that corner. The presenter
 * tools register sidebar, overview, presenter window, fullscreen and help; other plugins add their
 * own (comments adds its mode toggle in dev).
 */
export type ToolButton = {
  /**
   * A unique id such as `comments.mode`. Registering an id again replaces the earlier button, which
   * keeps hot reloads working.
   */
  id: string;

  /**
   * What the button does, in a few words; its accessible name and tooltip.
   */
  label: string;

  /**
   * The key that does the same, shown in the tooltip, such as `c`.
   */
  shortcut?: string;

  /**
   * The icon: one or more SVG path `d` strings drawn with a 1.75px stroke in a 24x24 box.
   */
  icon: readonly string[];

  /**
   * Where the button sits: lower first. The built-in buttons use 10 to 50; plugins default to 100.
   */
  order?: number;

  /**
   * Does the work; it gets the deck's controls.
   */
  run: (context: { deck: DeckControls }) => void;

  /**
   * A React hook that says whether the button's tool is on, shown as a pressed button. Called while
   * the cluster renders, so it may read a store.
   */
  usePressed?: () => boolean;
};

/**
 * The order of a button that names none. The built-in buttons sit before it, so every button at or
 * after it comes from a plugin.
 */
export const DEFAULT_ORDER = 100;

/**
 * Every registered button, sorted by order and then registration.
 */
const buttons = createStore<readonly ToolButton[]>([]);

/**
 * Adds a button to the tool cluster, or replaces the one with the same id.
 *
 * @param button - The button.
 * @returns A function that removes it again.
 */
export function registerToolButton(button: ToolButton): () => void {
  const others = buttons.get().filter((existing) => existing.id !== button.id);
  const next = [...others, button];
  next.sort((a, b) => (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER));
  buttons.set(next);
  return () => buttons.set(buttons.get().filter((existing) => existing !== button));
}

/**
 * The registered buttons in order.
 */
export function listToolButtons(): readonly ToolButton[] {
  return buttons.get();
}

/**
 * Reads the registered buttons in a component and re-renders when one is added or removed.
 */
export function useToolButtons(): readonly ToolButton[] {
  return useStore(buttons);
}

/**
 * Removes every button; for tests.
 */
export function clearToolButtons(): void {
  buttons.set([]);
}
