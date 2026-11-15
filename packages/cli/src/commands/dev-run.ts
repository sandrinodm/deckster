import { loadBrand } from '@deckster/brand/node';
import { findDeck, loadDeck } from '@deckster/vite-plugin';
import { Effect } from 'effect';

import { AGENT_ARG_OPTIONS, readAgentFlags } from '#agent/agent-flag-options.ts';
import { chooseDeck, defaultDeck } from '#choose-deck.ts';
import { EXIT_OK, type Command } from '#command.ts';
import { parseCommandArgs, readBrandName, readPort } from '#parse-command-args.ts';
import { startDevServer } from '#server/dev-server.ts';
import { awaitShutdown, requestShutdown } from '#server/shutdown.ts';
import { DEFAULT_DECK, Workspace } from '#workspace.ts';

/**
 * Parses the arguments and serves the deck until the process is stopped. The server belongs to the
 * command's scope, so it closes when the command is interrupted (Ctrl+C, SIGTERM, SIGHUP) or the
 * person presses q, and every finalizer runs.
 */
export const run: Command['run'] = Effect.fn('deck.dev')(function* (argv) {
  const { root: workspaceRoot } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('dev', argv, {
    port: { type: 'string' },
    host: { type: 'boolean', default: false },
    brand: { type: 'string' },
    mcp: { type: 'boolean', default: false },
    ...AGENT_ARG_OPTIONS,
  });
  const port = yield* readPort('dev', values.port);
  const brand = yield* readBrandName('dev', values.brand);
  const agent = yield* readAgentFlags('dev', values);
  const deck =
    (yield* chooseDeck(positionals[0], yield* defaultDeck(workspaceRoot))) ?? DEFAULT_DECK;
  yield* loadDeck(workspaceRoot, yield* findDeck(workspaceRoot, deck));
  if (brand !== undefined) {
    // A mistyped --brand fails here with the brands that exist, not later in the browser.
    yield* loadBrand(workspaceRoot, brand);
  }

  const { server } = yield* startDevServer({
    workspaceRoot,
    deck,
    brand,
    port,
    host: values.host,
    mcp: values.mcp,
    agent,
    printUrls: true,
    command: 'dev',
  });
  // q stops through the command's scope, so agent turns are killed and server.json is removed;
  // Vite's own q calls process.exit() first.
  server.bindCLIShortcuts({
    print: true,
    customShortcuts: [{ key: 'q', description: 'quit', action: () => requestShutdown() }],
  });
  yield* awaitShutdown;
  return EXIT_OK;
});
