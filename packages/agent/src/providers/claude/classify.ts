import type { AgentProblem } from '#protocol/agent-events.ts';
import type { ParseState, ProcessExit, TurnOutcome } from '#providers/provider-types.ts';

import { shorten } from '#providers/json-line.ts';
import { timeoutProblem } from '#providers/turn-problems.ts';

/**
 * What to do when Claude Code is not signed in.
 */
export const CLAUDE_SIGN_IN_FIX =
  'Run `claude` in a terminal and sign in with /login (or set ANTHROPIC_API_KEY), ' +
  'then send the prompt again.';

/**
 * Words that mark a login problem in Claude Code's messages.
 */
const LOGIN_PATTERN = /log ?in|\/login|sign in|authenticat|oauth|api key|credential/i;

/**
 * Words that mark a usage or billing limit.
 */
const QUOTA_PATTERN = /usage limit|credit|billing|quota|out of .*usage/i;

/**
 * Words that mark a rate limit.
 */
const RATE_LIMIT_PATTERN = /rate.?limit|429|overloaded|too many requests/i;

/**
 * Maps Claude Code's `assistant.error` value and the message beside it to a problem.
 *
 * @param error - The `error` field, such as `invalid_request`, `authentication_failed`,
 *   `rate_limit` or `billing_error`.
 * @param message - The text the assistant message carried.
 */
export function classifyClaudeError(error: string, message: string): AgentProblem {
  if (error === 'authentication_failed' || LOGIN_PATTERN.test(message)) {
    return { kind: 'not-signed-in', message: shorten(message), fix: CLAUDE_SIGN_IN_FIX };
  }

  if (error === 'billing_error' || QUOTA_PATTERN.test(message)) {
    return {
      kind: 'quota',
      message: shorten(message),
      fix: 'Check your Claude plan or usage at claude.ai, or wait for the limit to reset.',
    };
  }

  if (error === 'rate_limit' || RATE_LIMIT_PATTERN.test(message)) {
    return {
      kind: 'rate-limit',
      message: shorten(message),
      fix: 'Wait a minute and send the prompt again.',
    };
  }

  return {
    kind: 'crashed',
    message: shorten(message === '' ? `Claude Code reported "${error}".` : message),
    fix: 'Send the prompt again; if it keeps failing, run `deck agent doctor`.',
  };
}

/**
 * Reads a start-up failure (non-zero exit, nothing on stdout) from stderr.
 *
 * @param stderr - The start of stderr.
 * @param code - The exit code.
 */
export function claudeStartupProblem(stderr: string, code: number | null): AgentProblem {
  const said = shorten(stderr) || `Claude Code exited with code ${code ?? 'unknown'}.`;
  if (LOGIN_PATTERN.test(stderr)) {
    return { kind: 'not-signed-in', message: said, fix: CLAUDE_SIGN_IN_FIX };
  }

  return {
    kind: 'crashed',
    message: `Claude Code did not start: ${said}`,
    fix: 'Run `deck agent doctor` to check the installation and login.',
  };
}

/**
 * How a Claude Code turn ended. A `result` decides when there is one: `aborted_streaming` is a
 * cancel (SIGINT gives exit 0 and a resumable session), `is_error` is a failure whatever its
 * subtype. Without a result, a cancel or timeout explains the exit (SIGTERM gives 143 and no
 * result), and a non-zero exit with empty stdout is a start-up failure read from stderr.
 *
 * @param exit - How the process ended.
 * @param state - What the stream said.
 */
export function interpretClaudeExit(exit: ProcessExit, state: ParseState): TurnOutcome {
  if (state.terminal === 'completed') {
    return { status: 'completed', problem: undefined };
  }

  if (exit.timedOut !== undefined) {
    return { status: 'failed', problem: timeoutProblem(exit.timedOut) };
  }

  if (state.terminal === 'cancelled' || exit.cancelled) {
    return { status: 'cancelled', problem: undefined };
  }

  if (state.failure !== undefined) {
    return { status: 'failed', problem: state.failure };
  }

  if (state.lines === 0 && exit.code !== 0) {
    return { status: 'failed', problem: claudeStartupProblem(exit.stderr, exit.code) };
  }

  const how = exit.signal === null ? `with code ${exit.code}` : `on ${exit.signal}`;
  const detail = exit.stderr === '' ? '' : ` ${shorten(exit.stderr)}`;
  return {
    status: 'failed',
    problem: {
      kind: 'crashed',
      message: `Claude Code stopped ${how} before it finished the turn.${detail}`,
      fix: 'Send the prompt again; the session resumes where it stopped.',
    },
  };
}
