/**
 * The dev-server path of the agent WebSocket. Only a dev server started with `--agent` serves it.
 */
export const AGENT_PATH = '/__deck/agent';

/**
 * The WebSocket subprotocol the agent endpoint speaks. A client offers it and the server answers
 * with it; the handshake is authenticated by the dev session cookie, not by the subprotocol.
 */
export const AGENT_PROTOCOL = 'deck-agent.v1';

/**
 * The dev-only virtual module the agent runtime plugin reads its connection settings from.
 */
export const AGENT_VIRTUAL_ID = 'virtual:deck/agent';

/**
 * The agents the panel can drive. `fake` replays recorded transcripts and exists for tests only.
 */
export type ProviderId = 'claude' | 'codex' | 'fake';

/**
 * Where the chat panel docks.
 */
export type AgentPanelPosition = 'right' | 'bottom';

/**
 * Who asked for a turn: the person in the panel, or the automatic follow-up after lint errors.
 */
export type TurnKind = 'user' | 'auto-fix';

/**
 * Where a tool call is: still running, finished, failed, or refused by the permission rules or the
 * sandbox.
 */
export type ToolStatus = 'running' | 'done' | 'failed' | 'denied';

/**
 * How a turn changed a file.
 */
export type FileChangeKind = 'add' | 'update' | 'delete';

/**
 * How a turn ended.
 */
export type TurnStatus = 'completed' | 'failed' | 'cancelled';

/**
 * What went wrong, so the panel can show the right state and fix.
 */
export type AgentErrorKind =
  | 'not-installed'
  | 'not-signed-in'
  | 'rate-limit'
  | 'quota'
  | 'cancelled'
  | 'timeout'
  | 'crashed'
  | 'mcp-unavailable'
  | 'conflict'
  | 'bad-request';

/**
 * Something the panel shows in passing: a retry, a rate-limit warning, a tool server that did not
 * connect.
 */
export type NoticeKind = 'retry' | 'rate-limit' | 'mcp' | 'info';

/**
 * A problem with what it means and what to do.
 */
export type AgentProblem = {
  /**
   * What kind of problem it is.
   */
  readonly kind: AgentErrorKind;

  /**
   * What went wrong, as a sentence.
   */
  readonly message: string;

  /**
   * What to do about it, as a sentence or a command; empty when there is nothing to do.
   */
  readonly fix: string;
};

/**
 * A file a turn changed, relative to the workspace root.
 */
export type ChangedFile = {
  /**
   * The path relative to the workspace root, with forward slashes.
   */
  readonly path: string;

  /**
   * Whether the turn added, changed or deleted it.
   */
  readonly kind: FileChangeKind;

  /**
   * False when the journal kept no copy of one side because the file is larger than 5 MB, so undo
   * and redo leave it as it is. Absent means it can be undone.
   */
  readonly undoable?: boolean;

  /**
   * Never set since the working copy: the framework writes every change of a turn itself, and an
   * edit the person made during the turn is reported in `turn-done.conflicts` instead. Kept so
   * older transcripts still decode.
   */
  readonly concurrentEdit?: boolean;
};

/**
 * One lint finding on a slide a turn touched.
 */
export type AgentLintFinding = {
  /**
   * The slide id, or null for the deck as a whole.
   */
  readonly slide: string | null;

  /**
   * The file at fault, relative to the workspace root.
   */
  readonly file: string;

  /**
   * The step the problem shows at, or null.
   */
  readonly step: number | null;

  /**
   * The rule id.
   */
  readonly rule: string;

  /**
   * Whether it fails the deck.
   */
  readonly severity: 'error' | 'warning';

  /**
   * What is wrong.
   */
  readonly message: string;

  /**
   * How to fix it.
   */
  readonly fix: string;
};

/**
 * The state of the agent host: which provider and model, whether it can work, and what is running.
 * It is sent first to every new connection and again whenever it changes.
 */
export type AgentStatusEvent = {
  /**
   * The event's type.
   */
  readonly type: 'status';

  /**
   * The provider.
   */
  readonly provider: ProviderId;

  /**
   * The model turns use, or null for the provider's default.
   */
  readonly model: string | null;

  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * Where the panel docks.
   */
  readonly panel: AgentPanelPosition;

  /**
   * The provider's CLI version, or null before the check ran or when it is missing.
   */
  readonly version: string | null;

  /**
   * Whether the provider was found and signed in (true until a check says otherwise).
   */
  readonly ready: boolean;

  /**
   * Why the provider cannot work, with the fix, or null.
   */
  readonly problem: AgentProblem | null;

  /**
   * The turn that is running, or null.
   */
  readonly running: number | null;

  /**
   * How many turns wait behind it.
   */
  readonly queued: number;

  /**
   * Whether there is a turn to undo.
   */
  readonly canUndo: boolean;

  /**
   * Whether there is an undone turn to redo.
   */
  readonly canRedo: boolean;
};

