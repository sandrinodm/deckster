import { KebabName } from '@deckster/engine/names';
import { Schema } from 'effect';

import { COMMENT_TYPES } from '#model/comment-types.ts';

/**
 * The version written at the top of every feedback file, raised when the format changes.
 */
export const FEEDBACK_VERSION = 1;

/**
 * The longest comment text, in characters.
 */
export const MAX_COMMENT_TEXT = 4000;

/**
 * The longest element text excerpt kept in a locator, in characters.
 */
export const MAX_EXCERPT_LENGTH = 160;

/**
 * The longest CSS path kept in a locator, in characters.
 */
const MAX_CSS_PATH_LENGTH = 1000;

/**
 * The longest author name, resolution note or source line kept, in characters.
 */
const MAX_SHORT_TEXT = 500;

/**
 * The largest coordinate a box may have, in canvas pixels; boxes may hang off the 1920x1080 canvas,
 * but never this far.
 */
const MAX_COORDINATE = 10_000;

/**
 * The highest step a comment may name.
 */
const MAX_STEP = 999;

/**
 * Matches a comment id: eight lowercase letters or digits.
 */
export const COMMENT_ID_PATTERN = /^[a-z0-9]{8}$/;

/**
 * Matches an ISO 8601 timestamp in UTC as `Date.prototype.toISOString` writes it.
 */
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Matches a path segment that climbs out of its folder.
 */
const PARENT_SEGMENT_PATTERN = /(?:^|\/)\.\.(?:\/|$)/;

/**
 * Matches a path inside a deck folder: relative, forward slashes, no empty segments.
 */
const DECK_FILE_PATTERN = /^[\w@.-]+(?:\/[\w@.-]+)*$/;

/**
 * A comment id.
 */
export const CommentId = Schema.String.check(
  Schema.isPattern(COMMENT_ID_PATTERN, {
    message: 'Expected a comment id of eight lowercase letters or digits',
  }),
);

/**
 * What kind of comment it is.
 */
export const CommentType = Schema.Literals(COMMENT_TYPES);

/**
 * What kind of comment it is: `fix` (something is wrong), `question` or `idea`.
 */
export type CommentType = typeof CommentType.Type;

/**
 * Whether the comment still needs work.
 */
export const CommentStatus = Schema.Literals(['open', 'resolved']);

/**
 * Whether the comment still needs work.
 */
export type CommentStatus = typeof CommentStatus.Type;

/**
 * What a comment points at: one `element`, a `region` dragged on the slide, the whole `slide`, or a
 * source `line` (left from the CLI, without a browser).
 */
export const CommentTarget = Schema.Literals(['element', 'region', 'slide', 'line']);

/**
 * What a comment points at.
 */
export type CommentTarget = typeof CommentTarget.Type;

/**
 * A coordinate in canvas pixels.
 */
const Coordinate = Schema.Finite.check(
  Schema.isBetween(
    { minimum: -MAX_COORDINATE, maximum: MAX_COORDINATE },
    { message: `Expected canvas pixels between -${MAX_COORDINATE} and ${MAX_COORDINATE}` },
  ),
);

/**
 * A length in canvas pixels.
 */
const Length = Schema.Finite.check(
  Schema.isBetween(
    { minimum: 0, maximum: MAX_COORDINATE },
    { message: `Expected a size in canvas pixels from 0 to ${MAX_COORDINATE}` },
  ),
);

/**
 * A rectangle in canvas pixels, from the top-left corner of the 1920x1080 canvas.
 */
export const Rect = Schema.Struct({
  /**
   * The left edge.
   */
  x: Coordinate,

  /**
   * The top edge.
   */
  y: Coordinate,

  /**
   * The width.
   */
  width: Length,

  /**
   * The height.
   */
  height: Length,
});

/**
 * A rectangle in canvas pixels.
 */
export type Rect = typeof Rect.Type;

/**
 * A positive whole number, for lines and columns.
 */
const PositiveInt = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1, { message: 'Expected a whole number from 1' }),
);

/**
 * A short piece of text.
 */
const ShortText = Schema.String.check(
  Schema.isMaxLength(MAX_SHORT_TEXT, { message: `Expected at most ${MAX_SHORT_TEXT} characters` }),
);

/**
 * A file inside the deck folder, relative to it; a path that leaves the folder is rejected.
 */
export const DeckFile = Schema.String.check(
  Schema.isPattern(DECK_FILE_PATTERN, {
    message: 'Expected a path relative to the deck folder, such as "slides/intro.mdx"',
  }),
  Schema.makeFilter((file: string) => !PARENT_SEGMENT_PATTERN.test(file), {
    message: 'Expected a path inside the deck folder, without ".." segments',
  }),
);

/**
 * A place in the deck's source.
 */
