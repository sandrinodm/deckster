import { useEffect, useState } from 'react';

/**
 * The window events that count as the reader doing something: pointing, tapping, typing, or moving
 * focus (`focusin` bubbles, so tabbing into the page counts too).
 */
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'focusin'] as const;

/**
 * Whether the reader has done nothing in the window for `delayMs`. Starts `false`, turns `true`
 * once `delayMs` passes without a pointer move or press, a key or a focus change, and turns `false`
 * again on the next one, restarting the wait.
 *
 * @param delayMs - How long to wait without input, in milliseconds. Zero or less turns idle on the
 *   next timer tick.
 * @returns `true` while the window is idle.
 */
export function useIdle(delayMs: number): boolean {
  const [isIdle, setIsIdle] = useState(false);
  useEffect(() => {
    let timer = window.setTimeout(() => setIsIdle(true), delayMs);

    /**
     * Marks the window active and restarts the wait.
     */
    const onActivity = (): void => {
      setIsIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIsIdle(true), delayMs);
    };

    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { capture: true, passive: true });
    }

    return () => {
      window.clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, onActivity, { capture: true });
      }
    };
  }, [delayMs]);
  return isIdle;
}
