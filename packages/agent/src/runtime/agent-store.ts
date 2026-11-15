import type {
  AgentEvent,
  AgentLintFinding,
  AgentProblem,
  AgentStatusEvent,
  ChangedFile,
  NoticeKind,
  ProviderId,
  RevertedChange,
  ToolStatus,
  TurnDiffFile,
  TurnKind,
} from '#protocol/agent-events.ts';

/**
 * Where the connection to the agent host is: connecting the first time, open, reconnecting after a
 * drop, or closed for good.
 */
export type ConnectionPhase = 'connecting' | 'open' | 'reconnecting' | 'closed';

/**
 * Where a turn is.
 */
export type TurnPhase = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Whether a turn's file changes are in place, undone, or discarded and so past undoing or redoing.
 */
export type TurnHistory = 'applied' | 'undone' | 'discarded';

/**
 * One line of the agent's side of a turn, in the order it happened.
 */
export type TranscriptItem =
  | {
      /**
       * Answer text: streamed from deltas until the complete message replaces them.
       */
      readonly kind: 'text';

      /**
       * A key unique within the turn.
       */
      readonly key: string;

      /**
       * The text so far.
       */
      readonly text: string;

      /**
       * Whether deltas are still arriving.
       */
      readonly streaming: boolean;
    }
  | {
      /**
       * A reasoning summary.
       */
      readonly kind: 'reasoning';

      /**
       * A key unique within the turn.
       */
      readonly key: string;

      /**
       * The summary.
       */
      readonly text: string;
    }
  | {
      /**
       * A tool call, updated in place as its status changes.
       */
      readonly kind: 'tool';

      /**
       * A key unique within the turn.
       */
      readonly key: string;

      /**
       * The provider's call id.
       */
      readonly id: string;

      /**
       * The tool name.
       */
      readonly name: string;

      /**
       * The core's one-line title.
       */
      readonly title: string;

      /**
       * Where the call is.
       */
      readonly status: ToolStatus;

      /**
       * The file it works on, relative to the workspace root, or null.
       */
      readonly path: string | null;

      /**
       * Why it failed or was refused, or null.
       */
      readonly detail: string | null;
    }
  | {
      /**
       * Something said in passing: a retry, a rate-limit warning, tools that did not connect.
       */
      readonly kind: 'notice';

      /**
       * A key unique within the turn.
       */
      readonly key: string;

      /**
       * What kind of notice.
       */
      readonly notice: NoticeKind;

      /**
       * The text.
       */
      readonly message: string;
    }
  | {
      /**
       * A failure of the turn.
       */
      readonly kind: 'error';

      /**
       * A key unique within the turn.
       */
      readonly key: string;

      /**
       * What went wrong and the fix.
       */
      readonly problem: AgentProblem;
    };

/**
 * Tokens and cost of a turn, summed over its usage events.
 */
export type TurnUsage = {
  /**
   * Input tokens, cached ones included.
   */
  readonly inputTokens: number;

  /**
   * Input tokens read from the cache.
   */
  readonly cachedInputTokens: number;

  /**
   * Output tokens.
   */
  readonly outputTokens: number;

  /**
   * The cost in US dollars, or null when the provider does not say.
   */
  readonly costUsd: number | null;
};

/**
 * The lint result of the slides a turn touched.
 */
export type TurnLint = {
  /**
   * True when there are no errors.
   */
  readonly ok: boolean;

  /**
   * The slides linted.
   */
  readonly slides: readonly string[];

  /**
   * The error count.
   */
  readonly errors: number;

  /**
   * The warning count.
   */
  readonly warnings: number;

  /**
   * The findings.
   */
  readonly findings: readonly AgentLintFinding[];

  /**
   * Whether an automatic follow-up turn was started to fix the errors.
   */
  readonly autoFix: boolean;

  /**
   * Findings that were on these slides before the turn: not the turn's doing. Left out when none.
   */
  readonly existing?: readonly AgentLintFinding[];
};

/**
 * One turn: the prompt, what the agent did, and the footer data.
 */
