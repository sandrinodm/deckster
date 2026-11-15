import { describe, expect, it } from 'vite-plus/test';

import type { ProcessExit } from '#providers/provider-types.ts';

import { claudeProvider, codexProvider } from '#providers/index.ts';
import { makeParseState } from '#providers/provider-types.ts';
import { parseTranscript, readTranscript } from '#providers/transcripts.fixture.ts';

/**
 * A process exit with defaults for the fields a case does not set.
 *
 * @param fields - The fields to set.
 */
function exit(fields: Partial<ProcessExit>): ProcessExit {
  return { code: 0, signal: null, stderr: '', cancelled: false, timedOut: undefined, ...fields };
}

describe('Claude exit classification', () => {
  it('a completed turn is completed', () => {
    const { state } = parseTranscript(claudeProvider, 'claude-2.1.325-turn1-edit-title.jsonl');
    expect(claudeProvider.interpretExit(exit({}), state)).toEqual({
      status: 'completed',
      problem: undefined,
    });
  });

  it('not signed in: an assistant error, then is_error, then exit 1', () => {
    const { state } = parseTranscript(claudeProvider, 'claude-2.1.325-not-signed-in.jsonl');
    const outcome = claudeProvider.interpretExit(exit({ code: 1 }), state);
    expect(outcome.status).toBe('failed');
    expect(outcome.problem).toMatchObject({ kind: 'not-signed-in' });
    expect(outcome.problem?.fix).toContain('/login');
  });

  it('cancelled by SIGINT: exit 0 with an aborted_streaming result', () => {
    const { state } = parseTranscript(
      claudeProvider,
      'claude-2.1.325-cancelled-sigint-during-tools.jsonl',
    );
    expect(claudeProvider.interpretExit(exit({ code: 0, cancelled: true }), state).status).toBe(
      'cancelled',
    );
  });

  it('killed by SIGTERM: no result; cancelled when asked, crashed when not', () => {
    const { state } = parseTranscript(
      claudeProvider,
      'claude-2.1.325-cancelled-sigterm-no-result.jsonl',
    );
    expect(claudeProvider.interpretExit(exit({ code: 143, cancelled: true }), state).status).toBe(
      'cancelled',
    );
    const crashed = claudeProvider.interpretExit(exit({ code: null, signal: 'SIGTERM' }), state);
    expect(crashed).toMatchObject({ status: 'failed', problem: { kind: 'crashed' } });
    expect(crashed.problem?.message).toContain('SIGTERM');
  });

  it('a wrong MCP token still completes; the stream reported the tools as unavailable', () => {
    const { state, events } = parseTranscript(
      claudeProvider,
      'claude-2.1.325-mcp-wrong-token.jsonl',
    );
    expect(claudeProvider.interpretExit(exit({}), state).status).toBe('completed');
    expect(events.some((event) => event.type === 'error' && event.kind === 'mcp-unavailable')).toBe(
      true,
    );
  });

  it('a refused edit is a completed turn, not a failure', () => {
    const { state } = parseTranscript(
      claudeProvider,
      'claude-2.1.325-refused-edit-outside-deck.jsonl',
    );
    expect(claudeProvider.interpretExit(exit({}), state).status).toBe('completed');
  });

  it('a non-zero exit with nothing on stdout is a start-up failure read from stderr', () => {
    const state = makeParseState('/workspace');
    const outcome = claudeProvider.interpretExit(
      exit({ code: 1, stderr: 'Error: Invalid API key. Please run /login' }),
      state,
    );
    expect(outcome.problem).toMatchObject({ kind: 'not-signed-in' });
    const other = claudeProvider.interpretExit(
      exit({ code: 2, stderr: 'unknown option --nope' }),
      state,
    );
    expect(other.problem?.message).toContain('unknown option --nope');
  });

  it('a limit that stopped the turn is a timeout', () => {
    const state = makeParseState('/workspace');
    expect(
      claudeProvider.interpretExit(exit({ code: 0, timedOut: 'idle' }), state).problem?.kind,
    ).toBe('timeout');
  });
});

describe('Codex exit classification', () => {
  it('a completed turn is completed', () => {
    const { state } = parseTranscript(codexProvider, 'codex-0.167.2-turn1-edit-title.jsonl');
    expect(codexProvider.interpretExit(exit({}), state).status).toBe('completed');
  });

  it('not signed in: retries, then turn.failed with a 401', () => {
    const { state } = parseTranscript(codexProvider, 'codex-0.167.2-not-signed-in.jsonl');
    const outcome = codexProvider.interpretExit(exit({ code: 1 }), state);
    expect(outcome).toMatchObject({ status: 'failed', problem: { kind: 'not-signed-in' } });
    expect(outcome.problem?.fix).toContain('codex login');
  });

  it('cancelled by SIGINT: exit 1 without turn.completed', () => {
    const { state } = parseTranscript(codexProvider, 'codex-0.167.2-cancelled-sigint.jsonl');
    expect(codexProvider.interpretExit(exit({ code: 1, cancelled: true }), state).status).toBe(
      'cancelled',
    );
  });

  it('killed by SIGTERM without a cancel is a crash', () => {
    const { state } = parseTranscript(codexProvider, 'codex-0.167.2-cancelled-sigterm.jsonl');
    expect(
      codexProvider.interpretExit(exit({ code: null, signal: 'SIGTERM' }), state),
    ).toMatchObject({ status: 'failed', problem: { kind: 'crashed' } });
  });

  it('a wrong MCP token with required=true fails at start-up as mcp-unavailable', () => {
    const outcome = codexProvider.interpretExit(
      exit({
        code: 1,
        stderr: readTranscript('codex-0.167.2-mcp-wrong-token-required.stderr.txt'),
      }),
      makeParseState('/workspace'),
    );
    expect(outcome).toMatchObject({ status: 'failed', problem: { kind: 'mcp-unavailable' } });
    expect(outcome.problem?.message).toContain('required MCP servers failed to initialize');
  });

  it('a wrong MCP token without required completes; the tools are silently missing', () => {
    const { state } = parseTranscript(
      codexProvider,
      'codex-0.167.2-mcp-wrong-token-not-required.jsonl',
    );
    expect(
      codexProvider.interpretExit(
        exit({ stderr: readTranscript('codex-0.167.2-mcp-wrong-token-not-required.stderr.txt') }),
        state,
      ).status,
    ).toBe('completed');
  });

  it('a refused edit outside the deck is a completed turn', () => {
    const { state } = parseTranscript(
      codexProvider,
      'codex-0.167.2-refused-edit-outside-deck.jsonl',
    );
    expect(
      codexProvider.interpretExit(
        exit({ stderr: readTranscript('codex-0.167.2-refused-edit-outside-deck.stderr.txt') }),
        state,
      ).status,
    ).toBe('completed');
  });
});
