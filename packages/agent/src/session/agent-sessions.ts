import type { ChildProcessSpawner } from 'effect/process';

import {
  beginTurnGuard,
  recoverTurnGuard,
  type GuardOutcome,
  type TurnGuardError,
} from '@deckster/brand/node';
import {
  Cause,
  Context,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  PubSub,
  Queue,
  Result,
  Schema,
  Scope,
  Semaphore,
  Stream,
} from 'effect';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { AgentError } from '#errors.ts';
import type { TurnLimits } from '#process/run-turn.ts';
import type {
  AgentEvent,
  AgentEventBody,
  AgentLintFinding,
  AgentPanelPosition,
  AgentProblem,
  AgentStatusEvent,
  ChangedFile,
  PromptMessage,
  RevertedChange,
  TurnDiffFile,
  TurnKind,
} from '#protocol/agent-events.ts';
import type { McpEndpoint } from '#protocol/mcp-endpoint.ts';
import type {
  AgentProvider,
  CommentRef,
  FindingRef,
  ParseState,
  ProviderStatus,
  ScreenshotRef,
  SlideRef,
  TurnOutcome,
  TurnRequest,
} from '#providers/provider-types.ts';

import { agentError } from '#errors.ts';
import { makeTurnJournal, type TurnJournal } from '#journal/turn-journal.ts';
import { DeckTools } from '#mcp/deck-tools.ts';
import { runTurn } from '#process/run-turn.ts';
import { buildPrompt } from '#prompt/build-prompt.ts';
import { standingRules } from '#prompt/standing-rules.ts';
import { decodeAgentEvent } from '#protocol/events.ts';
import { agentDir } from '#protocol/mcp-endpoint.ts';
import { makeParseState } from '#providers/provider-types.ts';
import { isSessionLost } from '#providers/turn-problems.ts';
import { slideScreenshot } from '#screenshot/slide-screenshot.ts';
import { compareLint, findingsToFix, lintDeckFindings } from '#session/after-turn.ts';
import { acquireHostLock } from '#session/host-lock.ts';

/**
 * How many events of a conversation are kept in `session.json`.
 */
const MAX_SAVED_EVENTS = 1000;

/**
 * How many events of a conversation the host keeps in memory and replays to a new subscriber; older
 * ones are dropped (the panel shows the recent conversation, and `session.json` keeps fewer).
 */
export const MAX_LIVE_EVENTS = 4000;

/**
 * How long a turn waits for the background lint of the deck as it was before the turn, in
 * milliseconds. Without that baseline the turn cannot tell the errors it brought from those already
 * there, so it runs no automatic fix.
 */
const BASELINE_WAIT_MS = 20_000;

/**
 * How often `idle` checks whether the host is idle, in milliseconds.
 */
const IDLE_POLL_MS = 20;

/**
 * Spaces of indentation in `session.json`.
 */
const JSON_INDENT_SPACES = 2;

/**
 * How often the host brings the working copy into the deck while the provider runs, in
 * milliseconds, so the slide hot-reloads as the agent edits.
 */
const SYNC_INTERVAL_MS = 1000;

/**
 * The slide file extensions, in the order a slide id is looked up on disk.
 */
const SLIDE_EXTENSIONS = ['mdx', 'md', 'tsx', 'jsx'] as const;

/**
 * What a prompt from the panel carries.
 */
export type PromptInput = Omit<PromptMessage, 'type'>;

/**
 * How the agent host of one deck is set up.
 */
export type AgentSessionsOptions = {
  /**
   * The absolute workspace root.
   */
  readonly workspaceRoot: string;

  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * The brand the dev server renders with (`--brand`), or undefined to take the deck config's
   * (through the deck tools). Never what a page reports.
   */
  readonly brand: string | undefined;

  /**
   * The provider.
   */
  readonly provider: AgentProvider;

  /**
   * The model from `--agent-model`, or undefined for the provider's default.
   */
  readonly model: string | undefined;

  /**
   * Whether the agent may search the web (`--agent-web`). Default: false.
   */
  readonly web?: boolean;

  /**
   * Where the panel docks.
   */
  readonly panel: AgentPanelPosition;

  /**
   * The deck MCP endpoint; a function because the port is known only once the server listens.
   */
  readonly mcp: () => McpEndpoint;

  /**
   * The environment the provider's is picked from. Default: `process.env`.
   */
  readonly environment?: Readonly<Record<string, string | undefined>>;

  /**
   * Whether lint errors after a turn start one follow-up turn. Default: true.
   */
  readonly autoFix?: boolean;

  /**
   * Shorter turn limits, for tests.
   */
  readonly limits?: Partial<TurnLimits>;

  /**
   * Whether the host lints the deck in the background when it starts and after an undo or redo, so
   * the lint after a turn can tell the findings the turn brought from those already there. Default:
   * true.
   */
  readonly baselineLint?: boolean;

  /**
   * How long a turn waits for that background lint, in milliseconds. Default: 20 s.
   */
  readonly baselineWaitMs?: number;

  /**
   * How many events the host keeps in memory and replays. Default: {@link MAX_LIVE_EVENTS}.
   */
  readonly maxLiveEvents?: number;
};

