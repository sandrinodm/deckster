import { findDeck } from '@deckster/vite-plugin';
import { Effect } from 'effect';

import { chooseDeck } from '#choose-deck.ts';
import { EXIT_OK, type Command } from '#command.ts';
import { parseCommandArgs, readPort } from '#parse-command-args.ts';
import { startPreviewServer } from '#server/preview-server.ts';
import { awaitShutdown } from '#server/shutdown.ts';
import { DEFAULT_DECK, Workspace } from '#workspace.ts';

/**
 * Parses the arguments and serves the build until the process is stopped. The server belongs to the
 * command's scope, so it closes when the command is interrupted (Ctrl+C).
 */
export const run: Command['run'] = Effect.fn('deck.preview')(function* (argv) {
  const { root: workspaceRoot } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('preview', argv, {
    port: { type: 'string' },
    host: { type: 'boolean', default: false },
  });
  const port = yield* readPort('preview', values.port);
  const name = (yield* chooseDeck(positionals[0], DEFAULT_DECK)) ?? DEFAULT_DECK;
  const deck = yield* findDeck(workspaceRoot, name);
  const server = yield* startPreviewServer({
    workspaceRoot,
    deck: deck.id,
    port,
    host: values.host,
  });
  server.printUrls();
  yield* awaitShutdown;
  return EXIT_OK;
});
