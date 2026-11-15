import type { DeckControls } from '@deckster/engine';

import { setBlackout, uiState } from '#ui/ui-state.ts';

/**
 * A one-step move.
 */
export type NavigationMove = 'next' | 'prev';

/**
 * Keys that move one step forward: what keyboards and presentation clickers send.
 */
const FORWARD_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ']);

/**
 * Keys that move one step back.
 */
const BACKWARD_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);

/**
 * Elements a key press types into.
 */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * The one-step move a key press asks for: Space, Shift+Space, the arrows and PageUp/PageDown.
 * Presses with Ctrl, Alt or Meta, presses typed into a text field and presses while a modal panel
 * (help, the go-to prompt, the overview) is open ask for none, so those panels and fields keep
 * their keys.
 *
 * @param event - The key press.
 */
export function navigationMove(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey' | 'target'>,
): NavigationMove | undefined {
  const state = uiState.get();
  const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
  const isModal = state.helpOpen || state.overviewOpen || state.gotoBuffer !== undefined;
  if (hasModifier || isModal || isEditable(event.target)) {
    return undefined;
  }

  if (event.key === ' ' && event.shiftKey) {
    return 'prev';
  }

  if (FORWARD_KEYS.has(event.key)) {
    return 'next';
  }

  return BACKWARD_KEYS.has(event.key) ? 'prev' : undefined;
}

/**
 * Applies a one-step move. While the audience screen is blacked or whited out the move uncovers it
 * instead, so a clicker can always bring the slide back and the deck never moves unseen.
 *
 * @param move - The move.
 * @param deck - The deck's controls.
 */
export function runNavigation(move: NavigationMove, deck: DeckControls): void {
  if (uiState.get().blackout !== undefined) {
    setBlackout(undefined);
    return;
  }

  if (move === 'next') {
    deck.next();
  } else {
    deck.prev();
  }
}

/**
 * Whether a key press goes into a text field.
 *
 * @param target - The event target.
 */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable;
}
