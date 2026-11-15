import type { ReactNode } from 'react';

import { setBlackout, useUiState } from '#ui/ui-state.ts';

/**
 * The cover over the audience window: black for `b`, white for `w`. It sits above every other
 * panel; a click, or the key again, or Escape, uncovers the slide.
 */
export function Blackout(): ReactNode {
  const { blackout } = useUiState();
  if (blackout === undefined) {
    return null;
  }

  return (
    <div
      className="dp-ui dp-blackout"
      data-deck-interactive=""
      data-mode={blackout}
      role="presentation"
      onClick={() => setBlackout(undefined)}
    />
  );
}
