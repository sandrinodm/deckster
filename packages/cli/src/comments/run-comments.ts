import type { DeckBuildError } from '@deckster/vite-plugin';
import type { FileSystem } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';

import {
  buildCommentReport,
  changeComment,
  COMMENT_TYPES,
  commentAuthor,
  pruneComments,
  readDeckFeedback,
  saveNewComment,
  type AgentComment,
  type CommentChange,
  type CommentStatus,
  type CommentType,
  type FeedbackDeck,
  type FeedbackError,
} from '@deckster/comments/node';
import { deckCommand } from '@deckster/engine/command';
import { Effect } from 'effect';
import path from 'node:path';

import { cliError, usageError, type CliError } from '#cli-error.ts';
import { loadCommentDeck } from '#comments/comment-deck.ts';
import { formatCommentReport } from '#comments/format-comments.ts';
import { readPositiveInteger } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * The command name, for usage errors.
 */
const COMMAND = 'comments';

/**
 * Matches a step: a whole number from 0.
 */
const STEP_PATTERN = /^\d+$/;

/**
 * The parsed command line of `deckster comments`, after the first positional.
 */
export type CommentsArgs = {
  /**
   * The positionals after the form's name.
   */
  positionals: readonly string[];

  /**
   * The options.
   */
  values: {
    /**
     * List open comments.
     */
    open: boolean;

    /**
     * List resolved comments.
     */
    resolved: boolean;

    /**
     * List every comment.
     */
    all: boolean;

    /**
     * Only this slide's comments.
     */
    slide?: string | undefined;

    /**
     * The resolution note.
     */
    note?: string | undefined;

    /**
     * The new comment's text.
     */
    text?: string | undefined;

    /**
     * The new comment's line.
     */
    line?: string | undefined;

    /**
     * The new comment's step.
     */
    step?: string | undefined;

    /**
     * The new comment's type.
     */
    type?: string | undefined;
  };
};

/**
 * What a form prints: the JSON for `--json`, else the text.
 */
export type CommentsOutput = {
  /**
   * What `--json` prints.
   */
  json: unknown;

  /**
   * What the terminal shows.
   */
  text: string;
};

/**
 * Every way a form can fail.
 */
type CommentsError = CliError | DeckBuildError;

/**
 * The services a form uses.
 */
type CommentsServices = Workspace | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner;

/**
 * `deckster comments <deck>`: the deck's comments, open ones unless `--resolved` or `--all`.
 *
 * @param deckName - The deck folder name.
 * @param args - The options.
 * @throws CliError in the error channel for a missing deck name, two status flags or an invalid
 *   feedback file; DeckBuildError for a deck that does not load.
 */
export const listComments = Effect.fn('listComments')(function* (
  deckName: string | undefined,
  args: CommentsArgs,
): Effect.fn.Return<CommentsOutput, CommentsError, CommentsServices> {
  const deck = yield* loadDeckArg(deckName, '' + deckCommand() + ' comments hello');
  const status = yield* readStatus(args.values);
  const { root } = yield* Workspace;
  const slide = args.values.slide;
  if (slide !== undefined) {
    yield* checkSlideFilter(deck, slide);
  }

  const filter = slide === undefined ? { status } : { status, slide };
  const report = yield* buildCommentReport(root, deck, filter).pipe(readable);
  return { json: report, text: formatCommentReport(report, status === 'all' ? '' : status) };
});

/**
 * `deckster comments resolve <deck> <id>`: marks a comment resolved.
 *
 * @param args - The deck, the id and `--note`.
 * @throws CliError in the error channel for missing arguments or an unknown id.
 */
export const resolveComment = Effect.fn('resolveComment')(function* (
  args: CommentsArgs,
): Effect.fn.Return<CommentsOutput, CommentsError, CommentsServices> {
  const { deck, id } = yield* readDeckAndId(args, 'resolve');
  const { root } = yield* Workspace;
  const by = yield* commentAuthor(root);
  const change: CommentChange = { action: 'resolve', id, note: args.values.note?.trim() ?? '', by };
  return yield* applyChange(deck, change, `Resolved ${id}`);
});

/**
 * `deckster comments reopen <deck> <id>`: opens a resolved comment again.
 *
 * @param args - The deck and the id.
 * @throws CliError in the error channel for missing arguments or an unknown id.
 */
export const reopenComment = Effect.fn('reopenComment')(function* (
  args: CommentsArgs,
): Effect.fn.Return<CommentsOutput, CommentsError, CommentsServices> {
  const { deck, id } = yield* readDeckAndId(args, 'reopen');
  return yield* applyChange(deck, { action: 'reopen', id }, `Reopened ${id}`);
});

