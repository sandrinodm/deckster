import type { AgentEvent, ClientMessage } from '#protocol/agent-events.ts';

import { AGENT_PROTOCOL } from '#protocol/agent-events.ts';

/**
 * The first wait before a reconnect, in milliseconds.
 */
const RETRY_MIN_MS = 500;

/**
 * The longest wait between reconnects, in milliseconds.
 */
const RETRY_MAX_MS = 5000;

/**
 * How many messages wait for the socket to open; older ones are dropped beyond that.
 */
const MAX_PENDING_MESSAGES = 50;

/**
 * Where the connection is.
 */
export type AgentConnectionState = 'connecting' | 'open' | 'closed';

/**
 * Options for {@link connectAgent}.
 */
export type AgentConnectionOptions = {
  /**
   * The WebSocket URL, such as `ws://127.0.0.1:5661/__deck/agent`.
   */
  readonly url: string;

  /**
   * Receives each new event once, in order; events a reconnect replays again are skipped.
   */
  readonly onEvent: (event: AgentEvent) => void;

  /**
   * Hears when the connection opens, drops or closes.
   */
  readonly onState?: (state: AgentConnectionState) => void;

  /**
   * Makes the socket; tests pass a fake. Default: the browser's `WebSocket`.
   */
  readonly createSocket?: (url: string, protocols: string[]) => WebSocket;
};

/**
 * A live connection to the agent endpoint.
 */
export type AgentConnection = {
  /**
   * Sends a message, or keeps it until the socket opens.
   */
  readonly send: (message: ClientMessage) => void;

  /**
   * Closes the connection for good.
   */
  readonly close: () => void;

  /**
   * Where the connection is now.
   */
  readonly state: () => AgentConnectionState;
};

/**
 * The agent WebSocket URL for a page.
 *
 * @param location - The page's location.
 * @param path - The endpoint path, `/__deck/agent`.
 */
