import type { DeckControls } from '@deckster/engine';

import type { Target } from '#overlay/comments-state.ts';

import {
  cancelPick,
  closeDraft,
  commentsState,
  finishPick,
  setCommentMode,
  startDraft,
  updateComments,
} from '#overlay/comments-state.ts';
import { childTarget, parentTarget, slideTargets } from '#overlay/element-target.ts';

/**
 * The composer's text field, focused by Enter.
 */
const COMPOSER_INPUT_SELECTOR = '.dc-composer textarea';

/**
 * Tool chrome whose own controls take Tab: the comment overlay, the presenter tools and anything
 * else marked interactive outside the slide.
 */
const TOOL_CHROME_SELECTOR = '.dp-ui, [data-deck-interactive]';

/**
 * The element the keyboard picked last; the arrows and Enter act on the pick only while the hover
 * is still that element, so a pointer resting on the slide never stops the arrows navigating.
 */
let keyboardPick: Element | undefined;

/**
 * Moves the selected element one step up the element tree, remembering where it came from.
 *
 * @returns Whether the selection moved.
 */
export function selectParent(): boolean {
  const { draft } = commentsState();
  if (draft?.kind !== 'element') {
    return false;
  }

  const parent = parentTarget(draft.target);
  if (parent === undefined) {
    return false;
  }

  startDraft(
    { kind: 'element', target: parent, trail: [...draft.trail, draft.target] },
    { carry: true },
  );
  return true;
}

/**
 * Moves the selected element one step down: back to where an earlier step up came from, else to the
 * first element inside it.
 *
 * @returns Whether the selection moved.
 */
export function selectChild(): boolean {
  const { draft } = commentsState();
  if (draft?.kind !== 'element') {
    return false;
  }

  const previous = draft.trail.at(-1);
  const child = previous ?? childTarget(draft.target);
  if (child === undefined) {
    return false;
  }

  startDraft({ kind: 'element', target: child, trail: draft.trail.slice(0, -1) }, { carry: true });
  return true;
}

/**
 * Moves the keyboard pick to the next or previous stamped element of the slide, in document order.
 * Past either end the pick is dropped and the key is left to the browser, so Tab goes on to the
 * toolbar.
 *
 * @param step - `1` for Tab, `-1` for Shift+Tab.
 * @returns Whether the pick moved.
 */
export function pickNext(step: 1 | -1): boolean {
  const targets = slideTargets();
  const { hover } = commentsState();
  const current =
    hover === undefined || hover.element !== keyboardPick ? -1 : indexOf(targets, hover);
  const first = step === 1 ? 0 : targets.length - 1;
  const next = current < 0 ? first : current + step;
  const target = targets[next];
  keyboardPick = target?.element;
  updateComments({ hover: target });
  return target !== undefined;
}

/**
 * Moves the keyboard pick to its parent or child element.
 *
 * @param direction - `parent` for the up arrow, `child` for the down arrow.
 * @returns Whether the pick moved.
 */
export function walkPick(direction: 'parent' | 'child'): boolean {
  const hover = currentPick();
  if (hover === undefined) {
    return false;
  }

  const target = direction === 'parent' ? parentTarget(hover) : childTarget(hover);
  if (target === undefined) {
    return false;
  }

  keyboardPick = target.element;
  updateComments({ hover: target });
  return true;
}

/**
 * The comments plugin's key handler, for the keys that only mean something while comment mode or
 * the panel is open: Escape steps back (closes the draft and keeps its text, then leaves comment
 * mode, then closes the panel); in comment mode Tab and Shift+Tab pick the slide's elements one by
 * one, the up and down arrows walk the pick (or the selection) up and down the element tree, and
 * Enter selects the picked element or puts the cursor in the composer. Typing in the composer never
 * reaches it, and Tab keeps moving focus inside the toolbar and the panel.
 *
 * @param event - The key press.
 * @param deck - The deck's controls.
 * @returns `true` when the key was used and the deck must not navigate.
 */
export function handleCommentKey(event: KeyboardEvent, deck: DeckControls): boolean {
  const state = commentsState();
  const hasModifier = event.ctrlKey || event.metaKey;
  const closed = !state.mode && !state.panelOpen;
  if (deck.isStatic || hasModifier || closed) {
    return false;
  }

  if (!state.mode) {
    return event.key === 'Escape' && stepBack();
  }

  switch (event.key) {
    case 'Escape':
      return stepBack();
    case 'Tab':
      return state.draft === undefined && !inToolChrome(event.target) && pickNext(tabStep(event));
    case 'ArrowUp':
      return state.draft === undefined ? walkPick('parent') : selectParent();
    case 'ArrowDown':
      return state.draft === undefined ? walkPick('child') : selectChild();
    case 'Enter':
      return state.draft === undefined ? selectPick() : focusComposer();
    default:
      return false;
  }
}

/**
 * Selects the picked (or hovered) element for a new comment.
 *
 * @returns Whether an element was picked.
 */
function selectPick(): boolean {
  const hover = currentPick();
  if (hover === undefined) {
    return false;
  }

  keyboardPick = undefined;
  if (finishPick(hover)) {
    return true;
  }

  startDraft({ kind: 'element', target: hover, trail: [] });
  updateComments({ hover: undefined });
  return true;
}

/**
 * The hovered target when the keyboard picked it.
 */
function currentPick(): Target | undefined {
  const { hover } = commentsState();
  return hover !== undefined && hover.element === keyboardPick ? hover : undefined;
}

/**
 * Closes the innermost thing open.
 *
 * @returns Whether anything was open.
 */
function stepBack(): boolean {
  const state = commentsState();
  if (state.pick !== undefined) {
    cancelPick();
    return true;
  }

  if (state.draft !== undefined) {
    closeDraft();
    return true;
  }

  if (state.mode) {
    setCommentMode(false);
    return true;
  }

  updateComments({ panelOpen: false, openId: undefined });
  return true;
}

/**
 * Puts the cursor in the composer's text field.
 *
 * @returns Whether the field was there.
 */
function focusComposer(): boolean {
  const input = document.querySelector<HTMLTextAreaElement>(COMPOSER_INPUT_SELECTOR);
  input?.focus();
  return input !== null;
}

/**
 * Which way a Tab press moves.
 *
 * @param event - The key press.
 */
function tabStep(event: KeyboardEvent): 1 | -1 {
  return event.shiftKey ? -1 : 1;
}

/**
 * Whether a key press comes from a control of the tool chrome, which Tab must move through.
 *
 * @param target - The event target.
 */
function inToolChrome(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TOOL_CHROME_SELECTOR) !== null;
}

/**
 * Where a target is in a list, by its element.
 *
 * @param targets - The list.
 * @param target - The target.
 */
function indexOf(targets: readonly Target[], target: Target): number {
  return targets.findIndex((candidate) => candidate.element === target.element);
}
