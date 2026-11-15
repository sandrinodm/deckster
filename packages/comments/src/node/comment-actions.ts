import { Effect, FileSystem } from 'effect';

import type { Comment } from '#model/comment-schema.ts';
import type { NewComment } from '#node/comment-request.ts';
import type { FeedbackDeck } from '#node/feedback-deck.ts';

import { addComment, applyChange, type CommentChange } from '#node/comment-changes.ts';
import { createComment } from '#node/create-comment.ts';
import { feedbackError, type FeedbackError } from '#node/feedback-error.ts';
import {
  findComment,
  readDeckFeedback,
  removeScreenshot,
  removeSlideFeedback,
  updateSlideFeedback,
} from '#node/feedback-store.ts';

/**
 * What `prune` removed for one slide.
 */
export type PrunedSlide = {
  /**
   * The slide id the deck config does not list.
   */
  slide: string;

  /**
   * How many comments its feedback file held.
   */
  comments: number;
};

/**
 * Stores a new comment in its slide's feedback file.
 *
 * @param deck - The deck.
 * @param input - The comment as the overlay or the CLI sent it.
 * @param author - The author to use when the comment names none.
 * @returns The stored comment, with its id.
 * @throws FeedbackError in the error channel for a slide the deck does not list, a bad source
 *   location, an invalid feedback file or a failed write.
 */
export const saveNewComment = Effect.fn('saveNewComment')(function* (
  deck: FeedbackDeck,
  input: NewComment,
  author: string,
): Effect.fn.Return<Comment, FeedbackError, FileSystem.FileSystem> {
  const feedback = yield* readDeckFeedback(deck.dir);
  const takenIds = new Set([...feedback.values()].flat().map((comment) => comment.id));
  const comment = yield* createComment(deck, input, {
    author,
    now: new Date().toISOString(),
    takenIds,
  });
  return yield* updateSlideFeedback(deck.dir, comment.slide, (comments) =>
    Effect.succeed({ comments: addComment(comments, comment), result: comment }),
  );
});

/**
 * What a change did: the comment as it now is (`undefined` once deleted), and whether anything
 * changed.
 */
export type ChangeOutcome = {
  /**
   * The comment as it now is; `undefined` after a delete.
   */
  comment: Comment | undefined;

  /**
   * `false` when the comment was already resolved (for a resolve) or open (for a reopen); the file
   * is then left as it was.
   */
  changed: boolean;
};

/**
 * Updates, resolves, reopens or deletes a comment by id. A deleted comment's screenshot goes too.
 * Resolving a resolved comment or reopening an open one changes nothing, so a second resolve never
 * overwrites the first note.
 *
 * @param deck - The deck.
 * @param change - The change.
 * @returns The comment as it now is, and whether it changed.
 * @throws FeedbackError (`missing`) in the error channel when no comment has the id, and for an
 *   invalid feedback file or a failed write.
 */
export const changeComment = Effect.fn('changeComment')(function* (
  deck: FeedbackDeck,
  change: CommentChange,
): Effect.fn.Return<ChangeOutcome, FeedbackError, FileSystem.FileSystem> {
  const { slide } = yield* findComment(deck.dir, change.id);
  const now = new Date().toISOString();
  const outcome = yield* updateSlideFeedback(deck.dir, slide, (comments) => {
    const result = applyChange(comments, change, now);
    return result === undefined
      ? Effect.fail(feedbackError('missing', `The comment "${change.id}" was just deleted.`))
      : Effect.succeed({
          comments: result.comments,
          result: { comment: result.comment, changed: result.changed },
        });
  });
  if (change.action === 'delete') {
    yield* removeScreenshot(deck.dir, slide, change.id);
  }

  return outcome;
});

/**
 * Removes the feedback of slides the deck config does not list, screenshots included.
 *
 * @param deck - The deck.
 * @returns What was removed, by slide.
 * @throws FeedbackError in the error channel for an invalid feedback file or a failed removal.
 */
export const pruneComments = Effect.fn('pruneComments')(function* (
  deck: FeedbackDeck,
): Effect.fn.Return<PrunedSlide[], FeedbackError, FileSystem.FileSystem> {
  const feedback = yield* readDeckFeedback(deck.dir);
  const listed = new Set(deck.slides.map((slide) => slide.id));
  const orphans = [...feedback].filter(([slide]) => !listed.has(slide));
  yield* Effect.forEach(orphans, ([slide]) => removeSlideFeedback(deck.dir, slide), {
    concurrency: 1,
  });
  return orphans.map(([slide, comments]) => ({ slide, comments: comments.length }));
});
