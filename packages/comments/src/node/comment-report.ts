import { fileExists } from '@deckster/brand/node';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { Comment, CommentStatus } from '#model/comment-schema.ts';
import type { FeedbackDeck } from '#node/feedback-deck.ts';
import type { FeedbackError } from '#node/feedback-error.ts';

import {
  COMMENT_UNITS,
  type AgentComment,
  type CommentCounts,
  type CommentReport,
} from '#model/agent-comment.ts';
import { matchAnchor } from '#node/anchor-match.ts';
import { readSourceLines } from '#node/feedback-deck.ts';
import { deckFilePath, feedbackFile, relativePath, screenshotFile } from '#node/feedback-paths.ts';
import { readDeckFeedback, type DeckFeedback } from '#node/feedback-store.ts';

/**
 * Lines of source shown above and below the commented line.
 */
const EXCERPT_CONTEXT_LINES = 3;

/**
 * Lines of source shown from the top of the file for a comment on the whole slide.
 */
const SLIDE_EXCERPT_LINES = 12;

/**
 * Which comments a report lists.
 */
export type CommentFilter = {
  /**
   * Comments with this status, or every comment.
   */
  status: CommentStatus | 'all';

  /**
   * Only this slide's comments; every slide's when omitted.
   */
  slide?: string;
};

/**
 * Builds the agent's view of a deck's comments: for each comment, where to edit now (following an
 * anchor that moved), whether the element was found, the source around it and its screenshot, in
 * slide order and then oldest first. Comments on slides the deck config does not list come last,
 * with `slideNumber: null`.
 *
 * @param workspaceRoot - The absolute workspace root; report paths are relative to it.
 * @param deck - The deck and its slides.
 * @param filter - Which comments to list; the counts cover them all.
 * @throws FeedbackError in the error channel for a feedback file that is not valid.
 */
export const buildCommentReport = Effect.fn('buildCommentReport')(function* (
  workspaceRoot: string,
  deck: FeedbackDeck,
  filter: CommentFilter,
): Effect.fn.Return<CommentReport, FeedbackError, FileSystem.FileSystem> {
  const feedback = yield* readDeckFeedback(deck.dir);
  const ordered = orderedComments(deck, feedback);
  const listed = ordered.filter(({ comment }) => passes(comment, filter));
  const comments = yield* Effect.forEach(
    listed,
    ({ comment, number }) => agentComment({ workspaceRoot, deck, comment, number }),
    { concurrency: 1 },
  );
  return {
    deck: deck.id,
    deckDir: relativePath(workspaceRoot, deck.dir),
    units: COMMENT_UNITS,
    counts: countComments(ordered.map(({ comment }) => comment)),
    comments,
  };
});

/**
 * Counts a deck's open comments by slide, for the `open-comments` lint rule. A feedback file that
 * is not valid counts as none: `deck comments` is where it is reported.
 *
 * @param deckDir - The absolute deck folder.
 * @returns Slide id to open comment count; slides without open comments are left out.
 */
export const openCommentCounts = Effect.fn('openCommentCounts')(function* (
  deckDir: string,
): Effect.fn.Return<Record<string, number>, never, FileSystem.FileSystem> {
  const feedback = yield* readDeckFeedback(deckDir).pipe(Effect.orElseSucceed(() => new Map()));
  return openCountsBySlide(feedback);
});

/**
 * Counts open comments by slide.
 *
 * @param feedback - Every comment of the deck.
 * @returns Slide id to open comment count, on an object without a prototype so a slide named
 *   `constructor` never reads an inherited member; slides without open comments are left out.
 */
export function openCountsBySlide(feedback: DeckFeedback): Record<string, number> {
  const counts: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const [slide, comments] of feedback) {
    const open = comments.filter((comment) => comment.status === 'open').length;
    if (open > 0) {
      counts[slide] = open;
    }
  }

  return counts;
}

/**
 * Comments in report order with their pin numbers: the deck's slides in order, then slides it no
 * longer lists.
 *
 * @param deck - The deck.
 * @param feedback - Every comment, by slide.
 */
function orderedComments(
  deck: FeedbackDeck,
  feedback: DeckFeedback,
): { comment: Comment; number: number }[] {
  const listed = deck.slides.map((slide) => slide.id);
  const orphans = [...feedback.keys()].filter((slide) => !listed.includes(slide));
  return [...listed, ...orphans].flatMap((slide) =>
    (feedback.get(slide) ?? []).map((comment, index) => ({ comment, number: index + 1 })),
  );
}

/**
 * Whether a comment passes the filter.
 *
 * @param comment - The comment.
 * @param filter - The filter.
 */