/**
 * The agent host of one deck: one turn in flight, a queue behind it, the event stream every panel
 * subscribes to, undo and redo through the journal, and the provider session kept across turns and
 * restarts.
 */
export type AgentSessionsApi = {
  /**
   * Queues a prompt and returns its turn number.
   */
  readonly submit: (input: PromptInput) => Effect.Effect<number>;

  /**
   * The current conversation from its start (with the latest status), then every new event. The
   * subscription lives as long as the scope.
   */
  readonly subscribe: Effect.Effect<Stream.Stream<AgentEvent>, never, Scope.Scope>;

  /**
   * Stops the running turn and drops the queued ones.
   */
  readonly cancel: Effect.Effect<void>;

  /**
   * Restores the files of the last turn.
   */
  readonly undo: Effect.Effect<void>;

  /**
   * Applies the last undone turn again.
   */
  readonly redo: Effect.Effect<void>;

  /**
   * Undoes or redoes one named turn, idempotently: nothing happens unless that turn is the next one
   * to move (a second click, another window).
   */
  readonly moveHistory: (action: 'undo' | 'redo', turn: number) => Effect.Effect<void>;

  /**
   * Cancels everything, forgets the conversation and starts a new provider session next turn.
   */
  readonly newConversation: Effect.Effect<void>;

  /**
   * Sets the model of the next turns; undefined goes back to the default.
   */
  readonly setModel: (model: string | undefined) => Effect.Effect<void>;

  /**
   * Records what `doctor` found, for the panel's status.
   */
  readonly setProviderStatus: (status: ProviderStatus) => Effect.Effect<void>;

  /**
   * Waits until no turn runs and none is queued.
   */
  readonly idle: Effect.Effect<void>;

  /**
   * The events of the current conversation so far.
   */
  readonly history: Effect.Effect<readonly AgentEvent[]>;

  /**
   * The line diff of one turn's changes, from the journal.
   */
  readonly diff: (turn: number) => Effect.Effect<readonly TurnDiffFile[], AgentError>;
};

/**
 * A prompt waiting for its turn.
 */
type QueuedTurn = {
  /**
   * The turn number.
   */
  readonly turn: number;

  /**
   * Who asked.
   */
  readonly kind: TurnKind;

  /**
   * What the panel sent.
   */
  readonly input: PromptInput;

  /**
   * The findings to fix, for an automatic follow-up.
   */
  readonly findings: readonly FindingRef[];

  /**
   * The deck's findings before the user turn an automatic follow-up belongs to.
   */
  readonly baseline?: readonly AgentLintFinding[] | undefined;
};

/**
 * What `session.json` holds.
 */
const SavedSession = Schema.Struct({
  /**
   * The format version.
   */
  version: Schema.Literal(1),

  /**
   * The provider the session belongs to.
   */
  provider: Schema.String,

  /**
   * The model chosen in the panel, or null.
   */
  model: Schema.NullOr(Schema.String),

  /**
   * The provider session id, or null.
   */
  sessionId: Schema.NullOr(Schema.String),

  /**
   * Whether the provider has that session, so the next turn resumes it.
   */
  established: Schema.Boolean,

  /**
   * The session's cumulative cost so far (Claude reports running totals).
   */
  costUsd: Schema.Number,

  /**
   * The next turn number.
   */
  nextTurn: Schema.Number,

  /**
   * The next event number.
   */
  seq: Schema.Number,

  /**
   * The conversation's events, without streamed deltas.
   */
  transcript: Schema.Array(Schema.Unknown),
});

/**
 * Decodes `session.json`.
 */
const decodeSaved = Schema.decodeUnknownResult(Schema.fromJsonString(SavedSession));

/**
 * The list `comments` answers with; other fields are ignored.
 */
const CommentList = Schema.Struct({
  /**
   * The comments.
   */
  comments: Schema.Array(
    Schema.Struct({ id: Schema.String, text: Schema.String, location: Schema.String }),
  ),
});

/**
 * Decodes the comment list.
 */
const decodeComments = Schema.decodeUnknownResult(CommentList);

/**
 * The file a deck's conversation is saved in.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 */
export function sessionFile(workspaceRoot: string, deck: string): string {
  return path.join(agentDir(workspaceRoot, deck), 'session.json');
}

/**
 * Builds the agent host of one deck in the caller's scope. It takes the deck's host lock (one agent
 * host per deck, across processes), finishes an agent turn a crash or a kill left unfinished (the
 * turn guard puts the deck back as it was before it), and starts its worker in that scope, so
 * closing the scope interrupts the running turn, kills its process group and settles its guard.
 *
 * @param options - The deck, provider, panel and MCP endpoint.
 * @throws AgentError in the error channel when another live host holds the deck, or a turn left
 *   unfinished cannot be put back.
 */
