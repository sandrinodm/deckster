import type { DeckLocation } from '@deckster/vite-plugin';
import type { Scope } from 'effect';

import { DEFAULT_BRAND, DEFAULT_SURFACE } from '@deckster/brand';
import { MAX_TARGET_TITLE, type ShellDisplay } from '@deckster/shell/protocol';
import { Console, Effect } from 'effect';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import type { ChooserLink } from '#chooser/chooser-link.ts';
import type { ChooserDeck } from '#chooser/chooser-selection.ts';
import type { AgentFlags } from '#server/dev-server.ts';

import { AGENT_ARG_OPTIONS, readAgentFlags } from '#agent/agent-flag-options.ts';
import { chooseInteractiveDeck } from '#chooser/deck-choice.ts';
import { cliError, usageError, type CliError } from '#cli-error.ts';
import { EXIT_OK, type Command, type CommandError, type CommandServices } from '#command.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { parseCommandArgs, readBrandName, readPort } from '#parse-command-args.ts';
import { BrowserOpener } from '#present/browser-fallback.ts';
import { DEFAULT_START_TIMEOUT, DeckShell, type StartedShell } from '#present/deck-shell.ts';
import { describeDisplays, planWindows, type PlanFlags } from '#present/window-plan.ts';
import { findRunningDevServers, runningDevServerWarning } from '#server/dev-registry.ts';
import { awaitShutdown, bindQuitKey } from '#server/shutdown.ts';
import { Workspace } from '#workspace.ts';

/**
 * The bytes of randomness in the window's one-time code (32 characters in base64url).
 */
const AGENT_CODE_BYTES = 24;

/**
 * The window background when the brand's default surface has no background role.
 */
const FALLBACK_BACKGROUND_COLOR = '#000000';

/**
 * The port that asks the operating system for a free one: nobody types a presentation's URL, so a
 * random port never meets a dev server or another Vite app.
 */
const ANY_FREE_PORT = 0;

/**
 * Digits only: the value of `--presenter` when it is followed by a display index.
 */
const DISPLAY_NUMBER_PATTERN = /^\d+$/;

/**
 * The lowest UTF-16 code unit that starts a surrogate pair.
 */
const HIGH_SURROGATE_MIN = 0xd8_00;

/**
 * The highest UTF-16 code unit that starts a surrogate pair.
 */
const HIGH_SURROGATE_MAX = 0xdb_ff;

/**
 * The modules that serve the deck, imported once the shell is spawned: they take over a second to
 * load, which Electron spends booting. Only what the mode needs: the build and preview code with
 * `--built`, the turn summaries with `--agent`.
 */
type PresentModules = {
  /**
   * The plugin: finding and loading the deck.
   */
  plugin: typeof import('@deckster/vite-plugin');

  /**
   * The brand loader.
   */
  brandNode: typeof import('@deckster/brand/node');

  /**
   * How the deck is served.
   */
  serving:
    | {
        /**
         * The dev server.
         */
        kind: 'dev';

        /**
         * The dev server's module.
         */
        devServer: typeof import('#server/dev-server.ts');

        /**
         * The summaries of agent turns, loaded with `--agent`.
         */
        turnSummaries: typeof import('#agent/turn-summaries.ts') | undefined;
      }
    | {
        /**
         * The static build behind the preview server.
         */
        kind: 'built';

        /**
         * The preview server's module.
         */
        previewServer: typeof import('#server/preview-server.ts');

        /**
         * The build's module.
         */
        buildDeck: typeof import('#site/build-deck.ts');
      };
};

/**
 * Imports the heavy modules `deckster present` needs to serve a deck.
 *
 * @param built - Whether the static build is served.
 * @param withAgent - Whether `--agent` is given.
 * @throws CliError in the error channel when one does not load.
 */