export const CommentSource = Schema.Struct({
  /**
   * The file relative to the deck folder, such as `slides/intro.mdx`.
   */
  file: DeckFile,

  /**
   * The 1-based line.
   */
  line: PositiveInt,

  /**
   * The 1-based column.
   */
  column: PositiveInt,
});

/**
 * A place in the deck's source.
 */
export type CommentSource = typeof CommentSource.Type;

/**
 * How to find the commented element again after the slide changes: its source stamp, a CSS path
 * inside the slide, its tag and text, and the source line as it read when the comment was made.
 */
export const CommentAnchor = Schema.Struct({
  /**
   * The source stamp the element resolved to, `file:line:column`, or `null` for an element only a
   * layout renders (such as a title from frontmatter).
   */
  stamp: Schema.NullOr(ShortText),

  /**
   * A CSS path from the slide's `<section>` to the element.
   */
  cssPath: Schema.String.check(Schema.isMaxLength(MAX_CSS_PATH_LENGTH)),

  /**
   * The element's tag name, lowercase.
   */
  tag: ShortText,

  /**
   * The start of the element's text, whitespace collapsed.
   */
  text: Schema.String.check(Schema.isMaxLength(MAX_EXCERPT_LENGTH)),

  /**
   * The source line at the stamp when the comment was made, trimmed, so a later edit can be told
   * from a move; `null` when there was no line to read.
   */
  lineText: Schema.NullOr(ShortText),
});

/**
 * How to find the commented element again.
 */
export type CommentAnchor = typeof CommentAnchor.Type;

/**
 * Who closed a comment, when, and how.
 */
export const CommentResolution = Schema.Struct({
  /**
   * What was done, or an empty string.
   */
  note: ShortText,

  /**
   * Who resolved it.
   */
  by: ShortText,

  /**
   * When it was resolved.
   */
  at: Schema.String.check(Schema.isPattern(TIMESTAMP_PATTERN)),
});

/**
 * Who closed a comment, when, and how.
 */
export type CommentResolution = typeof CommentResolution.Type;

/**
 * A timestamp, as `toISOString` writes it.
 */
const Timestamp = Schema.String.check(
  Schema.isPattern(TIMESTAMP_PATTERN, { message: 'Expected an ISO timestamp in UTC' }),
);

/**
 * One comment, as a feedback file stores it.
 */
export const Comment = Schema.Struct({
  /**
   * Unique within the deck.
   */
  id: CommentId,

  /**
   * The slide id.
   */
  slide: KebabName('slide id'),

  /**
   * The step the reviewer was on, from 0.
   */
  step: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: MAX_STEP })),

  /**
   * What the comment points at.
   */
  target: CommentTarget,

  /**
   * Where to edit, or `null` for a comment on the whole slide or a region with no stamped element.
   */
  source: Schema.NullOr(CommentSource),

  /**
   * How to find the element again, or `null` when the comment is not about an element.
   */
  anchor: Schema.NullOr(CommentAnchor),

  /**
   * The element's (or region's) bounding box on the canvas when the comment was made.
   */
  box: Schema.NullOr(Rect),

  /**
   * The dragged rectangle of a region comment.
   */
  region: Schema.NullOr(Rect),

  /**
   * What the reviewer wrote.
   */
  text: Schema.String.check(
    Schema.isMinLength(1, { message: 'Expected some comment text' }),
    Schema.isMaxLength(MAX_COMMENT_TEXT, {
      message: `Expected at most ${MAX_COMMENT_TEXT} characters`,
    }),
  ),

  /**
   * The kind of comment, or `null`.
   */
  type: Schema.NullOr(CommentType),

  /**
   * Who wrote it.
   */
  author: ShortText,

  /**
   * When it was written.
   */
  createdAt: Timestamp,

  /**
   * When its text, type or status last changed.
   */
  updatedAt: Timestamp,

  /**
   * Whether it still needs work.
   */
  status: CommentStatus,

  /**
   * How it was resolved, or `null` while open.
   */
  resolution: Schema.NullOr(CommentResolution),
});

/**
 * One comment, as a feedback file stores it.
 */
export type Comment = typeof Comment.Type;

/**
 * A feedback file, `decks/<deck>/.feedback/<slide-id>.json`: one slide's comments.
 */
export const FeedbackFile = Schema.Struct({
  /**
   * The format version, {@link FEEDBACK_VERSION}.
   */
  version: Schema.Literal(FEEDBACK_VERSION),

  /**
   * The slide id, the same as the file name.
   */
  slide: KebabName('slide id'),

  /**
   * The slide's comments, oldest first.
   */
  comments: Schema.Array(Comment),
});

/**
 * A feedback file's contents.
 */
export type FeedbackFile = typeof FeedbackFile.Type;