export const makeAgentSessions = Effect.fn('makeAgentSessions')(function* (
  options: AgentSessionsOptions,
): Effect.fn.Return<
  AgentSessionsApi,
  AgentError,
  DeckTools | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const fs = yield* FileSystem.FileSystem;
  const tools = yield* DeckTools;
  const hostScope = yield* Scope.Scope;
  const services = yield* Effect.context<
    DeckTools | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  >();
  const environment = options.environment ?? process.env;
  const { provider, deck, workspaceRoot } = options;
  const dir = agentDir(workspaceRoot, deck);
  yield* acquireHostLock(dir, deck);
  yield* recoverTurnGuard(workspaceRoot, deck).pipe(
    Effect.mapError((error) => agentError(error.message)),
  );
  const journal: TurnJournal = yield* makeTurnJournal({ root: workspaceRoot, agentDir: dir, deck });
  const lock = yield* Semaphore.make(1);
  const control = yield* Semaphore.make(1);
  const persistLock = yield* Semaphore.make(1);
  const pubsub = yield* PubSub.unbounded<AgentEvent>();
  const queue = yield* Queue.unbounded<QueuedTurn>();
  const saved = yield* loadSession(workspaceRoot, deck, provider.id);
  const maxLiveEvents = options.maxLiveEvents ?? MAX_LIVE_EVENTS;
  const state = {
    seq: saved?.seq ?? 1,
    nextTurn: Math.max(saved?.nextTurn ?? 1, (yield* journal.lastTurn) + 1),
    history: [...(saved?.transcript ?? [])].slice(-maxLiveEvents),
    model: saved?.model ?? options.model,
    session: {
      id: saved?.sessionId ?? undefined,
      established: saved?.established ?? false,
      costUsd: saved?.costUsd ?? 0,
    },
    running: undefined as
      | { readonly turn: number; readonly cancel: Deferred.Deferred<void> }
      | undefined,
    pending: 0,
    providerStatus: undefined as ProviderStatus | undefined,
    problem: null as AgentProblem | null,
    status: undefined as AgentEvent | undefined,
    baseline: undefined as readonly AgentLintFinding[] | undefined,
    baselineRunning: undefined as Deferred.Deferred<void> | undefined,
    turnsStarted: 0,
    reverted: [] as readonly RevertedChange[],
  };

  /**
   * Runs a state-changing request after the ones before it, whichever connection sent them, so two
   * clicks on Undo or a model change beside a new conversation never interleave.
   *
   * @param effect - The request.
   */
  const serial = <A>(effect: Effect.Effect<A>): Effect.Effect<A> => control.withPermits(1)(effect);

  /**
   * Stamps an event with its number, time and turn, adds it to the conversation and sends it to
   * every subscriber. Status events are kept apart: only the latest is replayed.
   *
   * @param turn - The turn it belongs to, or null.
   * @param body - The event.
   */
  const emit = (turn: number | null, body: AgentEventBody): Effect.Effect<void> =>
    lock.withPermits(1)(
      Effect.suspend(() => {
        const event: AgentEvent = { ...body, seq: state.seq, at: Date.now(), turn };
        state.seq += 1;
        if (event.type === 'status') {
          state.status = event;
        } else {
          state.history.push(event);
          if (state.history.length > maxLiveEvents) {
            state.history.splice(0, state.history.length - maxLiveEvents);
          }
        }

        return PubSub.publish(pubsub, event);
      }),
    );

  /**
   * Sends the current status.
   */
  const publishStatus = Effect.fn('AgentSessions.publishStatus')(
    function* (): Effect.fn.Return<void> {
      const history = yield* journal.history;
      const queued = yield* Queue.size(queue);
      const status: AgentStatusEvent = {
        type: 'status',
        provider: provider.id,
        model: state.model ?? null,
        deck,
        panel: options.panel,
        version: state.providerStatus?.version ?? null,
        ready: state.problem === null,
        problem: state.problem,
        running: state.running?.turn ?? null,
        queued,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
      };
      yield* emit(null, status);
    },
  );

  /**
   * Writes `session.json`: the provider session, the model, the counters and the conversation
   * without its streamed deltas. Writes run one at a time and each reads the state when its turn
   * comes, so an older snapshot is never renamed over a newer one. A failure to write is a notice,
   * not a crash.
   */
  const persist = (): Effect.Effect<void> => persistLock.withPermits(1)(writeSession());

  /**
   * Writes `session.json` once, through its own temporary file.
   */
  const writeSession = Effect.fn('AgentSessions.writeSession')(
    function* (): Effect.fn.Return<void> {
      const file = sessionFile(workspaceRoot, deck);
      const body = {
        version: 1,
        provider: provider.id,
        model: state.model ?? null,
        sessionId: state.session.id ?? null,
        established: state.session.established,
        costUsd: state.session.costUsd,
        nextTurn: state.nextTurn,
        seq: state.seq,
        transcript: state.history
          .filter((event) => event.type !== 'text-delta')
          .slice(-MAX_SAVED_EVENTS),
      };
      const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
      yield* fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(
        Effect.andThen(
          fs.writeFileString(temporary, `${JSON.stringify(body, null, JSON_INDENT_SPACES)}\n`),
        ),
        Effect.andThen(fs.rename(temporary, file)),
        Effect.catch((error) =>
          fs.remove(temporary, { force: true }).pipe(
            Effect.ignore,
            Effect.andThen(
              emit(null, {
                type: 'notice',
                kind: 'info',
                message: `Could not save the conversation: ${error.message}`,
              }),
            ),
          ),
        ),
      );
    },
  );

  /**
   * Lints the deck in the background and keeps the findings as the baseline the next turn is
   * compared with, unless a turn started meanwhile (its edits could be in the result).
   */
  const refreshBaseline = Effect.gen(function* () {
    if (options.baselineLint === false) {
      return;
    }

    // Marked as running before the fork, so a turn that starts right away waits for it.
    const done = yield* Deferred.make<void>();
    state.baselineRunning = done;
    const startedBefore = state.turnsStarted;
    yield* lintDeckFindings().pipe(
      Effect.tap((findings) =>
        Effect.sync(() => {
          // A turn whose provider started meanwhile may have edited files the lint read.
          if (findings !== undefined && state.turnsStarted === startedBefore) {
            state.baseline = findings;
          }
        }),
      ),
      Effect.ensuring(
        Effect.suspend(() => {
          if (state.baselineRunning === done) {
            state.baselineRunning = undefined;
          }

          return Deferred.succeed(done, undefined);
        }),
      ),
      Effect.provide(services),
      Effect.forkIn(hostScope),
    );
  });

  /**
   * The deck's findings before a turn: the baseline, after waiting (bounded) for a background lint
   * that is still running. Undefined when it is not known. With the background lint turned off, the
   * findings the last turn's lint saw, else none.
   */
  const awaitBaseline = Effect.gen(function* () {
    if (options.baselineLint === false) {
      // Without the background lint every finding on the touched slides counts as the turn's.
      return state.baseline ?? [];
    }

    const running = state.baselineRunning;
    if (state.baseline === undefined && running !== undefined) {
      yield* Deferred.await(running).pipe(
        Effect.timeoutOption(options.baselineWaitMs ?? BASELINE_WAIT_MS),
      );
    }

    return state.baseline;
  });

  /**
   * Finds a slide's file from the deck manifest (no page is opened), else on disk.
   *
   * @param id - The slide id.
   */
  const slideFile = Effect.fn('AgentSessions.slideFile')(function* (
    id: string,
  ): Effect.fn.Return<string | undefined> {
    const listed = yield* tools.slideFile(id).pipe(Effect.option);
    if (Option.isSome(listed) && listed.value !== undefined) {
      return listed.value;
    }

    for (const extension of SLIDE_EXTENSIONS) {
      const file = `decks/${deck}/slides/${id}.${extension}`;
      if (
        yield* fs.exists(path.join(workspaceRoot, file)).pipe(Effect.orElseSucceed(() => false))
      ) {
        return file;
      }
    }

    return undefined;
  });

  /**
   * Turns what the panel sent into a full turn request: the slide (or the page the user looked at
   * last), the attached comments and the screenshot. The slide's file always comes from the deck
   * manifest by id, never from what a page reports; its title and layout come from the page link
   * when the page shows that slide. The brand comes from `--brand` or the deck config, never from
   * the page. Nothing here opens a headless page, so the provider starts at once (a screenshot,
   * when asked for, is the one exception).
   *
   * @param item - The queued turn.
   * @param turn - Its number, for notices.
   */
  const resolveRequest = Effect.fn('AgentSessions.resolveRequest')(function* (
    item: QueuedTurn,
    turn: number,
  ): Effect.fn.Return<TurnRequest> {
    const { input } = item;
    const brand =
      options.brand ?? Option.getOrUndefined(yield* tools.brandName.pipe(Effect.option));
    const current = yield* tools.currentSlide.pipe(Effect.option);
    const page = Option.isSome(current) && current.value.connected ? current.value : undefined;
    const id = input.slide?.id ?? page?.slide.id;
    const step = input.slide?.step ?? page?.step ?? 0;
    let slide: SlideRef | undefined;
    if (id !== undefined) {
      const file = yield* slideFile(id);
      if (file === undefined) {
        yield* emit(turn, {
          type: 'notice',
          kind: 'info',
          message: `There is no slide "${id}" in decks/${deck}; the prompt goes without a slide.`,
        });
      } else {
        const shown = page?.slide.id === id ? page.slide : undefined;
        slide = { id, file, layout: shown?.layout ?? '', title: shown?.title ?? '', step };
      }
    }

    const comments: CommentRef[] = [];
    if ((input.comments ?? []).length > 0) {
      const listed = yield* tools.comments({ action: 'list', status: 'all' }).pipe(Effect.option);
      const decoded = Option.isSome(listed) ? decodeComments(listed.value) : undefined;
      if (decoded !== undefined && Result.isSuccess(decoded)) {
        for (const wanted of input.comments ?? []) {
          const found = decoded.success.comments.find((comment) => comment.id === wanted);
          if (found !== undefined) {
            comments.push({ id: found.id, text: found.text, location: found.location });
          }
        }
      }
    }

    let screenshot: ScreenshotRef | undefined;
    if (input.screenshot === true && slide !== undefined) {
      const shot = yield* slideScreenshot(tools, slide.id, slide.step).pipe(Effect.result);
      if (Result.isSuccess(shot)) {
        screenshot = shot.success;
      } else {
        yield* emit(turn, {
          type: 'notice',
          kind: 'info',
          message: `The screenshot could not be taken, so the prompt goes without it: ${shot.failure.message}`,
        });
      }
    }

    const model =
      state.model ?? (yield* provider.defaultModel(environment).pipe(Effect.provide(services)));
    return {
      deck,
      brand,
      text: input.text,
      kind: item.kind,
      slide,
      selection:
        input.selection === undefined
          ? undefined
          : { text: input.selection.text, source: input.selection.source },
      comments,
      findings: item.findings,
      screenshot,
      reverted: state.reverted,
      web: options.web === true,
      model,
    };
  });

  /**
   * Runs the provider for a turn, once more with a fresh session when the provider says the session
   * it was given is gone or already taken (a first turn that failed after start-up, a session the
   * provider has dropped): the person is told the conversation was restarted.
   *
   * @param turn - The turn number.
   * @param request - The resolved request, with its working copy.
   * @param cancel - The turn's cancel signal.
   * @param workingCopy - The turn's working copy, absolute.
   */
  const runProvider = Effect.fn('AgentSessions.runProvider')(function* (
    turn: number,
    request: TurnRequest,
    cancel: Deferred.Deferred<void>,
    workingCopy: string,
  ): Effect.fn.Return<
    { readonly outcome: TurnOutcome; readonly parseState: ParseState },
    never,
    FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  > {
    for (let attempt = 0; ; attempt += 1) {
      const sessionId =
        state.session.established || !provider.namesSessions
          ? state.session.id
          : (state.session.id ?? randomUUID());
      if (provider.namesSessions && !state.session.established) {
        state.session.id = sessionId;
      }

      const parseState = makeParseState(
        workspaceRoot,
        state.session.established ? state.session.costUsd : 0,
        [{ from: workingCopy, to: path.join(workspaceRoot, 'decks', deck) }],
      );
      const invocation = provider.invocation({
        turn: request,
        prompt: buildPrompt(request),
        rules: standingRules(deck, request.web),
        session: { id: sessionId, resume: state.session.established && sessionId !== undefined },
        mcp: options.mcp(),
        workspaceRoot,
        agentDir: dir,
        workingCopy,
        environment,
      });
      const outcome = yield* runTurn({
        provider,
        invocation,
        state: parseState,
        cancel,
        onEvent: (event) => emit(turn, event),
        ...(options.limits === undefined ? {} : { limits: options.limits }),
      });
      // Once the stream named the session, the provider has it, whatever happened next.
      if (parseState.sessionId !== undefined) {
        state.session.id = parseState.sessionId;
        state.session.established = true;
      }

      const lost =
        outcome.status === 'failed' &&
        isSessionLost(outcome.problem) &&
        !(yield* Deferred.isDone(cancel));
      if (!lost || attempt > 0) {
        return { outcome, parseState };
      }

      state.session = { id: undefined, established: false, costUsd: 0 };
      yield* persist();
      yield* emit(turn, {
        type: 'notice',
        kind: 'info',
        message: `${provider.label} no longer had this conversation (${outcome.problem?.message ?? 'session not found'}), so it was restarted: the agent does not see the earlier messages. The prompt runs again in a new session.`,
      });
    }
  });

  /**
   * Runs the provider for a turn under the turn guard: the guard records the deck's and brand's
   * other files, holds their code and makes the turn's working copy before the provider starts;
   * while it runs the working copy is brought into the deck every second (and before every deck
   * tool that reads the deck); the guard settles whatever way the provider run ends (success,
   * failure, cancel, a defect, the host closing): one last sync, the working copy retired, the
   * other files verified. A guard that cannot start fails the turn before the provider runs.
   *
   * @param turn - The turn number.
   * @param request - The resolved request.
   * @param cancel - The turn's cancel signal.
   */
  const runGuarded = Effect.fn('AgentSessions.runGuarded')(function* (
    turn: number,
    request: TurnRequest,
    cancel: Deferred.Deferred<void>,
  ): Effect.fn.Return<
    {
      readonly outcome: TurnOutcome;
      readonly costUsd: number | undefined;
      readonly settled: Result.Result<GuardOutcome, TurnGuardError>;
    },
    TurnGuardError,
    FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  > {
    const guard = yield* beginTurnGuard({ workspaceRoot, deck, brand: request.brand }, turn);
    const settled = yield* Deferred.make<Result.Result<GuardOutcome, TurnGuardError>>();
    // Stopped by a signal, never interrupted, so a sync is never cut off half way through a file.
    const stop = yield* Deferred.make<void>();
    const syncing = yield* Effect.gen(function* () {
      while (!(yield* Deferred.isDone(stop))) {
        yield* Effect.raceFirst(Effect.sleep(SYNC_INTERVAL_MS), Deferred.await(stop));
        if (!(yield* Deferred.isDone(stop))) {
          yield* guard.sync;
        }
      }
    }).pipe(Effect.forkChild);
    const ran = yield* runProvider(
      turn,
      { ...request, workingCopy: guard.staging.absolute },
      cancel,
      guard.staging.absolute,
    ).pipe(
      Effect.exit,
      Effect.ensuring(
        Deferred.succeed(stop, undefined).pipe(
          Effect.andThen(Fiber.join(syncing)),
          Effect.andThen(guard.settle),
          Effect.result,
          Effect.flatMap((result) => Deferred.succeed(settled, result)),
        ),
      ),
    );
    const result = yield* Deferred.await(settled);
    if (ran._tag === 'Success') {
      return {
        outcome: ran.value.outcome,
        costUsd: ran.value.parseState.costUsd,
        settled: result,
      };
    }

    return {
      outcome: {
        status: 'failed',
        problem: {
          kind: 'crashed',
          message: `The turn stopped on an internal error: ${Cause.pretty(ran.cause).split('\n')[0] ?? 'unknown'}`,
          fix: 'Send the prompt again; if it happens again, restart the dev server.',
        },
      },
      costUsd: undefined,
      settled: result,
    };
  });

  /**
   * Runs one turn from start to `turn-done`: the guarded provider run, then what the guard ignored
   * (`reverted`, remembered for the next turn's prompt), the content changes recorded in the
   * journal, the lint of what it touched against the baseline and, once, the follow-up that fixes
   * the errors the turn brought. A cancel at any point, the lint included, stops the chain.
   *
   * @param item - The turn.
   */
  const runQueued = Effect.fn('AgentSessions.runQueued')(function* (
    item: QueuedTurn,
  ): Effect.fn.Return<
    void,
    never,
    FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner | DeckTools
  > {
    const { turn } = item;
    const cancel = yield* Deferred.make<void>();
    state.running = { turn, cancel };
    yield* publishStatus();
    const started = Date.now();
    const baseline = item.kind === 'auto-fix' ? item.baseline : yield* awaitBaseline;
    state.turnsStarted += 1;
    const request = yield* resolveRequest(item, turn);
    yield* emit(turn, {
      type: 'turn-started',
      text: item.kind === 'auto-fix' ? item.input.text : request.text,
      kind: item.kind,
      slide:
        request.slide === undefined
          ? null
          : { id: request.slide.id, file: request.slide.file, step: request.slide.step },
      provider: provider.id,
      model: request.model ?? null,
    });
    const guarded = yield* runGuarded(turn, request, cancel).pipe(Effect.result);
    if (Result.isFailure(guarded)) {
      yield* emit(turn, problemEvent('crashed', guarded.failure.message));
      yield* emit(turn, { type: 'turn-done', status: 'failed', changedFiles: [], durationMs: 0 });
      state.running = undefined;
      return yield* publishStatus();
    }

    const { outcome, costUsd, settled } = guarded.success;
    state.reverted = [];
    let changes: ChangedFile[] = [];
    let conflicts: readonly string[] = [];
    if (Result.isFailure(settled)) {
      yield* emit(turn, problemEvent('crashed', settled.failure.message));
    } else {
      const guardOutcome = settled.success;
      if (guardOutcome.failure !== undefined) {
        yield* emit(turn, problemEvent('crashed', guardOutcome.failure));
      }

      if (guardOutcome.reverted.length > 0) {
        state.reverted = guardOutcome.reverted;
        yield* emit(turn, {
          type: 'reverted',
          paths: guardOutcome.reverted,
          copies: guardOutcome.copies ?? null,
        });
      }

      conflicts = guardOutcome.conflicts;
      changes = yield* journal.record(turn, guardOutcome.kept).pipe(
        Effect.catch((error) =>
          emit(turn, problemEvent('crashed', error.message)).pipe(
            Effect.as(
              guardOutcome.kept.map((change): ChangedFile => ({
                path: change.path,
                kind: change.kind,
                undoable: false,
              })),
            ),
          ),
        ),
      );
    }

    if (costUsd !== undefined) {
      state.session.costUsd = costUsd;
    }

    if (outcome.problem !== undefined && outcome.status === 'failed') {
      yield* emit(turn, { type: 'error', ...outcome.problem });
    }

    if (outcome.problem?.kind === 'not-signed-in' || outcome.problem?.kind === 'not-installed') {
      state.problem = outcome.problem;
    } else if (outcome.status === 'completed') {
      state.problem = state.providerStatus?.problem ?? null;
      if (state.problem?.kind === 'not-signed-in') {
        state.problem = null;
      }
    }

    // Streamed deltas are replaced by the complete messages once the turn ends.
    state.history = state.history.filter(
      (event) => !(event.turn === turn && event.type === 'text-delta'),
    );
    yield* emit(turn, {
      type: 'turn-done',
      status: outcome.status,
      changedFiles: changes,
      durationMs: Date.now() - started,
      ...(conflicts.length === 0 ? {} : { conflicts }),
    });
    yield* persist();
    const followUp =
      outcome.status === 'cancelled' || changes.length === 0
        ? undefined
        : yield* afterTurn(item, changes, baseline, cancel);
    if (followUp !== undefined) {
      return yield* runQueued(followUp);
    }

    state.running = undefined;
    yield* publishStatus();
  });

  /**
   * Ends a turn that stopped on a defect (a bug, never a user's doing): an error, a failed
   * `turn-done`, no turn running, so the queue keeps draining.
   *
   * @param turn - The turn.
   * @param cause - What went wrong.
   */
  const recoverDefect = Effect.fn('AgentSessions.recoverDefect')(function* (
    turn: number,
    cause: Cause.Cause<unknown>,
  ): Effect.fn.Return<void> {
    yield* emit(
      turn,
      problemEvent(
        'crashed',
        `The turn stopped on an internal error: ${Cause.pretty(cause).split('\n')[0] ?? 'unknown'}\nSend the prompt again; if it happens again, restart the dev server.`,
      ),
    );
    yield* emit(turn, { type: 'turn-done', status: 'failed', changedFiles: [], durationMs: 0 });
    state.running = undefined;
    yield* publishStatus();
  });

  /**
   * Lints the deck after a turn, emits the findings the turn brought (with the ones already there
   * apart), and returns the automatic follow-up when the turn brought errors. A cancel during the
   * lint stops it, and a cancel before the follow-up starts drops it.
   *
   * @param item - The turn.
   * @param changes - What it changed.
   * @param baseline - The deck's findings before the turn, when known.
   * @param cancel - The turn's cancel signal.
   */
  const afterTurn = Effect.fn('AgentSessions.afterTurn')(function* (
    item: QueuedTurn,
    changes: readonly ChangedFile[],
    baseline: readonly AgentLintFinding[] | undefined,
    cancel: Deferred.Deferred<void>,
  ): Effect.fn.Return<QueuedTurn | undefined, never, DeckTools> {
    if (yield* Deferred.isDone(cancel)) {
      return undefined;
    }

    const linted = yield* Effect.raceFirst(
      lintDeckFindings().pipe(Effect.map((findings) => ({ findings }))),
      Deferred.await(cancel).pipe(Effect.as(undefined)),
    );
    if (linted === undefined || linted.findings === undefined) {
      return undefined;
    }

    state.baseline = linted.findings;
    const lint = compareLint(deck, changes, linted.findings, baseline);
    if (lint === undefined) {
      return undefined;
    }

    if (baseline === undefined && lint.errors > 0 && item.kind === 'user') {
      yield* emit(item.turn, {
        type: 'notice',
        kind: 'info',
        message:
          'The deck was not linted before this turn in time, so some of these findings may be older than the turn, and no automatic fix runs.',
      });
    }

    const cancelled = yield* Deferred.isDone(cancel);
    const autoFix =
      lint.errors > 0 &&
      item.kind === 'user' &&
      options.autoFix !== false &&
      !cancelled &&
      baseline !== undefined;
    yield* emit(item.turn, {
      type: 'lint',
      ok: lint.errors === 0,
      autoFix,
      slides: lint.slides,
      errors: lint.errors,
      warnings: lint.warnings,
      findings: lint.findings,
      ...(lint.existing.length === 0 ? {} : { existing: lint.existing }),
    });
    if (!autoFix) {
      return undefined;
    }

    const followUp: QueuedTurn = {
      turn: state.nextTurn,
      kind: 'auto-fix',
      input: {
        text: `Fix ${lint.errors} lint ${lint.errors === 1 ? 'error' : 'errors'} on ${lint.slides.join(', ') || 'the changed files'}.`,
        ...(item.input.slide === undefined ? {} : { slide: item.input.slide }),
      },
      findings: findingsToFix(lint),
      baseline,
    };
    state.nextTurn += 1;
    return followUp;
  });

  /**
   * Takes turns from the queue one at a time, for as long as the scope lives.
   */
  const worker = Effect.gen(function* () {
    while (true) {
      const item = yield* Queue.take(queue);
      yield* runQueued(item).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : recoverDefect(state.running?.turn ?? item.turn, cause),
        ),
        Effect.ensuring(Effect.sync(() => (state.pending -= 1))),
      );
    }
  });
  yield* Effect.forkScoped(worker);
  yield* Effect.addFinalizer(() => persist());

  /**
   * Drops the queued turns, each with a cancelled `turn-done`.
   */
  const dropQueued = Effect.fn('AgentSessions.dropQueued')(function* (): Effect.fn.Return<void> {
    const dropped = yield* Queue.clear(queue);
    state.pending -= dropped.length;
    for (const item of dropped) {
      yield* emit(item.turn, {
        type: 'turn-done',
        status: 'cancelled',
        changedFiles: [],
        durationMs: 0,
      });
    }
  });

  /**
   * Moves the files of a turn back or forward, refusing while a turn runs. With an expected turn it
   * does nothing unless that turn is the next to move, so a repeated request is harmless.
   *
   * @param action - Undo or redo.
   * @param expected - The turn the client means, if it said.
   */
  const history = Effect.fn('AgentSessions.history')(function* (
    action: 'undo' | 'redo',
    expected: number | undefined,
  ): Effect.fn.Return<void> {
    if (state.running !== undefined) {
      return yield* emit(
        null,
        problemEvent(
          'bad-request',
          `A turn is running.\nWait for it to end, or cancel it, before you ${action}.`,
        ),
      );
    }

    if (expected !== undefined && (yield* journal.targets)[action] !== expected) {
      return yield* publishStatus();
    }

    const operation = action === 'undo' ? journal.undo : journal.redo;
    const result = yield* operation.pipe(Effect.result);
    if (Result.isFailure(result)) {
      const { message } = result.failure;
      const conflict =
        message.includes('changed after') ||
        message.includes('outside the folders the agent may edit');
      yield* emit(null, problemEvent(conflict ? 'conflict' : 'bad-request', message));
    } else {
      yield* emit(null, { type: 'history', action, ...result.success });
      const skipped = result.success.skipped ?? [];
      if (skipped.length > 0) {
        yield* emit(null, {
          type: 'notice',
          kind: 'info',
          message: `Not restored (too large to undo): ${skipped.map((file) => file.path).join(', ')}.`,
        });
      }

      yield* refreshBaseline;
    }

    yield* publishStatus();
  });

  /**
   * Waits until no turn runs and none waits.
   */
  const waitIdle = Effect.gen(function* () {
    while (state.pending > 0) {
      yield* Effect.sleep(IDLE_POLL_MS);
    }
  });

  yield* refreshBaseline;
  yield* publishStatus();
  return {
    submit: (input) =>
      serial(
        Effect.gen(function* () {
          const turn = state.nextTurn;
          state.nextTurn += 1;
          const position = state.pending;
          state.pending += 1;
          yield* emit(turn, { type: 'turn-queued', text: input.text, kind: 'user', position });
          yield* Queue.offer(queue, { turn, kind: 'user', input, findings: [] });
          yield* publishStatus();
          return turn;
        }),
      ),

    subscribe: lock.withPermits(1)(
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(pubsub);
        const replay = [...state.history, ...(state.status === undefined ? [] : [state.status])];
        replay.sort((left, right) => left.seq - right.seq);
        return Stream.concat(Stream.fromIterable(replay), Stream.fromSubscription(subscription));
      }),
    ),

    cancel: Effect.gen(function* () {
      yield* dropQueued();
      if (state.running !== undefined) {
        yield* Deferred.succeed(state.running.cancel, undefined);
      }

      yield* publishStatus();
    }),

    undo: serial(history('undo', undefined)),
    redo: serial(history('redo', undefined)),
    moveHistory: (action, turn) => serial(history(action, turn)),

    newConversation: serial(
      Effect.gen(function* () {
        yield* dropQueued();
        if (state.running !== undefined) {
          yield* Deferred.succeed(state.running.cancel, undefined);
        }

        yield* waitIdle;
        state.history = [];
        state.session = { id: undefined, established: false, costUsd: 0 };
        yield* emit(null, { type: 'conversation-reset' });
        yield* persist();
        yield* publishStatus();
      }),
    ),

    setModel: (model) =>
      serial(
        Effect.gen(function* () {
          state.model = model === undefined || model.trim() === '' ? undefined : model.trim();
          yield* persist();
          yield* publishStatus();
        }),
      ),

    setProviderStatus: Effect.fn('AgentSessions.setProviderStatus')(function* (status) {
      state.providerStatus = status;
      state.problem = status.problem;
      yield* publishStatus();
    }),

    idle: waitIdle,

    history: Effect.sync(() => [...state.history]),

    diff: journal.diff,
  };
});

