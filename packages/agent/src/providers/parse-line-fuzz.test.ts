import { describe, expect, it } from 'vite-plus/test';

import { parseClaudeLine } from '#providers/claude/parse-line.ts';
import { parseCodexLine } from '#providers/codex/parse-line.ts';
import { makeParseState } from '#providers/provider-types.ts';
import { RECORDED_ROOT, readTranscript, transcriptsOf } from '#providers/transcripts.fixture.ts';

/**
 * How many random lines each parser is fed.
 */
const RANDOM_LINES = 3000;

/**
 * How many mutations of each recorded line are fed.
 */
const MUTATIONS_PER_LINE = 6;

/**
 * The deepest a random value nests.
 */
const MAX_DEPTH = 4;

/**
 * Field names the parsers read, so random objects hit their branches.
 */
const KEYS = [
  'type',
  'subtype',
  'session_id',
  'thread_id',
  'rate_limit_info',
  'status',
  'resetsAt',
  'rateLimitType',
  'event',
  'delta',
  'text',
  'message',
  'content',
  'error',
  'errors',
  'result',
  'is_error',
  'usage',
  'item',
  'id',
  'command',
  'changes',
  'path',
  'kind',
  'tool_use_id',
  'input',
  'name',
  'file_path',
  'parent_tool_use_id',
  'total_cost_usd',
  'terminal_reason',
  'mcp_servers',
  'aggregated_output',
  'exit_code',
  'arguments',
  'toString',
  'valueOf',
  '__proto__',
] as const;

/**
 * A small seeded generator (mulberry32), so a failure reproduces.
 *
 * @param seed - The seed.
 */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d_2b_79_f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * A random JSON value: strings, extreme numbers, booleans, null, arrays and objects with the
 * parsers' field names.
 *
 * @param random - The generator.
 * @param depth - How deep the value already is.
 */
function randomValue(random: () => number, depth: number): unknown {
  const pick = Math.floor(random() * (depth >= MAX_DEPTH ? 5 : 7));
  switch (pick) {
    case 0:
      return null;
    case 1:
      return random() < 0.5;
    case 2:
      return [0, -1, 1e308, -1e308, 8.64e15 + 1, 2 ** 53, 0.5, Number.MAX_SAFE_INTEGER][
        Math.floor(random() * 8)
      ];
    case 3:
      return ['', 'x', 'item.completed', 'result', 'rejected', '/bin/zsh -lc ""', '\u0000'][
        Math.floor(random() * 7)
      ];
    case 4:
      return KEYS[Math.floor(random() * KEYS.length)];
    case 5:
      return Array.from({ length: Math.floor(random() * 4) }, () => randomValue(random, depth + 1));
    default: {
      const entries = Array.from(
        { length: Math.floor(random() * 5) },
        () => [KEYS[Math.floor(random() * KEYS.length)], randomValue(random, depth + 1)] as const,
      );
      return Object.fromEntries(entries);
    }
  }
}

/**
 * A recorded line with one field (at any depth) replaced by a random value.
 *
 * @param value - The parsed line.
 * @param random - The generator.
 */
function mutate(value: unknown, random: () => number): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => (random() < 0.3 ? mutate(entry, random) : entry));
  }

  if (value === null || typeof value !== 'object') {
    return random() < 0.5 ? randomValue(random, 1) : value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      random() < 0.25 ? randomValue(random, 1) : mutate(entry, random),
    ]),
  );
}

/**
 * Every line of every recorded transcript, parsed.
 */
function recordedLines(): unknown[] {
  return [...transcriptsOf('claude'), ...transcriptsOf('codex')].flatMap((file) =>
    readTranscript(file)
      .split('\n')
      .flatMap((line): unknown[] => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      }),
  );
}

/**
 * The parsers under test.
 */
const PARSERS = [
  ['claude', parseClaudeLine],
  ['codex', parseCodexLine],
] as const;

describe('parseLine never throws', () => {
  it('Claude rate_limit_event with a huge resetsAt (RangeError: Invalid time value)', () => {
    const line = JSON.stringify({
      type: 'rate_limit_event',
      rate_limit_info: { status: 'rejected', resetsAt: 1e300, rateLimitType: 'five_hour' },
    });
    const events = parseClaudeLine(line, makeParseState(RECORDED_ROOT));
    expect(events).toEqual([
      { type: 'notice', kind: 'rate-limit', message: 'The five hour limit is reached.' },
    ]);
  });

  it('Claude result with errors:[{toString:null}] (TypeError in String())', () => {
    const state = makeParseState(RECORDED_ROOT);
    const line = JSON.stringify({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      errors: [{ toString: null }, 'plain text', { message: 'from a message' }],
    });
    expect(() => parseClaudeLine(line, state)).not.toThrow();
    expect(state.terminal).toBe('failed');
    expect(state.failure).toBeDefined();
  });

  it.each(PARSERS)('%s: random JSON lines', (_name, parse) => {
    const random = seeded(20_261_114);
    const state = makeParseState(RECORDED_ROOT);
    for (let index = 0; index < RANDOM_LINES; index += 1) {
      const line = JSON.stringify(randomValue(random, 0));
      expect(() => parse(line, state), line).not.toThrow();
    }
  });

  it.each(PARSERS)('%s: recorded lines with fields replaced by random values', (_name, parse) => {
    const random = seeded(7);
    const state = makeParseState(RECORDED_ROOT);
    for (const recorded of recordedLines()) {
      for (let index = 0; index < MUTATIONS_PER_LINE; index += 1) {
        const line = JSON.stringify(mutate(recorded, random));
        expect(() => parse(line, state), line).not.toThrow();
      }
    }
  });
});
