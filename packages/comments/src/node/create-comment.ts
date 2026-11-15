import { Effect, FileSystem } from 'effect';
import { randomInt } from 'node:crypto';

import type { NewComment } from '#node/comment-request.ts';
import type { FeedbackDeck, FeedbackSlide } from '#node/feedback-deck.ts';

import { MAX_EXCERPT_LENGTH, type Comment, type CommentSource } from '#model/comment-schema.ts';
import { normalizeText } from '#node/anchor-match.ts';
import { readSourceLines } from '#node/feedback-deck.ts';
import { feedbackError, type FeedbackError } from '#node/feedback-error.ts';
import { deckFilePath, relativePath } from '#node/feedback-paths.ts';

/**
 * The letters a comment id is made of.
 */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * The length of a comment id.
 */
const ID_LENGTH = 8;

/**
 * The shortest element text the server searches a slide file for when the element has no stamp.
 */
const MIN_LOOKUP_TEXT = 4;

/**
 * Turns a new comment into a stored one: checks that the slide is in the deck and the source line
 * exists, finds the line of an element only the layout renders (such as a title from frontmatter)
 * by its text, reads the source line the anchor will be matched against later, and adds the id, the
 * timestamps and the open status.
 *
 * @param deck - The deck the comment is for.
 * @param input - The comment as sent.
 * @param options - The author to use when the comment names none, the time, and the ids in use.
 * @returns The comment, ready to store.
 * @throws FeedbackError in the error channel: `missing` for a slide the deck does not list,
 *   `invalid` for a source file outside the deck, one that does not exist, or a line past its end.
 */
export const createComment = Effect.fn('createComment')(function* (
  deck: FeedbackDeck,
  input: NewComment,
  options: { author: string; now: string; takenIds: ReadonlySet<string> },
): Effect.fn.Return<Comment, FeedbackError, FileSystem.FileSystem> {
  const slide = deck.slides.find((candidate) => candidate.id === input.slide);
  if (slide === undefined) {
    const listed = deck.slides.map((candidate) => candidate.id).join(', ');
    return yield* feedbackError(
      'missing',
      `"${input.slide}" is not a slide of ${deck.id}. Comment on one of: ${listed}.`,
    );
  }

  const source = input.source ?? (yield* findByText(deck, slide, input.anchor?.text ?? ''));
  const lineText = source === null ? null : yield* readLineText(deck, source);
  const anchor =
    input.anchor === null
      ? lineAnchor(source, lineText)
      : { ...input.anchor, text: excerpt(input.anchor.text), lineText };
  return {
    id: newCommentId(options.takenIds),
    slide: input.slide,
    step: input.step,
    target: input.target,
    source,
    anchor,
    box: input.box,
    region: input.region,
    text: input.text,
    type: input.type,
    author: input.author ?? options.author,
    createdAt: options.now,
    updatedAt: options.now,
    status: 'open',
    resolution: null,
  };
});

/**
 * A fresh comment id that is not in use.
 *
 * @param taken - The ids the deck uses.
 */
export function newCommentId(taken: ReadonlySet<string>): string {
  for (;;) {
    const id = Array.from(
      { length: ID_LENGTH },
      () => ID_ALPHABET[randomInt(ID_ALPHABET.length)],
    ).join('');
    if (!taken.has(id)) {
      return id;
    }
  }
}

/**
 * The start of an element's text, as the anchor keeps it.
 *
 * @param text - The element's text.
 */
export function excerpt(text: string): string {
  return normalizeText(text).slice(0, MAX_EXCERPT_LENGTH);
}

/**
 * The anchor of a comment on a source line rather than an element (`deck comments add --line`): the
 * line is all there is to match.
 *
 * @param source - The line, or `null`.
 * @param lineText - How it reads now.
 */
function lineAnchor(source: CommentSource | null, lineText: string | null): Comment['anchor'] {
  if (source === null) {
    return null;
  }

  return { stamp: null, cssPath: '', tag: '', text: '', lineText };
}

/**
 * Looks for an unstamped element's text in its slide file, so a title or eyebrow the layout renders
 * from frontmatter resolves to its frontmatter line.
 *
 * @param deck - The deck.
 * @param slide - The slide.
 * @param text - The element's text.
 * @returns The first line that contains the text, or `null`.
 */
const findByText = Effect.fn('findCommentLineByText')(function* (
  deck: FeedbackDeck,
  slide: FeedbackSlide,
  text: string,
): Effect.fn.Return<CommentSource | null, never, FileSystem.FileSystem> {
  const wanted = normalizeText(text);
  const lines = yield* readSourceLines(slide.file);
  if (wanted.length < MIN_LOOKUP_TEXT || lines === undefined) {
    return null;
  }

  const index = lines.findIndex((line) => normalizeText(line).includes(wanted));
  if (index < 0) {
    return null;
  }

  const line = lines[index] ?? '';
  return {
    file: relativePath(deck.dir, slide.file),
    line: index + 1,
    column: line.length - line.trimStart().length + 1,
  };
});

/**
 * The source line a comment points at, checked to be inside the deck and the file.
 *
 * @param deck - The deck.
 * @param source - The location.
 * @returns The line without trailing whitespace.
 */
const readLineText = Effect.fn('readCommentLineText')(function* (
  deck: FeedbackDeck,
  source: CommentSource,
): Effect.fn.Return<string, FeedbackError, FileSystem.FileSystem> {
  const file = deckFilePath(deck.dir, source.file);
  if (file === undefined) {
    return yield* feedbackError('invalid', `"${source.file}" is not inside the deck folder.`);
  }

  const lines = yield* readSourceLines(file);
  if (lines === undefined) {
    return yield* feedbackError('invalid', `"${source.file}" does not exist in ${deck.id}.`);
  }

  const line = lines[source.line - 1];
  if (line === undefined) {
    return yield* feedbackError(
      'invalid',
      `"${source.file}" has ${lines.length} lines, so there is no line ${source.line}.`,
    );
  }

  return line.trimEnd();
});
