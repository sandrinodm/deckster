import type { ShellCommand, ShellDisplay, ShellEvent } from '@deckster/shell/protocol';

import { Deferred, Effect, Layer, Stream } from 'effect';

import { shellError } from '#cli-error.ts';
import { BrowserOpener, type BrowserOpening } from '#present/browser-fallback.ts';
import {
  DeckShell,
  type ShellOptions,
  type ShellSession,
  type ShellStartOptions,
  type StartedShell,
} from '#present/deck-shell.ts';
import { planWindows } from '#present/window-plan.ts';

/**
 * A 1920x1080 display for tests.
 *
 * @param id - Its id.
 * @param primary - Whether it is the primary display.
 */
export function testDisplay(id: number, primary: boolean): ShellDisplay {
  const rect = { x: (id - 1) * 1920, y: 0, width: 1920, height: 1080 };
  return { id, label: `Display ${id}`, bounds: rect, workArea: rect, scaleFactor: 2, primary };
}

/**
 * How the fake shell behaves.
 */
export type FakeShellOptions = {
  /**
   * The displays it reports; one primary display by default.
   */
  displays?: readonly ShellDisplay[];

  /**
   * Fail `start` as the real shell does without Electron's binary.
   */
  binaryMissing?: boolean;

  /**
   * Fail `open` with a start-up timeout.
   */
  startTimesOut?: boolean;

  /**
   * Fail `open` as the real shell does when Electron exits before it reported its displays.
   */
  exitsBeforeOpen?: boolean;

  /**
   * What the fake's `ready` says about the deck; `true` by default.
   */
  hasDeck?: boolean;

  /**
   * Never finish `open`, as a shell that is still booting: a test interrupts the command.
   */
  holdOpen?: boolean;

  /**
   * Close the window straight after it opens, so the command returns on its own.
   */
  closeImmediately?: boolean;

  /**
   * Called when the session's scope closes, which is when the real shell would be told to quit; the
   * command's server is still up at that moment.
   */
  onRelease?: () => Effect.Effect<void>;
};

/**
 * What a fake shell recorded, and how a test closes its window.
 */
export type FakeShell = {
  /**
   * The services to provide, both the shell and the browser opener.
   */
  layer: Layer.Layer<DeckShell | BrowserOpener>;

  /**
   * The options of every `start` call, in order.
   */
  started: ShellStartOptions[];

  /**
   * How many started shells the scope has quit so far.
   */
  quits: { count: number };

  /**
   * The options of every `open` call: the start options of its shell with the target.
   */
  opened: ShellOptions[];

  /**
   * The commands the command sent to the shell.
   */
  commands: ShellCommand[];

  /**
   * Every `listDisplays` call, in order.
   */
  listed: number[];

  /**
   * The URLs `--browser` opened, with how.
   */
  browserOpened: { url: string; opening: BrowserOpening }[];

  /**
   * Closes the fake window, as a person closing it does.
   */
  closeWindow: Effect.Effect<void>;
};

/**
 * A `DeckShell` and `BrowserOpener` for command tests: nothing starts. It plans windows with the
 * real {@link planWindows}, records what it was asked, and `closeWindow` ends the session.
 *
 * @param options - How it behaves.
 */
export function fakeShell(options: FakeShellOptions = {}): FakeShell {
  const displays = options.displays ?? [testDisplay(1, true)];
  const started: ShellStartOptions[] = [];
  const quits = { count: 0 };
  const opened: ShellOptions[] = [];
  const commands: ShellCommand[] = [];
  const listed: number[] = [];
  const browserOpened: { url: string; opening: BrowserOpening }[] = [];
  const closed = Deferred.makeUnsafe<void>();
  const closeWindow = Deferred.succeed(closed, undefined).pipe(Effect.asVoid);
  const start = Effect.fn('fakeShell.start')(function* (startOptions: ShellStartOptions) {
    started.push(startOptions);
    if (options.binaryMissing === true) {
      return yield* shellError(
        "Electron's binary is not downloaded (fake). Run `pnpm --filter @deckster/shell exec install-electron`, or pass --browser.",
      );
    }

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        quits.count += 1;
      }),
    );
    const startedShell: StartedShell = {
      displays: Effect.succeed(displays),
      open: Effect.fn('fakeShell.open')(function* (target) {
        opened.push({ ...startOptions, ...target });
        if (options.startTimesOut === true) {
          return yield* shellError(
            'The Electron shell did not report the window loaded within the start-up timeout.',
          );
        }

        if (options.holdOpen === true) {
          return yield* Effect.never;
        }

        if (options.exitsBeforeOpen === true) {
          return yield* shellError('The Electron shell exited with code 1 before its displays.');
        }

        const plan = yield* planWindows(target.flags, displays);
        yield* Effect.addFinalizer(() => options.onRelease?.() ?? Effect.void);
        if (options.closeImmediately === true) {
          yield* closeWindow;
        }

        const session: ShellSession = {
          displays,
          plan,
          ready: {
            type: 'ready',
            windows: [
              {
                window: 'audience',
                displayId: plan.plan.audience.displayId,
                bounds: displays[0]!.bounds,
              },
            ],
            url: target.url,
            title: target.title,
            hasDeck: options.hasDeck ?? true,
          },
          events: Stream.empty as Stream.Stream<ShellEvent>,
          send: (command) => Effect.sync(() => void commands.push(command)),
          openPresenter: (displayId) =>
            Effect.sync(() => {
              commands.push({
                type: 'open-presenter',
                ...(displayId === undefined ? {} : { displayId }),
              });
            }),
          closed: Deferred.await(closed),
          quit: closeWindow,
        };
        return session;
      }),
    };
    return startedShell;
  });
  const shell = DeckShell.of({
    start,
    open: (shellOptions) =>
      start(shellOptions).pipe(Effect.flatMap((startedShell) => startedShell.open(shellOptions))),
    listDisplays: () => Effect.sync(() => (listed.push(listed.length), displays)),
  });
  const browser = BrowserOpener.of({
    open: (url) =>
      Effect.sync(() => {
        browserOpened.push({ url, opening: 'chrome-app' });
        return 'chrome-app' as const;
      }),
  });
  return {
    layer: Layer.merge(Layer.succeed(DeckShell, shell), Layer.succeed(BrowserOpener, browser)),
    started,
    quits,
    opened,
    commands,
    listed,
    browserOpened,
    closeWindow,
  };
}
