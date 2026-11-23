import type { CommentReport } from '#model/agent-comment.ts';

/**
 * The dev-server path the comment overlay reads and writes comments through. Only the comments Vite
 * plugin mounts it, and only while serving, so builds, previews and exports have no such endpoint.
 */
export const FEEDBACK_ENDPOINT = '/__deck/comments';

/**
 * The sub-path of {@link FEEDBACK_ENDPOINT} that serves a comment's screenshot: `?id=<comment id>`.
 */
export const SCREENSHOT_PATH = '/screenshot';

/**
 * The custom HMR event the dev server sends when a feedback file changes, so open overlays reload
 * their comments (one resolved with `deckster comments resolve`, say).
 */
export const COMMENTS_CHANGED_EVENT = 'deck:comments-changed';

/**
 * What `GET /__deck/comments` answers: the agent report of every comment, and the author new
 * comments are signed with.
 */
export type FeedbackAnswer = CommentReport & {
  /**
   * The name comments are signed with unless the reviewer sets one: `DECK_AUTHOR`, else git's
   * `user.name`.
   */
  author: string;
};
