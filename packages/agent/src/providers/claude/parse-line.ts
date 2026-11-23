import type { FileChangeKind, ProviderEvent, ToolStatus } from '#protocol/agent-events.ts';
import type { ParseState } from '#providers/provider-types.ts';

import { classifyClaudeError } from '#providers/claude/classify.ts';
import {
  count,
  list,
  readJsonObject,
  record,
  shorten,
  text,
  workspacePath,
} from '#providers/json-line.ts';

/**
 * The prefix of the deck MCP tools' names in Claude Code.
 */
const DECK_TOOL_PREFIX = 'mcp__deck__';

/**
 * The tools that write files.
 */
const WRITING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/**
 * Milliseconds in a second, to turn a reset time in seconds into a date.
 */
const MS_PER_SECOND = 1000;

/**
 * The scale costs are rounded at: six decimal places of a dollar.
 */
const MILLIONTHS_PER_DOLLAR = 1_000_000;

/**
 * One line of `claude -p --output-format stream-json --verbose --include-partial-messages` to the
 * normalised events; it never throws (a line the parser cannot handle becomes one notice). It
 * handles `system` (`init`, `api_retry`, `permission_denied`; `status` and `thinking_tokens` are
 * noise), `rate_limit_event`, `stream_event` (text deltas only), `assistant` (text, thinking, tool
 * calls; an `error` field marks a failed request), `user` (tool results) and `result`, and records
 * what decides the turn's end in `state`. Unknown or malformed lines give nothing.
 *
 * @param line - One line of stdout.
 * @param state - The turn's parse state, updated in place.
 */
export function parseClaudeLine(line: string, state: ParseState): readonly ProviderEvent[] {
  try {
    return parseClaudeObject(line, state);
  } catch (error) {
    return [unreadableLine(error)];
  }
}

/**
 * The events of one line; may throw on a shape no parser foresaw, which {@link parseClaudeLine}
 * turns into a notice.
 *
 * @param line - One line of stdout.
 * @param state - The turn's parse state, updated in place.
 */
function parseClaudeObject(line: string, state: ParseState): readonly ProviderEvent[] {
  const event = readJsonObject(line);
  if (event === undefined) {
    return [];
  }

  state.lines += 1;
  if (event.parent_tool_use_id !== undefined && event.parent_tool_use_id !== null) {
    return [];
  }

  switch (event.type) {
    case 'system':
      return systemEvent(event, state);
    case 'rate_limit_event':
      return rateLimitEvent(record(event.rate_limit_info));
    case 'stream_event':
      return streamEvent(record(event.event));
    case 'assistant':
      return assistantEvent(event, state);
    case 'user':
      return userEvent(event, state);
    case 'result':
      return resultEvent(event, state);
    default:
      return [];
  }
}

/**
 * A `system` line.
 *
 * @param event - The line.
 * @param state - The parse state.
 */
function systemEvent(event: Record<string, unknown>, state: ParseState): ProviderEvent[] {
  switch (event.subtype) {
    case 'init': {
      const events: ProviderEvent[] = [];
      const sessionId = text(event.session_id);
      if (sessionId !== undefined) {
        state.sessionId = sessionId;
        events.push({ type: 'session', sessionId });
      }

      for (const server of list(event.mcp_servers).map(record)) {
        if (server.name === 'deck' && server.status !== 'connected') {
          events.push({
            type: 'error',
            kind: 'mcp-unavailable',
            message:
              `The deck tools did not connect (${text(server.status) ?? 'unknown'}), ` +
              'so the agent works without lint, screenshots or the slide on screen.',
            fix: 'Restart `deckster dev --agent`; if it happens again, run `deckster agent doctor`.',
          });
        }
      }

      return events;
    }

    case 'api_retry': {
      const attempt = count(event.attempt);
      const max = count(event.max_retries);
      const reason = text(event.error) ?? text(record(event.error).message) ?? '';
      const of = max > 0 ? ` of ${max}` : '';
      const which = attempt > 0 ? ` (attempt ${attempt}${of})` : '';
      const why = reason === '' ? '' : `: ${shorten(reason)}`;
      return [{ type: 'notice', kind: 'retry', message: `Retrying the request${which}${why}` }];
    }

    case 'permission_denied': {
      const id = text(event.tool_use_id);
      if (id !== undefined) {
        state.denied.add(id);
      }

      return [];
    }

    default:
      return [];
  }
}

