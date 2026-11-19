import {
  decodeEvent,
  encodeMessage,
  type ShellChooserTarget,
  type ShellCommand,
  type ShellDisplay,
  type ShellEvent,
} from '@deckster/shell/protocol';
import {
  Cause,
  Deferred,
  Effect,
  Option,
  PubSub,
  Queue,
  Ref,
  Stream,
  type Duration,
  type FileSystem,
  type Scope,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import type {
  ShellOpenOptions,
  ShellSession,
  ShellStartOptions,
  StartedShell,
} from '#present/deck-shell.ts';

import { shellError, type CliError, type ShellError } from '#cli-error.ts';
import { shellConfig, shellProfileDir } from '#present/deck-shell.ts';
import { resolveShellBinary, type ShellBinary } from '#present/shell-binary.ts';
import { planWindows } from '#present/window-plan.ts';

/**
 * How long the shell may take to exit after being asked to quit, before it is killed.
 */
const QUIT_GRACE: Duration.Input = '3 seconds';

/**
 * What the start-up waits for when it reads the displays, named in its timeout message.
 */
const AWAITING_DISPLAYS = 'its displays';

/**
 * How many lines of the shell's standard error are kept for error messages.
 */
const STDERR_LINES = 20;

/**
 * How many events a late subscriber still receives.
 */
const REPLAY = 256;

/**
 * A spawned shell process and what has been read from it so far.
 */
type ShellProcess = {
  /**
   * Every event the shell wrote, replayed to late subscribers.
   */
  events: PubSub.PubSub<ShellEvent>;

  /**
   * The latest connected display list, including reports after startup.
   */
  displays: Ref.Ref<readonly ShellDisplay[]>;

  /**
   * Completes with the exit code and the tail of standard error when the process ends.
   */
  exited: Deferred.Deferred<{ code: number; stderr: string }>;

  /**
   * Writes one command to the shell's standard input.
   */
  send: (command: ShellCommand) => Effect.Effect<void>;

  /**
   * Closes standard input, which tells the shell its parent is done.
   */
  closeInput: Effect.Effect<void>;
};

/**
 * Spawns the Electron shell with the readers that feed {@link ShellProcess}. The shell is quit when
 * the scope closes, and killed when it does not leave.
 *
 * @param root - The workspace root, the shell's working directory.
 * @param binary - The executable and entry file.
 * @param config - What goes into `DECK_SHELL_CONFIG`.
 * @param env - Extra environment variables.
 */
const spawnShell = Effect.fn('spawnShell')(function* (
  root: string,
  binary: ShellBinary,
  config: Readonly<Record<string, unknown>>,
  env: Readonly<Record<string, string>>,
): Effect.fn.Return<
  ShellProcess,
  ShellError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const input = yield* Queue.unbounded<Uint8Array, Cause.Done>();
  const encoder = new TextEncoder();
  const child = yield* spawner
    .spawn(
      ChildProcess.make(binary.executable, [binary.entry], {
        cwd: root,
        env: {
          ...env,
          DECK_SHELL_CONFIG: JSON.stringify(config),
          ELECTRON_RUN_AS_NODE: undefined,
        },
        extendEnv: true,
        shell: false,
        stdin: Stream.fromQueue(input),
        stdout: 'pipe',
        stderr: 'pipe',
        killSignal: 'SIGTERM',
        forceKillAfter: '2 seconds',
      }),
    )
    .pipe(
      Effect.mapError((cause) =>
        shellError(`Could not start Electron (${binary.executable}): ${cause.message}`),
      ),
    );
  const events = yield* PubSub.unbounded<ShellEvent>({ replay: REPLAY });
  const displays = yield* Ref.make<readonly ShellDisplay[]>([]);
  const exited = yield* Deferred.make<{ code: number; stderr: string }>();
  const stderrTail = yield* Ref.make<readonly string[]>([]);
  yield* child.stdout.pipe(
    Stream.decodeText,
    Stream.splitLines,
    Stream.runForEach((line) => {
      const decoded = decodeEvent(line);
      if (!decoded.ok) {
        return Ref.update(stderrTail, (lines) => [...lines, line].slice(-STDERR_LINES));
      }

      const event = decoded.message;
      const publish = PubSub.publish(events, event);
      return event.type === 'displays'
        ? Ref.set(displays, event.displays).pipe(Effect.andThen(publish))
        : publish;
    }),
    Effect.ignore,
    Effect.forkScoped,
  );
  yield* child.stderr.pipe(
    Stream.decodeText,
    Stream.splitLines,
    Stream.runForEach((line) =>
      Ref.update(stderrTail, (lines) => [...lines, line].slice(-STDERR_LINES)),
    ),
    Effect.ignore,
    Effect.forkScoped,
  );
  yield* child.exitCode.pipe(
    Effect.map(Number),
    Effect.orElseSucceed(() => -1),
    Effect.flatMap((code) =>
      Ref.get(stderrTail).pipe(
        Effect.flatMap((lines) => Deferred.succeed(exited, { code, stderr: lines.join('\n') })),
      ),
    ),
    Effect.forkScoped,
  );
  const closeInput = Queue.end(input).pipe(Effect.asVoid);
  /**
   * Writes one command to the shell's standard input.
   */
  const send = (command: ShellCommand): Effect.Effect<void> =>
    Queue.offer(input, encoder.encode(encodeMessage(command))).pipe(Effect.asVoid);
  yield* Effect.addFinalizer(() =>
    send({ type: 'quit' }).pipe(
      Effect.andThen(closeInput),
      Effect.andThen(Deferred.await(exited)),
      Effect.timeout(QUIT_GRACE),
      Effect.ignore,
    ),
  );
  return { events, displays, exited, send, closeInput };
});

