import { Schema } from 'effect';

import {
  Comment,
  CommentAnchor,
  CommentId,
  CommentResolution,
  CommentSource,
  CommentType,
  Rect,
} from '#model/comment-schema.ts';

/**
 * Comment text as a request sends it: the stored text's limits, and not only whitespace.
 */
const RequestText = Comment.fields.text.check(
  Schema.makeFilter((text: string) => text.trim() !== '', {
    message: 'Expected some comment text, not only whitespace',
  }),
);

/**
 * A new comment as the overlay (or `deckster comments add`) sends it. The server adds the id, the
 * author when none is given, the timestamps, the status and the source line the anchor reads.
 */
export const NewComment = Schema.Struct({
  /**
   * The slide id.
   */
  slide: Comment.fields.slide,

  /**
   * The step the reviewer is on.
   */
  step: Comment.fields.step,

  /**
   * What the comment points at.
   */
  target: Comment.fields.target,

  /**
   * The element's source location, or `null` for an element only the layout renders (the server
   * then looks for its text in the slide file), a region without one, or the whole slide.
   */
  source: Schema.NullOr(CommentSource),

  /**
   * How to find the element again, without the source line, which the server reads.
   */
  anchor: Schema.NullOr(
    Schema.Struct({
      /**
       * The source stamp the element resolved to, or `null`.
       */
      stamp: CommentAnchor.fields.stamp,

      /**
       * A CSS path from the slide's `<section>` to the element.
       */
      cssPath: CommentAnchor.fields.cssPath,

      /**
       * The element's tag name.
       */
      tag: CommentAnchor.fields.tag,

      /**
       * The start of the element's text.
       */
      text: CommentAnchor.fields.text,
    }),
  ),

  /**
   * The element's or region's box on the canvas.
   */
  box: Schema.NullOr(Rect),

  /**
   * The dragged rectangle of a region comment.
   */
  region: Schema.NullOr(Rect),

  /**
   * What the reviewer wrote; not only whitespace.
   */
  text: RequestText,

  /**
   * The kind of comment, or `null`.
   */
  type: Schema.NullOr(CommentType),

  /**
   * The name the reviewer set in the overlay, or `null` to use `DECK_AUTHOR` or git's `user.name`.
   */
  author: Schema.NullOr(CommentResolution.fields.by),
});

/**
 * A new comment as the overlay sends it.
 */
export type NewComment = typeof NewComment.Type;

/**
 * A request to the dev server's `POST /__deck/comments`: add a comment, or change one by id.
 */
export const FeedbackRequest = Schema.Union([
  Schema.Struct({
    /**
     * Adds a comment.
     */
    action: Schema.Literal('add'),

    /**
     * The comment.
     */
    comment: NewComment,
  }),
  Schema.Struct({
    /**
     * Changes a comment's text or type.
     */
    action: Schema.Literal('update'),

    /**
     * The comment id.
     */
    id: CommentId,

    /**
     * The new text.
     */
    text: Schema.optionalKey(RequestText),

    /**
     * The new type, `null` for none.
     */
    type: Schema.optionalKey(Schema.NullOr(CommentType)),
  }),
  Schema.Struct({
    /**
     * Resolves a comment.
     */
    action: Schema.Literal('resolve'),

    /**
     * The comment id.
     */
    id: CommentId,

    /**
     * What was done.
     */
    note: Schema.optionalKey(CommentResolution.fields.note),

    /**
     * Who resolved it, or `null` for the server's author.
     */
    author: Schema.optionalKey(Schema.NullOr(CommentResolution.fields.by)),
  }),
  Schema.Struct({
    /**
     * Opens a resolved comment again.
     */
    action: Schema.Literal('reopen'),

    /**
     * The comment id.
     */
    id: CommentId,
  }),
  Schema.Struct({
    /**
     * Deletes a comment and its screenshot.
     */
    action: Schema.Literal('delete'),

    /**
     * The comment id.
     */
    id: CommentId,
  }),
]);

/**
 * A request to the dev server's `POST /__deck/comments`.
 */
export type FeedbackRequest = typeof FeedbackRequest.Type;
