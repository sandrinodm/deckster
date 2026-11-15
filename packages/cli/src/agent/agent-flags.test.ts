import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';

import { readAgentFlags } from '#agent/agent-flag-options.ts';
import { resolveAgentSetup } from '#agent/agent-flags.ts';
import { runCaptured } from '#cli.fixture.ts';

describe('agent flags', () => {
  it.effect('collects the flags only with --agent', () =>
    Effect.gen(function* () {
      expect(yield* readAgentFlags('dev', {})).toBeUndefined();
      expect(yield* readAgentFlags('dev', { agent: 'claude', 'agent-panel': 'bottom' })).toEqual({
        provider: 'claude',
        panel: 'bottom',
        model: undefined,
        web: false,
      });
      expect(yield* readAgentFlags('dev', { agent: 'codex', 'agent-web': true })).toMatchObject({
        web: true,
      });
      const orphan = yield* Effect.flip(readAgentFlags('dev', { 'agent-model': 'x' }));
      expect(orphan.message).toContain('need --agent <name>');
      const orphanWeb = yield* Effect.flip(readAgentFlags('dev', { 'agent-web': true }));
      expect(orphanWeb.message).toContain('--agent-web need --agent <name>');
    }),
  );

  it.effect('defaults the panel to right and accepts the hidden fake', () =>
    Effect.gen(function* () {
      const setup = yield* resolveAgentSetup('dev', {
        provider: 'codex',
        panel: undefined,
        model: ' gpt-6-astra ',
        web: false,
      });
      expect(setup).toMatchObject({
        panel: 'right',
        model: 'gpt-6-astra',
        web: false,
      });
      expect(setup.provider.id).toBe('codex');
      const fake = yield* resolveAgentSetup('dev', {
        provider: 'fake',
        panel: undefined,
        model: undefined,
        web: true,
      });
      expect(fake.web).toBe(true);
      expect(fake.provider.id).toBe('fake');
    }),
  );

  it.effect('refuses the fake provider unless the test fixtures allow it', () =>
    Effect.gen(function* () {
      const refused = yield* Effect.flip(
        resolveAgentSetup('dev', {
          provider: 'fake',
          panel: undefined,
          model: undefined,
          web: false,
        }),
      ).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))));
      expect(refused.message).toContain('--agent must be claude or codex, got "fake"');
    }),
  );

  it.effect('names the allowed values of a wrong flag, never the hidden fake', () =>
    Effect.gen(function* () {
      const flags = {
        provider: 'claude',
        panel: undefined,
        model: undefined,
        web: false,
      };
      const provider = yield* Effect.flip(resolveAgentSetup('dev', { ...flags, provider: 'gpt' }));
      expect(provider.message).toContain('--agent must be claude or codex, got "gpt"');
      const panel = yield* Effect.flip(resolveAgentSetup('dev', { ...flags, panel: 'left' }));
      expect(panel.message).toContain('--agent-panel must be right or bottom');
    }),
  );

  it.effect('has no --agent-scope: one scope, said in the help', () =>
    Effect.gen(function* () {
      const help = yield* runCaptured(['dev', '--help']);
      expect(help.output).not.toContain('--agent-scope');
      expect(help.output).toContain("The agent edits only the deck's content");
      const refused = yield* Effect.flip(
        runCaptured(['dev', 'hello', '--agent', 'claude', '--agent-scope', 'workspace']),
      );
      expect(refused.message).toContain('agent-scope');
    }),
  );

  it.effect('deck agent needs the doctor subcommand and a public provider', () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip(runCaptured(['agent']));
      expect(missing.message).toContain('The one there is: doctor.');
      const fake = yield* runCaptured(['agent', 'doctor', '--agent', 'fake', '--json']);
      expect(JSON.parse(fake.output)).toMatchObject({
        ok: false,
        error: { type: 'CliError', message: expect.stringContaining('claude or codex') },
      });
    }),
  );
});
