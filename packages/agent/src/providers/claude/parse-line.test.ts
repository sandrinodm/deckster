import { describe, expect, it } from 'vite-plus/test';

import { claudeProvider } from '#providers/index.ts';
import { makeParseState } from '#providers/provider-types.ts';
import { parseTranscript, summarise, transcriptsOf } from '#providers/transcripts.fixture.ts';

import { parseClaudeLine } from './parse-line.ts';

describe('parseClaudeLine', () => {
  it.each(transcriptsOf('claude'))('parses %s without throwing', (file) => {
    const { events, state } = parseTranscript(claudeProvider, file);
    expect(events.length).toBeGreaterThan(0);
    expect(state.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    // Every transcript but the SIGTERM one ends with a result.
    expect(state.terminal !== undefined || file.includes('sigterm')).toBe(true);
  });

  it('normalises the edit turn: tools with paths, the edit, lint, the answer, usage', () => {
    const { events, state } = parseTranscript(
      claudeProvider,
      'claude-2.1.325-turn1-edit-title.jsonl',
    );
    expect(state.terminal).toBe('completed');
    expect(summarise(events)).toMatchSnapshot();
    const usage = events.find((event) => event.type === 'usage');
    expect(usage).toMatchObject({ costUsd: 0.270333, outputTokens: 898 });
  });

  it('reports a turn cost as the difference of the cumulative totals', () => {
    const { events } = parseTranscript(
      claudeProvider,
      'claude-2.1.325-turn2-resume-full-stop.jsonl',
      0.27033260000000003,
    );
    const usage = events.find((event) => event.type === 'usage');
    expect(usage?.type === 'usage' && usage.costUsd).toBeGreaterThan(0);
    expect(usage?.type === 'usage' && usage.costUsd).toBeLessThan(0.2);
  });

  it('marks an edit outside the deck as denied, and the write inside as a file change', () => {
    const { events, state } = parseTranscript(
      claudeProvider,
      'claude-2.1.325-refused-edit-outside-deck.jsonl',
    );
    expect(state.terminal).toBe('completed');
    expect(summarise(events)).toMatchSnapshot();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'tool',
        name: 'Edit',
        status: 'denied',
        path: 'brands/default/brand.ts',
      }),
    );
    expect(events).toContainEqual({
      type: 'file-change',
      path: 'decks/hello/scratch-note.txt',
      kind: 'add',
    });
  });

  it('reads a cancel by SIGINT as cancelled', () => {
    const { events, state } = parseTranscript(
      claudeProvider,
      'claude-2.1.325-cancelled-sigint-during-tools.jsonl',
    );
    expect(state.terminal).toBe('cancelled');
    expect(summarise(events)).toMatchSnapshot();
  });

  it('streams text deltas and stops without a terminal event on SIGTERM', () => {
    const { events, state } = parseTranscript(
      claudeProvider,
      'claude-2.1.325-cancelled-sigterm-no-result.jsonl',
    );
    expect(state.terminal).toBeUndefined();
    expect(events.filter((event) => event.type === 'text-delta').length).toBeGreaterThan(20);
  });

  it('reports a deck MCP server that did not connect, and carries on', () => {
    const { events, state } = parseTranscript(
      claudeProvider,
      'claude-2.1.325-mcp-wrong-token.jsonl',
    );
    expect(events[1]).toMatchObject({ type: 'error', kind: 'mcp-unavailable' });
    expect(state.terminal).toBe('completed');
  });

  it('reads not signed in from the assistant error', () => {
    const { events, state } = parseTranscript(claudeProvider, 'claude-2.1.325-not-signed-in.jsonl');
    expect(state.terminal).toBe('failed');
    expect(state.failure?.kind).toBe('not-signed-in');
    expect(summarise(events)).toMatchSnapshot();
  });

  it('names MCP tool calls without the server prefix', () => {
    const { events } = parseTranscript(
      claudeProvider,
      'claude-2.1.325-mcp-call-deferred-toolsearch.jsonl',
    );
    const names = events.flatMap((event) => (event.type === 'tool' ? [event.name] : []));
    expect(names).toContain('current_slide');
    expect(names).toContain('deck_lint');
  });

  it('ignores malformed, blank, non-object and unknown lines', () => {
    const state = makeParseState('/workspace');
    for (const line of [
      '',
      '   ',
      'not json',
      '{"type":',
      '[1,2]',
      '42',
      '{"type":"future_event"}',
      '{"type":"system","subtype":"new_thing"}',
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hm"}}}',
    ]) {
      expect(() => parseClaudeLine(line, state)).not.toThrow();
      expect(parseClaudeLine(line, state)).toEqual([]);
    }
  });

  it('turns an api_retry and a rate-limit warning into notices', () => {
    const state = makeParseState('/workspace');
    expect(
      parseClaudeLine(
        '{"type":"system","subtype":"api_retry","attempt":2,"max_retries":10,"error":"overloaded"}',
        state,
      ),
    ).toEqual([
      {
        type: 'notice',
        kind: 'retry',
        message: 'Retrying the request (attempt 2 of 10): overloaded',
      },
    ]);
    expect(
      parseClaudeLine(
        '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","rateLimitType":"five_hour"}}',
        state,
      ),
    ).toEqual([{ type: 'notice', kind: 'rate-limit', message: 'The five hour limit is close.' }]);
  });
});
