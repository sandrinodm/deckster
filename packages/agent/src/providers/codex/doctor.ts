import type { ChildProcessSpawner } from 'effect/process';

import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { ProviderStatus } from '#providers/provider-types.ts';

import { childEnvironment } from '#providers/child-env.ts';
import { CODEX_SIGN_IN_FIX } from '#providers/codex/classify.ts';
import { CODEX_TESTED_VERSION } from '#providers/codex/invocation.ts';
import { runCommand } from '#providers/run-command.ts';
import { readVersion, versionWarning } from '#providers/version.ts';

/**
 * The line `codex login status` prints for a signed-in account, with the account after it.
 */
const ACCOUNT_PATTERN = /Logged in using (.+)/;

/**
 * A top-level `model = "…"` (or single-quoted) line of a TOML document.
 */
const TOML_MODEL_PATTERN = /^model\s*=\s*(?:"([^"]*)"|'([^']*)')/;

/**
 * Checks Codex: `codex --version`, then `codex login status` (exit 0 "Logged in…", exit 1 "Not
 * logged in").
 *
 * @param environment - The parent environment.
 */
export const codexDoctor = Effect.fn('codexDoctor')(function* (
  environment: Readonly<Record<string, string | undefined>>,
): Effect.fn.Return<ProviderStatus, never, ChildProcessSpawner.ChildProcessSpawner> {
  const env = childEnvironment('codex', environment);
  const base = { provider: 'codex', testedVersion: CODEX_TESTED_VERSION } as const;
  const version = yield* runCommand('codex', ['--version'], env);
  if (version.kind === 'missing') {
    return {
      ...base,
      installed: false,
      version: null,
      signedIn: null,
      account: null,
      problem: {
        kind: 'not-installed',
        message: 'Codex (`codex`) is not on the PATH.',
        fix:
          'Install it with `npm install -g @openai/codex`, run `codex login`, ' +
          'then start the deck again.',
      },
      warnings: [],
    };
  }

  const found = readVersion(version.stdout);
  const warnings = versionWarning('Codex', found, CODEX_TESTED_VERSION);
  const login = yield* runCommand('codex', ['login', 'status'], env);
  if (login.kind === 'missing' || login.code === null) {
    return {
      ...base,
      installed: true,
      version: found,
      signedIn: null,
      account: null,
      problem: null,
      warnings: [...warnings, 'Could not run `codex login status`; the login was not checked.'],
    };
  }

  const said = `${login.stdout}\n${login.stderr}`.trim();
  const signedIn = login.code === 0;
  const account = ACCOUNT_PATTERN.exec(said)?.[1]?.trim() ?? null;
  return {
    ...base,
    installed: true,
    version: found,
    signedIn,
    account,
    problem: signedIn
      ? null
      : { kind: 'not-signed-in', message: 'Codex is not signed in.', fix: CODEX_SIGN_IN_FIX },
    warnings,
  };
});

/**
 * The model in Codex's own configuration (`$CODEX_HOME/config.toml`, default `~/.codex`). Turns run
 * with `--ignore-user-config`, which drops it, so the adapter passes it with `-m`. Only a top-level
 * `model = "…"` before the first table counts.
 *
 * @param environment - The parent environment, for `CODEX_HOME` and `HOME`.
 */
export const codexConfigModel = Effect.fn('codexConfigModel')(function* (
  environment: Readonly<Record<string, string | undefined>>,
): Effect.fn.Return<string | undefined, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const home = environment.CODEX_HOME ?? path.join(environment.HOME ?? '', '.codex');
  const config = yield* fs
    .readFileString(path.join(home, 'config.toml'))
    .pipe(Effect.orElseSucceed(() => ''));
  return readTomlModel(config);
});

/**
 * The top-level `model` of a TOML document, ignoring tables.
 *
 * @param toml - The document.
 */
export function readTomlModel(toml: string): string | undefined {
  for (const raw of toml.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      return undefined;
    }

    const match = TOML_MODEL_PATTERN.exec(line);
    if (match !== null) {
      return match[1] ?? match[2];
    }
  }

  return undefined;
}
