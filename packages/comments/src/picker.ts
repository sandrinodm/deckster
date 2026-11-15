import { useMemo } from 'react';

import type { CommentType } from '#model/comment-schema.ts';
import type { Target } from '#overlay/comments-state.ts';

import { SOURCE_ATTRIBUTE } from '#model/source-stamp.ts';
import { cancelPick, startPick, useCommentsState } from '#overlay/comments-state.ts';
import { activeSlide } from '#overlay/element-target.ts';
import { targetLabel } from '#overlay/labels.ts';

/**
 * The longest text snippet a picked element keeps, in characters.
 */
const SNIPPET_CHARS = 120;

/**
 * Matches a run of whitespace.
 */
const WHITESPACE = /\s+/g;

/**
 * An element of the slide another tool picked through the comment overlay's picker.
 */
export type PickedElement = {
  /**
   * The outermost DOM element of the picked JSX element.
   */
  element: Element;

  /**
   * Its source stamp relative to the deck folder, such as `slides/title.mdx:7:1`, or `undefined`
   * for an element only the layout renders.
   */
  stamp: string | undefined;

  /**
   * Whether it belongs to the brand chrome (logo, footer, page number).
   */
  chrome: boolean;

  /**
   * Its tag name, lower case.
   */
  tag: string;

  /**
   * Its text, whitespace collapsed and cut to a short snippet.
   */
  text: string;

  /**
   * The outline label: tag and `file:line`, such as `h1 · slides/title.mdx:7`.
   */
  label: string;
};

/**
 * An open review comment, as another tool lists it.
 */
export type OpenComment = {
  /**
   * The comment id.
   */
  id: string;

  /**
   * Its number on the slide.
   */
  number: number;

  /**
   * The text.
   */
  text: string;

  /**
   * Fix, question or idea, or `null`.
   */
  type: CommentType | null;

  /**
   * The step it was made on.
   */
  step: number;

  /**
   * `decks/<deck>/slides/x.mdx:14:3`, or the file alone.
   */
  location: string;
};

/**
 * Starts the comment overlay's element picker for another tool: comment mode turns on with a "Pick
 * an element" toolbar, hover outlines elements with their source line, a click (Alt-click for the
 * parent, a drag for the element a region covers, Tab and Enter by keyboard) picks one, and Escape
 * cancels. No comment is created. Needs the comments runtime plugin, which every dev server loads.
 *
 * @param callbacks - `onPick` receives the element; `onCancel` hears a pick that ended without one.
 * @returns A function that cancels the pick.
 */
export function pickElement(callbacks: {
  readonly onPick: (picked: PickedElement) => void;
  readonly onCancel?: () => void;
}): () => void {
  startPick({
    onPick: (target) => callbacks.onPick(describeTarget(target)),
    onCancel: () => callbacks.onCancel?.(),
  });
  return cancelPick;
}

/**
 * Cancels a pick under way, if any.
 */
export function cancelElementPick(): void {
  cancelPick();
}

/**
 * Whether a pick is under way, re-rendering when that changes.
 */
export function useElementPicking(): boolean {
  return useCommentsState().pick !== undefined;
}

/**
 * The open review comments on one slide, oldest first, re-rendering when they change.
 *
 * @param slideId - The slide, or `undefined` for none.
 */
export function useOpenComments(slideId: string | undefined): readonly OpenComment[] {
  const { answer } = useCommentsState();
  return useMemo(
    () =>
      (answer?.comments ?? [])
        .filter((comment) => comment.status === 'open' && comment.slide === slideId)
        .map((comment) => ({
          id: comment.id,
          number: comment.number,
          text: comment.text,
          type: comment.type,
          step: comment.step,
          location: comment.location,
        })),
    [answer, slideId],
  );
}

/**
 * The element on the slide on screen that carries a source stamp, to find a picked element again
 * after hot reload replaced it.
 *
 * @param stamp - The stamp, such as `slides/title.mdx:7:1`.
 */
export function findStamped(stamp: string): Element | undefined {
  const slide = activeSlide();
  if (slide === null) {
    return undefined;
  }

  for (const element of slide.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`)) {
    if (element.getAttribute(SOURCE_ATTRIBUTE) === stamp) {
      return element;
    }
  }

  return undefined;
}

/**
 * A target as another tool sees it.
 *
 * @param target - The selected element and its stamp.
 */
function describeTarget(target: Target): PickedElement {
  const text = (target.element.textContent ?? '').replaceAll(WHITESPACE, ' ').trim();
  return {
    element: target.element,
    stamp: target.stamp,
    chrome: target.chrome === true,
    tag: target.element.tagName.toLowerCase(),
    text: text.length > SNIPPET_CHARS ? `${text.slice(0, SNIPPET_CHARS - 1)}…` : text,
    label: targetLabel(target),
  };
}
