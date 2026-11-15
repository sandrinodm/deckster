import type { Scope } from 'effect';

import { Deferred, Effect, Fiber, FileSystem, Option, Redacted, Result, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import path from 'node:path';

import type { AgentProblem, ProviderEvent } from '#protocol/agent-events.ts';
import type {
  AgentProvider,
  Invocation,
  InvocationFile,
  ParseState,
  ProcessExit,
  TurnOutcome,
} from '#providers/provider-types.ts';

import { trackFile, trackGroup, untrackFile, untrackGroup } from '#process/cleanup-registry.ts';

/**
 * The time limits of one turn, in milliseconds.
 */
export type TurnLimits = {
  /**
   * How long the provider may print nothing before the turn is stopped.
   */
  readonly idleMs: number;

  /**
   * How long a turn may run at all.
   */
  readonly totalMs: number;

  /**
   * How long a cancelled process gets after SIGINT before SIGTERM.
   */
  readonly graceMs: number;

  /**
   * How long it gets after SIGTERM before SIGKILL.
   */
  readonly killAfterMs: number;

  /**
   * How long to wait for buffered output after the process exited.
   */
  readonly drainMs: number;

  /**
   * The longest line of output, in bytes, the turn reads; a longer line ends the turn with an error
   * instead of being buffered.
   */
  readonly maxLineBytes: number;
};

/**
 * The limits of a real turn: 2 minutes idle, 10 minutes in all, SIGINT then SIGTERM after 2 s, then
 * SIGKILL after 2 s more.
 */
export const DEFAULT_TURN_LIMITS: TurnLimits = {
  /**
   * Two minutes without output.
   */
  idleMs: 120_000,

  /**
   * Ten minutes in all.
   */
  totalMs: 600_000,

  /**
   * Two seconds after SIGINT.
   */
  graceMs: 2000,

  /**
   * Two seconds after SIGTERM.
   */
  killAfterMs: 2000,

  /**
   * Two seconds to drain output.
   */
  drainMs: 2000,

  /**
   * Four MiB a line: more than any real event (a screenshot is not echoed back), far less than
   * memory.
   */
  maxLineBytes: 4 * 1024 * 1024,
};

/**
 * How much of stderr is kept for classification, in bytes.
 */
const MAX_STDERR_BYTES = 64 * 1024;

/**
 * How often the idle limit is checked, at most, in milliseconds.
 */
const IDLE_CHECK_MS = 1000;

/**
 * One turn to run.
 */
export type TurnRun = {
  /**
   * The adapter that parses the output and reads the exit.
   */
  readonly provider: AgentProvider;

  /**
   * The command line.
   */
  readonly invocation: Invocation;

  /**
   * The turn's parse state, which the adapter fills as lines arrive.
   */
  readonly state: ParseState;

  /**
   * Completed to cancel the turn: SIGINT to the process group, then SIGTERM, then SIGKILL.
   */
  readonly cancel: Deferred.Deferred<void>;

  /**
   * Receives each event as its line arrives.
   */
  readonly onEvent: (event: ProviderEvent) => Effect.Effect<void>;

  /**
   * Shorter limits, for tests.
   */
  readonly limits?: Partial<TurnLimits>;
};

/**
 * Why the turn stopped before the process ended on its own.
 */
type StopReason = 'cancel' | 'idle' | 'total' | 'overflow';

/**
 * The byte of a line feed.
 */
const LINE_FEED = 0x0a;

/**
 * The byte of a carriage return.
 */
const CARRIAGE_RETURN = 0x0d;

/**
 * What {@link makeLineSplitter} answers for one chunk.
 */
export type SplitChunk = {
  /**
   * The lines the chunk completed, without their line breaks.
   */
  readonly lines: readonly string[];

  /**
   * True once the line being read is longer than the limit; the splitter keeps nothing more.
   */
  readonly overflow: boolean;
};

/**
 * Splits a byte stream into UTF-8 lines with a bound on each line: unlike `Stream.splitLines`, a
 * line that never ends is not buffered past `maxLineBytes`. Lines are decoded whole, so a character
 * split between chunks stays intact (a line feed byte never occurs inside a UTF-8 sequence).
 *
 * @param maxLineBytes - The longest line, in bytes, without its line break.
 */
export function makeLineSplitter(maxLineBytes: number): {
  readonly push: (chunk: Uint8Array) => SplitChunk;
  readonly end: () => readonly string[];
} {
  const decoder = new TextDecoder();
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let overflow = false;
  /**
   * The pending bytes plus a last piece, as one line of text without a trailing carriage return.
   *
   * @param last - The piece up to the line feed.
   */
  const take = (last: Uint8Array): string => {
    const bytes = pending.length === 0 ? last : Buffer.concat([...pending, last]);
    pending = [];
    pendingBytes = 0;
    const end = bytes.at(-1) === CARRIAGE_RETURN ? bytes.length - 1 : bytes.length;
    return decoder.decode(bytes.subarray(0, end));
  };
  return {
    push: (chunk) => {
      if (overflow) {
        return { lines: [], overflow };
      }

      const lines: string[] = [];
      let start = 0;
      let feed = chunk.indexOf(LINE_FEED, start);
      while (feed !== -1) {
        if (pendingBytes + feed - start > maxLineBytes) {
          overflow = true;
          return { lines, overflow };
        }

        lines.push(take(chunk.subarray(start, feed)));
        start = feed + 1;
        feed = chunk.indexOf(LINE_FEED, start);
      }

      const rest = chunk.subarray(start);
      if (pendingBytes + rest.length > maxLineBytes) {
        overflow = true;
        pending = [];
        pendingBytes = 0;
        return { lines, overflow };
      }

      if (rest.length > 0) {
        pending.push(rest.slice());
        pendingBytes += rest.length;
      }

      return { lines, overflow };
    },
    end: () => (overflow || pendingBytes === 0 ? [] : [take(new Uint8Array())]),
  };
}

/**
 * The events of one line, never throwing: a parser that throws despite its contract gives one
 * notice instead, so a defect in an adapter never ends the turn's reader.
 *
 * @param provider - The adapter.
 * @param line - The line.
 * @param state - The parse state.
 */
function parseSafely(
  provider: AgentProvider,
  line: string,
  state: ParseState,
): readonly ProviderEvent[] {
  try {
    return provider.parseLine(line, state);
  } catch (error) {
    return [
      {
        type: 'notice',
        kind: 'info',
        message: `A line of ${provider.label} output could not be read and was skipped (${
          error instanceof Error ? error.message : 'unknown error'
        }).`,
      },
    ];
  }
}

/**
 * The exit of the process, before stderr is attached.
 */
type RawExit = Pick<ProcessExit, 'code' | 'signal'>;

/**
 * Runs one provider turn as a child process in its own process group and returns how it ended. The
 * prompt goes to stdin; stdout is split into lines and each line is parsed into events as it
 * arrives (nothing waits for the end); stderr is kept, bounded, for classification. A cancel, the
 * idle limit or the total limit sends SIGINT to the group (both CLIs end a turn cleanly on it),
 * then SIGTERM, then SIGKILL. When the caller's fiber is interrupted instead, the scope kills the
 * group with SIGTERM then SIGKILL, so no child outlives its owner. It never fails: every way a turn
 * can end is a {@link TurnOutcome}.
 *
 * @param run - The provider, the command line, the parse state, the cancel signal and the event
 *   sink.
 */
export const runTurn = Effect.fn('runTurn')(function* (
  run: TurnRun,
): Effect.fn.Return<
  TurnOutcome,
  never,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem
> {
  const limits = { ...DEFAULT_TURN_LIMITS, ...run.limits };
  const fs = yield* FileSystem.FileSystem;
  // The invocation's files hold the MCP token: they exist only while the turn runs.
  const removeFiles = Effect.forEach(
    run.invocation.files,
    (file) =>
      fs
        .remove(file.path, { force: true })
        .pipe(Effect.ignore, Effect.andThen(Effect.sync(() => untrackFile(file.path)))),
    { discard: true },
  );
  for (const file of run.invocation.files) {
    trackFile(file.path);
  }

  const written = yield* Effect.result(writeFiles(run.invocation.files));
  if (Result.isFailure(written)) {
    yield* removeFiles;
    return failed({
      kind: 'crashed',
      message: `Could not write the agent's configuration: ${written.failure.message}`,
      fix: 'Check that the workspace is writable.',
    });
  }

  return yield* Effect.scoped(runChild(run, limits)).pipe(Effect.ensuring(removeFiles));
});

/**
 * Spawns the child in the caller's scope and follows it to its end.
 *
 * @param run - The turn.
 * @param limits - The time limits.
 */
const runChild = Effect.fn('runChild')(function* (
  run: TurnRun,
  limits: TurnLimits,
): Effect.fn.Return<TurnOutcome, never, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const spawned = yield* Effect.result(spawner.spawn(turnCommand(run.invocation, limits)));
  if (Result.isFailure(spawned)) {
    const missing = spawned.failure.reason._tag === 'NotFound';
    return failed({
      kind: missing ? 'not-installed' : 'crashed',
      message: missing
        ? `${run.provider.label} (\`${run.invocation.command}\`) is not on the PATH.`
        : `${run.provider.label} could not start: ${spawned.failure.message}`,
      fix: 'Run `deck agent doctor` for the installation and login state.',
    });
  }

  const handle = spawned.success;
  const pid = Number(handle.pid);
  // Tracked until the scope closes: the exit hook and the watchdog kill the group if the CLI dies
  // first.
  trackGroup(pid);
  yield* Effect.addFinalizer(() => Effect.sync(() => untrackGroup(pid)));
  let lastActivity = Date.now();
  const overflow = yield* Deferred.make<void>();
  const splitter = makeLineSplitter(limits.maxLineBytes);
  /**
   * Parses lines and hands their events on, one line at a time.
   *
   * @param lines - The lines.
   */
  const handLines = (lines: readonly string[]) =>
    Effect.forEach(
      lines,
      (line) =>
        Effect.forEach(parseSafely(run.provider, line, run.state), run.onEvent, { discard: true }),
      { discard: true },
    );
  const stdout = yield* handle.stdout.pipe(
    Stream.runForEach((chunk) =>
      Effect.suspend(() => {
        lastActivity = Date.now();
        const split = splitter.push(chunk);
        return handLines(split.lines).pipe(
          Effect.andThen(
            split.overflow
              ? Deferred.succeed(overflow, undefined).pipe(Effect.andThen(Effect.fail('overflow')))
              : Effect.void,
          ),
        );
      }),
    ),
    Effect.andThen(Effect.suspend(() => handLines(splitter.end()))),
    Effect.ignoreCause,
    Effect.forkScoped,
  );
  const stderr = yield* boundedText(handle.stderr).pipe(Effect.forkScoped);
  const exited: Effect.Effect<RawExit> = handle.exitCode.pipe(
    Effect.map((code): RawExit => ({ code: Number(code), signal: null })),
    Effect.catch((error) =>
      Effect.succeed<RawExit>({
        code: null,
        signal: /'(SIG[A-Z0-9]+)'/.exec(error.message)?.[1] ?? 'unknown',
      }),
    ),
  );
  const idle = Effect.gen(function* () {
    while (Date.now() - lastActivity < limits.idleMs) {
      yield* Effect.sleep(Math.min(IDLE_CHECK_MS, limits.idleMs));
    }

    return 'idle' as const;
  });
  const first = yield* Effect.raceAll<Effect.Effect<RawExit | StopReason>>([
    exited,
    Deferred.await(run.cancel).pipe(Effect.as('cancel' as const)),
    idle,
    Effect.sleep(limits.totalMs).pipe(Effect.as('total' as const)),
    Deferred.await(overflow).pipe(Effect.as('overflow' as const)),
  ]);
  const reason = typeof first === 'string' ? first : undefined;
  const raw = typeof first === 'string' ? yield* stopGroup(handle, exited, limits) : first;
  const drained = yield* Fiber.join(stdout).pipe(Effect.timeoutOption(limits.drainMs));
  if (Option.isNone(drained)) {
    yield* Fiber.interrupt(stdout);
  }

  const errors = yield* Fiber.join(stderr).pipe(
    Effect.timeoutOption(limits.drainMs),
    Effect.map(Option.getOrElse(() => '')),
  );
  if (reason === 'overflow') {
    return failed({
      kind: 'crashed',
      message: `${run.provider.label} printed a line longer than ${limits.maxLineBytes} bytes, so the turn was stopped.`,
      fix: 'Try the prompt again; if it happens again, run `deck agent doctor` and report the provider version.',
    });
  }

  return run.provider.interpretExit(
    {
      ...raw,
      stderr: errors,
      cancelled: reason === 'cancel',
      timedOut: reason === 'idle' || reason === 'total' ? reason : undefined,
    },
    run.state,
  );
});