/**
 * Waits for the first event of one of the given types, failing when the shell exits first or
 * reports an error.
 *
 * @param shell - The spawned shell.
 * @param type - The event type to wait for.
 * @param timeout - How long to wait.
 * @param what - What the wait is for, for the timeout message.
 */
const awaitEvent = Effect.fn('awaitEvent')(function* <Type extends ShellEvent['type']>(
  shell: ShellProcess,
  type: Type,
  timeout: Duration.Input,
  options: { readonly what: string; readonly requestId?: string; readonly ignoreErrors?: boolean },
): Effect.fn.Return<Extract<ShellEvent, { type: Type }>, ShellError> {
  const found = Stream.fromPubSub(shell.events).pipe(
    Stream.filter((event) => {
      if (event.type !== type && event.type !== 'error') {
        return false;
      }

      if (event.type === 'error' && options.ignoreErrors === true) {
        return false;
      }

      const requestId = 'requestId' in event ? event.requestId : undefined;
      return requestId === options.requestId;
    }),
    Stream.runHead,
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.never,
        onSome: (event) =>
          event.type === 'error'
            ? Effect.fail(shellError(`The Electron shell reported an error: ${event.message}`))
            : Effect.succeed(event as Extract<ShellEvent, { type: Type }>),
      }),
    ),
  );
  const exitedEarly = Deferred.await(shell.exited).pipe(
    Effect.flatMap(({ code, stderr }) =>
      Effect.fail(
        shellError(
          `The Electron shell exited with code ${code} before ${options.what}.` +
            (stderr === '' ? '' : `\n${stderr}`),
        ),
      ),
    ),
  );
  return yield* Effect.raceFirst(found, exitedEarly).pipe(
    Effect.timeout(timeout),
    Effect.catchTag('TimeoutError', () =>
      Effect.fail(
        shellError(
          `The Electron shell did not report ${options.what} within the start-up timeout. ` +
            'Run the command again; if it keeps failing, ' +
            'check that the deck URL loads in a browser.',
        ),
      ),
    ),
  );
});

/**
 * Spawns the shell without a deck and starts waiting for its displays in the background, so the
 * caller can load and serve the deck while Electron boots. The shell is quit when the scope
 * closes.
 *
 * @param root - The workspace root.
 * @param electronDir - The electron package folder, or `undefined` for `@deckster/shell`'s.
 * @param options - How to start it.
 */