/**
 * A prompt was accepted and waits for its turn.
 */
export type TurnQueuedEvent = {
  /**
   * The event's type.
   */
  readonly type: 'turn-queued';

  /**
   * The prompt text as the person wrote it.
   */
  readonly text: string;

  /**
   * Who asked.
   */
  readonly kind: TurnKind;

  /**
   * How many turns are ahead of it, the running one included.
   */
  readonly position: number;
};

/**
 * A turn started: the provider process is about to run.
 */
export type TurnStartedEvent = {
  /**
   * The event's type.
   */
  readonly type: 'turn-started';

  /**
   * The prompt text as the person wrote it, or the summary of the lint findings for an auto-fix.
   */
  readonly text: string;

  /**
   * Who asked.
   */
  readonly kind: TurnKind;

  /**
   * The slide the prompt is about, or null when none was given or found.
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
     * The step on screen.
     */
    readonly step: number;
  } | null;

  /**
   * The provider that runs it.
   */
  readonly provider: ProviderId;

  /**
   * The model, or null for the provider's default.
   */
  readonly model: string | null;
};

/**
 * The provider named its session; later turns resume it.
 */
export type SessionEvent = {
  /**
   * The event's type.
   */
  readonly type: 'session';

  /**
   * The provider's session or thread id.
   */
  readonly sessionId: string;
};

/**
 * A piece of the answer as it streams (Claude only; Codex sends whole messages).
 */
export type TextDeltaEvent = {
  /**
   * The event's type.
   */
  readonly type: 'text-delta';

  /**
   * The new text.
   */
  readonly text: string;
};

/**
 * A complete message of the answer. It replaces the deltas streamed before it.
 */
export type TextEvent = {
  /**
   * The event's type.
   */
  readonly type: 'text';

  /**
   * The message.
   */
  readonly text: string;
};

/**
 * A reasoning summary, when the provider shares one.
 */
export type ReasoningEvent = {
  /**
   * The event's type.
   */
  readonly type: 'reasoning';

  /**
   * The summary.
   */
  readonly text: string;
};

/**
 * A tool call started or ended. The same id comes again with the final status.
 */
export type ToolEvent = {
  /**
   * The event's type.
   */
  readonly type: 'tool';

  /**
   * The provider's id of the call.
   */
  readonly id: string;

  /**
   * The tool, such as `Read`, `Edit`, `shell`, `apply_patch` or `deck_lint`.
   */
  readonly name: string;

  /**
   * One line for the panel, such as `Edit decks/hello/slides/title.mdx`.
   */
  readonly title: string;

  /**
   * Where the call is.
   */
  readonly status: ToolStatus;

  /**
   * The file the call works on, relative to the workspace root, or null.
   */
  readonly path: string | null;

  /**
   * Why it failed or was refused, cut short, or null.
   */
  readonly detail: string | null;
};

/**
 * The provider reported a file change. The journal's own list in `turn-done` is the reliable one.
 */
export type FileChangeEvent = {
  /**
   * The event's type.
   */
  readonly type: 'file-change';

  /**
   * The path relative to the workspace root.
   */
  readonly path: string;

  /**
   * How it changed.
   */
  readonly kind: FileChangeKind;
};

/**
 * Tokens and cost of a turn.
 */
export type UsageEvent = {
  /**
   * The event's type.
   */
  readonly type: 'usage';

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
   * The turn's cost in US dollars, or null when the provider does not say (Codex).
   */
  readonly costUsd: number | null;
};

/**
 * Something to show in passing.
 */
export type NoticeEvent = {
  /**
   * The event's type.
   */
  readonly type: 'notice';

  /**
   * What kind of notice.
   */
  readonly kind: NoticeKind;

  /**
   * The text to show.
   */
  readonly message: string;
};

/**
 * The lint result of the slides a turn touched.
 */
export type LintEvent = {
  /**
   * The event's type.
   */
  readonly type: 'lint';

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
   * Whether an automatic follow-up turn was queued to fix the errors.
   */
  readonly autoFix: boolean;

  /**
   * Findings on the same slides that were already there before the turn: shown as "already there",
   * never counted in `errors` and `warnings`, never sent to an automatic follow-up. Left out when
   * there were none.
   */
  readonly existing?: readonly AgentLintFinding[];
};

