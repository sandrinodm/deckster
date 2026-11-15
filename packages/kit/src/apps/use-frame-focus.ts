import { useCallback, useEffect, useState } from 'react';

/**
 * How often a running frame checks whether it holds the keyboard, in milliseconds: the window's
 * blur event does not fire when the deck's window never had focus, so the check does not rely on it
 * alone.
 */
const FOCUS_POLL_MS = 250;

/**
 * What {@link useFrameFocus} returns.
 */
export type FrameFocus = {
  /**
   * Whether the keyboard is inside the frame, which is when the deck cannot see keys.
   */
  interacting: boolean;

  /**
   * Takes the keyboard back from the frame, so the deck's keys work again.
   */
  release: () => void;

  /**
   * Records what the app's bridge reports about its own focus, for apps that can say so.
   */
  setReported: (focused: boolean) => void;
};

/**
 * Tracks whether an iframe holds keyboard focus. Keys pressed inside a frame never reach the deck's
 * window, so the deck watches where focus is: the window's blur and focus events, and, while the
 * app runs, the document's `activeElement` a few times a second, which also catches a click into a
 * frame of a window that never had focus. A page that has the bridge also reports its own focus.
 * `release` blurs the frame and whatever control took the click, which returns focus to the deck's
 * page.
 *
 * @param frame - The iframe element, once it exists.
 * @param running - Whether the app runs; the check pauses while it does not.
 */
export function useFrameFocus(frame: HTMLIFrameElement | null, running = true): FrameFocus {
  const [detected, setDetected] = useState(false);
  const [reported, setReported] = useState(false);
  const interacting = detected || reported;
  useEffect(() => {
    if (frame === null || !running) {
      return undefined;
    }

    const owner = frame.ownerDocument;
    const ownerWindow = owner.defaultView ?? window;
    const pendingChecks = new Set<ReturnType<typeof setTimeout>>();
    /**
     * Reads whether the frame is the focused element of the deck's document.
     */
    const check = (): void => setDetected(owner.activeElement === frame);
    /**
     * Checks again after the browser has moved focus, which it does just after the blur event.
     */
    const onBlur = (): void => {
      const pending = setTimeout(() => {
        pendingChecks.delete(pending);
        check();
      }, 0);
      pendingChecks.add(pending);
    };
    const timer = setInterval(check, FOCUS_POLL_MS);
    ownerWindow.addEventListener('blur', onBlur);
    ownerWindow.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      for (const pending of pendingChecks) {
        clearTimeout(pending);
      }

      pendingChecks.clear();
      ownerWindow.removeEventListener('blur', onBlur);
      ownerWindow.removeEventListener('focus', check);
    };
  }, [frame, running]);
  const release = useCallback(() => {
    const owner = frame?.ownerDocument;
    frame?.blur();
    const active = owner?.activeElement;
    if (active instanceof HTMLElement && active !== owner?.body) {
      active.blur();
    }

    owner?.defaultView?.focus();
    setDetected(false);
    setReported(false);
  }, [frame]);
  return { interacting, release, setReported };
}