/**
 * `deckster comments add <deck> <slide> --text ...`: adds a comment on a slide, or with `--line` on
 * a line of the slide file.
 *
 * @param args - The deck, the slide, `--text`, `--line`, `--step` and `--type`.
 * @throws CliError in the error channel for missing or invalid arguments, a slide the deck does not
 *   list or a line past the end of the file.
 */
export const addComment = Effect.fn('addComment')(function* (
  args: CommentsArgs,
): Effect.fn.Return<CommentsOutput, CommentsError, CommentsServices> {
  const [deckName, slideId] = args.positionals;
  const text = args.values.text?.trim() ?? '';
  if (deckName === undefined || slideId === undefined || text === '') {
    return yield* usageError(
      'Which deck, slide and text? For example ' +
        '`' +
        deckCommand() +
        ' comments add hello title --text "Shorter title" --line 7`.',
      COMMAND,
    );
  }

  const deck = yield* loadCommentDeck(deckName);
  const slide = deck.slides.find((candidate) => candidate.id === slideId);
  const line = yield* readPositiveInteger(COMMAND, 'line', args.values.line);
  const step = yield* readStep(args.values.step);
  const type = yield* readType(args.values.type);
  const { root } = yield* Workspace;
  const author = yield* commentAuthor(root);
  const source = sourceOf(deck, slide, line);
  const comment = yield* saveNewComment(
    deck,
    {
      slide: slideId,
      step,
      target: source === null ? 'slide' : 'line',
      source,
      anchor: null,
      box: null,
      region: null,
      text,
      type,
      author: null,
    },
    author,
  ).pipe(readable);
  const view = yield* findView(deck, comment.id);
  return {
    json: { ok: true, changed: true, comment: view },
    text: `Added ${comment.id} at ${view.location}`,
  };
});

/**
 * `deckster comments prune <deck>`: removes the comments of slides the deck config does not list.
 *
 * @param args - The deck.
 * @throws CliError in the error channel for a missing deck name or an invalid feedback file.
 */
export const pruneDeckComments = Effect.fn('pruneDeckComments')(function* (
  args: CommentsArgs,
): Effect.fn.Return<CommentsOutput, CommentsError, CommentsServices> {
  const deck = yield* loadDeckArg(
    args.positionals[0],
    '' + deckCommand() + ' comments prune hello',
  );
  const removed = yield* pruneComments(deck).pipe(readable);
  const lines = removed.map(({ slide, comments }) => `Removed ${comments} from ${slide}`);
  return {
    json: { deck: deck.id, removed },
    text:
      lines.length === 0
        ? `${deck.id}: every comment belongs to a slide of the deck.`
        : lines.join('\n'),
  };
});

/**
 * Applies a change to a comment and describes the result.
 *
 * @param deck - The deck.
 * @param change - The change.
 * @param done - What the terminal says, such as `Resolved abcd1234`.
 */
const applyChange = Effect.fn('applyCommentChange')(function* (
  deck: FeedbackDeck,
  change: CommentChange,
  done: string,
): Effect.fn.Return<CommentsOutput, CommentsError, CommentsServices> {
  const { changed } = yield* changeComment(deck, change).pipe(readable);
  const view = yield* findView(deck, change.id);
  const text = changed
    ? `${done} (${view.location})`
    : `${change.id} is already ${view.status}; nothing changed (${view.location}).`;
  return { json: { ok: true, changed, comment: view }, text };
});

/**
 * One comment as the report shows it.
 *
 * @param deck - The deck.
 * @param id - The comment id.
 */
const findView = Effect.fn('findCommentView')(function* (
  deck: FeedbackDeck,
  id: string,
): Effect.fn.Return<AgentComment, CliError, Workspace | FileSystem.FileSystem> {
  const { root } = yield* Workspace;
  const report = yield* buildCommentReport(root, deck, { status: 'all' }).pipe(readable);
  const view = report.comments.find((comment) => comment.id === id);
  if (view === undefined) {
    return yield* cliError(`The comment ${id} was removed while the command ran. Run it again.`);
  }

  return view;
});

/**
 * Checks `--slide`: a slide the deck config lists, or one that still has comments.
 *
 * @param deck - The deck.
 * @param slide - The slide id given.
 * @throws CliError (usage) in the error channel naming the deck's slides when it is neither.
 */
