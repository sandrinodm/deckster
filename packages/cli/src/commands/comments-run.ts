import * as NodeServices from '@effect/platform-node/NodeServices';
import { Console, Effect } from 'effect';

import { EXIT_OK, type Command } from '#command.ts';
import {
  addComment,
  listComments,
  pruneDeckComments,
  reopenComment,
  resolveComment,
  type CommentsArgs,
} from '#comments/run-comments.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { parseCommandArgs } from '#parse-command-args.ts';

/**
 * The options every form of the command takes; each form reads the ones it needs.
 */
const OPTIONS = {
  /**
   * List open comments, the default.
   */
  open: { type: 'boolean', default: false },

  /**
   * List resolved comments.
   */
  resolved: { type: 'boolean', default: false },

  /**
   * List every comment.
   */
  all: { type: 'boolean', default: false },

  /**
   * Only one slide's comments.
   */
  slide: { type: 'string' },

  /**
   * What changed, for resolve.
   */
  note: { type: 'string' },

  /**
   * The comment, for add.
   */
  text: { type: 'string' },

  /**
   * The slide file's line, for add.
   */
  line: { type: 'string' },

  /**
   * The step, for add.
   */
  step: { type: 'string' },

  /**
   * Fix, question or idea, for add.
   */
  type: { type: 'string' },

  /**
   * Print JSON.
   */
  json: { type: 'boolean', default: false },
} as const;

/**
 * Parses the arguments and runs the command; succeeds with the process exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runComments(argv));

/**
 * Parses the arguments, runs one form of the command and prints its result.
 *
 * @param argv - The arguments after `comments`.
 */
const runComments = Effect.fn('deck.comments')(function* (argv: readonly string[]) {
  const { values, positionals } = yield* parseCommandArgs('comments', argv, OPTIONS);
  const [first, ...rest] = positionals;
  const args: CommentsArgs = { values, positionals: rest };
  const output = yield* runForm(first, args).pipe(Effect.provide(NodeServices.layer));
  yield* values.json ? printJson(output.json) : Console.log(output.text);
  return EXIT_OK;
});

/**
 * Runs the form the first positional names; anything else is a deck to list.
 *
 * @param first - `resolve`, `reopen`, `add`, `prune` or a deck name.
 * @param args - The other positionals and the options.
 */
function runForm(first: string | undefined, args: CommentsArgs): ReturnType<typeof listComments> {
  switch (first) {
    case 'resolve':
      return resolveComment(args);
    case 'reopen':
      return reopenComment(args);
    case 'add':
      return addComment(args);
    case 'prune':
      return pruneDeckComments(args);
    case undefined:
    default:
      return listComments(first, args);
  }
}
