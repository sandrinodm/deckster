import type {
  ShellChooserTarget,
  ShellCommand,
  ShellDisplay,
  ShellEvent,
} from '@deckster/shell/protocol';

import { Context, Effect, Layer, type Duration, FileSystem, type Scope, type Stream } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import path from 'node:path';

import type { PlanFlags, WindowPlan } from '#present/window-plan.ts';

import { shellError, type CliError, type ShellError } from '#cli-error.ts';
import { Workspace } from '#workspace.ts';

/**
 * How long the shell may take, unless the caller says so, to report its displays after the spawn
 * and, separately, to load the audience page after `open`.
 */
export const DEFAULT_START_TIMEOUT: Duration.Input = '45 seconds';

/**
 * The `ready` event, which says the audience window loaded the deck.
 */
export type ShellReady = Extract<ShellEvent, { type: 'ready' }>;

/**
 * How the shell is started, before any deck is known.
 */
export type ShellStartOptions = {
  /**
   * The key of this deck in `.deck/shell/windows.json`.
   */
  stateKey: string;

  /**
   * The absolute path of `windows.json`; `undefined` remembers nothing.
   */
  stateFile: string | undefined;

  /**
   * How long to wait for the shell's displays, from the spawn, and later for the window to load the
   * page, from the `open`.
   */
  startTimeout: Duration.Input;

  /**
   * Extra environment variables for the shell, such as the test options.
   */
  env: Readonly<Record<string, string>>;
};

/**
 * The deck to show and where the windows go, known once the deck is served.
 */
export type ShellOpenOptions = {
  /**
   * The deck's URL.
   */
  url: string;

  /**
   * The window title and dock name.
   */
  title: string;

  /**
   * The brand's default surface colour.
   */
  backgroundColor: string;

  /**
   * Where the windows go.
   */
  flags: PlanFlags;

  /**
   * A one-time code (16 to 128 URL-safe characters) the audience window's first load sends to the
   * dev server as the `X-Deck-Agent-Code` header, never in the URL; leave out for none.
   */
  agentCode?: string;

  /**
   * Identifies an interactive selection and its saved window bounds.
   */
  selection?: { readonly key: string; readonly deck: string };
};

/**
 * Everything the shell is started and opened with.
 */
export type ShellOptions = ShellStartOptions & ShellOpenOptions;

/**
 * The folder of the shell's Chromium profile, caches, logs and crash dumps: inside the workspace,
 * never under the user's Application Support. The shell uses a temporary folder instead under its
 * test options.
 *
 * @param root - The workspace root.
 */
export function shellProfileDir(root: string): string {
  return path.join(root, '.deck', 'shell', 'profile');
}

/**
 * What `deckster present` puts in the shell's `DECK_SHELL_CONFIG`: nothing about the deck, which
 * the `open` command carries once it is served.
 *
 * @param root - The workspace root.
 * @param options - How the shell starts.
 */
export function shellConfig(root: string, options: ShellStartOptions): Record<string, unknown> {
  return {
    stateKey: options.stateKey,
    profileDir: shellProfileDir(root),
    ...(options.stateFile === undefined ? {} : { stateFile: options.stateFile }),
  };
}

/**
 * An open shell.
 */
export type ShellSession = {
  /**
   * The displays connected when the shell started.
   */
  readonly displays: readonly ShellDisplay[];

  /**
   * The placement the shell was told to use, with notes about it.
   */
  readonly plan: WindowPlan;

  /**
   * What the shell said when the audience window had loaded.
   */
  readonly ready: ShellReady;

  /**
   * Everything the shell reports, including events from before the subscription.
   */
  readonly events: Stream.Stream<ShellEvent>;

  /**
   * Sends a command to the shell.
   *
   * @param command - The command.
   */
  readonly send: (command: ShellCommand) => Effect.Effect<void>;

  /**
   * Asks the presenter window to open, on a display or on the one other than the audience's.
   *
   * @param displayId - The display's id; leave out for the default.
   */
  readonly openPresenter: (displayId?: number) => Effect.Effect<void>;

  /**
   * Completes when the shell exits normally, which it does when the last window closes. Fails when
   * it exits with an error.
   */
  readonly closed: Effect.Effect<void, ShellError>;

  /**
   * Asks the shell to quit and waits for it to exit.
   */
  readonly quit: Effect.Effect<void>;
};

/**
 * A shell that was spawned without a deck and is booting while the caller loads and serves it.
 */