const loadPresentModules = Effect.fn('deck.present.load')(function* (
  built: boolean,
  withAgent: boolean,
): Effect.fn.Return<PresentModules, CliError> {
  return yield* Effect.tryPromise({
    try: async (): Promise<PresentModules> => {
      const [plugin, brandNode] = await Promise.all([
        import('@deckster/vite-plugin'),
        import('@deckster/brand/node'),
      ]);
      if (built) {
        const [previewServer, buildDeck] = await Promise.all([
          import('#server/preview-server.ts'),
          import('#site/build-deck.ts'),
        ]);
        return { plugin, brandNode, serving: { kind: 'built', previewServer, buildDeck } };
      }

      const [devServer, turnSummaries] = await Promise.all([
        import('#server/dev-server.ts'),
        withAgent ? import('#agent/turn-summaries.ts') : undefined,
      ]);
      return { plugin, brandNode, serving: { kind: 'dev', devServer, turnSummaries } };
    },
    catch: (cause) =>
      cliError(
        `Could not load the presenting code: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
  });
});

/**
 * The plain listing `--list-displays` prints: one display per line, or a note when there is none.
 *
 * @param displays - The displays the shell reported.
 */
function describeDisplayList(displays: readonly ShellDisplay[]): string {
  if (displays.length === 0) {
    return 'No display is connected.';
  }

  return describeDisplays(displays).replaceAll('; ', '\n');
}

/**
 * The deck's title as the shell accepts it: the protocol refuses a title over its limit, which a
 * deck config does not have, so a longer one is cut (the window title only), never inside a
 * surrogate pair, so an emoji at the cut is dropped whole rather than shown as a broken glyph.
 *
 * @param title - The deck's title.
 */
export function clampShellTitle(title: string): string {
  if (title.length <= MAX_TARGET_TITLE) {
    return title;
  }

  const cut = title.slice(0, MAX_TARGET_TITLE);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= HIGH_SURROGATE_MIN && last <= HIGH_SURROGATE_MAX ? cut.slice(0, -1) : cut;
}

/**
 * Turns `--presenter 2` and `--presenter=2` into the internal `--presenter-display` option, so the
 * flag can stand alone or take a display: `parseArgs` has no optional values.
 *
 * @param argv - The arguments after `present`.
 */
export function splitPresenterFlag(argv: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const next = argv[index + 1];
    if (arg === '--presenter' && next !== undefined && DISPLAY_NUMBER_PATTERN.test(next)) {
      result.push('--presenter', `--presenter-display=${next}`);
      index += 1;
    } else if (arg.startsWith('--presenter=')) {
      result.push('--presenter', `--presenter-display=${arg.slice('--presenter='.length)}`);
    } else {
      result.push(arg);
    }
  }

  return result;
}

/**
 * Reads a display index: a non-negative integer.
 *
 * @param name - The option name without dashes.
 * @param value - The raw value.
 * @returns The index, or `undefined` when not given.
 */
const readDisplayIndex = Effect.fn('readDisplayIndex')(function* (
  name: string,
  value: string | undefined,
): Effect.fn.Return<number | undefined, CliError> {
  if (value === undefined) {
    return undefined;
  }

  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) {
    return yield* usageError(
      `--${name} must be a display index such as 0 or 1 (see --list-displays), got "${value}".`,
      'present',
    );
  }

  return index;
});

/**
 * Parses the arguments, serves the deck and opens the window, then runs until the window closes or
 * the command is interrupted. The server and the window belong to the command's scope; the window
 * closes first, then the server.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runPresent(argv));

/**
 * The body of `deckster present`.
 *
 * @param argv - The arguments after `present`.
 */
const runPresent = Effect.fn('deck.present')(function* (
  argv: readonly string[],
): Effect.fn.Return<number, CommandError, CommandServices> {
  const { root: workspaceRoot } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('present', splitPresenterFlag(argv), {
    brand: { type: 'string' },
    port: { type: 'string' },
    built: { type: 'boolean', default: false },
    fullscreen: { type: 'boolean', default: false },
    display: { type: 'string' },
    presenter: { type: 'boolean', default: false },
    'presenter-display': { type: 'string' },
    kiosk: { type: 'boolean', default: false },
    browser: { type: 'boolean', default: false },
    'list-displays': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
    ...AGENT_ARG_OPTIONS,
  });
  const port = yield* readPort('present', values.port);
  const brand = yield* readBrandName('present', values.brand);
  const display = yield* readDisplayIndex('display', values.display);
  const presenterDisplay = yield* readDisplayIndex('presenter', values['presenter-display']);
  const agent = yield* readAgentFlags('present', values);
  const shell = yield* DeckShell;
  if (values['list-displays']) {
    const others = Object.entries(values).filter(
      ([name, value]) =>
        !['list-displays', 'json'].includes(name) && value !== undefined && value !== false,
    );
    if (others.length > 0 || positionals.length > 0) {
      const leftOut = [...positionals, ...others.map(([name]) => `--${name}`)].join(', ');
      return yield* usageError(
        `--list-displays prints the displays and exits: leave out ${leftOut}.`,
        'present',
      );
    }

    const displays = yield* shell.listDisplays(DEFAULT_START_TIMEOUT);
    yield* values.json
      ? printJson({
          ok: true,
          displays: displays.map((found, index) => ({ index, ...found })),
        })
      : Console.log(describeDisplayList(displays));
    return EXIT_OK;
  }

  if (values.json) {
    return yield* usageError('--json goes with --list-displays only.', 'present');
  }

  if (values.built && (brand !== undefined || agent !== undefined)) {
    return yield* usageError(
      '--built presents the static build, which has no dev tools: leave out --brand and --agent.',
      'present',
    );
  }

  const placesWindow =
    values.fullscreen || values.kiosk || display !== undefined || values.presenter;
  if (values.browser && placesWindow) {
    return yield* usageError(
      '--browser opens the deck in a browser window, which --fullscreen, --kiosk, --display and ' +
        '--presenter cannot place. Leave them out or drop --browser.',
      'present',
    );
  }

  const { deck } = yield* chooseInteractiveDeck(workspaceRoot, positionals[0], 'present');
  for (const running of yield* findRunningDevServers(workspaceRoot)) {
    yield* Console.log(runningDevServerWarning(running));
  }

  if (agent !== undefined) {
    // A bad --agent value is a usage error, reported before Electron starts.
    const { resolveAgentSetup } = yield* Effect.tryPromise({
      try: () => import('#agent/agent-flags.ts'),
      catch: (cause) =>
        cliError(
          `Could not load the presenting code: ${cause instanceof Error ? cause.message : String(cause)}`,
        ),
    });
    yield* resolveAgentSetup('present', agent);
  }

  const flags: PlanFlags = {
    fullscreen: values.fullscreen,
    kiosk: values.kiosk,
    display,
    presenter: values.presenter,
    presenterDisplay,
  };
  const options = {
    workspaceRoot,
    port,
    brand,
    agent,
    flags,
    built: values.built,
    browser: values.browser,
    verbose: values.verbose,
  };
  const started = values.browser
    ? undefined
    : yield* shell.start({
        stateKey: deck ?? '/chooser',
        stateFile: path.join(workspaceRoot, '.deck', 'shell', 'windows.json'),
        startTimeout: DEFAULT_START_TIMEOUT,
        env: {},
      });
  if (deck === undefined) {
    yield* presentChooser(options, started);
  } else {
    const target = yield* openPresentation(options, deck, started);
    if (target.closed === undefined) {
      yield* openInBrowser(target.url);
      yield* awaitShutdown;
    } else {
      yield* Effect.raceFirst(target.closed, awaitShutdown);
    }
  }

  return EXIT_OK;
});

/**
 * The shared launch settings for direct and chooser presentations.
 */
type PresentationOptions = {
  /**
   * The workspace containing deck and brand folders.
   */
  readonly workspaceRoot: string;

  /**
   * The requested listener port, if any.
   */
  readonly port: number | undefined;

  /**
   * The requested development brand override, if any.
   */
  readonly brand: string | undefined;

  /**
   * The development agent settings, if enabled.
   */
  readonly agent: AgentFlags | undefined;

  /**
   * The audience and presenter window placement settings.
   */
  readonly flags: PlanFlags;

  /**
   * Whether to serve a static build.
   */
  readonly built: boolean;

  /**
   * Whether the presentation runs inside a browser.
   */
  readonly browser: boolean;

  /**
   * Whether to print Vite's full log.
   */
  readonly verbose: boolean;
};

/**
 * Keeps one launcher and shell alive while selections open and close in their own scopes.
 */
const presentChooser = Effect.fn('deck.present.chooser')(function* (
  options: PresentationOptions,
  started: StartedShell | undefined,
): Effect.fn.Return<void, CommandError, CommandServices> {
  const operator =
    started === undefined ? undefined : yield* planWindows(options.flags, yield* started.displays);
  const { startDeckChooser } = yield* Effect.promise(() => import('#chooser/chooser-server.ts'));
  const { url } = yield* startDeckChooser({
    ...options,
    host: false,
    desktop: started !== undefined,
    open: (deck, chooser) =>
      openPresentation({ ...options, port: 0 }, deck, started, chooser).pipe(
        Effect.map(({ url, busy, focus }): ChooserDeck => ({
          url,
          stayOnChooser: started !== undefined,
          ...(busy === undefined ? {} : { busy }),
          ...(focus === undefined ? {} : { focus }),
        })),
      ),
  });
  yield* bindQuitKey;
  yield* Console.log(`  Deck chooser: ${url}`);
  if (started === undefined || operator === undefined) {
    yield* openInBrowser(url);
    yield* awaitShutdown;
    return;
  }

  const launcher = yield* started.openChooser({
    url,
    audienceDisplayId: operator.plan.audience.displayId,
    operatorDisplayId: operator.plan.presenter?.displayId,
  });
  yield* Console.log('Choose a deck in Deckster. Close the chooser or press Ctrl+C to quit.');
  yield* Effect.raceFirst(launcher.closed, awaitShutdown);
});

/**
 * The selection's listening address, busy state, and desktop window controls.
 */
type OpenPresentation = {
  /**
   * The served deck URL.
   */
  readonly url: string;

  /**
   * Checks whether the active agent has work in progress.
   */
  readonly busy?: Effect.Effect<boolean>;

  /**
   * Brings the already open presentation to the foreground.
   */
  readonly focus?: Effect.Effect<void>;

  /**
   * Completes if the Electron process exits.
   */
  readonly closed?: Effect.Effect<void, CommandError>;
};

/**
 * Serves one deck and opens its role windows when running in Electron. The caller owns its scope.
 */
const openPresentation = Effect.fn('deck.present.open')(function* (
  options: PresentationOptions,
  deckName: string,
  started: StartedShell | undefined,
  chooser?: ChooserLink,
): Effect.fn.Return<OpenPresentation, CommandError, CommandServices> {
  const { workspaceRoot, brand, port, built, agent, browser, verbose, flags } = options;
  const modules = yield* loadPresentModules(built, agent !== undefined);
  const location = yield* modules.plugin.findDeck(workspaceRoot, deckName);
  const loaded = yield* modules.plugin.loadDeck(workspaceRoot, location);
  const brandName = brand ?? loaded.config.brand ?? DEFAULT_BRAND;
  const loadedBrand = yield* modules.brandNode.loadBrand(workspaceRoot, brandName);
  const backgroundColor =
    loadedBrand.tokens.surfaces[DEFAULT_SURFACE]?.roles.bg ?? FALLBACK_BACKGROUND_COLOR;
  // The window's first page load presents this code and gets the dev session; nothing else does.
  const agentCode =
    browser || built ? undefined : randomBytes(AGENT_CODE_BYTES).toString('base64url');
  const { url, busy } = yield* serveDeck({
    modules,
    workspaceRoot,
    location,
    brand,
    port,
    agent,
    agentCode,
    verbose,
    chooser: chooser === undefined ? undefined : { ...chooser, desktop: started !== undefined },
  });
  yield* Console.log(`Presenting ${deckName} at ${url}`);
  if (started === undefined) {
    return { url, ...(busy === undefined ? {} : { busy }) };
  }

  const session = yield* started.open({
    url,
    title: clampShellTitle(loaded.config.title),
    backgroundColor,
    flags,
    ...(agentCode === undefined ? {} : { agentCode }),
    ...(chooser === undefined ? {} : { selection: { key: chooser.key, deck: deckName } }),
  });
  for (const note of session.plan.notes) {
    yield* Console.log(note);
  }

  if (!session.ready.hasDeck) {
    yield* Console.log(
      'Warning: the window loaded the page, but no deck is running in it. ' +
        'Open the URL in a browser to see its errors.',
    );
  }

  const presenterNote =
    session.plan.presenterIndex === undefined
      ? ''
      : `, presenter on display ${session.plan.presenterIndex}`;
  yield* Console.log(
    `Window open on display ${session.plan.audienceIndex}${presenterNote}. ` +
      (chooser === undefined
        ? 'Close the window or press Ctrl+C to stop.'
        : 'Use Back to decks to choose another deck, or press Ctrl+C to quit.'),
  );
  return {
    url,
    ...(busy === undefined ? {} : { busy }),
    focus: session.send({ type: 'focus' }),
    closed: session.closed,
  };
});

/**
 * What {@link serveDeck} needs.
 */
type ServeOptions = {
  /**
   * The modules that serve the deck.
   */
  modules: PresentModules;

  /**
   * The workspace root.
   */
  workspaceRoot: string;

  /**
   * The deck.
   */
  location: DeckLocation;

  /**
   * The brand override.
   */
  brand: string | undefined;

  /**
   * The port, or `undefined` for one the operating system picks.
   */
  port: number | undefined;

  /**
   * The agent flags, handed to the dev server's options.
   */
  agent: AgentFlags | undefined;

  /**
   * The window's one-time code for the dev session, or undefined (a browser, a build).
   */
  agentCode: string | undefined;

  /**
   * Whether to print the dev server's whole log.
   */
  verbose: boolean;

  /**
   * The chooser selection, when this deck was opened from the gallery.
   */
  chooser: ChooserLink | undefined;
};

/**
 * Serves the deck in the command's scope and returns its URL: the dev server `deckster dev` starts,
 * or with `built` a production build behind the preview server.
 *
 * @param options - The deck and how to serve it.
 */
const serveDeck = Effect.fn('serveDeck')(function* (
  options: ServeOptions,
): Effect.fn.Return<
  Pick<OpenPresentation, 'url' | 'busy'>,
  CommandError,
  CommandServices | Scope.Scope
> {
  const { modules, workspaceRoot, location } = options;
  const port = options.port ?? ANY_FREE_PORT;
  const logLevel = options.verbose ? 'info' : 'warn';
  const { serving } = modules;
  if (serving.kind === 'dev') {
    const { url, sessions } = yield* serving.devServer.startDevServer({
      workspaceRoot,
      deck: location.id,
      brand: options.brand,
      port,
      host: false,
      mcp: options.agent !== undefined,
      agent: options.agent,
      printUrls: false,
      command: 'present',
      logLevel,
      ...(options.chooser === undefined ? {} : { chooser: options.chooser }),
      ...(options.agentCode === undefined ? {} : { agentCode: options.agentCode }),
    });
    if (sessions !== undefined && serving.turnSummaries !== undefined) {
      yield* serving.turnSummaries.printTurnSummaries(sessions);
    }

    return { url, ...(sessions === undefined ? {} : { busy: sessions.busy }) };
  }

  yield* Console.log(`Building ${location.id}...`);
  yield* serving.buildDeck.buildDeck(workspaceRoot, location, false);
  const server = yield* serving.previewServer.startPreviewServer({
    workspaceRoot,
    deck: location.id,
    port,
    host: false,
    logLevel,
    ...(options.chooser === undefined ? {} : { chooser: options.chooser }),
  });
  const address = server.httpServer.address();
  const listening = typeof address === 'object' && address !== null ? address.port : port;
  return { url: server.resolvedUrls?.local[0] ?? `http://127.0.0.1:${listening}/` };
});

/**
 * Opens the current document in Chrome app mode or the default browser.
 */
const openInBrowser = Effect.fn('deck.present.browser')(function* (url: string) {
  const opening = yield* (yield* BrowserOpener).open(url);
  yield* Console.log(
    opening === 'chrome-app'
      ? 'Opened Chrome in app mode. Press Ctrl+C here to stop the server.'
      : 'Opened your default browser. Press Ctrl+C here to stop the server.',
  );
});
