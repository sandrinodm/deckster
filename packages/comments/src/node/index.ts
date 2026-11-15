export type {
  AgentComment,
  AnchorStatus,
  CommentCounts,
  CommentReport,
} from '#model/agent-comment.ts';
export { commentMarkdown, commentsMarkdown } from '#model/agent-markdown.ts';
export type { Comment, CommentStatus, CommentType } from '#model/comment-schema.ts';
export { COMMENT_TYPES } from '#model/comment-types.ts';
export {
  changeComment,
  pruneComments,
  saveNewComment,
  type ChangeOutcome,
  type PrunedSlide,
} from '#node/comment-actions.ts';
export { commentAuthor, FALLBACK_AUTHOR } from '#node/comment-author.ts';
export type { CommentChange } from '#node/comment-changes.ts';
export {
  buildCommentReport,
  openCommentCounts,
  openCountsBySlide,
  type CommentFilter,
} from '#node/comment-report.ts';
export type { NewComment } from '#node/comment-request.ts';
export type { FeedbackDeck, FeedbackSlide } from '#node/feedback-deck.ts';
export { FeedbackError } from '#node/feedback-error.ts';
export { FEEDBACK_DIR } from '#node/feedback-paths.ts';
export { readDeckFeedback } from '#node/feedback-store.ts';
