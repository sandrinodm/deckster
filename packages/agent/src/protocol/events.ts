import { Schema } from 'effect';

import type * as Types from '#protocol/agent-events.ts';

/**
 * The longest prompt the endpoint accepts, in characters.
 */
export const MAX_PROMPT_CHARS = 20_000;

/**
 * The most comments one prompt may attach.
 */
const MAX_ATTACHED_COMMENTS = 20;

/**
 * The longest model name accepted.
 */
const MAX_MODEL_CHARS = 120;

/**
 * The providers.
 */
export const ProviderId = Schema.Literals(['claude', 'codex', 'fake']);

/**
 * The panel positions.
 */
export const AgentPanelPosition = Schema.Literals(['right', 'bottom']);

/**
 * Who asked for a turn.
 */
const TurnKind = Schema.Literals(['user', 'auto-fix']);

/**
 * How a file changed.
 */
const FileChangeKind = Schema.Literals(['add', 'update', 'delete']);

/**
 * The error kinds.
 */
export const AgentErrorKind = Schema.Literals([
  'not-installed',
  'not-signed-in',
  'rate-limit',
  'quota',
  'cancelled',
  'timeout',
  'crashed',
  'mcp-unavailable',
  'conflict',
  'bad-request',
]);

/**
 * A problem with its fix.
 */
export const AgentProblem = Schema.Struct({
  /**
   * What kind of problem it is.
   */
  kind: AgentErrorKind,

  /**
   * What went wrong.
   */
  message: Schema.String,

  /**
   * What to do.
   */
  fix: Schema.String,
});

/**
 * A changed file.
 */
const ChangedFile = Schema.Struct({
  /**
   * The path relative to the workspace root.
   */
  path: Schema.String,

  /**
   * How it changed.
   */
  kind: FileChangeKind,

  /**
   * False when the journal kept no copy (too large to undo).
   */
  undoable: Schema.optionalKey(Schema.Boolean),

  /**
   * Whether it changed after the provider process ended (a person's edit, probably).
   */
  concurrentEdit: Schema.optionalKey(Schema.Boolean),
});

/**
 * One lint finding.
 */
const AgentLintFinding = Schema.Struct({
  /**
   * The slide id, or null.
   */
  slide: Schema.NullOr(Schema.String),

  /**
   * The file at fault.
   */
  file: Schema.String,

  /**
   * The step, or null.
   */
  step: Schema.NullOr(Schema.Number),

  /**
   * The rule id.
   */
  rule: Schema.String,

  /**
   * How serious it is.
   */
  severity: Schema.Literals(['error', 'warning']),

  /**
   * What is wrong.
   */
  message: Schema.String,

  /**
   * How to fix it.
   */
  fix: Schema.String,
});

/**
 * The fields every event carries.
 */
const ENVELOPE = {
  /**
   * The growing event number.
   */
  seq: Schema.Number,

  /**
   * Epoch milliseconds.
   */
  at: Schema.Number,

  /**
   * The turn, or null.
   */
  turn: Schema.NullOr(Schema.Number),
};

/**
 * The status event.
 */
const StatusEvent = Schema.Struct({
  ...ENVELOPE,
  type: Schema.Literal('status'),
  provider: ProviderId,
  model: Schema.NullOr(Schema.String),
  deck: Schema.String,
  panel: AgentPanelPosition,
  version: Schema.NullOr(Schema.String),
  ready: Schema.Boolean,
  problem: Schema.NullOr(AgentProblem),
  running: Schema.NullOr(Schema.Number),
  queued: Schema.Number,
  canUndo: Schema.Boolean,
  canRedo: Schema.Boolean,
});

/**
 * Every event the agent stream sends, as one schema. Each member is the plain type of the same name
 * in `agent-events.ts` with the envelope fields; a compile-time check below keeps them equal.
 */