export const startShell = Effect.fn('DeckShell.start')(function* (
  root: string,
  electronDir: string | undefined,
  options: ShellStartOptions,
): Effect.fn.Return<
  StartedShell,
  ShellError,
  Scope.Scope | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const binary = yield* resolveShellBinary(root, electronDir);
  const shell = yield* spawnShell(root, binary, shellConfig(root, options), options.env);
  const displays = yield* Deferred.make<readonly ShellDisplay[], ShellError>();
  yield* awaitEvent(shell, 'displays', options.startTimeout, { what: AWAITING_DISPLAYS }).pipe(
    Effect.map((event) => event.displays),
    (waiting) => Deferred.into(waiting, displays),
    Effect.forkScoped,
  );
  const connected = Deferred.await(displays).pipe(Effect.andThen(Ref.get(shell.displays)));
  const closed = Deferred.await(shell.exited).pipe(
    Effect.flatMap(({ code, stderr }) => {
      if (code === 0) {
        return Effect.void;
      }

      const detail = stderr === '' ? '' : `\n${stderr}`;
      return Effect.fail(shellError(`The Electron shell exited with code ${code}.${detail}`));
    }),
  );
  const quit = shell
    .send({ type: 'quit' })
    .pipe(Effect.andThen(Deferred.await(shell.exited)), Effect.timeout(QUIT_GRACE), Effect.ignore);
  /**
   * Opens the windows once the displays are known and waits for the audience page to load.
   */
  const open = Effect.fn('DeckShell.open')(function* (
    target: ShellOpenOptions,
  ): Effect.fn.Return<ShellSession, ShellError | CliError, Scope.Scope> {
    const known = yield* connected;
    const plan = yield* planWindows(target.flags, known);
    // Closes the window before anything the caller started after the shell, such as the server.
    const selection = target.selection;
    yield* Effect.addFinalizer(() => {
      if (selection === undefined) {
        return quit;
      }

      return shell.send({ type: 'close-deck', requestId: selection.key }).pipe(
        Effect.andThen(
          awaitEvent(shell, 'deck-closed', options.startTimeout, {
            what: 'the deck closed',
            ignoreErrors: true,
            requestId: selection.key,
          }),
        ),
        Effect.ignore,
      );
    });
    yield* shell.send({
      type: 'open',
      ...(selection === undefined ? {} : { requestId: selection.key, stateKey: selection.deck }),
      plan: plan.plan,
      target: {
        url: target.url,
        title: target.title,
        backgroundColor: target.backgroundColor,
        ...(target.agentCode === undefined ? {} : { agentCode: target.agentCode }),
      },
    });
    const ready = yield* awaitEvent(shell, 'ready', options.startTimeout, {
      what: 'the window loaded',
      ...(selection === undefined ? {} : { requestId: selection.key }),
    });
    return {
      displays: known,
      plan,
      ready,
      events: Stream.fromPubSub(shell.events),
      send: shell.send,
      openPresenter: (displayId) =>
        shell.send({ type: 'open-presenter', ...(displayId === undefined ? {} : { displayId }) }),
      closed,
      quit,
    };
  });
  const openChooser = Effect.fn('DeckShell.openChooser')(function* (target: ShellChooserTarget) {
    yield* shell.send({ type: 'open-chooser', target });
    yield* awaitEvent(shell, 'chooser-ready', options.startTimeout, { what: 'the chooser loaded' });
    return { closed };
  });
  return { displays: connected, open, openChooser };
});

/**
 * Lists the displays by running the shell in its windowless mode.
 *
 * @param root - The workspace root.
 * @param electronDir - The electron package folder, or `undefined` for `@deckster/shell`'s.
 * @param timeout - How long to wait.
 */
export const listShellDisplays = Effect.fn('DeckShell.listDisplays')(function* (
  root: string,
  electronDir: string | undefined,
  timeout: Duration.Input,
): Effect.fn.Return<
  readonly ShellDisplay[],
  ShellError,
  Scope.Scope | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const binary = yield* resolveShellBinary(root, electronDir);
  const shell = yield* spawnShell(
    root,
    binary,
    { url: 'http://127.0.0.1/', listOnly: true, profileDir: shellProfileDir(root) },
    {},
  );
  const first = yield* awaitEvent(shell, 'displays', timeout, { what: AWAITING_DISPLAYS });
  return first.displays;
});
