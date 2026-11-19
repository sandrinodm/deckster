import { loadBrand } from '@deckster/brand/node';
import { findDeck, loadDeck } from '@deckster/vite-plugin';
import { Console, Effect } from 'effect';

import { AGENT_ARG_OPTIONS, readAgentFlags } from '#agent/agent-flag-options.ts';
import { chooseInteractiveDeck } from '#chooser/deck-choice.ts';
import { EXIT_OK, type Command } from '#command.ts';
import { parseCommandArgs, readBrandName, readPort } from '#parse-command-args.ts';
import { startDevServer } from '#server/dev-server.ts';
import { awaitShutdown, bindQuitKey, requestShutdown } from '#server/shutdown.ts';
import { Workspace } from '#workspace.ts';

/**
 * Parses the arguments and serves a selected deck, or the interactive chooser, until the process is
 * stopped. The command's scope closes the server and its active session on shutdown.
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
  const { deck } = yield* chooseInteractiveDeck(workspaceRoot, positionals[0], 'dev');
  if (deck !== undefined) {
    yield* loadDeck(workspaceRoot, yield* findDeck(workspaceRoot, deck));
  }

  if (brand !== undefined) {
    yield* loadBrand(workspaceRoot, brand);
  }

  const options = {
    workspaceRoot,
    brand,
    port,
    host: values.host,
    mcp: values.mcp,
    agent,
    printUrls: true,
    command: 'dev',
  };
  if (deck === undefined) {
    if (agent !== undefined) {
      const { resolveAgentSetup } = yield* Effect.promise(() => import('#agent/agent-flags.ts'));
      yield* resolveAgentSetup('dev', agent);
    }

    const { startDeckChooser } = yield* Effect.promise(() => import('#chooser/chooser-server.ts'));
    const { url } = yield* startDeckChooser({
      ...options,
      open: Effect.fn('deck.dev.openSelection')(function* (id, chooser) {
        yield* loadDeck(workspaceRoot, yield* findDeck(workspaceRoot, id));
        const selected = yield* startDevServer({ ...options, deck: id, chooser, port: 0 });
        return {
          url: selected.url,
          ...(selected.sessions === undefined ? {} : { busy: selected.sessions.busy }),
        };
      }),
    });
    yield* bindQuitKey;
    yield* Console.log(`  Deck chooser: ${url}`);
  } else {
    const { server } = yield* startDevServer({ ...options, deck });
    // Vite's default q exits before the command's scoped cleanup runs.
    server.bindCLIShortcuts({
      print: true,
      customShortcuts: [{ key: 'q', description: 'quit', action: () => requestShutdown() }],
    });
  }

  yield* awaitShutdown;
  return EXIT_OK;
});