/**
 * A turn ended. Every turn ends with exactly one of these.
 */
export type TurnDoneEvent = {
  /**
   * The event's type.
   */
  readonly type: 'turn-done';

  /**
   * How it ended.
   */
  readonly status: TurnStatus;

  /**
   * The content files the turn changed in the deck, as the framework brought them in from the
   * turn's working copy (or the deck tools wrote them).
   */
  readonly changedFiles: readonly ChangedFile[];

  /**
   * How long it ran, in milliseconds.
   */
  readonly durationMs: number;

  /**
   * Content files the agent changed but the person edited in the deck during the turn: the person's
   * version was kept and the agent's not applied. Relative to the workspace root; absent when
   * none.
   */
  readonly conflicts?: readonly string[];
};

/**
 * Something failed: the provider, the turn or a request.
 */
export type ErrorEvent = AgentProblem & {
  /**
   * The event's type.
   */
  readonly type: 'error';
};

/**
 * A turn's changes were undone or redone.
 */
export type HistoryEvent = {
  /**
   * The event's type.
   */
  readonly type: 'history';

  /**
   * What happened.
   */
  readonly action: 'undo' | 'redo';

  /**
   * The turn whose changes moved.
   */
  readonly target: number;

  /**
   * The files restored.
   */
  readonly files: readonly ChangedFile[];

  /**
   * Files of the turn that could not be restored (too large to undo); left out when none.
   */
  readonly skipped?: readonly ChangedFile[];
};

/**
 * The conversation was cleared; the next turn starts a new provider session.
 */
export type ConversationResetEvent = {
  /**
   * The event's type.
   */
  readonly type: 'conversation-reset';
};

/**
 * One path a turn wrote that is not content: left in its working copy (ignored), or put back in the
 * deck.
 */
export type RevertedChange = {
  /**
   * The path relative to the workspace root.
   */
  readonly path: string;

  /**
   * What was there, in a few words (`not content`, `a link`, `changed, put back`…).
   */
  readonly what: string;
};

/**
 * A turn wrote files that are not the deck's content: in its working copy (a stylesheet, a helper
 * module, a link…), which the framework did not take, or in the deck itself, which the turn guard
 * put back as it was. The next turn is told.
 */
export type RevertedEvent = {
  /**
   * The event's type.
   */
  readonly type: 'reverted';

  /**
   * What was put back, in path order.
   */
  readonly paths: readonly RevertedChange[];

  /**
   * The folder with copies of the files as the turn left them, relative to the workspace root, or
   * null when none were kept.
   */
  readonly copies: string | null;
};

/**
 * One hunk of a unified line diff.
 */
export type DiffHunk = {
  /**
   * The first old line the hunk covers, 1-based (0 when the old file had none).
   */
  readonly oldStart: number;

  /**
   * How many old lines it covers.
   */
  readonly oldLines: number;

  /**
   * The first new line the hunk covers, 1-based (0 when the new file has none).
   */
  readonly newStart: number;

  /**
   * How many new lines it covers.
   */
  readonly newLines: number;

  /**
   * The lines, each starting with a space (kept), `-` (removed) or `+` (added).
   */
  readonly lines: readonly string[];
};

/**
 * How one file changed in a turn, from the journal's pre- and post-images.
 */
export type TurnDiffFile = {
  /**
   * The path relative to the workspace root.
   */
  readonly path: string;

  /**
   * Whether the turn added, changed or deleted it.
   */
  readonly kind: FileChangeKind;

  /**
   * Lines added.
   */
  readonly added: number;

  /**
   * Lines removed.
   */
  readonly removed: number;

  /**
   * Whether the file is binary, so there are no hunks.
   */
  readonly binary: boolean;

  /**
   * Whether the hunks were cut short to keep the answer small.
   */
  readonly truncated: boolean;

  /**
   * The changes with three lines of context.
   */
  readonly hunks: readonly DiffHunk[];

  /**
   * True when the file is too large to diff: there are no hunks.
   */
  readonly tooLarge?: boolean;

  /**
   * False when the journal kept no copy of one side because the file is larger than 5 MB, so there
   * are no hunks and undo leaves it as it is. Absent means it can be undone.
   */
  readonly undoable?: boolean;
};

/**
 * The answer to a `diff` request, sent to the asking connection only (`seq` 0, `turn` the turn
 * asked about).
 */
