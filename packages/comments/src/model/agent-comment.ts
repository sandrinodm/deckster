import type {
  CommentResolution,
  CommentStatus,
  CommentTarget,
  CommentType,
  Rect,
} from '#model/comment-schema.ts';

/**
 * Whether the commented element is still where the comment says, judged from the source: `ok` (the
 * line still reads as it did), `moved` (the same line or text is found elsewhere; `line` is the new
 * place), `guessed` (the line was reworded: `line` is the nearby line of the same kind that shares
 * most of its words; check the excerpt), `lost` (nothing matches: `line` is `null` and `location`
 * names only the file; read the excerpt around `originalLine` and the screenshot) or `none` (the
 * comment is not about an element: a whole slide, or a region without one).
 */
export type AnchorStatus = 'ok' | 'moved' | 'guessed' | 'lost' | 'none';

/**
 * One comment as `deck comments --json` prints it and the overlay receives it: everything an agent
 * needs to make the change without opening the browser.
 */
export type AgentComment = {
  /**
   * The comment id, for `deck comments resolve <deck> <id>`.
   */
  id: string;

  /**
   * The pin number on its slide: 1 for the slide's oldest comment.
   */
  number: number;

  /**
   * The slide id.
   */
  slide: string;

  /**
   * The slide's 1-based position in the deck, or `null` when the deck config does not list it.
   */
  slideNumber: number | null;

  /**
   * The step the reviewer was on, from 0.
   */
  step: number;

  /**
   * Whether it still needs work.
   */
  status: CommentStatus;

  /**
   * `fix`, `question`, `idea`, or `null`.
   */
  type: CommentType | null;

  /**
   * What the comment points at: `element`, `region`, `slide` or `line`.
   */
  target: CommentTarget;

  /**
   * What the reviewer wrote.
   */
  text: string;

  /**
   * Who wrote it.
   */
  author: string;

  /**
   * When it was written, ISO 8601.
   */
  createdAt: string;

  /**
   * When it last changed, ISO 8601.
   */
  updatedAt: string;

  /**
   * Where to edit, relative to the workspace: `file:line:column`, or just the file for a comment on
   * the whole slide or one whose anchor is `lost`.
   */
  location: string;

  /**
   * The file to edit, relative to the workspace.
   */
  file: string;

  /**
   * The line to edit now (after following a moved or guessed anchor), or `null` for a comment on
   * the whole slide or one whose anchor is `lost`.
   */
  line: number | null;

  /**
   * The column of the element's tag, or `null`.
   */
  column: number | null;

  /**
   * Whether the element was found again, where it was, and what it looked like.
   */
  anchor: {
    /**
     * See {@link AnchorStatus}.
     */
    status: AnchorStatus;

    /**
     * The line the comment was made on, or `null`.
     */
    originalLine: number | null;

    /**
     * The source stamp the element had, relative to the deck folder, or `null`.
     */
    stamp: string | null;

    /**
     * The element: tag, text excerpt and CSS path in the slide, or `null`.
     */
    element: { tag: string; text: string; cssPath: string } | null;
  };

  /**
   * The source around `line` (around the original line for a lost anchor, else the top of the
   * file), so the change can be planned from the report alone; `null` when the file cannot be
   * read.
   */
  excerpt: { startLine: number; lines: readonly string[] } | null;

  /**
   * A PNG of the element with some context, relative to the workspace, or `null` when none was
   * captured.
   */
  screenshot: string | null;

  /**
   * The element's box when the comment was made, in canvas pixels of the 1920x1080 slide (origin
   * top left), whatever size the browser window had; see {@link CommentReport.units}.
   */
  box: Rect | null;

  /**
   * The dragged rectangle of a region comment, in the same canvas pixels as `box`.
   */
  region: Rect | null;

  /**
   * How it was resolved, or `null` while open.
   */
  resolution: CommentResolution | null;

  /**
   * The URL hash that shows the slide at the comment's step, such as `#/3/1`.
   */
  hash: string;
};

/**
 * Comment counts by status.
 */
export type CommentCounts = {
  /**
   * Comments that still need work.
   */
  open: number;

  /**
   * Comments that were resolved.
   */
  resolved: number;
};

/**
 * The units of comment boxes: pixels of the slide's 1920x1080 canvas, never screen pixels.
 */
export type CommentUnits = {
  /**
   * Always `canvas-px`: `x`, `y`, `width` and `height` of `box` and `region` are canvas pixels.
   */
  box: 'canvas-px';

  /**
   * The canvas width the boxes are measured against, 1920.
   */
  canvasWidth: number;

  /**
   * The canvas height the boxes are measured against, 1080.
   */
  canvasHeight: number;
};

/**
 * The units every report states.
 */
export const COMMENT_UNITS: CommentUnits = {
  /**
   * Boxes are canvas pixels.
   */
  box: 'canvas-px',

  /**
   * The canvas width.
   */
  canvasWidth: 1920,

  /**
   * The canvas height.
   */
  canvasHeight: 1080,
};

/**
 * What `deck comments <deck> --json` prints and the dev server's `GET /__deck/comments` answers.
 */
export type CommentReport = {
  /**
   * The deck folder name.
   */
  deck: string;

  /**
   * The deck folder, relative to the workspace, such as `decks/hello`.
   */
  deckDir: string;

  /**
   * What the comments' `box` and `region` are measured in.
   */
  units: CommentUnits;

  /**
   * Counts over every comment of the deck, whatever the filter.
   */
  counts: CommentCounts;

  /**
   * The comments that pass the filter, in slide order, then oldest first.
   */
  comments: readonly AgentComment[];
};
