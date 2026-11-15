import { useEffect, type RefObject } from 'react';

/**
 * What can take keyboard focus inside a panel.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Makes a panel modal for the keyboard while it is mounted: focus moves into it (to `initial`, else
 * its first focusable element, else the panel itself), Tab and Shift+Tab cycle inside it, and focus
 * goes back to where it was when the panel closes.
 *
 * @param ref - The panel.
 * @param initial - Picks the element to focus first, if not the first focusable one.
 */
export function useModalFocus(
  ref: RefObject<HTMLElement | null>,
  initial?: (panel: HTMLElement) => HTMLElement | null,
): void {
  useEffect(() => {
    const panel = ref.current;
    if (panel === null) {
      return undefined;
    }

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = initial?.(panel) ?? focusableIn(panel)[0] ?? panel;
    first.focus({ preventScroll: true });

    /**
     * Keeps Tab inside the panel.
     */
    const onKeyDown = (event: KeyboardEvent) => keepTabInside(event, panel);
    panel.addEventListener('keydown', onKeyDown);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
      if (previous?.isConnected === true) {
        previous.focus({ preventScroll: true });
      }
    };
    // The panel is modal for as long as it is mounted; `initial` is read once, on open.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}

/**
 * Wraps a Tab press inside the panel: from the last focusable element forward, or from the first
 * one backward, focus goes to the other end. A panel with nothing focusable keeps Tab to itself.
 *
 * @param event - The key press.
 * @param panel - The panel.
 */
function keepTabInside(event: KeyboardEvent, panel: HTMLElement): void {
  if (event.key !== 'Tab') {
    return;
  }

  const focusable = focusableIn(panel);
  const head = focusable[0];
  const tail = focusable.at(-1);
  if (head === undefined || tail === undefined) {
    event.preventDefault();
    return;
  }

  const active = document.activeElement;
  const leavesAtEnd = !event.shiftKey && (active === tail || !panel.contains(active));
  const leavesAtStart = event.shiftKey && (active === head || active === panel);
  if (leavesAtEnd) {
    event.preventDefault();
    head.focus();
  } else if (leavesAtStart) {
    event.preventDefault();
    tail.focus();
  }
}

/**
 * The focusable elements inside a panel, in document order.
 *
 * @param panel - The panel.
 */
function focusableIn(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.closest('[inert]'),
  );
}
