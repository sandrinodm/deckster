import type { Comment, CommentType } from '#model/comment-schema.ts';

/**
 * A change to one existing comment, found by id.
 */
export type CommentChange =
  | {
      /**
       * Changes the text, the type or both.
       */
      action: 'update';

      /**
       * The comment id.
       */
      id: string;

      /**
       * The new text; unchanged when omitted.
       */
      text?: string;

      /**
       * The new type, `null` for none; unchanged when omitted.
       */
      type?: CommentType | null;
    }
  | {
      /**
       * Marks it resolved.
       */
      action: 'resolve';

      /**
       * The comment id.
       */
      id: string;

      /**
       * What was done; may be empty.
       */
      note: string;

      /**
       * Who resolved it.
       */
      by: string;
    }
  | {
      /**
       * Opens a resolved comment again and drops its resolution.
       */
      action: 'reopen';

      /**
       * The comment id.
       */
      id: string;
    }
  | {
      /**
       * Removes it.
       */
      action: 'delete';

      /**
       * The comment id.
       */
      id: string;
    };

/**
 * The comments after a change, and the comment as it now is (`undefined` once deleted).
 */
export type ChangeResult = {
  /**
   * Every comment of the slide, oldest first; the same array when nothing changed.
   */
  comments: readonly Comment[];

  /**
   * The changed comment; `undefined` for a delete.
   */
  comment: Comment | undefined;

  /**
   * `false` when the comment was already in the state the change asks for (resolving a resolved
   * comment, reopening an open one), which then changes nothing: not the note, not the time.
   */
  changed: boolean;
};

/**
 * Puts comments in their stored order: oldest first, ties by id, so a file written twice from the
 * same comments is byte for byte the same.
 *
 * @param comments - Comments in any order.
 */
export function sortComments(comments: readonly Comment[]): Comment[] {
  return [...comments].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/**
 * Adds a comment to a slide's comments, replacing one with the same id.
 *
 * @param comments - The slide's comments as they are on disk now.
 * @param comment - The new comment.
 */
export function addComment(comments: readonly Comment[], comment: Comment): Comment[] {
  return sortComments([...comments.filter((existing) => existing.id !== comment.id), comment]);
}

/**
 * Applies a change to the comments as they are on disk now, so changes from different writers merge
 * instead of overwriting each other.
 *
 * @param comments - The slide's comments, freshly read.
 * @param change - The change.
 * @param now - The time of the change, ISO 8601.
 * @returns The result, or `undefined` when no comment has the id.
 */
export function applyChange(
  comments: readonly Comment[],
  change: CommentChange,
  now: string,
): ChangeResult | undefined {
  const current = comments.find((comment) => comment.id === change.id);
  if (current === undefined) {
    return undefined;
  }

  if (change.action === 'delete') {
    return {
      comments: comments.filter((comment) => comment !== current),
      comment: undefined,
      changed: true,
    };
  }

  if (isAlready(current, change)) {
    return { comments, comment: current, changed: false };
  }

  const changed = changedComment(current, change, now);
  const next = comments.map((comment) => (comment === current ? changed : comment));
  return { comments: next, comment: changed, changed: true };
}

/**
 * Whether a resolve or reopen asks for the state the comment is in already.
 *
 * @param comment - The comment as it is.
 * @param change - The change.
 */
export function isAlready(comment: Comment, change: CommentChange): boolean {
  return (
    (change.action === 'resolve' && comment.status === 'resolved') ||
    (change.action === 'reopen' && comment.status === 'open')
  );
}

/**
 * One comment after an update, resolve or reopen.
 *
 * @param comment - The comment as it is.
 * @param change - The change.
 * @param now - The time of the change.
 */
function changedComment(
  comment: Comment,
  change: Exclude<CommentChange, { action: 'delete' }>,
  now: string,
): Comment {
  switch (change.action) {
    case 'update':
      return {
        ...comment,
        text: change.text ?? comment.text,
        type: change.type === undefined ? comment.type : change.type,
        updatedAt: now,
      };
    case 'resolve':
      return {
        ...comment,
        status: 'resolved',
        resolution: { note: change.note, by: change.by, at: now },
        updatedAt: now,
      };
    case 'reopen':
      return { ...comment, status: 'open', resolution: null, updatedAt: now };
  }
}
