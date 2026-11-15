import { PROVIDERS, PUBLIC_PROVIDERS, resolveProvider } from '@deckster/agent/providers';
import { CONTENT_SCOPE_SENTENCE } from '@deckster/brand/node';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Console, Effect } from 'effect';

import { formatProviderStatus } from '#agent/agent-status.ts';
import { usageError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK, type Command } from '#command.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { parseCommandArgs } from '#parse-command-args.ts';

/**
 * Runs `doctor`, the one subcommand, and succeeds with the exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runAgent(argv));

/**
 * Parses the arguments and checks the providers.
 *
 * @param argv - The arguments after `agent`.
 */
const runAgent = Effect.fn('deck.agent')(function* (argv: readonly string[]) {
  const { values, positionals } = yield* parseCommandArgs('agent', argv, {
    agent: { type: 'string' },
    json: { type: 'boolean', default: false },
  });
  if (positionals[0] !== 'doctor' || positionals.length > 1) {
    return yield* usageError(
      positionals[0] === undefined
        ? 'Which agent command? The one there is: doctor.'
        : `Unknown agent command "${positionals.join(' ')}". The one there is: doctor.`,
      'agent',
    );
  }

  const chosen = values.agent === undefined ? undefined : resolveProvider(values.agent);
  if (values.agent !== undefined && (chosen === undefined || chosen.id === 'fake')) {
    return yield* usageError(
      `--agent must be ${PUBLIC_PROVIDERS.join(' or ')}, got "${values.agent}".`,
      'agent',
    );
  }

  const providers = chosen === undefined ? PUBLIC_PROVIDERS.map((id) => PROVIDERS[id]) : [chosen];
  const statuses = yield* Effect.forEach(
    providers,
    (provider) =>
      provider
        .doctor(process.env)
        .pipe(Effect.map((status) => ({ label: provider.label, ...status }))),
    { concurrency: 'unbounded' },
  ).pipe(Effect.provide(NodeServices.layer));
  const ok = statuses.every((status) => status.problem === null);
  if (values.json) {
    yield* printJson({ ok, providers: statuses });
  } else {
    for (const status of statuses) {
      yield* Console.log(formatProviderStatus(status.label, status).join('\n'));
    }

    yield* Console.log(`\n${CONTENT_SCOPE_SENTENCE}`);
  }

  return ok ? EXIT_OK : EXIT_FAILED;
});