export type TurnView = {
  /**
   * The turn number.
   */
  readonly turn: number;

  /**
   * Who asked: the person, or the automatic lint fix.
   */
  readonly kind: TurnKind;

  /**
   * The prompt as written, or the summary of the findings for an auto-fix.
   */
  readonly prompt: string;

  /**
   * Where the turn is.
   */
  readonly phase: TurnPhase;

  /**
   * How many turns were ahead when it was queued, or null once it started.
   */
  readonly position: number | null;

  /**
   * The slide it is about, or null.
   */
  readonly slide: {
    /**
     * The slide id.
     */
    readonly id: string;

    /**
     * The slide file relative to the workspace root.
     */
    readonly file: string;

    /**
     * The step.
     */
    readonly step: number;
  } | null;

  /**
   * The provider that ran it, or null before it started.
   */
  readonly provider: ProviderId | null;

  /**
   * The model, or null for the default.
   */
  readonly model: string | null;

  /**
   * What the agent said and did, in order.
   */
  readonly items: readonly TranscriptItem[];

  /**
   * The files the journal found changed, once the turn ended.
   */
  readonly changedFiles: readonly ChangedFile[];

  /**
   * How long it ran, once it ended.
   */
  readonly durationMs: number | null;

  /**
   * Tokens and cost, when reported.
   */
  readonly usage: TurnUsage | null;

  /**
   * The lint result, when lint ran after it.
   */
  readonly lint: TurnLint | null;

  /**
   * For an auto-fix turn, the turn whose lint errors it fixes.
   */
  readonly autoFixOf: number | null;

  /**
   * Whether its changes are in place, undone, or past undoing.
   */
  readonly history: TurnHistory;

  /**
   * The last error of the turn, for its retry action.
   */
  readonly error: AgentProblem | null;

  /**
   * Files an undo of this turn could not restore (too large to undo); empty when none.
   */
  readonly skipped: readonly ChangedFile[];

  /**
   * Content files the person edited in the deck while the agent changed them: their version was
   * kept, the agent's not applied; empty when none.
   */
  readonly conflicts: readonly string[];

  /**
   * What the framework did not take from the turn (or put back), or null when nothing.
   */
  readonly reverted: RevertedView | null;

  /**
   * When it was queued or started, in epoch milliseconds.
   */
  readonly at: number;
};

/**
 * A diff the panel asked for.
 */
export type DiffView =
  | {
      /**
       * Asked, not answered yet.
       */
      readonly state: 'loading';
    }
  | {
      /**
       * Answered with the files.
       */
      readonly state: 'ready';

      /**
       * The files and their hunks.
       */
      readonly files: readonly TurnDiffFile[];
    }
  | {
      /**
       * The journal has no record of the turn.
       */
      readonly state: 'unavailable';

      /**
       * Why.
       */
      readonly message: string;
    };

/**
 * How many turns the panel keeps; older ones leave the transcript (the host keeps a bounded
 * conversation too).
 */
export const MAX_PANEL_TURNS = 200;

/**
 * How many transcript items one turn keeps; the oldest go first.
 */
export const MAX_TURN_ITEMS = 400;

/**
 * What the framework did not take from a turn: files outside the deck's content it wrote (in its
 * working copy, ignored; or in the deck, put back).
 */
export type RevertedView = {
  /**
   * The paths and what the turn did to each.
   */
  readonly paths: readonly RevertedChange[];

  /**
   * Where copies of the turn's versions are kept, relative to the workspace root, or null.
   */
  readonly copies: string | null;
};

/**
 * Everything the panel draws, derived from the event stream alone.
 */
export type AgentViewState = {
  /**
   * Where the connection is.
   */
  readonly connection: ConnectionPhase;

  /**
   * Whether the connection was ever open, to tell reconnecting from connecting.
   */
  readonly connectedOnce: boolean;

  /**
   * The highest conversation event number applied; replays at or below it are skipped.
   */
  readonly lastSeq: number;

  /**
   * The latest status of the agent host, or null before the first.
   */
  readonly status: Omit<AgentStatusEvent, 'type'> | null;

  /**
   * The turns of the conversation, oldest first.
   */
  readonly turns: readonly TurnView[];

  /**
   * The last problem with a request that belongs to no turn: an undo the journal refused, a message
   * the host did not understand. Cleared by the next undo, redo or turn.
   */
  readonly requestProblem: AgentProblem | null;

  /**
   * The diffs asked for, by turn.
   */
  readonly diffs: Readonly<Record<number, DiffView>>;

  /**
   * The text for the polite live region: the last completed message or turn outcome.
   */
  readonly announcement: string;
};

/**
 * The state before the first event.
 */