/**
 * The agent host as a service, built by {@link makeAgentSessions}.
 */
export class AgentSessions extends Context.Service<AgentSessions, AgentSessionsApi>()(
  'agent/AgentSessions',
) {
  /**
   * The agent host of one deck, scoped to the layer.
   *
   * @param options - The deck, provider, panel and MCP endpoint.
   */
  static readonly layer = (
    options: AgentSessionsOptions,
  ): Layer.Layer<
    AgentSessions,
    AgentError,
    DeckTools | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  > => Layer.effect(AgentSessions, makeAgentSessions(options));
}

/**
 * Reads `session.json` when it belongs to the same provider; anything else starts fresh.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param deck - The deck folder name.
 * @param provider - The provider id.
 */
const loadSession = Effect.fn('loadSession')(function* (
  workspaceRoot: string,
  deck: string,
  provider: string,
): Effect.fn.Return<
  | (Omit<typeof SavedSession.Type, 'transcript'> & { readonly transcript: AgentEvent[] })
  | undefined,
  never,
  FileSystem.FileSystem
> {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(sessionFile(workspaceRoot, deck))
    .pipe(Effect.orElseSucceed(() => ''));
  const decoded = decodeSaved(text);
  if (Result.isFailure(decoded) || decoded.success.provider !== provider) {
    return undefined;
  }

  const transcript = decoded.success.transcript.flatMap((event) => {
    const one = decodeAgentEvent(event);
    return Result.isSuccess(one) ? [one.success] : [];
  });
  return { ...decoded.success, transcript };
});

/**
 * An error event from an agent error's message, whose second line, if any, is the fix.
 *
 * @param kind - The error kind.
 * @param message - The message.
 */
function problemEvent(kind: AgentProblem['kind'], message: string): AgentEventBody {
  const [first = message, ...rest] = message.split('\n');
  return { type: 'error', kind, message: first, fix: rest.join(' ') };
}
