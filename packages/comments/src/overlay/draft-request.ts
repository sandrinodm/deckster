import type { CommentType } from '#model/comment-schema.ts';
import type { FeedbackRequest, NewComment } from '#node/comment-request.ts';
import type { Draft, Target } from '#overlay/comments-state.ts';

import { parseStamp } from '#model/source-stamp.ts';
import {
  cssPathOf,
  textExcerpt,
  toCanvasRect,
  type CanvasGeometry,
} from '#overlay/element-target.ts';

/**
 * What a draft is turned into a request with.
 */
export type DraftInput = {
  /**
   * What the comment is about.
   */
  draft: Draft;

  /**
   * The slide id.
   */
  slide: string;

  /**
   * The step on screen.
   */
  step: number;

  /**
   * What the reviewer wrote, trimmed.
   */
  text: string;

  /**
   * The type picked, or `null`.
   */
  type: CommentType | null;

  /**
   * Where the canvas is, to measure the element in canvas pixels.
   */
  geometry: CanvasGeometry;
};

/**
 * The `add` request for a draft: the element's source location and anchor, its box in canvas
 * pixels, and for a region the stamped element it holds.
 *
 * @param input - The draft and what goes with it.
 */
export function draftRequest(input: DraftInput): FeedbackRequest {
  const base = {
    slide: input.slide,
    step: input.step,
    text: input.text,
    type: input.type,
    author: null,
  };
  return { action: 'add', comment: { ...base, ...draftTarget(input.draft, input.geometry) } };
}

/**
 * The target fields of a new comment.
 *
 * @param draft - What the comment is about.
 * @param geometry - Where the canvas is.
 */
function draftTarget(
  draft: Draft,
  geometry: CanvasGeometry,
): Pick<NewComment, 'target' | 'source' | 'anchor' | 'box' | 'region'> {
  switch (draft.kind) {
    case 'element':
      return {
        target: 'element',
        ...targetFields(draft.target),
        box: toCanvasRect(draft.target.element.getBoundingClientRect(), geometry),
        region: null,
      };
    case 'region': {
      const { inside } = draft;
      const fields = inside === undefined ? { source: null, anchor: null } : targetFields(inside);
      return { target: 'region', ...fields, box: draft.rect, region: draft.rect };
    }
    case 'slide':
      return { target: 'slide', source: null, anchor: null, box: null, region: null };
  }
}

/**
 * The source location and anchor of a target.
 *
 * @param target - The element and its stamp.
 */
function targetFields(target: Target): Pick<NewComment, 'source' | 'anchor'> {
  const source = target.stamp === undefined ? undefined : parseStamp(target.stamp);
  return {
    source: source ?? null,
    anchor: {
      stamp: target.stamp ?? null,
      cssPath: cssPathOf(target.element),
      tag: target.element.tagName.toLowerCase(),
      text: textExcerpt(target.element),
    },
  };
}