export const INITIAL_AGENT_STATE: AgentViewState = {
  /**
   * Not connected yet.
   */
  connection: 'connecting',

  /**
   * Never connected.
   */
  connectedOnce: false,

  /**
   * No event applied.
   */
  lastSeq: 0,

  /**
   * No status yet.
   */
  status: null,

  /**
   * No turns.
   */
  turns: [],

  /**
   * No problem.
   */
  requestProblem: null,

  /**
   * No diffs asked for.
   */
  diffs: {},

  /**
   * Nothing to announce.
   */
  announcement: '',
};

/**
 * Records where the connection is. A drop after the first open reads as reconnecting.
 *
 * @param state - The state.
 * @param phase - `connecting`, `open` or `closed` from the connection.
 */
export function reduceConnection(
  state: AgentViewState,
  phase: 'connecting' | 'open' | 'closed',
): AgentViewState {
  if (phase === 'open') {
    return { ...state, connection: 'open', connectedOnce: true };
  }

  if (phase === 'connecting') {
    return { ...state, connection: state.connectedOnce ? 'reconnecting' : 'connecting' };
  }

  return { ...state, connection: 'closed' };
}

/**
 * Marks a diff as asked for.
 *
 * @param state - The state.
 * @param turn - The turn.
 */
export function requestDiffState(state: AgentViewState, turn: number): AgentViewState {
  const known = state.diffs[turn];
  if (known !== undefined && known.state !== 'unavailable') {
    return state;
  }

  return { ...state, diffs: { ...state.diffs, [turn]: { state: 'loading' } } };
}

/**
 * Applies one event to the view state. Pure: the same events give the same state, and an event
 * replayed after a reconnect (a `seq` at or below the last one applied) changes nothing.
 *
 * @param state - The state.
 * @param event - The event.
 */
export function reduceAgent(state: AgentViewState, event: AgentEvent): AgentViewState {
  if (event.seq > 0) {
    if (event.seq <= state.lastSeq) {
      return state;
    }

    return applyEvent({ ...state, lastSeq: event.seq }, event);
  }

  return applyEvent(state, event);
}

/**
 * Applies a list of events in order.
 *
 * @param events - The events.
 * @param state - Where to start; the initial state by default.
 */
export function reduceAll(
  events: readonly AgentEvent[],
  state: AgentViewState = INITIAL_AGENT_STATE,
): AgentViewState {
  return events.reduce(reduceAgent, state);
}

/**
 * Applies one new event.
 *
 * @param state - The state, with `lastSeq` already moved.
 * @param event - The event.
 */
function applyEvent(state: AgentViewState, event: AgentEvent): AgentViewState {
  switch (event.type) {
    case 'status': {
      const { type: _type, ...status } = event;
      // The host names the running turn before it sends `turn-started` (it first resolves the
      // slide and takes the screenshot), so a queued turn it names is already under way.
      const turns = state.turns.map((turn) =>
        turn.turn === status.running && turn.phase === 'queued'
          ? { ...turn, phase: 'running' as const, position: null }
          : turn,
      );
      return { ...state, status, turns };
    }

    case 'turn-queued':
      return upsertTurn(state, event.turn, event.at, (turn) => ({
        ...turn,
        kind: event.kind,
        prompt: event.text,
        phase: 'queued',
        position: event.position,
      }));
    case 'turn-started':
      return startTurn(state, event);
    case 'text-delta':
      return updateTurn(state, event, (turn) => appendDelta(turn, event.text));
    case 'text':
      return {
        ...updateTurn(state, event, (turn) => completeText(turn, event.text)),
        announcement: event.text,
      };
    case 'reasoning':
      return updateTurn(state, event, (turn) =>
        addItem(turn, { kind: 'reasoning', key: '', text: event.text }),
      );
    case 'tool':
      return updateTurn(state, event, (turn) => upsertTool(turn, event));
    case 'notice':
      return updateTurn(state, event, (turn) =>
        addItem(turn, { kind: 'notice', key: '', notice: event.kind, message: event.message }),
      );
    case 'usage':
      return updateTurn(state, event, (turn) => ({ ...turn, usage: addUsage(turn.usage, event) }));
    case 'lint': {
      const { type: _type, seq: _seq, at: _at, turn: _turn, ...lint } = event;
      return updateTurn(state, event, (turn) => ({ ...turn, lint }));
    }

    case 'turn-done':
      return finishTurn(state, event);
    case 'error':
      return reduceError(state, event);
    case 'history':
      return applyHistory(state, event);
    case 'conversation-reset':
      return resetConversation(state);
    case 'reverted':
      return {
        ...updateTurn(state, event, (turn) => ({
          ...turn,
          reverted: { paths: event.paths, copies: event.copies },
        })),
        announcement: `Ignored ${event.paths.length} ${event.paths.length === 1 ? 'change' : 'changes'} outside the slides.`,
      };
    case 'diff':
      return applyDiff(state, event);
    case 'session':
    case 'file-change':
      return state;
    default:
      // A newer host may send event types this panel does not know yet; they change nothing.
      return state;
  }
}