/**
 * Stops a running turn the way both CLIs end cleanly: SIGINT to the process group, then, after the
 * grace period, SIGTERM and SIGKILL through the handle.
 *
 * @param handle - The child.
 * @param exited - Waits for its exit.
 * @param limits - The grace periods.
 */
const stopGroup = Effect.fn('stopGroup')(function* (
  handle: ChildProcessSpawner.ChildProcessHandle,
  exited: Effect.Effect<RawExit>,
  limits: TurnLimits,
): Effect.fn.Return<RawExit> {
  yield* Effect.sync(() => {
    try {
      process.kill(-Number(handle.pid), 'SIGINT');
    } catch {
      // The group is already gone.
    }
  });
  const graceful = yield* exited.pipe(Effect.timeoutOption(limits.graceMs));
  if (Option.isSome(graceful)) {
    return graceful.value;
  }

  yield* handle
    .kill({ killSignal: 'SIGTERM', forceKillAfter: limits.killAfterMs })
    .pipe(Effect.ignore);
  return yield* exited.pipe(
    Effect.timeoutOption(limits.killAfterMs + limits.drainMs),
    Effect.map(Option.getOrElse((): RawExit => ({ code: null, signal: 'SIGKILL' }))),
  );
});

/**
 * The child process description: no shell, its own process group, an explicit environment and
 * arguments kept out of diagnostics, the prompt on stdin.
 *
 * @param invocation - The command line.
 * @param limits - The kill grace period.
 */
