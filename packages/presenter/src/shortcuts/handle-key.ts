import type { DeckControls } from '@deckster/engine';

import { stepGoto } from '#goto/goto-buffer.ts';
import { moveOverviewSelection } from '#overview/overview-keys.ts';
import { dispatchShortcut } from '#shortcuts/shortcut-registry.ts';
import { closeTopOverlay, setBlackout, uiState, updateUi } from '#ui/ui-state.ts';
import { windowKind } from '#ui/window-kind.ts';

/**
 * Keys that move the deck. They do nothing while a modal panel (help, the overview) is open, so the
 * slide never moves behind it, and while the screen is covered the first one uncovers it.
 */
const NAVIGATION_KEYS = new Set([
  ' ',
  'PageDown',
  'PageUp',
  'ArrowRight',
  'ArrowLeft',
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
]);

/**
 * The deck plugin's key handler. The go-to prompt and the overview take the keys first, because
 * they are modal; every other key goes to the shortcut registry. Navigation keys left over are
 * consumed while help or the overview is open, and uncover a blacked-out screen instead of moving
 * the deck unseen.
 *
 * @param event - The key press.
 * @param deck - The deck's controls.
 * @returns `true` when the key press was handled and the engine must not navigate.
 */
export function handleKey(event: KeyboardEvent, deck: DeckControls): boolean {
  if (deck.isStatic) {
    return false;
  }

  const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
  const state = uiState.get();
  if (!hasModifier && state.gotoBuffer !== undefined) {
    return handleGotoKey(event.key, state.gotoBuffer, deck);
  }

  if (!hasModifier && state.overviewOpen && handleOverviewKey(event.key, deck)) {
    return true;
  }

  if (dispatchShortcut({ event, deck }, windowKind())) {
    return true;
  }

  if (hasModifier || !NAVIGATION_KEYS.has(event.key)) {
    return false;
  }

  if (state.helpOpen || state.overviewOpen || state.displaysOpen) {
    return true;
  }

  if (state.blackout !== undefined) {
    setBlackout(undefined);
    return true;
  }

  return false;
}

/**
 * Applies a key to the open go-to prompt. Every key is consumed while it is open.
 *
 * @param key - The `KeyboardEvent.key`.
 * @param buffer - The digits typed so far.
 * @param deck - The deck's controls.
 */
function handleGotoKey(key: string, buffer: string, deck: DeckControls): boolean {
  const step = stepGoto(buffer, key, deck.slides.length);
  switch (step.type) {
    case 'edit':
    case 'invalid':
      updateUi({ gotoBuffer: step.buffer });
      return true;
    case 'go':
      updateUi({ gotoBuffer: undefined });
      deck.goto(step.slide);
      return true;
    case 'cancel':
      closeTopOverlay();
      return true;
  }
}

/**
 * Applies a key to the open overview: arrows and Home or End move the selection, Enter opens it.
 *
 * @param key - The `KeyboardEvent.key`.
 * @param deck - The deck's controls.
 * @returns Whether the overview used the key.
 */
function handleOverviewKey(key: string, deck: DeckControls): boolean {
  const { overviewSelected, overviewColumns } = uiState.get();
  if (key === 'Enter') {
    updateUi({ overviewOpen: false });
    deck.goto(overviewSelected);
    return true;
  }

  const selected = moveOverviewSelection({
    selected: overviewSelected,
    key,
    columns: overviewColumns,
    count: deck.slides.length,
  });
  if (selected === undefined) {
    return false;
  }

  updateUi({ overviewSelected: selected });
  return true;
}
