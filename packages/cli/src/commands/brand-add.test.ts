import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCaptured } from '#cli.fixture.ts';

/**
 * A credential-free address suitable for the tests' offline Git fixture.
 */
const ADDRESS = 'https://example.test/acme/brand-kit.git';

/**
 * A synthetic credential that must stay out of the CLI's output.
 */
const MARKER = 'synthetic-brand-credential';

/**
 * A source with credentials in its authority.
 */
const CREDENTIAL_ADDRESS = `https://user:${MARKER}@example.test/acme/brand-kit.git`;

/**
 * Time for Node to start the CLI and load the brand command.
 */
const CLI_TIMEOUT_MS = 30_000;

/**
 * Runs the real CLI with a Git fixture that records its invocation and prints a credential on both
 * streams before failing, like a transport reporting a rewritten address.
 *
 * @param args - The arguments after `deckster brand add`.
 */
function runWithFailingGit(
  args: readonly string[],
): SpawnSyncReturns<string> & { gitRan: boolean } {
  using directory = fs.mkdtempDisposableSync(path.join(os.tmpdir(), 'deck-brand-cli-'));
  const invocation = path.join(directory.path, 'git-ran');
  const fixture = [
    '#!/bin/sh',
    ': > "$DECK_TEST_GIT_INVOCATION"',
    'printf "%s\\n" "$DECK_TEST_GIT_DIAGNOSTIC"',
    'printf "%s\\n" "$DECK_TEST_GIT_DIAGNOSTIC" >&2',
    'exit 128',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(directory.path, 'git'), fixture, { mode: 0o755 });

  const run = spawnSync(process.execPath, ['packages/cli/src/bin.ts', 'brand', 'add', ...args], {
    cwd: FRAMEWORK_ROOT,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: {
      ...process.env,
      PATH: [directory.path, process.env['PATH']].join(path.delimiter),
      DECK_TEST_GIT_INVOCATION: invocation,
      DECK_TEST_GIT_DIAGNOSTIC: `fatal: could not read ${CREDENTIAL_ADDRESS}`,
    },
  });
  return { ...run, gitRan: fs.existsSync(invocation) };
}

describe('deckster brand add', () => {
  it.effect('needs exactly one source, and refuses --force on the other brand commands', () =>
    Effect.gen(function* () {
      const missing = yield* runCaptured(['brand', 'add', '--json']);
      expect(missing.code).toBe(1);
      expect(JSON.parse(missing.output)).toMatchObject({
        ok: false,
        error: { type: 'CliError', message: expect.stringContaining('Name one brand source') },
      });
      const extra = yield* runCaptured(['brand', 'add', 'gh:a/b', 'gh:c/d', '--json']);
      expect(extra.code).toBe(1);
      const forced = yield* runCaptured(['brand', 'default', '--force', '--json']);
      expect(forced.code).toBe(1);
    }),
  );

  it.effect('refuses a source with another protocol before running git', () =>
    Effect.gen(function* () {
      const run = yield* runCaptured(['brand', 'add', 'file:///etc//x', '--json']);
      expect(run.code).toBe(1);
      expect(JSON.parse(run.output)).toMatchObject({
        ok: false,
        error: { message: expect.stringContaining('only https:// and ssh://') },
      });
    }),
  );

  it(
    'keeps rejected sources and malformed options out of stdout and stderr before running Git',
    () => {
      const invalidInputs = [CREDENTIAL_ADDRESS, `--${MARKER}`, `--force=${MARKER}`];
      for (const source of invalidInputs) {
        const run = runWithFailingGit([source, '--json']);
        expect(run.error).toBeUndefined();
        expect(run.status).toBe(1);
        expect(run.gitRan).toBe(false);
        expect(run.stderr).toBe('');
        expect(run.stdout).not.toContain(MARKER);
        expect(JSON.parse(run.stdout)).toMatchObject({ ok: false, error: { type: 'CliError' } });
      }

      const run = runWithFailingGit([CREDENTIAL_ADDRESS]);
      expect(run.status).toBe(1);
      expect(run.gitRan).toBe(false);
      expect(run.stdout).toBe('');
      expect(run.stderr).toContain('user name, token or password');
      expect(run.stderr).not.toContain(MARKER);
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'reports a Git failure without leaking its diagnostics in human or JSON output',
    () => {
      const human = runWithFailingGit([ADDRESS]);
      expect(human.status).toBe(1);
      expect(human.gitRan).toBe(true);
      expect(human.stdout).toBe('');
      expect(human.stderr).toContain(`Fetching ${ADDRESS} with git`);
      expect(human.stderr).toContain(`git could not read ${ADDRESS}`);
      expect(human.stderr).not.toContain(MARKER);

      const json = runWithFailingGit([ADDRESS, '--json']);
      expect(json.status).toBe(1);
      expect(json.gitRan).toBe(true);
      expect(json.stderr).toContain(`Fetching ${ADDRESS} with git`);
      expect(json.stderr).not.toContain(MARKER);
      expect(json.stdout).not.toContain(MARKER);
      expect(JSON.parse(json.stdout)).toMatchObject({
        ok: false,
        error: { message: expect.stringContaining(`git could not read ${ADDRESS}`) },
      });
    },
    CLI_TIMEOUT_MS,
  );
});
