import { isInteractiveTarget, useDeck } from '@deckster/engine';
import { useRef, type ReactNode, type TouchEvent } from 'react';

import { swipeDirection } from '#stage/swipe.ts';
import { useUiState } from '#ui/ui-state.ts';
import { windowKind } from '#ui/window-kind.ts';

/**
 * Props of {@link PresenterStage}.
 */
type PresenterStageProps = {
  /**
   * The scaled canvas with the slides and chrome.
   */
  children: ReactNode;
};

/**
 * Wraps the main stage. In static mode, which `deck shot`, `deck lint` and export use, it adds
 * nothing. In the presenter window it renders no slides at all, because that window draws its own
 * panes. Otherwise it makes room for the sidebar, so the stage resizes beside it instead of being
 * covered, and turns a horizontal swipe into the previous or next step.
 */
export function PresenterStage({ children }: PresenterStageProps): ReactNode {
  const deck = useDeck();
  const { sidebarOpen } = useUiState();
  const touchStart = useRef<{ x: number; y: number; at: number } | undefined>(undefined);
  if (deck.isStatic) {
    return children;
  }

  if (windowKind() === 'presenter') {
    return null;
  }

  /**
   * Remembers where a finger went down, unless it is on interactive content.
   */
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current =
      touch === undefined || isInteractiveTarget(event.target)
        ? undefined
        : { x: touch.clientX, y: touch.clientY, at: event.timeStamp };
  };
  /**
   * Moves the deck when the finger came up after a swipe.
   */
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = undefined;
    if (start === undefined || touch === undefined) {
      return;
    }

    const direction = swipeDirection({
      dx: touch.clientX - start.x,
      dy: touch.clientY - start.y,
      durationMs: event.timeStamp - start.at,
    });
    if (direction === 'next') {
      deck.next();
    } else if (direction === 'prev') {
      deck.prev();
    }
  };
  return (
    <div
      className="dp-stage"
      data-sidebar={sidebarOpen}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}>
      {children}
    </div>
  );
}
