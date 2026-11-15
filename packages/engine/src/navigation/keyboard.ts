import type { MoveAction } from '#navigation/navigation.ts';

import { isInteractiveTarget } from '#navigation/interactive-target.ts';

/**
 * The parts of a keyboard event that decide the navigation action.
 */
export type KeyInput = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>;

/**
 * Keys that move one step forward, including the PageDown that presentation clickers send.
 */
const FORWARD_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ']);

/**
 * Keys that move one step back, including the PageUp that presentation clickers send.
 */
const BACKWARD_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);

/**
 * Elements whose key presses belong to the element, not to deck navigation.
 */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * The `key` of the space bar.
 */
const SPACE = ' ';

/**
 * Maps a key press to a navigation action. Arrows, space and PageUp/PageDown (what presentation
 * clickers send) move one step; Shift+Space moves back; Home and End jump to the first and last
 * slide. Presses with Ctrl, Alt or Meta are left to the browser.
 *
 * @param input - The key and its modifiers.
 * @returns The action, or `undefined` when the key is not a navigation key.
 */
export function keyToAction(input: KeyInput): MoveAction | undefined {
  if (input.altKey || input.ctrlKey || input.metaKey) {
    return undefined;
  }

  if (input.key === SPACE && input.shiftKey) {
    return { type: 'prev' };
  }

  if (FORWARD_KEYS.has(input.key)) {
    return { type: 'next' };
  }

  if (BACKWARD_KEYS.has(input.key)) {
    return { type: 'prev' };
  }

  switch (input.key) {
    case 'Home':
      return { type: 'first' };
    case 'End':
      return { type: 'last' };
    default:
      return undefined;
  }
}

/**
 * Whether a key press belongs to an element the user is typing into, so the deck must ignore it.
 *
 * @param target - The event target; anything that is not an element counts as not editable.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable;
}

/**
 * Whether a key press is Space (with or without Shift) on interactive content (see
 * `isInteractiveTarget`): a button, a link, a `<summary>`, a media element, an element with a
 * button-like role, or anything inside `[data-deck-interactive]`. The deck leaves those presses
 * alone so the element gets its click.
 *
 * @param input - The key and the event target; a target that is not an element never matches.
 */
export function isSpaceForTarget(input: { key: string; target: EventTarget | null }): boolean {
  return input.key === SPACE && isInteractiveTarget(input.target);
}
