import { Effect } from 'effect';

import type { AgentFlags } from '#server/dev-server.ts';

import { usageError, type CliError } from '#cli-error.ts';

/**
 * The `parseArgs` options of the agent flags, shared by `deck dev` and `deck present`.
 */
export const AGENT_ARG_OPTIONS = {
  /**
   * `--agent <claude|codex>`.
   */
  agent: { type: 'string' },

  /**
   * `--agent-panel <right|bottom>`.
   */
  'agent-panel': { type: 'string' },

  /**
   * `--agent-model <name>`.
   */
  'agent-model': { type: 'string' },

  /**
   * `--agent-web`.
   */
  'agent-web': { type: 'boolean' },
} as const;

/**
 * Collects the agent flags, or undefined when `--agent` is not given; the other agent flags without
 * `--agent` are a usage error.
 *
 * @param command - The command name, for the error.
 * @param values - The parsed options.
 * @throws CliError in the error channel, for agent options without `--agent`.
 */
export const readAgentFlags = Effect.fn('readAgentFlags')(function* (
  command: string,
  values: {
    readonly agent?: string | undefined;
    readonly 'agent-panel'?: string | undefined;
    readonly 'agent-model'?: string | undefined;
    readonly 'agent-web'?: boolean | undefined;
  },
): Effect.fn.Return<AgentFlags | undefined, CliError> {
  if (values.agent === undefined) {
    const others = [values['agent-panel'], values['agent-model'], values['agent-web']];
    if (others.some(Boolean)) {
      return yield* usageError(
        '--agent-panel, --agent-model and --agent-web need --agent <name>.',
        command,
      );
    }

    return undefined;
  }

  return {
    provider: values.agent,
    panel: values['agent-panel'],
    model: values['agent-model'],
    web: values['agent-web'] === true,
  };
});