/**
 * Applies an undo or a redo: the turn's files are back in the other state, and the journal lists
 * the files it could not restore.
 *
 * @param state - The state.
 * @param event - The `history` event.
 */
function applyHistory(
  state: AgentViewState,
  event: Extract<AgentEvent, { type: 'history' }>,
): AgentViewState {
  const undone = event.action === 'undo';
  const history: TurnHistory = undone ? 'undone' : 'applied';
  return {
    ...state,
    requestProblem: null,
    turns: state.turns.map((turn) =>
      turn.turn === event.target ? { ...turn, history, skipped: event.skipped ?? [] } : turn,
    ),
    announcement: `${undone ? 'Undid' : 'Redid'} turn ${event.target}.`,
  };
}

/**
 * Clears the conversation: its turns and diffs go.
 *
 * @param state - The state.
 */
function resetConversation(state: AgentViewState): AgentViewState {
  return {
    ...state,
    turns: [],
    requestProblem: null,
    diffs: {},
    announcement: '',
  };
}

/**
 * Records the answer to a diff request for its turn. A diff without a turn changes nothing.
 *
 * @param state - The state.
 * @param event - The `diff` event.
 */
function applyDiff(
  state: AgentViewState,
  event: Extract<AgentEvent, { type: 'diff' }>,
): AgentViewState {
  if (event.turn === null) {
    return state;
  }

  return { ...state, diffs: { ...state.diffs, [event.turn]: diffAnswer(event) } };
}

/**
 * The answer to a diff request: the files, or why there are none.
 *
 * @param event - The `diff` event.
 */
function diffAnswer(event: Extract<AgentEvent, { type: 'diff' }>): DiffView {
  return event.available
    ? { state: 'ready', files: event.files }
    : { state: 'unavailable', message: event.message };
}

/**
 * A turn the stream mentions before it said what it is (a trimmed history), filled in later.
 *
 * @param turn - The turn number.
 * @param at - When it was first seen.
 */
function emptyTurn(turn: number, at: number): TurnView {
  return {
    turn,
    kind: 'user',
    prompt: '',
    phase: 'running',
    position: null,
    slide: null,
    provider: null,
    model: null,
    items: [],
    changedFiles: [],
    durationMs: null,
    usage: null,
    lint: null,
    autoFixOf: null,
    history: 'applied',
    error: null,
    skipped: [],
    conflicts: [],
    reverted: null,
    at,
  };
}

/**
 * Changes one turn, adding it first when it is new.
 *
 * @param state - The state.
 * @param number - The turn number.
 * @param at - When the event happened.
 * @param change - What to change.
 */
function upsertTurn(
  state: AgentViewState,
  number: number | null,
  at: number,
  change: (turn: TurnView) => TurnView,
): AgentViewState {
  if (number === null) {
    return state;
  }

  const index = state.turns.findIndex((turn) => turn.turn === number);
  const known = state.turns[index];
  if (known === undefined) {
    const turns = [...state.turns, change(emptyTurn(number, at))];
    turns.sort((left, right) => left.turn - right.turn);
    return {
      ...state,
      turns: turns.length > MAX_PANEL_TURNS ? turns.slice(-MAX_PANEL_TURNS) : turns,
    };
  }

  return { ...state, turns: state.turns.with(index, capItems(change(known))) };
}

/**
 * A turn with at most {@link MAX_TURN_ITEMS} transcript items, the newest kept.
 *
 * @param turn - The turn.
 */
function capItems(turn: TurnView): TurnView {
  return turn.items.length > MAX_TURN_ITEMS
    ? { ...turn, items: turn.items.slice(-MAX_TURN_ITEMS) }
    : turn;
}

/**
 * Changes the turn an event belongs to.
 *
 * @param state - The state.
 * @param event - The event.
 * @param change - What to change.
 */