function turnCommand(invocation: Invocation, limits: TurnLimits) {
  return ChildProcess.make(
    invocation.command,
    invocation.args.map((value) => Redacted.make(value)),
    {
      cwd: invocation.cwd,
      env: Object.fromEntries(
        Object.entries(invocation.env).map(([name, value]) => [name, Redacted.make(value)]),
      ),
      extendEnv: false,
      shell: false,
      detached: true,
      killSignal: 'SIGTERM',
      forceKillAfter: limits.killAfterMs,
      stdin: { stream: Stream.make(new TextEncoder().encode(invocation.stdin)), endOnDone: true },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
}

/**
 * Reads a stream to its end, keeping only the first {@link MAX_STDERR_BYTES} bytes as text.
 *
 * @param stream - The stream.
 */
function boundedText(stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<string> {
  return stream.pipe(
    Stream.runFold(
      (): Uint8Array[] => [],
      (kept, chunk) => {
        const size = kept.reduce((total, piece) => total + piece.byteLength, 0);
        if (size < MAX_STDERR_BYTES) {
          kept.push(chunk.subarray(0, MAX_STDERR_BYTES - size));
        }

        return kept;
      },
    ),
    Effect.map((kept) => Buffer.concat(kept).toString('utf8')),
    Effect.orElseSucceed(() => ''),
  );
}

/**
 * Writes the invocation's files, such as Claude's MCP configuration, with their modes.
 *
 * @param files - The files.
 */
const writeFiles = Effect.fn('writeFiles')(function* (
  files: readonly InvocationFile[],
): Effect.fn.Return<void, Error, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  for (const file of files) {
    yield* fs.makeDirectory(path.dirname(file.path), { recursive: true });
    yield* fs.writeFileString(file.path, file.content, { mode: file.mode });
    yield* fs.chmod(file.path, file.mode);
  }
});

/**
 * A failed outcome.
 *
 * @param problem - What went wrong.
 */
function failed(problem: AgentProblem): TurnOutcome {
  return { status: 'failed', problem };
}
