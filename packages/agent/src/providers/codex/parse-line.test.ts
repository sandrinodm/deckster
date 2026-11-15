import { describe, expect, it } from 'vite-plus/test';

import { codexProvider } from '#providers/index.ts';
import { makeParseState } from '#providers/provider-types.ts';
import { parseTranscript, summarise, transcriptsOf } from '#providers/transcripts.fixture.ts';

import { parseCodexLine } from './parse-line.ts';

describe('parseCodexLine', () => {
  it.each(transcriptsOf('codex'))('parses %s without throwing', (file) => {
    const { events, state } = parseTranscript(codexProvider, file);
    expect(events[0]).toMatchObject({ type: 'session' });
    expect(state.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    // Every transcript but the two cancels ends with turn.completed or turn.failed.
    expect(state.terminal !== undefined || file.includes('cancelled')).toBe(true);
  });

  it('normalises the edit turn: shell reads, the patch, the MCP lint, the answer, usage', () => {
    const { events, state } = parseTranscript(
      codexProvider,
      'codex-0.167.2-turn1-edit-title.jsonl',
    );
    expect(state.terminal).toBe('completed');
    expect(summarise(events)).toMatchSnapshot();
  });

  it('reports the file change of a resumed turn with a workspace path', () => {
    const { events } = parseTranscript(codexProvider, 'codex-0.167.2-turn2-resume-full-stop.jsonl');
    expect(events).toContainEqual({
      type: 'file-change',
      path: 'decks/hello/slides/title.mdx',
      kind: 'update',
    });
  });

  it('marks an MCP call refused by the approval policy as denied', () => {
    const { events } = parseTranscript(codexProvider, 'codex-0.167.2-plan-invocation-turn1.jsonl');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tool', name: 'current_slide', status: 'denied' }),
    );
  });

  it('turns reconnect errors into retry notices and the final 401 into not signed in', () => {
    const { events, state } = parseTranscript(codexProvider, 'codex-0.167.2-not-signed-in.jsonl');
    expect(state.terminal).toBe('failed');
    expect(state.failure?.kind).toBe('not-signed-in');
    expect(summarise(events)).toMatchSnapshot();
  });

  it('stops after the first items when cancelled', () => {
    const { events, state } = parseTranscript(
      codexProvider,
      'codex-0.167.2-cancelled-sigint.jsonl',
    );
    expect(state.terminal).toBeUndefined();
    expect(summarise(events)).toMatchSnapshot();
  });

  it('names tools of other MCP servers with their server', () => {
    const { events } = parseTranscript(codexProvider, 'codex-0.167.2-shell-disabled.jsonl');
    const names = events.flatMap((event) => (event.type === 'tool' ? [event.name] : []));
    expect(names).toContain('current_slide');
    expect(names).toContain('codex.list_mcp_resources');
  });

  it('ignores malformed, blank and unknown lines', () => {
    const state = makeParseState('/workspace');
    for (const line of [
      '',
      'Reading prompt from stdin...',
      '{"type":',
      '[]',
      '{"type":"turn.started"}',
      '{"type":"item.started","item":{"type":"todo_list"}}',
      '{"type":"something.new"}',
    ]) {
      expect(() => parseCodexLine(line, state)).not.toThrow();
      expect(parseCodexLine(line, state)).toEqual([]);
    }
  });

  it('turns a reasoning item into reasoning', () => {
    const state = makeParseState('/workspace');
    expect(
      parseCodexLine(
        '{"type":"item.completed","item":{"id":"item_1","type":"reasoning","text":"Reading the slide first."}}',
        state,
      ),
    ).toEqual([{ type: 'reasoning', text: 'Reading the slide first.' }]);
  });
});
