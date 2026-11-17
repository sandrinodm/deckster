import { deckCommand } from '@deckster/engine/command';
import { Console, Effect } from 'effect';

import { checkDeckName } from '#choose-deck.ts';
import { usageError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK, type Command } from '#command.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { formatReport } from '#lint/format-report.ts';
import { lintDeck } from '#lint/run-lint.ts';
import { parseCommandArgs, readBrandName } from '#parse-command-args.ts';

/**
 * Parses the arguments and runs the command; succeeds with the process exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runLint(argv));

/**
 * Parses the arguments, lints the deck and prints the report.
 *
 * @param argv - The arguments after `lint`.
 */
const runLint = Effect.fn('deck.lint')(function* (argv: readonly string[]) {
  const { values, positionals } = yield* parseCommandArgs('lint', argv, {
    brand: { type: 'string' },
    json: { type: 'boolean', default: false },
  });
  const deck = positionals[0];
  if (deck === undefined) {
    return yield* usageError(
      'Which deck? Name one, for example `' + deckCommand() + ' lint hello`.',
      'lint',
    );
  }

  yield* checkDeckName(deck);
  const brand = yield* readBrandName('lint', values.brand);
  const report = yield* lintDeck({ deck, brand });
  yield* values.json ? printJson(report) : Console.log(formatReport(report));
  return report.ok ? EXIT_OK : EXIT_FAILED;
});