/**
 * A `rate_limit_event`: a notice when the limit is close or reached.
 *
 * @param info - Its `rate_limit_info`.
 */
function rateLimitEvent(info: Record<string, unknown>): ProviderEvent[] {
  const status = text(info.status);
  if (status === undefined || status === 'allowed') {
    return [];
  }

  const window = text(info.rateLimitType)?.replaceAll('_', ' ') ?? 'usage';
  const resets = new Date(count(info.resetsAt) * MS_PER_SECOND);
  const valid = resets.getTime() > 0 && Number.isFinite(resets.getTime());
  const when = valid ? ` It resets ${resets.toISOString()}.` : '';
  return [
    {
      type: 'notice',
      kind: 'rate-limit',
      message:
        status === 'rejected'
          ? `The ${window} limit is reached.${when}`
          : `The ${window} limit is close.${when}`,
    },
  ];
}

/**
 * A `stream_event`: only text deltas become events; thinking, signature and tool-input deltas are
 * dropped.
 *
 * @param inner - The wrapped Anthropic stream event.
 */
function streamEvent(inner: Record<string, unknown>): ProviderEvent[] {
  if (inner.type !== 'content_block_delta') {
    return [];
  }

  const delta = record(inner.delta);
  const value = text(delta.text);
  return delta.type === 'text_delta' && value !== undefined && value !== ''
    ? [{ type: 'text-delta', text: value }]
    : [];
}

/**
 * An `assistant` message: its text, thinking and tool calls, or the failure it reports.
 *
 * @param event - The line.
 * @param state - The parse state.
 */
function assistantEvent(event: Record<string, unknown>, state: ParseState): ProviderEvent[] {
  const content = list(record(event.message).content).map(record);
  const error = text(event.error);
  if (error !== undefined) {
    const said = content
      .map((block) => text(block.text) ?? '')
      .join(' ')
      .trim();
    state.failure = classifyClaudeError(error, said);
    return [];
  }

  const events: ProviderEvent[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      const value = text(block.text) ?? '';
      if (value.trim() !== '') {
        events.push({ type: 'text', text: value });
      }
    } else if (block.type === 'thinking') {
      const value = text(block.thinking) ?? '';
      if (value.trim() !== '') {
        events.push({ type: 'reasoning', text: value });
      }
    } else if (block.type === 'tool_use') {
      const id = text(block.id) ?? '';
      const call = describeTool(
        text(block.name) ?? 'tool',
        record(block.input),
        state.root,
        state.aliases,
      );
      state.tools.set(id, call);
      events.push({ type: 'tool', id, ...call, status: 'running', detail: null });
    }
  }

  return events;
}

/**
 * A `user` message: the results of tool calls.
 *
 * @param event - The line.
 * @param state - The parse state.
 */
function userEvent(event: Record<string, unknown>, state: ParseState): ProviderEvent[] {
  const events: ProviderEvent[] = [];
  const meta = new Map(
    list(event.tool_result_meta)
      .map(record)
      .map((entry) => [text(entry.id) ?? '', record(entry.permission_decision)] as const),
  );
  const result = record(event.tool_use_result);
  for (const block of list(record(event.message).content).map(record)) {
    if (block.type !== 'tool_result') {
      continue;
    }

    const id = text(block.tool_use_id) ?? '';
    const call = state.tools.get(id) ?? { name: 'tool', title: 'tool', path: null };
    const denied = state.denied.has(id) || meta.get(id)?.decision === 'reject';
    const failed = block.is_error === true;
    let status: ToolStatus = failed ? 'failed' : 'done';
    if (denied) {
      status = 'denied';
    }

    events.push({
      type: 'tool',
      id,
      ...call,
      status,
      detail: status === 'done' ? null : shorten(resultText(block.content)),
    });
    if (status === 'done' && WRITING_TOOLS.has(call.name) && call.path !== null) {
      const kind: FileChangeKind = result.type === 'create' ? 'add' : 'update';
      events.push({ type: 'file-change', path: call.path, kind });
    }
  }

  return events;
}

