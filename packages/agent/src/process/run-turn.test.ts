import { NodeServices } from '@effect/platform-node';
import { Deferred, Effect, Exit } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import type { ProviderEvent } from '#protocol/agent-events.ts';
import type { AgentProvider } from '#providers/provider-types.ts';

import { makeLineSplitter, runTurn } from '#process/run-turn.ts';
import { claudeProvider } from '#providers/index.ts';
import { makeParseState } from '#providers/provider-types.ts';

/**
 * Turn limits short enough for a test.
 */
const LIMITS = {
  /**
   * Five seconds without output.
   */
  idleMs: 5000,

  /**
   * Ten seconds in all.
   */
  totalMs: 10_000,

  /**
   * A short grace after SIGINT.
   */
  graceMs: 300,

  /**
   * A short grace after SIGTERM.
   */
  killAfterMs: 300,

  /**
   * Half a second to drain output.
   */
  drainMs: 500,
};

/**
 * Text as UTF-8 bytes.
 *
 * @param value - The text.
 */
function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * Runs `node -e <script>` as a turn of a provider and returns the outcome and the events.
 *
 * @param provider - The adapter.
 * @param script - What the child prints.
 * @param maxLineBytes - The longest line allowed.
 */
function runScript(provider: AgentProvider, script: string, maxLineBytes?: number) {
  return Effect.gen(function* () {
    const events: ProviderEvent[] = [];
    const cancel = yield* Deferred.make<void>();
    const outcome = yield* runTurn({
      provider,
      invocation: {
        command: process.execPath,
        args: ['-e', script],
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? '' },
        stdin: '',
        files: [],
      },
      state: makeParseState(process.cwd()),
      cancel,
      onEvent: (event) => Effect.sync(() => void events.push(event)),
      limits: { ...LIMITS, ...(maxLineBytes === undefined ? {} : { maxLineBytes }) },
    }).pipe(Effect.exit);
    return { outcome, events };
  }).pipe(Effect.provide(NodeServices.layer));
}

describe('makeLineSplitter', () => {
  it('splits chunks into lines across chunk borders and drops a carriage return', () => {
    const split = makeLineSplitter(100);
    expect(split.push(encode('{"a":1}\r\n{"b"'))).toEqual({ lines: ['{"a":1}'], overflow: false });
    expect(split.push(encode(':2}\n'))).toEqual({ lines: ['{"b":2}'], overflow: false });
    expect(split.push(encode('tail'))).toEqual({ lines: [], overflow: false });
    expect(split.end()).toEqual(['tail']);
  });

  it('keeps a multi-byte character split between chunks whole', () => {
    const split = makeLineSplitter(100);
    const bytes = new TextEncoder().encode('é\n');
    expect(split.push(bytes.subarray(0, 1)).lines).toEqual([]);
    expect(split.push(bytes.subarray(1)).lines).toEqual(['é']);
  });

  it('reports an overflow once a line passes the limit, without keeping it', () => {
    const split = makeLineSplitter(8);
    expect(split.push(new TextEncoder().encode('12345')).overflow).toBe(false);
    expect(split.push(new TextEncoder().encode('6789')).overflow).toBe(true);
  });
});

describe('runTurn', () => {
  it('unbounded output line: a line over the limit ends the turn with an error', async () => {
    const { outcome } = await Effect.runPromise(
      runScript(
        claudeProvider,
        "process.stdout.write('x'.repeat(5000)); setTimeout(() => {}, 4000)",
        1024,
      ),
    );
    const value = Exit.isSuccess(outcome) ? outcome.value : undefined;
    expect(value?.status).toBe('failed');
    expect(value?.problem).toMatchObject({ kind: 'crashed' });
    expect(value?.problem?.message).toContain('1024 bytes');
  });

  it('parser defect: a parseLine that throws never kills the turn', async () => {
    const throwing: AgentProvider = {
      ...claudeProvider,
      parseLine: () => {
        throw new Error('boom');
      },
    };
    const { outcome, events } = await Effect.runPromise(
      runScript(throwing, 'console.log(\'{"type":"system"}\')'),
    );
    expect(Exit.isSuccess(outcome)).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: 'notice', kind: 'info' }));
  });
});