function updateTurn(
  state: AgentViewState,
  event: AgentEvent,
  change: (turn: TurnView) => TurnView,
): AgentViewState {
  return upsertTurn(state, event.turn, event.at, change);
}

/**
 * Starts a turn: it leaves the queue, and an auto-fix turn is linked to the turn whose lint asked
 * for it.
 *
 * @param state - The state.
 * @param event - The `turn-started` event.
 */
function startTurn(
  state: AgentViewState,
  event: Extract<AgentEvent, { type: 'turn-started' }>,
): AgentViewState {
  const fixes =
    event.kind === 'auto-fix'
      ? state.turns.findLast(
          (turn) =>
            turn.turn !== event.turn &&
            turn.lint?.autoFix === true &&
            !state.turns.some((other) => other.autoFixOf === turn.turn),
        )?.turn
      : undefined;
  return {
    ...upsertTurn(state, event.turn, event.at, (turn) => ({
      ...turn,
      kind: event.kind,
      prompt: event.text,
      phase: 'running',
      position: null,
      slide: event.slide,
      provider: event.provider,
      model: event.model,
      autoFixOf: fixes ?? turn.autoFixOf,
    })),
    requestProblem: null,
  };
}

/**
 * Ends a turn. When it changed files, the turns undone before it are discarded: the journal drops
 * them, so they cannot be redone.
 *
 * @param state - The state.
 * @param event - The `turn-done` event.
 */
function finishTurn(
  state: AgentViewState,
  event: Extract<AgentEvent, { type: 'turn-done' }>,
): AgentViewState {
  const next = upsertTurn(state, event.turn, event.at, (turn) => ({
    ...turn,
    phase: event.status,
    position: null,
    changedFiles: event.changedFiles,
    conflicts: event.conflicts ?? [],
    durationMs: event.durationMs,
    items: turn.items.map((item) =>
      item.kind === 'text' && item.streaming ? { ...item, streaming: false } : item,
    ),
  }));
  const turns =
    event.changedFiles.length === 0
      ? next.turns
      : next.turns.map((turn) =>
          turn.turn !== event.turn && turn.history === 'undone'
            ? { ...turn, history: 'discarded' as const }
            : turn,
        );
  return { ...next, turns, announcement: outcomeText(event.status, event.changedFiles.length) };
}

/**
 * What the live region says when a turn ends.
 *
 * @param status - How it ended.
 * @param changed - How many files changed.
 */
function outcomeText(status: TurnPhase, changed: number): string {
  if (status === 'cancelled') {
    return 'Turn cancelled.';
  }

  if (status === 'failed') {
    return 'Turn failed.';
  }

  if (changed === 0) {
    return 'Turn finished; no files changed.';
  }

  const noun = changed === 1 ? 'file' : 'files';
  return `Turn finished; ${changed} ${noun} changed.`;
}

/**
 * Records an error: in its turn, or as the problem of a request outside any turn.
 *
 * @param state - The state.
 * @param event - The error event.
 */
function reduceError(
  state: AgentViewState,
  event: Extract<AgentEvent, { type: 'error' }>,
): AgentViewState {
  const problem: AgentProblem = { kind: event.kind, message: event.message, fix: event.fix };
  if (event.turn === null) {
    return { ...state, requestProblem: problem, announcement: problem.message };
  }

  return {
    ...updateTurn(state, event, (turn) => ({
      ...addItem(turn, { kind: 'error', key: '', problem }),
      error: problem,
    })),
    announcement: problem.message,
  };
}

/**
 * Adds an item to a turn with a key from its position.
 *
 * @param turn - The turn.
 * @param item - The item; its key is replaced.
 */
function addItem(turn: TurnView, item: TranscriptItem): TurnView {
  return { ...turn, items: [...turn.items, { ...item, key: `${item.kind}-${turn.items.length}` }] };
}

/**
 * Appends streamed text to the open text item, or opens one.
 *
 * @param turn - The turn.
 * @param text - The new text.
 */
function appendDelta(turn: TurnView, text: string): TurnView {
  const last = turn.items.at(-1);
  if (last?.kind === 'text' && last.streaming) {
    return { ...turn, items: turn.items.with(-1, { ...last, text: last.text + text }) };
  }

  return addItem(turn, { kind: 'text', key: '', text, streaming: true });
}