/**
 * The terminal `result`: usage and cost, the session id, and how the turn ended. `is_error` makes
 * it a failure whatever the subtype; `aborted_streaming` is a cancel.
 *
 * @param event - The line.
 * @param state - The parse state.
 */
function resultEvent(event: Record<string, unknown>, state: ParseState): ProviderEvent[] {
  const sessionId = text(event.session_id);
  if (sessionId !== undefined) {
    state.sessionId = sessionId;
  }

  const total = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : undefined;
  state.costUsd = total;
  if (event.terminal_reason === 'aborted_streaming') {
    state.terminal = 'cancelled';
  } else if (event.is_error === true) {
    state.terminal = 'failed';
    state.failure ??= classifyClaudeError(
      text(event.subtype) ?? '',
      text(event.result) ?? list(event.errors).map(errorText).join(' '),
    );
  } else {
    state.terminal = 'completed';
  }

  const usage = record(event.usage);
  const cached = count(usage.cache_read_input_tokens);
  const input = count(usage.input_tokens) + count(usage.cache_creation_input_tokens) + cached;
  if (input === 0 && count(usage.output_tokens) === 0 && (total ?? 0) === 0) {
    return [];
  }

  return [
    {
      type: 'usage',
      inputTokens: input,
      cachedInputTokens: cached,
      outputTokens: count(usage.output_tokens),
      costUsd: total === undefined ? null : Math.max(0, roundCents(total - state.previousCostUsd)),
    },
  ];
}

/**
 * One entry of a result's `errors` as text: a string, an object's `message`, or nothing; never
 * calls the entry's own `toString`.
 *
 * @param entry - The entry.
 */
function errorText(entry: unknown): string {
  return text(entry) ?? text(record(entry).message) ?? '';
}

/**
 * A cost rounded to a millionth of a dollar, to drop float noise from the subtraction.
 *
 * @param usd - The cost.
 */
function roundCents(usd: number): number {
  return Math.round(usd * MILLIONTHS_PER_DOLLAR) / MILLIONTHS_PER_DOLLAR;
}

/**
 * The name, panel title and file of a tool call.
 *
 * @param name - The tool's name in Claude Code.
 * @param input - Its input.
 * @param root - The workspace root.
 * @param aliases - Folders shown as other folders (the working copy as the deck).
 */
export function describeTool(
  name: string,
  input: Record<string, unknown>,
  root: string,
  aliases: ParseState['aliases'] = [],
): { name: string; title: string; path: string | null } {
  if (name.startsWith(DECK_TOOL_PREFIX)) {
    const tool = name.slice(DECK_TOOL_PREFIX.length);
    const target = text(input.slide) ?? text(input.kind) ?? text(input.action) ?? '';
    return { name: tool, title: target === '' ? tool : `${tool} ${target}`, path: null };
  }

  const file = text(input.file_path) ?? text(input.notebook_path);
  const filePath = file === undefined ? null : workspacePath(root, file, aliases);
  if (filePath !== null) {
    return { name, title: `${name} ${filePath}`, path: filePath };
  }

  const pattern = text(input.pattern);
  if (pattern !== undefined) {
    return {
      name,
      title: name === 'Grep' ? `Grep "${pattern}"` : `${name} ${pattern}`,
      path: null,
    };
  }

  const skill = text(input.skill) ?? text(input.command);
  return { name, title: skill === undefined ? name : `${name} ${skill}`, path: null };
}

/**
 * The text of a tool result's content: a string, or text blocks.
 *
 * @param content - The `content` of a `tool_result`.
 */
function resultText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  return list(content)
    .map((block) => text(record(block).text) ?? '')
    .join(' ');
}

/**
 * The notice for a line the parser could not handle: the turn goes on without it.
 *
 * @param error - What the parser threw.
 */
function unreadableLine(error: unknown): ProviderEvent {
  const reason = error instanceof Error ? error.message : 'unknown error';
  return {
    type: 'notice',
    kind: 'info',
    message: shorten(`A line of Claude Code output could not be read and was skipped (${reason}).`),
  };
}
