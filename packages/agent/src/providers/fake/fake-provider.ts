import { Effect } from 'effect';
import { fileURLToPath } from 'node:url';

import type { AgentProvider, Invocation, InvocationContext } from '#providers/provider-types.ts';

import { childEnvironment } from '#providers/child-env.ts';
import { interpretClaudeExit } from '#providers/claude/classify.ts';
import { claudeStdin } from '#providers/claude/invocation.ts';
import { parseClaudeLine } from '#providers/claude/parse-line.ts';

/**
 * The script that plays a provider CLI for tests.
 */
export const FAKE_AGENT_SCRIPT = fileURLToPath(new URL('./fake-agent.fixture.ts', import.meta.url));

/**
 * The variables the fake reads from the host's environment, passed through when set.
 */
const FAKE_VARIABLES = [
  'DECK_FAKE_DELAY_MS',
  'DECK_FAKE_SCENARIO',
  'DECK_FAKE_IGNORE_PARENT',
  'DECK_FAKE_SESSIONS_DIR',
  'DECK_FAKE_PROMPT_LOG',
];

/**
 * The fake's command line: Node running `fake-agent.fixture.ts` with Claude-shaped session flags.
 * It replays recorded Claude Code transcripts, so the Claude parser and exit rules read it.
 *
 * @param context - The turn.
 */
function fakeInvocation(context: InvocationContext): Invocation {
  const { session } = context;
  const extra: Record<string, string> = {};
  for (const name of FAKE_VARIABLES) {
    const value = context.environment[name];
    if (value !== undefined) {
      extra[name] = value;
    }
  }

  const sessionFlag = session.resume ? '--resume' : '--session-id';
  return {
    command: process.execPath,
    args: [
      FAKE_AGENT_SCRIPT,
      ...(session.id === undefined ? [] : [sessionFlag, session.id]),
      ...(context.turn.screenshot === undefined ? [] : ['--input-format', 'stream-json']),
    ],
    cwd: context.workspaceRoot,
    env: childEnvironment('fake', context.environment, extra),
    stdin: claudeStdin(context),
    files: [],
  };
}

/**
 * The fake provider, selected with the hidden `--agent fake`: tests drive the whole agent host with
 * it, without a model.
 */
export const fakeProvider: AgentProvider = {
  /**
   * The provider id.
   */
  id: 'fake',

  /**
   * The name to show.
   */
  label: 'Fake agent',

  /**
   * The version the transcripts were recorded with.
   */
  testedVersion: '0.0.0',

  /**
   * Whether the host names new sessions.
   */
  namesSessions: true,

  /**
   * Checks the binary, version and login.
   */
  doctor: () =>
    Effect.succeed({
      provider: 'fake',
      installed: true,
      version: '0.0.0',
      testedVersion: '0.0.0',
      signedIn: true,
      account: 'fixtures',
      problem: null,
      warnings: [],
    }),

  /**
   * The model when none is chosen.
   */
  defaultModel: () => Effect.succeed(undefined),

  /**
   * The command line of a turn.
   */
  invocation: fakeInvocation,

  /**
   * One output line to events.
   */
  parseLine: parseClaudeLine,

  /**
   * How a turn ended.
   */
  interpretExit: interpretClaudeExit,
};
