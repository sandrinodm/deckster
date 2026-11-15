import { useEffect, useEffectEvent, useRef, type Dispatch, type RefObject } from 'react';

import type { DeckControls } from '#deck/deck-context.ts';
import type { NavigationAction, Position } from '#navigation/navigation.ts';
import type { DeckRuntime } from '#plugins/compose-plugins.ts';

import { DOUBLE_CLICK_MS, isDoubleClickSelection, pointerToAction } from '#navigation/pointer.ts';

/**
 * Selects a `SlideView` copy, whose clicks never move the deck.
 */
const SLIDE_VIEW_SELECTOR = '.deck-slide-view';

/**
 * The last left click that moved the deck: when, and where the deck was before it.
 */
type LastAdvance = {
  /**
   * The click's `timeStamp`.
   */
  at: number;

  /**
   * The position before the click moved the deck.
   */
  from: Position;
};

/**
 * Moves the deck with the mouse on the main stage: a left click goes forward, a right click back,
 * and the browser's context menu is suppressed only when a right click navigates. Plugins see each
 * click first and can claim it. Clicks on interactive content, with a modifier key, at the end of a
 * drag or of a text selection, and clicks inside a `SlideView` are left alone.
 *
 * A single click navigates at once, with no wait for a possible second click. When the second click
 * of a double-click selects text, the advance the first click made is undone, so double-clicking a
 * word selects it instead of moving on. If that advance had already left the slide, the selection
 * (made on the next slide) is cleared too.
 *
 * @param stageRef - The element that holds the main stage; clicks outside it are ignored.
 * @param options - Whether mouse navigation is on, the controls for plugin handlers, the handlers
 *   and the dispatcher.
 */
export function usePointerNavigation(
  stageRef: RefObject<HTMLElement | null>,
  options: {
    enabled: boolean;
    controls: DeckControls;
    pointerHandlers: DeckRuntime['pointerHandlers'];
    dispatch: Dispatch<NavigationAction>;
  },
): void {
  const { enabled, controls, pointerHandlers, dispatch } = options;
  const lastAdvance = useRef<LastAdvance | undefined>(undefined);

  /**
   * Handles a `click` or `contextmenu` on the stage.
   */
  const onClick = useEffectEvent((event: MouseEvent, distance: number) => {
    if (event.defaultPrevented || isInSlideView(event.target)) {
      return;
    }

    const selection = window.getSelection()?.toString() ?? '';
    const previous = lastAdvance.current;
    lastAdvance.current = undefined;
    const undoes =
      previous !== undefined &&
      isDoubleClickSelection({ detail: event.detail, button: event.button, selection }) &&
      event.timeStamp - previous.at <= DOUBLE_CLICK_MS;
    if (undoes) {
      if (previous.from.slide !== controls.position.slide) {
        window.getSelection()?.removeAllRanges();
      }

      dispatch({ type: 'goto', position: previous.from });
      return;
    }

    const action = pointerToAction({
      button: event.button,
      hasModifier: event.shiftKey || event.altKey || event.ctrlKey || event.metaKey,
      target: event.target,
      distance,
      selection,
    });
    if (action === undefined) {
      return;
    }

    if (pointerHandlers.some((handler) => handler(event, controls))) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    if (action.type === 'next' && event.detail <= 1) {
      lastAdvance.current = { at: event.timeStamp, from: controls.position };
    }

    dispatch(action);
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!enabled || stage === null) {
      return undefined;
    }

    let pressedAt: { x: number; y: number } | undefined;

    /**
     * Remembers where the pointer was pressed, to tell a click from a drag.
     */
    const onPointerDown = (event: PointerEvent) => {
      pressedAt = { x: event.clientX, y: event.clientY };
    };

    /**
     * How far the pointer moved since it was pressed.
     */
    const distanceOf = (event: MouseEvent) =>
      pressedAt === undefined
        ? 0
        : Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y);

    /**
     * A left click or a right click on the stage.
     */
    const onMouse = (event: MouseEvent) => onClick(event, distanceOf(event));
    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('click', onMouse);
    stage.addEventListener('contextmenu', onMouse);
    return () => {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('click', onMouse);
      stage.removeEventListener('contextmenu', onMouse);
    };
  }, [stageRef, enabled]);
}

/**
 * Whether a click target is inside a `SlideView` (a thumbnail drawn in the stage's chrome).
 *
 * @param target - The event target.
 */
function isInSlideView(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SLIDE_VIEW_SELECTOR) !== null;
}
