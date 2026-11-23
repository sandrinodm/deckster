import type { AgentProblem } from '#protocol/agent-events.ts';
import type { ParseState, ProcessExit, TurnOutcome } from '#providers/provider-types.ts';

import { shorten } from '#providers/json-line.ts';
import { timeoutProblem } from '#providers/turn-problems.ts';

/**
 * What to do when Codex is not signed in.
 */
export const CODEX_SIGN_IN_FIX =
  'Run `codex login` in a terminal (or set CODEX_API_KEY), then send the prompt again.';

/**
 * Marks of a login problem in Codex's messages.
 */
const LOGIN_PATTERN = /401|unauthori[sz]ed|not logged in|missing bearer|login/i;

/**
 * Marks of an exhausted plan or quota.
 */
const QUOTA_PATTERN = /quota|usage limit|insufficient|billing|plan limit/i;

/**
 * Marks of a rate limit.
 */
const RATE_LIMIT_PATTERN = /429|rate.?limit|too many requests/i;

/**
 * Marks of a required MCP server that did not start.
 */
const MCP_PATTERN = /required MCP servers? failed|handshaking with MCP server failed/i;

/**
 * Maps a Codex failure message (`turn.failed`, a top-level `error`, or stderr) to a problem.
 *
 * @param message - What Codex said.
 */
export function classifyCodexMessage(message: string): AgentProblem {
  if (MCP_PATTERN.test(message)) {
    return {
      kind: 'mcp-unavailable',
      message: `Codex could not reach the deck tools: ${shorten(firstLine(message))}`,
      fix: 'Restart `deckster dev --agent`; if it happens again, run `deckster agent doctor`.',
    };
  }

  if (QUOTA_PATTERN.test(message)) {
    return {
      kind: 'quota',
      message: shorten(message),
      fix: 'Check your ChatGPT plan or API usage, or wait for the limit to reset.',
    };
  }

  if (RATE_LIMIT_PATTERN.test(message)) {
    return {
      kind: 'rate-limit',
      message: shorten(message),
      fix: 'Wait a minute and send the prompt again.',
    };
  }

  if (LOGIN_PATTERN.test(message)) {
    return { kind: 'not-signed-in', message: shorten(message), fix: CODEX_SIGN_IN_FIX };
  }

  return {
    kind: 'crashed',
    message: shorten(message),
    fix: 'Send the prompt again; if it keeps failing, run `deckster agent doctor`.',
  };
}

/**
 * How a Codex turn ended. `turn.completed` is success; after a cancel, an exit without it is
 * `cancelled` (SIGINT gives exit 1 and nothing more); `turn.failed` carries the reason; a non-zero
 * exit with empty stdout is a start-up failure, such as a required MCP server that did not connect,
 * read from stderr.
 *
 * @param exit - How the process ended.
 * @param state - What the stream said.
 */
export function interpretCodexExit(exit: ProcessExit, state: ParseState): TurnOutcome {
  if (state.terminal === 'completed') {
    return { status: 'completed', problem: undefined };
  }

  if (exit.timedOut !== undefined) {
    return { status: 'failed', problem: timeoutProblem(exit.timedOut) };
  }

  if (exit.cancelled) {
    return { status: 'cancelled', problem: undefined };
  }

  if (state.failure !== undefined) {
    return { status: 'failed', problem: state.failure };
  }

  if (state.lines === 0 && exit.code !== 0) {
    const code = exit.code ?? exit.signal ?? 'unknown';
    return {
      status: 'failed',
      problem:
        exit.stderr.trim() === ''
          ? {
              kind: 'crashed',
              message: `Codex exited with code ${code} before it started.`,
              fix: 'Run `deckster agent doctor` to check the installation and login.',
            }
          : classifyCodexMessage(errorLine(exit.stderr)),
    };
  }

  const how = exit.signal === null ? `with code ${exit.code}` : `on ${exit.signal}`;
  return {
    status: 'failed',
    problem: {
      kind: 'crashed',
      message: `Codex stopped ${how} before it finished the turn.`,
      fix: 'Send the prompt again; the thread resumes where it stopped.',
    },
  };
}

/**
 * The most telling line of Codex's stderr: the last `Error:` line, else the last `ERROR` log line,
 * else the first line.
 *
 * @param stderr - The start of stderr.
 */
function errorLine(stderr: string): string {
  const lines = stderr.split('\n').filter((line) => line.trim() !== '');
  return (
    lines.findLast((line) => line.startsWith('Error:')) ??
    lines.findLast((line) => line.includes(' ERROR ')) ??
    lines[0] ??
    ''
  );
}

/**
 * The first line of a message.
 *
 * @param message - The message.
 */
function firstLine(message: string): string {
  return message.split('\n')[0] ?? message;
}