export type StartedShell = {
  /**
   * The latest display report. Waits for the first report, which the start timeout limits from the
   * spawn; fails when the shell exits or times out first.
   */
  readonly displays: Effect.Effect<readonly ShellDisplay[], ShellError>;

  /**
   * Opens the independent chooser, then completes when the shell exits.
   */
  readonly openChooser: (
    target: ShellChooserTarget,
  ) => Effect.Effect<{ readonly closed: Effect.Effect<void, ShellError> }, ShellError>;

  /**
   * Plans the windows from the displays, opens them on the deck and waits for the audience page to
   * load (the start timeout counts from this call). Nothing times out while the caller is still
   * serving the deck. Adds a finalizer to the caller's scope that quits the shell, so it closes
   * before anything the caller started after the shell.
   *
   * @param target - The deck's URL, title and colour, and where the windows go.
   */
  readonly open: (
    target: ShellOpenOptions,
  ) => Effect.Effect<ShellSession, ShellError | CliError, Scope.Scope>;
};

/**
 * Starts Electron windows for `deckster present`. A shell lives in the scope of the caller that
 * started it: leaving the scope asks it to quit and kills it when it does not. The code that spawns
 * it loads on the first call, so a command that never presents does not import it. Tests replace
 * the layer with `fakeShellLayer`.
 */
export class DeckShell extends Context.Service<
  DeckShell,
  {
    /**
     * Spawns the shell without a deck and returns at once; the displays are read in the background.
     *
     * @param options - The state key and file, the timeout and the environment.
     * @throws ShellError in the error channel when the binary is missing or cannot be started.
     */
    readonly start: (
      options: ShellStartOptions,
    ) => Effect.Effect<StartedShell, ShellError, Scope.Scope>;

    /**
     * Starts the shell and opens the deck in one step: `start`, then `open` on the started shell.
     *
     * @param options - What to start and open.
     * @throws ShellError in the error channel when the binary is missing, the shell does not start
     *   in time, fails to load the page or exits early; CliError for a display that does not
     *   exist.
     */
    readonly open: (
      options: ShellOptions,
    ) => Effect.Effect<ShellSession, ShellError | CliError, Scope.Scope>;

    /**
     * Lists the connected displays by starting the shell without any window.
     *
     * @param timeout - How long to wait.
     * @throws ShellError in the error channel when the shell cannot start.
     */
    readonly listDisplays: (
      timeout: Duration.Input,
    ) => Effect.Effect<readonly ShellDisplay[], ShellError>;
  }
>()('cli/DeckShell') {
  /**
   * The shell of this workspace, started from the Electron binary `@deckster/shell` installed.
   */
  static readonly layer: Layer.Layer<
    DeckShell,
    never,
    Workspace | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  > = DeckShell.layerFor(undefined);

  /**
   * The shell with the Electron package at another folder, such as a folder without a binary.
   *
   * @param electronDir - The folder of the electron package; `undefined` finds `@deckster/shell`'s.
   */
  static layerFor(
    electronDir: string | undefined,
  ): Layer.Layer<
    DeckShell,
    never,
    Workspace | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  > {
    return Layer.effect(
      DeckShell,
      Effect.gen(function* () {
        const { root } = yield* Workspace;
        // Only these two services are provided to the shell's effects, never the layer's whole
        // context: that holds the scope of the layer, which would own the shell's finalizers.
        const fs = yield* FileSystem.FileSystem;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        /**
         * Gives an effect the two services it needs, and nothing else.
         */
        const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          effect.pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          );
        /**
         * Spawns the shell, loading the code that does it on first use.
         */
        const start = Effect.fn('DeckShell.startLive')(function* (
          options: ShellStartOptions,
        ): Effect.fn.Return<StartedShell, ShellError, Scope.Scope> {
          const live = yield* loadLive();
          return yield* provide(live.startShell(root, electronDir, options));
        });
        return DeckShell.of({
          start,
          open: (options) =>
            start(options).pipe(Effect.flatMap((started) => started.open(options))),
          listDisplays: (timeout) =>
            loadLive().pipe(
              Effect.flatMap((live) =>
                provide(Effect.scoped(live.listShellDisplays(root, electronDir, timeout))),
              ),
            ),
        });
      }),
    );
  }
}

/**
 * Loads the module that spawns and talks to the shell, the first time a shell is wanted.
 *
 * @throws ShellError in the error channel when the module does not load.
 */
const loadLive = Effect.fn('DeckShell.loadLive')(function* (): Effect.fn.Return<
  typeof import('#present/deck-shell-live.ts'),
  ShellError
> {
  return yield* Effect.tryPromise({
    try: () => import('#present/deck-shell-live.ts'),
    catch: (cause) =>
      shellError(
        `Could not load the presenting code: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
  });
});