function passes(comment: Comment, filter: CommentFilter): boolean {
  const statusMatches = filter.status === 'all' || comment.status === filter.status;
  return statusMatches && (filter.slide === undefined || comment.slide === filter.slide);
}

/**
 * Open and resolved counts.
 *
 * @param comments - Every comment.
 */
function countComments(comments: readonly Comment[]): CommentCounts {
  const open = comments.filter((comment) => comment.status === 'open').length;
  return { open, resolved: comments.length - open };
}

/**
 * One comment as the agent sees it.
 *
 * @param input - The workspace, the deck, the comment and its pin number.
 */
const agentComment = Effect.fn('agentComment')(function* (input: {
  workspaceRoot: string;
  deck: FeedbackDeck;
  comment: Comment;
  number: number;
}): Effect.fn.Return<AgentComment, never, FileSystem.FileSystem> {
  const { workspaceRoot, deck, comment } = input;
  const slideIndex = deck.slides.findIndex((slide) => slide.id === comment.slide);
  const file = commentFile(deck, comment, slideIndex);
  const lines = yield* readSourceLines(file);
  const match = matchAnchor(comment, comment.source === null ? undefined : lines);
  const shownFile = relativePath(workspaceRoot, file);
  const screenshot = screenshotFile(deck.dir, comment.slide, comment.id);
  const hasScreenshot = screenshot !== undefined && (yield* fileExists(screenshot));
  return {
    id: comment.id,
    number: input.number,
    slide: comment.slide,
    slideNumber: slideIndex < 0 ? null : slideIndex + 1,
    step: comment.step,
    status: comment.status,
    type: comment.type,
    target: comment.target,
    text: comment.text,
    author: comment.author,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    location: match.line === null ? shownFile : `${shownFile}:${match.line}:${match.column ?? 1}`,
    file: shownFile,
    line: match.line,
    column: match.column,
    anchor: {
      status: comment.source === null ? 'none' : match.status,
      originalLine: comment.source?.line ?? null,
      stamp: comment.anchor?.stamp ?? null,
      element: elementOf(comment),
    },
    excerpt: excerptOf(lines, match.line ?? lostLine(match.status, comment, lines)),
    screenshot: hasScreenshot ? relativePath(workspaceRoot, screenshot) : null,
    box: comment.box,
    region: comment.region,
    resolution: comment.resolution,
    hash: `#/${slideIndex < 0 ? 1 : slideIndex + 1}/${comment.step}`,
  };
});

/**
 * The file to edit for a comment: its source file, else the slide's file, else (for a slide the
 * deck config does not list) its feedback file.
 *
 * @param deck - The deck.
 * @param comment - The comment.
 * @param slideIndex - The slide's position, or -1.
 */
function commentFile(deck: FeedbackDeck, comment: Comment, slideIndex: number): string {
  const source = comment.source === null ? undefined : deckFilePath(deck.dir, comment.source.file);
  const slideFile = deck.slides[slideIndex]?.file;
  return (
    source ??
    slideFile ??
    feedbackFile(deck.dir, comment.slide) ??
    path.join(deck.dir, comment.slide)
  );
}

/**
 * The element part of the anchor, or `null` for a comment without one.
 *
 * @param comment - The comment.
 */
function elementOf(comment: Comment): AgentComment['anchor']['element'] {
  const anchor = comment.anchor;
  if (anchor === null || anchor.tag === '') {
    return null;
  }

  return { tag: anchor.tag, text: anchor.text, cssPath: anchor.cssPath };
}

/**
 * Where to show the source of a comment whose anchor is lost: around the line it was made on, kept
 * inside the file; `null` for any other comment without a line.
 *
 * @param status - The anchor status.
 * @param comment - The comment.
 * @param lines - The file's lines, or `undefined`.
 */
function lostLine(
  status: AgentComment['anchor']['status'],
  comment: Comment,
  lines: readonly string[] | undefined,
): number | null {
  if (status !== 'lost' || comment.source === null || lines === undefined) {
    return null;
  }

  return Math.min(comment.source.line, Math.max(lines.length, 1));
}

/**
 * The lines around the commented line, or the top of the file when there is no line.
 *
 * @param lines - The file's lines, or `undefined`.
 * @param line - The 1-based line, or `null`.
 */
function excerptOf(
  lines: readonly string[] | undefined,
  line: number | null,
): AgentComment['excerpt'] {
  if (lines === undefined) {
    return null;
  }

  if (line === null) {
    return { startLine: 1, lines: lines.slice(0, SLIDE_EXCERPT_LINES) };
  }

  const start = Math.max(1, line - EXCERPT_CONTEXT_LINES);
  const end = Math.min(lines.length, line + EXCERPT_CONTEXT_LINES);
  return { startLine: start, lines: lines.slice(start - 1, end) };
}
