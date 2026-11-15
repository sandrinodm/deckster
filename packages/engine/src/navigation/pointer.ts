import type { MoveAction } from '#navigation/navigation.ts';

import { isInteractiveTarget } from '#navigation/interactive-target.ts';

/**
 * How far the pointer may move between press and release, in CSS pixels, before the click counts as
 * the end of a drag.
 */
export const DRAG_THRESHOLD_PX = 5;

/**
 * How soon after a click that moved the deck a second click counts as the same double-click, in
 * milliseconds; the usual system double-click interval.
 */
export const DOUBLE_CLICK_MS = 500;

/**
 * The `button` of a primary (left) click.
 */
const PRIMARY_BUTTON = 0;

/**
 * The `button` of a secondary (right) click.
 */
const SECONDARY_BUTTON = 2;

/**
 * What decides whether a click on the deck moves it.
 */
export type PointerInput = {
  /**
   * The mouse button: 0 for a left click (`click`), 2 for a right click (`contextmenu`).
   */
  button: number;

  /**
   * Whether Shift, Alt, Ctrl or Meta was held.
   */
  hasModifier: boolean;

  /**
   * The element clicked.
   */
  target: EventTarget | null;

  /**
   * How far the pointer moved since it was pressed, in CSS pixels; 0 when unknown.
   */
  distance: number;

  /**
   * The text selected in the page when the click ended, `''` for none.
   */
  selection: string;
};

/**
 * Maps a click on the slide to a navigation action: a left click moves forward, a right click back.
 * Clicks with a modifier key (so developers can still inspect), clicks on interactive content (see
 * `isInteractiveTarget`), clicks that end a drag and clicks that end a text selection do not
 * navigate.
 *
 * @param input - The button, modifiers, target, drag distance and selection.
 * @returns The action, or `undefined` when the click is not for the deck.
 */
export function pointerToAction(input: PointerInput): MoveAction | undefined {
  const isOwnClick =
    input.hasModifier ||
    isInteractiveTarget(input.target) ||
    input.distance > DRAG_THRESHOLD_PX ||
    input.selection.trim() !== '';
  if (isOwnClick) {
    return undefined;
  }

  switch (input.button) {
    case PRIMARY_BUTTON:
      return { type: 'next' };
    case SECONDARY_BUTTON:
      return { type: 'prev' };
    default:
      return undefined;
  }
}

/**
 * Whether a click is the second click of a double-click that selected text: a left click with a
 * click count of 2 or more and a selection in the page.
 *
 * @param input - The click's `detail` (its click count), button and the selected text.
 */
export function isDoubleClickSelection(input: {
  detail: number;
  button: number;
  selection: string;
}): boolean {
  return input.button === PRIMARY_BUTTON && input.detail >= 2 && input.selection.trim() !== '';
}