/**
 * Replaces the oldest open text item with the complete message, or adds it (a provider that sends
 * whole messages, or a replay without deltas). The oldest, because a tool call may arrive between a
 * message's deltas and the message itself; the deltas after the call open a newer item.
 *
 * @param turn - The turn.
 * @param text - The complete message.
 */
function completeText(turn: TurnView, text: string): TurnView {
  const open = turn.items.find(isStreamingText);
  if (open === undefined) {
    return addItem(turn, { kind: 'text', key: '', text, streaming: false });
  }

  const index = turn.items.indexOf(open);
  return { ...turn, items: turn.items.with(index, { ...open, text, streaming: false }) };
}

/**
 * Whether an item is a text item whose deltas are still arriving.
 *
 * @param item - The item.
 */
function isStreamingText(item: TranscriptItem): item is Extract<TranscriptItem, { kind: 'text' }> {
  return item.kind === 'text' && item.streaming;
}

/**
 * Adds a tool call, or updates the one with the same id.
 *
 * @param turn - The turn.
 * @param event - The tool event.
 */
function upsertTool(turn: TurnView, event: Extract<AgentEvent, { type: 'tool' }>): TurnView {
  const fields = {
    id: event.id,
    name: event.name,
    title: event.title,
    status: event.status,
    path: event.path,
    detail: event.detail,
  };
  const known = turn.items.find((item) => item.kind === 'tool' && item.id === event.id);
  if (known?.kind !== 'tool') {
    return addItem(turn, { kind: 'tool', key: '', ...fields });
  }

  const index = turn.items.indexOf(known);
  return { ...turn, items: turn.items.with(index, { ...known, ...fields }) };
}

/**
 * Adds a usage event to a turn's totals.
 *
 * @param usage - The totals so far.
 * @param event - The usage event.
 */
function addUsage(
  usage: TurnUsage | null,
  event: Extract<AgentEvent, { type: 'usage' }>,
): TurnUsage {
  if (usage === null) {
    return {
      inputTokens: event.inputTokens,
      cachedInputTokens: event.cachedInputTokens,
      outputTokens: event.outputTokens,
      costUsd: event.costUsd,
    };
  }

  return {
    inputTokens: usage.inputTokens + event.inputTokens,
    cachedInputTokens: usage.cachedInputTokens + event.cachedInputTokens,
    outputTokens: usage.outputTokens + event.outputTokens,
    costUsd:
      usage.costUsd === null && event.costUsd === null
        ? null
        : (usage.costUsd ?? 0) + (event.costUsd ?? 0),
  };
}

/**
 * Whether a turn runs or waits, so Undo, Redo and New conversation wait.
 *
 * @param state - The state.
 */
export function isBusy(state: AgentViewState): boolean {
  return (
    (state.status?.running ?? null) !== null ||
    state.turns.some((turn) => turn.phase === 'running' || turn.phase === 'queued')
  );
}

/**
 * The turn Undo would restore: the newest one whose changes are in place, when the host says there
 * is something to undo.
 *
 * @param state - The state.
 */
export function undoTarget(state: AgentViewState): number | undefined {
  if (state.status?.canUndo !== true) {
    return undefined;
  }

  return state.turns.findLast((turn) => turn.changedFiles.length > 0 && turn.history === 'applied')
    ?.turn;
}

/**
 * The turn Redo would apply again: the oldest undone one, when the host says there is something to
 * redo.
 *
 * @param state - The state.
 */
export function redoTarget(state: AgentViewState): number | undefined {
  if (state.status?.canRedo !== true) {
    return undefined;
  }

  return state.turns.find((turn) => turn.history === 'undone')?.turn;
}

/**
 * The newest lint findings the conversation has for a slide, or an empty list.
 *
 * @param state - The state.
 * @param slideId - The slide.
 */
export function lintFindingsFor(
  state: AgentViewState,
  slideId: string,
): readonly AgentLintFinding[] {
  const turn = state.turns.findLast((candidate) => candidate.lint?.slides.includes(slideId));
  const lint = turn?.lint;
  return [...(lint?.findings ?? []), ...(lint?.existing ?? [])].filter(
    (finding) => finding.slide === slideId,
  );
}

/**
 * The turns waiting in the queue, oldest first.
 *
 * @param state - The state.
 */
export function queuedTurns(state: AgentViewState): readonly TurnView[] {
  return state.turns.filter((turn) => turn.phase === 'queued');
}
