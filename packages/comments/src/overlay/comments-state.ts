import { useSyncExternalStore } from 'react';

import type { CommentType, Rect } from '#model/comment-schema.ts';
import type { FeedbackAnswer } from '#model/feedback-api.ts';

import { activeSlide, cssPathOf } from '#overlay/element-target.ts';

/**
 * An element on the slide the overlay can comment on, with the source stamp it resolves to.
 */
export type Target = {
  /**
   * The outermost DOM element of the stamped JSX element.
   */
  element: Element;

  /**
   * `file:line:column` relative to the deck folder, or `undefined` for an element only the layout
   * renders.
   */
  stamp: string | undefined;

  /**
   * Set for an item of the brand chrome (logo, footer, page number), which the brand draws over
   * every slide rather than the slide or its layout.
   */
  chrome?: true;
};

/**
 * What a new comment is about, while the reviewer writes it.
 */
export type Draft =
  | {
      /**
       * One element.
       */
      kind: 'element';

      /**
       * The selected element.
       */
      target: Target;

      /**
       * The elements the selection walked up from, innermost last, so walking down returns there.
       */
      trail: readonly Target[];
    }
  | {
      /**
       * A dragged rectangle.
       */
      kind: 'region';

      /**
       * The rectangle in canvas pixels.
       */
      rect: Rect;

      /**
       * The first stamped element almost wholly inside the rectangle when it was drawn, if any: the
       * place in the source the region points an agent at.
       */
      inside: Target | undefined;
    }
  | {
      /**
       * The whole slide.
       */
      kind: 'slide';
    };

/**
 * A comment that was being written when its composer closed without saving, kept until it is saved
 * or discarded.
 */
export type KeptDraft = {
  /**
   * The text typed so far.
   */
  text: string;

  /**
   * The type picked.
   */
  type: CommentType | null;
};

/**
 * Which comments the panel lists.
 */
export type StatusFilter = 'open' | 'resolved' | 'all';

/**
 * Another tool asking for an element of the slide (the agent panel's "Pick element"): while one is
 * set, comment mode hands the selected element to it instead of starting a comment.
 */
export type PickRequest = {
  /**
   * Receives the selected element; comment mode is off again by then.
   */
  onPick: (target: Target) => void;

  /**
   * Hears that the pick ended without an element (Escape, Cancel, leaving comment mode).
   */
  onCancel: () => void;
};

/**
 * The comment overlay's state, shared by the key handler and the components.
 */
export type CommentsState = {
  /**
   * Whether comment mode is on: hover highlights, clicks select.
   */
  mode: boolean;

  /**
   * Whether the comment panel is open.
   */
  panelOpen: boolean;

  /**
   * The deck's comments as the dev server last answered, or `undefined` before the first answer.
   */
  answer: FeedbackAnswer | undefined;

  /**
   * Why the comments could not be loaded or saved, shown in the panel.
   */
  problem: string | undefined;

  /**
   * The element under the pointer in comment mode.
   */
  hover: Target | undefined;

  /**
   * The new comment being written.
   */
  draft: Draft | undefined;

  /**
   * The text typed into the draft so far, kept when the selection changes.
   */
  draftText: string;

  /**
   * The type picked for the draft.
   */
  draftType: CommentType | null;

  /**
   * Drafts whose composer was closed (Escape, another selection, leaving comment mode) before they
   * were saved, by {@link draftKey}; selecting the same target again brings the text back.
   */
  keptDrafts: Readonly<Record<string, KeptDraft>>;

  /**
   * The comment whose card is open, by id.
   */
  openId: string | undefined;

  /**
   * The comment whose element is flashing after a jump from the panel, by id.
   */
  flashId: string | undefined;

  /**
   * The panel's status filter.
   */
  status: StatusFilter;

  /**
   * The panel's slide filter: a slide id, or `undefined` for every slide.
   */
  slide: string | undefined;

  /**
   * A short message shown for a moment, such as "Copied".
   */
  toast: string | undefined;

  /**
   * The element pick another tool asked for, if one is under way.
   */
  pick: PickRequest | undefined;
};

/**
 * How long a toast stays, in milliseconds.
 */
const TOAST_MS = 2200;

/**
 * The current state; nothing is open at first, and the panel lists open comments.
 */
let state = initialState();

/**
 * Who re-renders on a change.
 */
const listeners = new Set<() => void>();

/**
 * The current state, outside React.
 */
export function commentsState(): CommentsState {
  return state;
}

/**
 * Merges changes into the state and re-renders the overlay.
 *
 * @param changes - The fields to change.
 */
