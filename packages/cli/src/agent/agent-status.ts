import type { ProviderStatus } from '@deckster/agent/providers';

import { Console, Effect } from 'effect';

import type { AgentSetup } from '#agent/agent-flags.ts';

/**
 * A provider's state in a few lines: version and login, then the problem with its fix, then
 * warnings.
 *
 * @param label - The provider's name, such as `Claude Code`.
 * @param status - What its doctor found.
 */
export function formatProviderStatus(label: string, status: ProviderStatus): string[] {
  const lines: string[] = [];
  if (!status.installed) {
    lines.push(`${label}: not installed`);
  } else {
    const version = status.version ?? 'unknown version';
    let login = 'login not checked';
    if (status.signedIn === true) {
      login = `signed in${status.account === null ? '' : ` with ${status.account}`}`;
    } else if (status.signedIn === false) {
      login = 'not signed in';
    }

    lines.push(`${label} ${version}: ${login}`);
  }

  if (status.problem !== null) {
    lines.push(`  Problem: ${status.problem.message}`, `  Fix: ${status.problem.fix}`);
  }

  for (const warning of status.warnings) {
    lines.push(`  Note: ${warning}`);
  }

  return lines;
}

/**
 * Prints the agent's set-up and its doctor's findings when the dev server starts. A problem goes to
 * stderr with its fix; the server keeps running and the panel shows the same state.
 *
 * @param setup - The agent set-up.
 * @param status - What the provider's doctor found.
 */
export const reportAgentStatus = Effect.fn('reportAgentStatus')(function* (
  setup: AgentSetup,
  status: ProviderStatus,
): Effect.fn.Return<void> {
  const [first = '', ...rest] = formatProviderStatus(setup.provider.label, status);
  const model = setup.model === undefined ? '' : `, model ${setup.model}`;
  const web = setup.web ? ', web on' : '';
  yield* Console.log(`  Agent:   ${first} (panel ${setup.panel}${model}${web})`);
  for (const line of rest) {
    yield* status.problem === null
      ? Console.log(`         ${line}`)
      : Console.error(`         ${line}`);
  }
});
