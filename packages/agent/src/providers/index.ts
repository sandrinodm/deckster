import { Effect } from 'effect';

import type { ProviderId } from '#protocol/agent-events.ts';
import type { AgentProvider } from '#providers/provider-types.ts';

import { interpretClaudeExit } from '#providers/claude/classify.ts';
import { claudeDoctor } from '#providers/claude/doctor.ts';
import { CLAUDE_TESTED_VERSION, claudeInvocation } from '#providers/claude/invocation.ts';
import { parseClaudeLine } from '#providers/claude/parse-line.ts';
import { interpretCodexExit } from '#providers/codex/classify.ts';
import { codexConfigModel, codexDoctor } from '#providers/codex/doctor.ts';
import { CODEX_TESTED_VERSION, codexInvocation } from '#providers/codex/invocation.ts';
import { parseCodexLine } from '#providers/codex/parse-line.ts';
import { fakeProvider } from '#providers/fake/fake-provider.ts';

/**
 * Claude Code, driven as `claude -p` with stream-json output.
 */
export const claudeProvider: AgentProvider = {
  /**
   * The provider id.
   */
  id: 'claude',

  /**
   * The name to show.
   */
  label: 'Claude Code',

  /**
   * The version the transcripts were recorded with.
   */
  testedVersion: CLAUDE_TESTED_VERSION,

  /**
   * Whether the host names new sessions.
   */
  namesSessions: true,

  /**
   * Checks the binary, version and login.
   */
  doctor: claudeDoctor,

  /**
   * The model when none is chosen.
   */
  defaultModel: () => Effect.succeed(undefined),

  /**
   * The command line of a turn.
   */
  invocation: claudeInvocation,

  /**
   * One output line to events.
   */
  parseLine: parseClaudeLine,

  /**
   * How a turn ended.
   */
  interpretExit: interpretClaudeExit,
};

/**
 * Codex, driven as `codex exec --json`.
 */
export const codexProvider: AgentProvider = {
  /**
   * The provider id.
   */
  id: 'codex',

  /**
   * The name to show.
   */
  label: 'Codex',

  /**
   * The version the transcripts were recorded with.
   */
  testedVersion: CODEX_TESTED_VERSION,

  /**
   * Whether the host names new sessions.
   */
  namesSessions: false,

  /**
   * Checks the binary, version and login.
   */
  doctor: codexDoctor,

  /**
   * The model when none is chosen.
   */
  defaultModel: codexConfigModel,

  /**
   * The command line of a turn.
   */
  invocation: codexInvocation,

  /**
   * One output line to events.
   */
  parseLine: parseCodexLine,

  /**
   * How a turn ended.
   */
  interpretExit: interpretCodexExit,
};

/**
 * The providers `--agent` offers, in the order help lists them. `fake` is left out on purpose.
 */
export const PUBLIC_PROVIDERS = ['claude', 'codex'] as const;

/**
 * Every provider by id, the hidden fake included.
 */
export const PROVIDERS: Readonly<Record<ProviderId, AgentProvider>> = {
  /**
   * Claude Code.
   */
  claude: claudeProvider,

  /**
   * Codex.
   */
  codex: codexProvider,

  /**
   * The fake provider, for tests.
   */
  fake: fakeProvider,
};

/**
 * The provider a `--agent` value names, or undefined when it names none.
 *
 * @param flag - The value given.
 */
export function resolveProvider(flag: string): AgentProvider | undefined {
  return flag === 'claude' || flag === 'codex' || flag === 'fake' ? PROVIDERS[flag] : undefined;
}

export type { AgentProvider, ProviderStatus } from '#providers/provider-types.ts';