export function updateComments(changes: Partial<CommentsState>): void {
  state = { ...state, ...changes };
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Reads the state in a component and re-renders when it changes.
 */
export function useCommentsState(): CommentsState {
  return useSyncExternalStore(subscribe, commentsState, commentsState);
}

/**
 * Turns comment mode on or off. Turning it off drops the hover and closes the draft, keeping what
 * was typed.
 *
 * @param on - The new mode; toggles when omitted.
 */
export function setCommentMode(on: boolean = !state.mode): void {
  if (on) {
    updateComments({ mode: true });
    return;
  }

  if (state.pick !== undefined) {
    cancelPick();
    return;
  }

  closeDraft();
  updateComments({ mode: false, hover: undefined });
}

/**
 * Starts picking an element for another tool: comment mode turns on, and the next selected element
 * goes to `request.onPick` instead of a new comment. A pick already under way is cancelled first.
 *
 * @param request - Who receives the element.
 */
export function startPick(request: PickRequest): void {
  if (state.pick !== undefined) {
    cancelPick();
  }

  closeDraft();
  updateComments({ mode: true, pick: request, hover: undefined, openId: undefined });
}

/**
 * Hands a selected element to the tool that asked for it and leaves comment mode.
 *
 * @param target - The selected element.
 * @returns Whether a pick was under way.
 */
export function finishPick(target: Target): boolean {
  const { pick } = state;
  if (pick === undefined) {
    return false;
  }

  updateComments({ pick: undefined, mode: false, hover: undefined });
  pick.onPick(target);
  return true;
}

/**
 * Ends a pick without an element and leaves comment mode.
 */
export function cancelPick(): void {
  const { pick } = state;
  if (pick === undefined) {
    return;
  }

  updateComments({ pick: undefined, mode: false, hover: undefined });
  pick.onCancel();
}

/**
 * Starts a draft. Walking the selection to a parent or child (`carry`) keeps the text with it;
 * selecting another target keeps the open draft's text for its own target and brings back the text
 * kept for the new one, if any.
 *
 * @param draft - What the comment is about.
 * @param options - `carry: true` when the selection only walked the element tree.
 */
export function startDraft(draft: Draft, options: { carry?: boolean } = {}): void {
  if (options.carry === true) {
    updateComments({ draft, openId: undefined });
    return;
  }

  const keptDrafts = keepCurrent(state.keptDrafts);
  const key = draftKey(draft);
  const kept = keptDrafts[key];
  updateComments({
    draft,
    openId: undefined,
    draftText: kept?.text ?? '',
    draftType: kept?.type ?? null,
    keptDrafts: without(keptDrafts, key),
  });
}

/**
 * Closes the composer without saving: text already typed is kept for its target, and comes back
 * when that target is selected again.
 *
 * @returns Whether text was kept.
 */
export function closeDraft(): boolean {
  if (state.draft === undefined) {
    return false;
  }

  const kept = state.draftText.trim() !== '';
  updateComments({
    draft: undefined,
    draftText: '',
    draftType: null,
    keptDrafts: keepCurrent(state.keptDrafts),
  });
  if (kept) {
    showToast('Draft kept: select the same element to finish it');
  }

  return kept;
}

/**
 * Drops the draft and its text for good: after it is saved, or when the reviewer discards it.
 */
export function discardDraft(): void {
  const keptDrafts =
    state.draft === undefined ? state.keptDrafts : without(state.keptDrafts, draftKey(state.draft));
  updateComments({ draft: undefined, draftText: '', draftType: null, keptDrafts });
}

/**
 * The key a draft's text is kept under: the slide and the element's stamp (or CSS path), the
 * rectangle of a dragged region, or the slide.
 *
 * @param draft - What the comment is about.
 */
export function draftKey(draft: Draft): string {
  const slide = activeSlide()?.getAttribute('data-slide-id') ?? '';
  switch (draft.kind) {
    case 'element':
      return `element:${slide}:${draft.target.stamp ?? cssPathOf(draft.target.element)}`;
    case 'region': {
      const { x, y, width, height } = draft.rect;
      return `region:${slide}:${[x, y, width, height].map(Math.round).join(',')}`;
    }
    case 'slide':
      return `slide:${slide}`;
  }
}

/**
 * The kept drafts with the open draft's text added, when there is any.
 *
 * @param keptDrafts - The drafts kept so far.
 */
function keepCurrent(
  keptDrafts: Readonly<Record<string, KeptDraft>>,
): Readonly<Record<string, KeptDraft>> {
  if (state.draft === undefined || state.draftText.trim() === '') {
    return keptDrafts;
  }

  return {
    ...keptDrafts,
    [draftKey(state.draft)]: { text: state.draftText, type: state.draftType },
  };
}

/**
 * The kept drafts without one key.
 *
 * @param keptDrafts - The drafts kept so far.
 * @param key - The key to drop.
 */
function without(
  keptDrafts: Readonly<Record<string, KeptDraft>>,
  key: string,
): Readonly<Record<string, KeptDraft>> {
  if (!(key in keptDrafts)) {
    return keptDrafts;
  }

  return Object.fromEntries(Object.entries(keptDrafts).filter(([kept]) => kept !== key));
}

/**
 * Shows a short message for a moment.
 *
 * @param message - The message.
 */
export function showToast(message: string): void {
  updateComments({ toast: message });
  window.setTimeout(() => {
    if (state.toast === message) {
      updateComments({ toast: undefined });
    }
  }, TOAST_MS);
}

/**
 * Adds a listener.
 *
 * @param listener - Called after every change.
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Puts the state back to where it starts; for tests.
 */
export function resetComments(): void {
  state = initialState();
  for (const listener of listeners) {
    listener();
  }
}

/**
 * The state before anything happens.
 */
function initialState(): CommentsState {
  return {
    mode: false,
    panelOpen: false,
    answer: undefined,
    problem: undefined,
    hover: undefined,
    draft: undefined,
    draftText: '',
    draftType: null,
    keptDrafts: {},
    openId: undefined,
    flashId: undefined,
    status: 'open',
    slide: undefined,
    toast: undefined,
    pick: undefined,
  };
}