const checkSlideFilter = Effect.fn('checkCommentSlideFilter')(function* (
  deck: FeedbackDeck,
  slide: string,
): Effect.fn.Return<void, CliError, FileSystem.FileSystem> {
  if (deck.slides.some((candidate) => candidate.id === slide)) {
    return;
  }

  const feedback = yield* readDeckFeedback(deck.dir).pipe(readable);
  if (feedback.has(slide)) {
    return;
  }

  return yield* usageError(
    `"${slide}" is not a slide of ${deck.id}. Pass one of: ` +
      `${deck.slides.map((candidate) => candidate.id).join(', ')}.`,
    COMMAND,
  );
});

/**
 * Loads the deck a form names.
 *
 * @param deckName - The deck folder name, if given.
 * @param example - A command line that shows the usage.
 */
const loadDeckArg = Effect.fn('loadCommentDeckArg')(function* (
  deckName: string | undefined,
  example: string,
): Effect.fn.Return<FeedbackDeck, CommentsError, Workspace | FileSystem.FileSystem> {
  if (deckName === undefined) {
    return yield* usageError(`Which deck? For example \`${example}\`.`, COMMAND);
  }

  return yield* loadCommentDeck(deckName);
});

/**
 * Reads the deck and comment id of `resolve` and `reopen`.
 *
 * @param args - The positionals.
 * @param form - `resolve` or `reopen`, for the usage error.
 */
const readDeckAndId = Effect.fn('readCommentDeckAndId')(function* (
  args: CommentsArgs,
  form: string,
): Effect.fn.Return<
  { deck: FeedbackDeck; id: string },
  CommentsError,
  Workspace | FileSystem.FileSystem
> {
  const [deckName, id] = args.positionals;
  if (deckName === undefined || id === undefined) {
    return yield* usageError(
      `Which deck and comment? For example \`${deckCommand()} comments ${form} hello k3x9a2qp\`; ` +
        '`' +
        deckCommand() +
        ' comments hello` lists the ids.',
      COMMAND,
    );
  }

  return { deck: yield* loadCommentDeck(deckName), id };
});

/**
 * The status flag: `--open` (the default), `--resolved` or `--all`.
 *
 * @param values - The options.
 */
const readStatus = Effect.fn('readCommentStatus')(function* (
  values: CommentsArgs['values'],
): Effect.fn.Return<CommentStatus | 'all', CliError> {
  const flags = [values.open && 'open', values.resolved && 'resolved', values.all && 'all'].filter(
    (flag): flag is CommentStatus | 'all' => flag !== false,
  );
  if (flags.length > 1) {
    return yield* usageError('Pass one of --open, --resolved and --all.', COMMAND);
  }

  return flags[0] ?? 'open';
});

/**
 * Reads `--step`: a whole number from 0, default 0.
 *
 * @param value - The raw option value.
 */
const readStep = Effect.fn('readCommentStep')(function* (
  value: string | undefined,
): Effect.fn.Return<number, CliError> {
  if (value === undefined) {
    return 0;
  }

  if (!STEP_PATTERN.test(value)) {
    return yield* usageError(`--step must be a whole number from 0, got "${value}".`, COMMAND);
  }

  return Number(value);
});

/**
 * Reads `--type`: fix, question or idea.
 *
 * @param value - The raw option value.
 */
const readType = Effect.fn('readCommentType')(function* (
  value: string | undefined,
): Effect.fn.Return<CommentType | null, CliError> {
  if (value === undefined) {
    return null;
  }

  const type = COMMENT_TYPES.find((candidate) => candidate === value);
  if (type === undefined) {
    return yield* usageError(
      `--type must be one of ${COMMENT_TYPES.join(', ')}, got "${value}".`,
      COMMAND,
    );
  }

  return type;
});

/**
 * Turns the comment store's errors into CLI errors with the same message.
 *
 * @param effect - A store effect.
 */
function readable<A, R>(effect: Effect.Effect<A, FeedbackError, R>): Effect.Effect<A, CliError, R> {
  return effect.pipe(Effect.mapError((error) => cliError(error.message)));
}

/**
 * Where a comment added with `--line` points: a line of the slide's file, relative to the deck.
 * Null when the slide is not one the deck lists or no line was given, so the comment is about the
 * whole slide.
 *
 * @param deck - The deck.
 * @param slide - The slide the comment names, if the deck lists it.
 * @param line - The line, if given.
 */
function sourceOf(
  deck: FeedbackDeck,
  slide: FeedbackDeck['slides'][number] | undefined,
  line: number | undefined,
): { file: string; line: number; column: number } | null {
  if (slide === undefined || line === undefined) {
    return null;
  }

  return { file: toPosix(path.relative(deck.dir, slide.file)), line, column: 1 };
}

/**
 * A path with forward slashes.
 *
 * @param file - Any path.
 */
function toPosix(file: string): string {
  return file.split(path.sep).join('/');
}
