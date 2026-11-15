import type { DeckControls } from '@deckster/engine';

import { revealToolsOnTap } from '#tools/tool-reveal.ts';
import { isModalOpen, uiState, updateUi } from '#ui/ui-state.ts';

/**
 * The deck plugin's pointer handler. While the go-to prompt, help or the overview is open, a click
 * on the stage never moves the deck: it closes the go-to prompt, and is otherwise ignored. A finger
 * tap in the bottom-left corner shows the tool cluster instead of moving the deck.
 *
 * @param event - The click on the stage.
 * @param deck - The deck's controls.
 * @returns `true` when the click was claimed and the deck must not move.
 */
export function handlePointer(event: MouseEvent, deck: DeckControls): boolean {
  if (deck.isStatic) {
    return false;
  }

  if (isModalOpen()) {
    if (uiState.get().gotoBuffer !== undefined) {
      updateUi({ gotoBuffer: undefined });
    }

    return true;
  }

  return revealToolsOnTap(event);
}
