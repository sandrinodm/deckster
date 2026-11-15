import type { FileChangeKind, ProviderEvent, ToolStatus } from '#protocol/agent-events.ts';
import type { ParseState } from '#providers/provider-types.ts';

import { classifyCodexMessage } from '#providers/codex/classify.ts';
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
 * A retry Codex announces as a top-level `error`, such as `Reconnecting... 2/5 (…)`.
 */
const RETRY_PATTERN = /^Reconnecting\.\.\./;

/**
 * What a sandbox refusal looks like in a command's output or a patch error.
 */
const REFUSED_PATTERN =
  /operation not permitted|writing outside of the project|rejected by user approval|requires approval/i;

/**
 * The shell wrapper Codex puts around commands, such as `/bin/zsh -lc '…'`.
 */
const SHELL_WRAPPER = /^\S*\/(?:ba|z)?sh -lc\s+/;

/**
 * A command wrapped in one pair of matching quotes, with the quote character as group 1.
 */
const QUOTED_PATTERN = /^(['"])(.*)\1$/s;

/**
 * How many lines of a command's output the detail of a failed command keeps.
 */
const OUTPUT_TAIL_LINES = 3;

/**
 * One line of `codex exec --json` to the normalised events. It handles `thread.started`,
 * `turn.started|completed|failed`, `item.started|updated|completed` (agent messages, reasoning,
 * shell commands, file changes, MCP tool calls, error items) and top-level `error` lines, which are
 * retries or the reason a turn is about to fail. Unknown or malformed lines give nothing, and it
 * never throws: a line the parser cannot handle becomes one notice.
 *
 * @param line - One line of stdout.
 * @param state - The turn's parse state, updated in place.
 */
export function parseCodexLine(line: string, state: ParseState): readonly ProviderEvent[] {
  try {
    return parseCodexObject(line, state);
  } catch (error) {
    return [unreadableLine(error)];
  }
}

/**
 * The events of one line; may throw on a shape no parser foresaw, which {@link parseCodexLine} turns
 * into a notice.
 *
 * @param line - One line of stdout.
 * @param state - The turn's parse state, updated in place.
 */
function parseCodexObject(line: string, state: ParseState): readonly ProviderEvent[] {
  const event = readJsonObject(line);
  if (event === undefined) {
    return [];
  }

  state.lines += 1;
  switch (event.type) {
    case 'thread.started': {
      const sessionId = text(event.thread_id);
      if (sessionId === undefined) {
        return [];
      }

      state.sessionId = sessionId;
      return [{ type: 'session', sessionId }];
    }

    case 'turn.completed': {
      state.terminal = 'completed';
      const usage = record(event.usage);
      return [
        {
          type: 'usage',
          inputTokens: count(usage.input_tokens),
          cachedInputTokens: count(usage.cached_input_tokens),
          outputTokens: count(usage.output_tokens) + count(usage.reasoning_output_tokens),
          costUsd: null,
        },
      ];
    }

    case 'turn.failed': {
      state.terminal = 'failed';
      const message = text(record(event.error).message) ?? 'The turn failed.';
      state.failure = classifyCodexMessage(message);
      return [];
    }

    case 'error': {
      const message = text(event.message) ?? '';
      if (RETRY_PATTERN.test(message)) {
        return [{ type: 'notice', kind: 'retry', message: shorten(message) }];
      }

      state.failure = classifyCodexMessage(message);
      return [];
    }

    case 'item.started':
    case 'item.updated':
    case 'item.completed':
      return itemEvent(record(event.item), event.type === 'item.completed', state);
    default:
      return [];
  }
}

/**
 * An item at its start, update or end.
 *
 * @param item - The item.
 * @param completed - Whether this is `item.completed`.
 * @param state - The parse state.
 */
function itemEvent(
  item: Record<string, unknown>,
  completed: boolean,
  state: ParseState,
): ProviderEvent[] {
  const id = text(item.id) ?? '';
  switch (item.type) {
    case 'agent_message': {
      const value = text(item.text) ?? '';
      return completed && value.trim() !== '' ? [{ type: 'text', text: value.trim() }] : [];
    }

    case 'reasoning': {
      const value = text(item.text) ?? '';
      return completed && value.trim() !== '' ? [{ type: 'reasoning', text: value.trim() }] : [];
    }

    case 'command_execution': {
      const command = (text(item.command) ?? '').replace(SHELL_WRAPPER, '');
      const call = { name: 'shell', title: unquote(command), path: null };
      if (!completed) {
        return [{ type: 'tool', id, ...call, status: 'running', detail: null }];
      }

      const output = text(item.aggregated_output) ?? '';
      const failed = item.status === 'failed' || count(item.exit_code) !== 0;
      return [
        {
          type: 'tool',
          id,
          ...call,
          status: toolStatus(failed, output),
          detail: failed ? shorten(lastLines(output)) : null,
        },
      ];
    }

    case 'file_change':
      return fileChangeEvent(item, id, completed, state);
    case 'mcp_tool_call': {
      const server = text(item.server) ?? 'mcp';
      const tool = text(item.tool) ?? 'tool';
      const name = server === 'deck' ? tool : `${server}.${tool}`;
      const args = record(item.arguments);
      const target = text(args.slide) ?? text(args.kind) ?? text(args.action) ?? '';
      const call = { name, title: target === '' ? name : `${name} ${target}`, path: null };
      if (!completed) {
        return [{ type: 'tool', id, ...call, status: 'running', detail: null }];
      }

      const error = text(record(item.error).message);
      const failed = item.status === 'failed' || error !== undefined;
      return [
        {
          type: 'tool',
          id,
          ...call,
          status: toolStatus(failed, error ?? ''),
          detail: error === undefined ? null : shorten(error),
        },
      ];
    }

    case 'error': {
      const message = text(item.message) ?? '';
      return completed && message !== ''
        ? [{ type: 'notice', kind: 'info', message: shorten(message) }]
        : [];
    }

    default:
      return [];
  }
}

/**
 * A `file_change` item: a running tool while the patch applies, then the tool's end and one
 * `file-change` per changed file.
 *
 * @param item - The item.
 * @param id - Its id.
 * @param completed - Whether this is `item.completed`.
 * @param state - The parse state.
 */
function fileChangeEvent(
  item: Record<string, unknown>,
  id: string,
  completed: boolean,
  state: ParseState,
): ProviderEvent[] {
  const changes = list(item.changes)
    .map(record)
    .map((change) => ({
      path: workspacePath(state.root, text(change.path) ?? '', state.aliases),
      kind: changeKind(change.kind),
    }));
  const paths = changes.map((change) => change.path);
  const call = {
    name: 'apply_patch',
    title: `Edit ${paths.join(', ')}`,
    path: paths.length === 1 ? (paths[0] ?? null) : null,
  };
  if (!completed) {
    return [{ type: 'tool', id, ...call, status: 'running', detail: null }];
  }

  if (item.status !== 'completed') {
    return [{ type: 'tool', id, ...call, status: 'failed', detail: null }];
  }

  return [
    { type: 'tool', id, ...call, status: 'done', detail: null },
    ...changes.map((change) => ({ type: 'file-change' as const, ...change })),
  ];
}

/**
 * A finished call's status: refused when the output says the sandbox or approval policy stopped it.
 *
 * @param failed - Whether it failed.
 * @param output - Its output or error.
 */
function toolStatus(failed: boolean, output: string): ToolStatus {
  if (!failed) {
    return 'done';
  }

  return REFUSED_PATTERN.test(output) ? 'denied' : 'failed';
}

/**
 * A Codex change kind as a file change kind.
 *
 * @param kind - `add`, `delete` or `update`.
 */
function changeKind(kind: unknown): FileChangeKind {
  return kind === 'add' || kind === 'delete' ? kind : 'update';
}

/**
 * A command without the quotes the shell wrapper added.
 *
 * @param command - The command.
 */
function unquote(command: string): string {
  const quoted = QUOTED_PATTERN.exec(command);
  return quoted?.[2] ?? command;
}

/**
 * The last few lines of a command's output.
 *
 * @param output - The output.
 */
function lastLines(output: string): string {
  return output.trim().split('\n').slice(-OUTPUT_TAIL_LINES).join(' ');
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
    message: shorten(`A line of Codex output could not be read and was skipped (${reason}).`),
  };
}