export function agentSocketUrl(
  location: Pick<Location, 'protocol' | 'host'>,
  path: string,
): string {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${path}`;
}

/**
 * Connects to the agent endpoint and stays connected: it offers the `deck-agent.v1` subprotocol and
 * is authenticated by the dev session cookie the browser sends with the handshake (the server sets
 * it `HttpOnly` on the deck's page, so no script ever holds a secret), reconnects with a growing
 * delay when the socket drops, and skips the events the server replays on reconnect (every event
 * has a growing `seq`; `seq` 0 marks an answer to this connection only). Messages sent while the
 * socket is not open are kept and sent when it opens. Plain browser code, no dependencies, so the
 * panel can build on it.
 *
 * @param options - The URL and the event sink.
 */
export function connectAgent(options: AgentConnectionOptions): AgentConnection {
  const create =
    options.createSocket ?? ((url: string, protocols: string[]) => new WebSocket(url, protocols));
  const pending: string[] = [];
  let socket: WebSocket | undefined;
  let state: AgentConnectionState = 'connecting';
  let lastSeq = 0;
  let delay = RETRY_MIN_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  /**
   * Records and announces a new state.
   *
   * @param next - The state.
   */
  const setState = (next: AgentConnectionState) => {
    state = next;
    options.onState?.(next);
  };

  /**
   * Hands an incoming event on, once.
   *
   * @param data - The message text.
   */
  const receive = (data: unknown) => {
    const event = parseEvent(data);
    if (event === undefined) {
      return;
    }

    if (event.seq > 0 && event.seq <= lastSeq) {
      return;
    }

    try {
      options.onEvent(event);
    } catch {
      // A listener that throws has not applied the event: its seq stays unseen, and the connection
      // goes on with the next message.
      return;
    }

    if (event.seq > lastSeq) {
      lastSeq = event.seq;
    }
  };

  /**
   * Opens a socket and wires it.
   */
  const open = () => {
    if (closed) {
      return;
    }

    setState('connecting');
    const next = create(options.url, [AGENT_PROTOCOL]);
    socket = next;
    next.addEventListener('open', () => {
      delay = RETRY_MIN_MS;
      setState('open');
      for (const message of pending.splice(0)) {
        next.send(message);
      }
    });
    next.addEventListener('message', (event) => receive(event.data));
    next.addEventListener('close', () => {
      if (socket !== next) {
        return;
      }

      socket = undefined;
      if (closed) {
        return;
      }

      setState('connecting');
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, RETRY_MAX_MS);
    });
  };
  open();
  return {
    send: (message) => {
      const text = JSON.stringify(message);
      if (socket !== undefined && state === 'open') {
        socket.send(text);
        return;
      }

      pending.push(text);
      pending.splice(0, Math.max(0, pending.length - MAX_PENDING_MESSAGES));
    },
    close: () => {
      closed = true;
      clearTimeout(timer);
      const current = socket;
      socket = undefined;
      current?.close();
      setState('closed');
    },
    state: () => state,
  };
}

/**
 * Parses one incoming message into an agent event, or `undefined` when it is not valid JSON or not
 * an agent event.
 *
 * @param data - The message's data, as the socket delivered it.
 */
function parseEvent(data: unknown): AgentEvent | undefined {
  if (typeof data !== 'string') {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }

  return isAgentEvent(parsed) ? parsed : undefined;
}

/**
 * A check of one field's value.
 */
type FieldCheck = (value: unknown) => boolean;

/**
 * A string.
 *
 * @param value - The value.
 */
const isString: FieldCheck = (value) => typeof value === 'string';

/**
 * A finite number.
 *
 * @param value - The value.
 */
const isNumber: FieldCheck = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * A boolean.
 *
 * @param value - The value.
 */
const isBoolean: FieldCheck = (value) => typeof value === 'boolean';

/**
 * A check that also accepts null.
 *
 * @param check - The check of a present value.
 */
const orNull =
  (check: FieldCheck): FieldCheck =>
  (value) =>
    value === null || check(value);

/**
 * A check that also accepts a missing field.
 *
 * @param check - The check of a present value.
 */
const optional =
  (check: FieldCheck): FieldCheck =>
  (value) =>
    value === undefined || check(value);

/**
 * An array whose every element passes a check.
 *
 * @param check - The element check.
 */
const arrayOf =
  (check: FieldCheck): FieldCheck =>
  (value) =>
    Array.isArray(value) && value.every((element) => check(element));

/**
 * An object whose fields pass their checks; other fields are not looked at.
 *
 * @param fields - The checks by field name.
 */
const shape =
  (fields: Readonly<Record<string, FieldCheck>>): FieldCheck =>
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(fields).every(([name, check]) => check(Reflect.get(value, name)));

/**
 * A file a turn changed.
 */
const changedFile = shape({ path: isString, kind: isString });

/**
 * A lint finding.
 */
const finding = shape({
  slide: orNull(isString),
  file: isString,
  step: orNull(isNumber),
  rule: isString,
  severity: isString,
  message: isString,
  fix: isString,
});

/**
 * The fields the panel reads, per event type. A type not listed passes with a valid envelope: the
 * reducer ignores types it does not know.
 */
const EVENT_FIELDS: Readonly<Record<string, Readonly<Record<string, FieldCheck>>>> = {
  /**
   * The host's status.
   */
  status: {
    provider: isString,
    model: orNull(isString),
    deck: isString,
    panel: isString,
    version: orNull(isString),
    ready: isBoolean,
    problem: orNull(shape({ kind: isString, message: isString, fix: isString })),
    running: orNull(isNumber),
    queued: isNumber,
    canUndo: isBoolean,
    canRedo: isBoolean,
  },

  /**
   * A queued prompt.
   */
  'turn-queued': { text: isString, kind: isString, position: isNumber },

  /**
   * A started turn.
   */
  'turn-started': {
    text: isString,
    kind: isString,
    slide: orNull(shape({ id: isString, file: isString, step: isNumber })),
    provider: isString,
    model: orNull(isString),
  },

  /**
   * The provider's session.
   */
  session: { sessionId: isString },

  /**
   * Streamed text.
   */
  'text-delta': { text: isString },

  /**
   * A whole message.
   */
  text: { text: isString },

  /**
   * A reasoning summary.
   */
  reasoning: { text: isString },

  /**
   * A tool call.
   */
  tool: {
    id: isString,
    name: isString,
    title: isString,
    status: isString,
    path: orNull(isString),
    detail: orNull(isString),
  },

  /**
   * A reported file change.
   */
  'file-change': { path: isString, kind: isString },

  /**
   * Tokens and cost.
   */
  usage: {
    inputTokens: isNumber,
    cachedInputTokens: isNumber,
    outputTokens: isNumber,
    costUsd: orNull(isNumber),
  },

  /**
   * A notice.
   */
  notice: { kind: isString, message: isString },

  /**
   * A lint result.
   */
  lint: {
    ok: isBoolean,
    slides: arrayOf(isString),
    errors: isNumber,
    warnings: isNumber,
    findings: arrayOf(finding),
    autoFix: isBoolean,
    existing: optional(arrayOf(finding)),
  },

  /**
   * The end of a turn.
   */
  'turn-done': { status: isString, changedFiles: arrayOf(changedFile), durationMs: isNumber },

  /**
   * An error.
   */
  error: { kind: isString, message: isString, fix: isString },

  /**
   * An undo or redo.
   */
  history: {
    action: isString,
    target: isNumber,
    files: arrayOf(changedFile),
    skipped: optional(arrayOf(changedFile)),
  },

  /**
   * A turn's line diff.
   */
  diff: {
    available: isBoolean,
    message: isString,
    files: arrayOf(
      shape({
        path: isString,
        kind: isString,
        added: isNumber,
        removed: isNumber,
        binary: isBoolean,
        truncated: isBoolean,
        hunks: arrayOf(
          shape({
            oldStart: isNumber,
            oldLines: isNumber,
            newStart: isNumber,
            newLines: isNumber,
            lines: arrayOf(isString),
          }),
        ),
      }),
    ),
  },
};

/**
 * Whether a value is an agent event the panel can apply: the envelope (a string `type`, a whole
 * `seq` of 0 or more, a numeric `at`, a `turn` number or null) and, for the types the panel knows,
 * the fields it reads with their types. The server validated what it sent, so this guards the
 * reducer against a message that is not what it claims, never against a schema change: unknown
 * types and extra fields pass.
 *
 * @param value - A parsed message.
 */
export function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const type: unknown = Reflect.get(value, 'type');
  const seq: unknown = Reflect.get(value, 'seq');
  const envelope =
    typeof type === 'string' &&
    typeof seq === 'number' &&
    Number.isSafeInteger(seq) &&
    seq >= 0 &&
    isNumber(Reflect.get(value, 'at')) &&
    orNull(isNumber)(Reflect.get(value, 'turn'));
  if (!envelope) {
    return false;
  }

  const fields = Object.hasOwn(EVENT_FIELDS, type) ? EVENT_FIELDS[type] : undefined;
  return fields === undefined || shape(fields)(value);
}