export const AgentEvent = Schema.Union([
  StatusEvent,
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('turn-queued'),
    text: Schema.String,
    kind: TurnKind,
    position: Schema.Number,
  }),
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('turn-started'),
    text: Schema.String,
    kind: TurnKind,
    slide: Schema.NullOr(
      Schema.Struct({ id: Schema.String, file: Schema.String, step: Schema.Number }),
    ),
    provider: ProviderId,
    model: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({ ...ENVELOPE, type: Schema.Literal('session'), sessionId: Schema.String }),
  Schema.Struct({ ...ENVELOPE, type: Schema.Literal('text-delta'), text: Schema.String }),
  Schema.Struct({ ...ENVELOPE, type: Schema.Literal('text'), text: Schema.String }),
  Schema.Struct({ ...ENVELOPE, type: Schema.Literal('reasoning'), text: Schema.String }),
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('tool'),
    id: Schema.String,
    name: Schema.String,
    title: Schema.String,
    status: Schema.Literals(['running', 'done', 'failed', 'denied']),
    path: Schema.NullOr(Schema.String),
    detail: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('file-change'),
    path: Schema.String,
    kind: FileChangeKind,
  }),
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('usage'),
    inputTokens: Schema.Number,
    cachedInputTokens: Schema.Number,
    outputTokens: Schema.Number,
    costUsd: Schema.NullOr(Schema.Number),
  }),
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('notice'),
    kind: Schema.Literals(['retry', 'rate-limit', 'mcp', 'info']),
    message: Schema.String,
  }),
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('lint'),
    ok: Schema.Boolean,
    slides: Schema.Array(Schema.String),
    errors: Schema.Number,
    warnings: Schema.Number,
    findings: Schema.Array(AgentLintFinding),
    autoFix: Schema.Boolean,
    existing: Schema.optionalKey(Schema.Array(AgentLintFinding)),
  }),
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('turn-done'),
    status: Schema.Literals(['completed', 'failed', 'cancelled']),
    changedFiles: Schema.Array(ChangedFile),
    durationMs: Schema.Number,
    conflicts: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('error'),
    kind: AgentErrorKind,
    message: Schema.String,
    fix: Schema.String,
  }),
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('history'),
    action: Schema.Literals(['undo', 'redo']),
    target: Schema.Number,
    files: Schema.Array(ChangedFile),
    skipped: Schema.optionalKey(Schema.Array(ChangedFile)),
  }),
  Schema.Struct({ ...ENVELOPE, type: Schema.Literal('conversation-reset') }),
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('diff'),
    available: Schema.Boolean,
    message: Schema.String,
    files: Schema.Array(
      Schema.Struct({
        path: Schema.String,
        kind: FileChangeKind,
        added: Schema.Number,
        removed: Schema.Number,
        binary: Schema.Boolean,
        truncated: Schema.Boolean,
        tooLarge: Schema.optionalKey(Schema.Boolean),
        undoable: Schema.optionalKey(Schema.Boolean),
        hunks: Schema.Array(
          Schema.Struct({
            oldStart: Schema.Number,
            oldLines: Schema.Number,
            newStart: Schema.Number,
            newLines: Schema.Number,
            lines: Schema.Array(Schema.String),
          }),
        ),
      }),
    ),
  }),
  Schema.Struct({
    ...ENVELOPE,
    type: Schema.Literal('reverted'),
    paths: Schema.Array(Schema.Struct({ path: Schema.String, what: Schema.String })),
    copies: Schema.NullOr(Schema.String),
  }),
]);

/**
 * A prompt from the panel. Text is required and bounded; everything else is optional.
 */
const PromptMessage = Schema.Struct({
  type: Schema.Literal('prompt'),
  text: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_PROMPT_CHARS)),
  slide: Schema.optionalKey(
    Schema.Struct({
      id: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_MODEL_CHARS)),
      step: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    }),
  ),
  selection: Schema.optionalKey(
    Schema.Struct({
      text: Schema.String.check(Schema.isMaxLength(MAX_PROMPT_CHARS)),
      source: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(MAX_PROMPT_CHARS))),
    }),
  ),
  comments: Schema.optionalKey(
    Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_MODEL_CHARS))).check(
      Schema.isMaxLength(MAX_ATTACHED_COMMENTS),
    ),
  ),
  screenshot: Schema.optionalKey(Schema.Boolean),
});

/**
 * Everything a client may send over the agent WebSocket.
 */
export const ClientMessage = Schema.Union([
  PromptMessage,
  Schema.Struct({ type: Schema.Literal('cancel') }),
  Schema.Struct({
    type: Schema.Literal('undo'),
    turn: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  }),
  Schema.Struct({
    type: Schema.Literal('redo'),
    turn: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  }),
  Schema.Struct({ type: Schema.Literal('new-conversation') }),
  Schema.Struct({
    type: Schema.Literal('set-model'),
    model: Schema.NullOr(Schema.String.check(Schema.isMaxLength(MAX_MODEL_CHARS))),
  }),
  Schema.Struct({
    type: Schema.Literal('diff'),
    turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  }),
]);

/**
 * Decodes the text of one WebSocket message from a client.
 */
export const decodeClientMessage = Schema.decodeUnknownResult(Schema.fromJsonString(ClientMessage));

/**
 * Decodes one event, as a client that wants to check what it received would.
 */
export const decodeAgentEvent = Schema.decodeUnknownResult(AgentEvent);

/**
 * True when each of two types is assignable to the other.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Fails to compile when the event schema and the plain event type drift apart.
 */
export const EVENT_TYPES_MATCH: Same<typeof AgentEvent.Type, Types.AgentEvent> = true;

/**
 * Fails to compile when the message schema and the plain message type drift apart.
 */
export const MESSAGE_TYPES_MATCH: Same<typeof ClientMessage.Type, Types.ClientMessage> = true;
