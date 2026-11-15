/**
 * The kinds of comment a reviewer can pick: `fix` (something is wrong), `question` or `idea`. A
 * comment may also have none. Kept apart from the schema so the browser overlay can list them
 * without loading Effect.
 */
export const COMMENT_TYPES = ['fix', 'question', 'idea'] as const;
