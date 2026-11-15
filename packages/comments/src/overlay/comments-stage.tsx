import type { ReactNode } from 'react';

import { useDeck } from '@deckster/engine';
import { windowKind } from '@deckster/presenter';

import { useCommentsState } from '#overlay/comments-state.ts';

/**
 * Props of {@link CommentsStage}.
 */
type CommentsStageProps = {
  /**
   * The scaled canvas with the slides and chrome.
   */
  children: ReactNode;
};

/**
 * Wraps the main stage so it shrinks beside the docked comment panel instead of being covered by
 * it. In static mode and in the presenter window it adds nothing.
 */
export function CommentsStage({ children }: CommentsStageProps): ReactNode {
  const deck = useDeck();
  const { panelOpen } = useCommentsState();
  if (deck.isStatic || windowKind() === 'presenter') {
    return children;
  }

  return (
    <div className="dc-stage" data-panel={panelOpen}>
      {children}
    </div>
  );
}
