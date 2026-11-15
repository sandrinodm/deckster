import type { ReactNode } from 'react';

import { useDeck } from '@deckster/engine';

import { useUiState } from '#ui/ui-state.ts';

/**
 * The prompt that shows the digits typed after `g`, with the deck's length so a number that is too
 * big is obvious before Enter.
 */
export function GotoPrompt(): ReactNode {
  const deck = useDeck();
  const { gotoBuffer } = useUiState();
  if (gotoBuffer === undefined) {
    return null;
  }

  const total = deck.slides.length;
  const isInvalid = gotoBuffer !== '' && Number(gotoBuffer) > total;
  return (
    <output className="dp-ui dp-goto" data-deck-interactive="" data-invalid={isInvalid}>
      <span>Go to slide</span>
      <span className="dp-goto-value">{gotoBuffer === '' ? '_' : gotoBuffer}</span>
      <span className="dp-goto-of">of {total}</span>
      <kbd>Enter</kbd>
    </output>
  );
}
