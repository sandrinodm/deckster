import type { ChildProcessSpawner } from 'effect/process';

import { Effect } from 'effect';

import type { ProviderStatus } from '#providers/provider-types.ts';

import { childEnvironment } from '#providers/child-env.ts';
import { CLAUDE_SIGN_IN_FIX } from '#providers/claude/classify.ts';
import { CLAUDE_TESTED_VERSION } from '#providers/claude/invocation.ts';
import { readJsonObject, text } from '#providers/json-line.ts';
import { runCommand } from '#providers/run-command.ts';
import { readVersion, versionWarning } from '#providers/version.ts';

/**
 * Checks Claude Code: `claude --version`, then `claude auth status --json` (`loggedIn`,
 * `authMethod`, `subscriptionType`). It never prints the account's e-mail address.
 *
 * @param environment - The parent environment.
 */
export const claudeDoctor = Effect.fn('claudeDoctor')(function* (
  environment: Readonly<Record<string, string | undefined>>,
): Effect.fn.Return<ProviderStatus, never, ChildProcessSpawner.ChildProcessSpawner> {
  const env = childEnvironment('claude', environment);
  const base = {
    provider: 'claude',
    testedVersion: CLAUDE_TESTED_VERSION,
  } as const;
  const version = yield* runCommand('claude', ['--version'], env);
  if (version.kind === 'missing') {
    return {
      ...base,
      installed: false,
      version: null,
      signedIn: null,
      account: null,
      problem: {
        kind: 'not-installed',
        message: 'Claude Code (`claude`) is not on the PATH.',
        fix:
          'Install it with `npm install -g @anthropic-ai/claude-code`, ' +
          'run `claude` once to sign in, then start the deck again.',
      },
      warnings: [],
    };
  }

  const found = readVersion(version.stdout);
  const warnings = versionWarning('Claude Code', found, CLAUDE_TESTED_VERSION);
  const status = yield* runCommand('claude', ['auth', 'status', '--json'], env);
  const auth = status.kind === 'ran' ? readJsonObject(status.stdout.trim()) : undefined;
  if (auth === undefined) {
    return {
      ...base,
      installed: true,
      version: found,
      signedIn: null,
      account: null,
      problem: null,
      warnings: [
        ...warnings,
        'Could not read `claude auth status --json`; the login was not checked.',
      ],
    };
  }

  const signedIn = auth.loggedIn === true;
  const method = text(auth.authMethod);
  const plan = text(auth.subscriptionType);
  const planLabel = plan === undefined ? '' : ` (${plan})`;
  return {
    ...base,
    installed: true,
    version: found,
    signedIn,
    account: method === undefined ? null : `${method}${planLabel}`,
    problem: signedIn
      ? null
      : {
          kind: 'not-signed-in',
          message: 'Claude Code is not signed in.',
          fix: CLAUDE_SIGN_IN_FIX,
        },
    warnings,
  };
});
