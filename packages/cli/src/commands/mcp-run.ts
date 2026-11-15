import { readServerInfo } from '@deckster/agent/server-info';
import { Console, Effect } from 'effect';

import { mcpConfig, formatMcpConfig } from '#agent/mcp-config.ts';
import { chooseDeck } from '#choose-deck.ts';
import { cliError } from '#cli-error.ts';
import { EXIT_OK, type Command } from '#command.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { DEFAULT_DECK, Workspace } from '#workspace.ts';

/**
 * Parses the arguments and prints the configuration; succeeds with the process exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runMcp(argv));

/**
 * Reads the running server's file and prints the configuration for it.
 *
 * @param argv - The arguments after `mcp`.
 */
const runMcp = Effect.fn('deck.mcp')(function* (argv: readonly string[]) {
  const { root } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('mcp', argv, {
    json: { type: 'boolean', default: false },
  });
  const deck = (yield* chooseDeck(positionals[0], DEFAULT_DECK)) ?? DEFAULT_DECK;
  const info = yield* readServerInfo(root, deck).pipe(
    Effect.mapError((error) => cliError(error.message)),
  );
  const config = mcpConfig(info);
  yield* values.json ? printJson(config) : Console.log(formatMcpConfig(config));
  return EXIT_OK;
});
