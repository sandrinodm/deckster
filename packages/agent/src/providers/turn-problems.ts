import type { AgentProblem } from '#protocol/agent-events.ts';

/**
 * The problem for a turn a limit stopped.
 *
 * @param limit - Which limit.
 */
export function timeoutProblem(limit: 'idle' | 'total'): AgentProblem {
  return limit === 'idle'
    ? {
        kind: 'timeout',
        message: 'The agent printed nothing for two minutes, so the turn was stopped.',
        fix: 'Send the prompt again, or ask for a smaller change.',
      }
    : {
        kind: 'timeout',
        message: 'The turn ran for ten minutes, the limit, so it was stopped.',
        fix: 'Ask for a smaller change, or split the work into several prompts.',
      };
}

/**
 * What the providers say when the session a turn names is not usable: Claude Code's "Session ID …
 * is already in use" (a `--session-id` the provider already has) and "No conversation found with
 * session ID" (a `--resume` it does not have), and Codex's "thread not found", "no rollout found
 * for thread id" and "Session not found".
 */
const SESSION_LOST_PATTERN =
  /is already in use|no conversation found|thread not found|no rollout found|session not found/i;

/**
 * Whether a failed turn failed because the provider does not have (or already has) the session it
 * was given, so a fresh session would work.
 *
 * @param problem - The turn's problem.
 */
export function isSessionLost(problem: AgentProblem | undefined): boolean {
  return problem !== undefined && SESSION_LOST_PATTERN.test(`${problem.message} ${problem.fix}`);
}
