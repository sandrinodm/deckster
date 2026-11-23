import type { AgentPanelPosition } from '@deckster/agent/protocol/events';
import type { AgentProvider } from '@deckster/agent/providers';

import { PUBLIC_PROVIDERS, resolveProvider } from '@deckster/agent/providers';
import { CONTENT_SCOPE_SENTENCE } from '@deckster/brand/node';
import { Config, Effect, Option } from 'effect';

import type { AgentFlags } from '#server/dev-server.ts';

import { usageError, type CliError } from '#cli-error.ts';

/**
 * The help lines of the agent flags.
 */
export const AGENT_HELP = `  --agent <name>  Add the agent chat beside the slide: ${PUBLIC_PROVIDERS.join(' or ')}. It runs that
                  CLI with your own login, one process per prompt; every turn can be undone.
                  Implies --mcp. Check the set-up with \`deckster agent doctor\`.
                  ${CONTENT_SCOPE_SENTENCE}
                  See docs/agent.md.
  --agent-panel <right|bottom>
                  Where the chat docks. Default: right.
  --agent-model <name>
                  The model the agent uses. Default: the CLI's own default (for Codex, the model
                  in $CODEX_HOME/config.toml).
  --agent-web     Let the agent search the web and read pages (Claude's WebSearch and WebFetch
                  tools, Codex's live web search). Off by default: pages are text from outside
                  the repository that the agent reads while it edits code your browser runs, and
                  its queries and the addresses it opens leave this machine.`;

/**
 * The agent set-up a dev server starts with, validated.
 */
export type AgentSetup = {
  /**
   * The provider.
   */
  readonly provider: AgentProvider;

  /**
   * Where the panel docks.
   */
  readonly panel: AgentPanelPosition;

  /**
   * The model, or undefined for the provider's default.
   */
  readonly model: string | undefined;

  /**
   * Whether the agent may search the web.
   */
  readonly web: boolean;
};

/**
 * The environment variable the test fixtures set to allow the fake provider.
 */
export const FAKE_AGENT_VARIABLE = 'DECK_TEST_FAKE_AGENT';

/**
 * That variable, read through Effect's configuration.
 */
const FAKE_AGENT_FROM_ENV = Config.option(Config.String(FAKE_AGENT_VARIABLE));

/**
 * Checks the agent flags: a known provider (`fake` only when the test fixtures set
 * `DECK_TEST_FAKE_AGENT=1`, and never listed), a panel position and a non-empty model; web search
 * passes through.
 *
 * @param command - The command name, for the error.
 * @param flags - The flags as given.
 * @throws CliError in the error channel, naming the values that are allowed.
 */
export const resolveAgentSetup = Effect.fn('resolveAgentSetup')(function* (
  command: string,
  flags: AgentFlags,
): Effect.fn.Return<AgentSetup, CliError> {
  const allowFake = yield* Effect.orElseSucceed(FAKE_AGENT_FROM_ENV, () =>
    Option.none<string>(),
  ).pipe(Effect.map((value) => Option.getOrElse(value, () => '') === '1'));
  const provider =
    flags.provider === 'fake' && !allowFake ? undefined : resolveProvider(flags.provider);
  if (provider === undefined) {
    return yield* usageError(
      `--agent must be ${PUBLIC_PROVIDERS.join(' or ')}, got "${flags.provider}".`,
      command,
    );
  }

  const panel = flags.panel ?? 'right';
  if (panel !== 'right' && panel !== 'bottom') {
    return yield* usageError(`--agent-panel must be right or bottom, got "${panel}".`, command);
  }

  const model = flags.model?.trim();
  if (model === '') {
    return yield* usageError('--agent-model needs a model name.', command);
  }

  return { provider, panel, model, web: flags.web };
});