export type TurnDiffEvent = {
  /**
   * The event's type.
   */
  readonly type: 'diff';

  /**
   * Whether the journal still has the turn.
   */
  readonly available: boolean;

  /**
   * Why there is no diff, or an empty string.
   */
  readonly message: string;

  /**
   * The changed files, in path order.
   */
  readonly files: readonly TurnDiffFile[];
};

/**
 * What an event is about, without its envelope.
 */
export type AgentEventBody =
  | AgentStatusEvent
  | TurnQueuedEvent
  | TurnStartedEvent
  | SessionEvent
  | TextDeltaEvent
  | TextEvent
  | ReasoningEvent
  | ToolEvent
  | FileChangeEvent
  | UsageEvent
  | NoticeEvent
  | LintEvent
  | TurnDoneEvent
  | ErrorEvent
  | HistoryEvent
  | ConversationResetEvent
  | TurnDiffEvent
  | RevertedEvent;

/**
 * The fields every event carries.
 */
export type AgentEventEnvelope = {
  /**
   * A number that grows with every event of the deck's agent host, across conversations and
   * restarts. 0 marks an answer to one connection that is not part of the conversation. A client
   * that reconnects skips what it already has.
   */
  readonly seq: number;

  /**
   * When it happened, in epoch milliseconds.
   */
  readonly at: number;

  /**
   * The turn it belongs to, or null.
   */
  readonly turn: number | null;
};

/**
 * One event of the agent stream, as the WebSocket sends it.
 */
export type AgentEvent = AgentEventBody & AgentEventEnvelope;

/**
 * The events a provider adapter produces from its output.
 */
export type ProviderEvent =
  | SessionEvent
  | TextDeltaEvent
  | TextEvent
  | ReasoningEvent
  | ToolEvent
  | FileChangeEvent
  | UsageEvent
  | NoticeEvent
  | ErrorEvent;

/**
 * Where a selection on the page came from.
 */
export type PromptSelection = {
  /**
   * The selected text.
   */
  readonly text: string;

  /**
   * The source location of the picked element, such as `slides/title.mdx:7:1`, when known.
   */
  readonly source?: string;
};

/**
 * Ask the agent something about a slide.
 */
export type PromptMessage = {
  /**
   * The message's type.
   */
  readonly type: 'prompt';

  /**
   * What the person wrote.
   */
  readonly text: string;

  /**
   * The slide and step on screen; the page the user looked at last when left out.
   */
  readonly slide?: {
    /**
     * The slide id.
     */
    readonly id: string;

    /**
     * The step, from 0.
     */
    readonly step: number;
  };

  /**
   * The selected text or picked element.
   */
  readonly selection?: PromptSelection;

  /**
   * Review comment ids to attach.
   */
  readonly comments?: readonly string[];

  /**
   * Whether to attach a screenshot of the slide at that step.
   */
  readonly screenshot?: boolean;
};

/**
 * What a client sends over the agent WebSocket.
 */
export type ClientMessage =
  | PromptMessage
  | {
      /**
       * Stop the running turn and drop the queued ones.
       */
      readonly type: 'cancel';
    }
  | {
      /**
       * Restore the files the last turn changed.
       */
      readonly type: 'undo';

      /**
       * The turn the panel means to undo. When given, the message is idempotent: it does nothing
       * unless that turn is the next one to undo (a second click, another window).
       */
      readonly turn?: number;
    }
  | {
      /**
       * Apply the last undone turn again.
       */
      readonly type: 'redo';

      /**
       * The turn the panel means to redo; when given, the message does nothing unless that turn is
       * the next one to redo.
       */
      readonly turn?: number;
    }
  | {
      /**
       * Forget the conversation; the next turn starts a new session.
       */
      readonly type: 'new-conversation';
    }
  | {
      /**
       * The message's type.
       */
      readonly type: 'set-model';

      /**
       * The model for the next turns, or null for the provider's default.
       */
      readonly model: string | null;
    }
  | {
      /**
       * Ask for the line diff of one turn's changes; answered with a `diff` event to this
       * connection only.
       */
      readonly type: 'diff';

      /**
       * The turn.
       */
      readonly turn: number;
    };

/**
 * What the dev-only virtual module tells the runtime plugin. It carries no secret: the page
 * authenticates with the `HttpOnly` session cookie the dev server sets on the deck's document.
 */
export type AgentClientConfig = {
  /**
   * The WebSocket path.
   */
  readonly path: string;

  /**
   * The provider.
   */
  readonly provider: ProviderId;

  /**
   * Where the panel docks.
   */
  readonly panel: AgentPanelPosition;
};
