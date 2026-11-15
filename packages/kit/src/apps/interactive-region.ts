import { useCallback, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react';

/**
 * The key that gives the keyboard back to the deck.
 */
export const RELEASE_KEY = 'Escape';

/**
 * What {@link useKeyCapture} returns.
 */
export type KeyCapture = {
  /**
   * Whether keyboard focus is inside the region, so keys belong to it and not to the deck.
   */
  interacting: boolean;

  /**
   * Props for the region's root element: focus tracking and the key handler.
   */
  props: {
    /**
     * Makes the root focusable by a click without joining the tab order.
     */
    tabIndex: -1;

    /**
     * Focus entered the region.
     */
    onFocus: () => void;

    /**
     * Focus left the region.
     */
    onBlur: (event: FocusEvent<HTMLElement>) => void;

    /**
     * Keeps keys inside the region and turns Escape into a release.
     */
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  };

  /**
   * Gives the keyboard back to the deck: blurs whatever has focus inside the region.
   */
  release: () => void;
};

/**
 * Keyboard capture for an inline widget. While focus is inside the region, every key stays there:
 * the handler stops the event before it reaches the deck's window listener, so arrows, space and
 * the presenter's shortcuts do not move the deck. Escape blurs the focused element and lets the
 * next key through, so the deck takes the keyboard back.
 *
 * @param root - The region's root element.
 */
export function useKeyCapture(root: RefObject<HTMLElement | null>): KeyCapture {
  const [interacting, setInteracting] = useState(false);
  const release = useCallback(() => {
    const active = root.current?.ownerDocument.activeElement;
    if (active instanceof HTMLElement && root.current?.contains(active)) {
      active.blur();
    }

    setInteracting(false);
  }, [root]);
  return {
    interacting,
    release,
    props: {
      tabIndex: -1,
      onFocus: () => setInteracting(true),
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setInteracting(false);
        }
      },
      onKeyDown: (event) => {
        event.stopPropagation();
        if (event.key === RELEASE_KEY) {
          event.preventDefault();
          release();
        }
      },
    },
  };
}
