import { describe, expect, it } from 'vite-plus/test';

import type { AgentEvent } from '#protocol/agent-events.ts';

import { connectAgent, isAgentEvent } from '#runtime/agent-connection.ts';

/**
 * A socket the test drives by hand.
 */
type FakeSocket = {
  /**
   * The socket as `connectAgent` sees it.
   */
  readonly socket: WebSocket;

  /**
   * Delivers a message to the connection.
   */
  readonly deliver: (data: string) => void;
};

/**
 * A minimal fake WebSocket: listeners by type, `send` and `close` that do nothing.
 */
function fakeSocket(): FakeSocket {
  const listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
  const socket = {
    addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    send: () => undefined,
    close: () => undefined,
  } as unknown as WebSocket;
  return {
    socket,
    deliver: (data) => {
      for (const listener of listeners.get('message') ?? []) {
        listener({ data });
      }
    },
  };
}

/**
 * A text event with a sequence number.
 *
 * @param seq - The number.
 * @param text - The text.
 */
function textEvent(seq: number, text: string): string {
  return JSON.stringify({ type: 'text', text, seq, at: 1, turn: 1 });
}

describe('isAgentEvent', () => {
  it('malformed event: checks the fields the panel reads, per type', () => {
    expect(isAgentEvent({ type: 'text', text: 'hi', seq: 1, at: 1, turn: 1 })).toBe(true);
    expect(isAgentEvent({ type: 'text', seq: 1, at: 1, turn: 1 })).toBe(false);
    expect(isAgentEvent({ type: 'text', text: 'hi', seq: -1, at: 1, turn: 1 })).toBe(false);
    expect(
      isAgentEvent({
        type: 'turn-done',
        status: 'completed',
        changedFiles: 'none',
        durationMs: 3,
        seq: 2,
        at: 1,
        turn: 1,
      }),
    ).toBe(false);
    expect(
      isAgentEvent({
        type: 'turn-done',
        status: 'completed',
        changedFiles: [{ path: 'a', kind: 'update' }],
        durationMs: 3,
        seq: 2,
        at: 1,
        turn: 1,
      }),
    ).toBe(true);
    expect(isAgentEvent({ type: 'tool', id: 'x', seq: 3, at: 1, turn: 1, status: 'done' })).toBe(
      false,
    );
  });

  it('lets an event type it does not know through with a valid envelope', () => {
    expect(isAgentEvent({ type: 'something-new', seq: 4, at: 1, turn: null })).toBe(true);
    expect(isAgentEvent({ type: 'something-new', seq: 4, at: 1, turn: 'x' })).toBe(false);
  });
});

describe('connectAgent', () => {
  it('malformed event: drops it and still applies the next event with the same seq', () => {
    const fake = fakeSocket();
    const seen: AgentEvent[] = [];
    connectAgent({ url: 'ws://x', createSocket: () => fake.socket, onEvent: (e) => seen.push(e) });
    fake.deliver(JSON.stringify({ type: 'text', seq: 5, at: 1, turn: 1 }));
    fake.deliver(textEvent(5, 'valid'));
    expect(seen).toEqual([expect.objectContaining({ seq: 5, text: 'valid' })]);
  });

  it('advances past an event only once the listener applied it without throwing', () => {
    const fake = fakeSocket();
    const seen: string[] = [];
    let fail = true;
    connectAgent({
      url: 'ws://x',
      createSocket: () => fake.socket,
      onEvent: (event) => {
        if (fail) {
          throw new Error('reducer bug');
        }

        seen.push(event.type === 'text' ? event.text : event.type);
      },
    });
    expect(() => fake.deliver(textEvent(1, 'first'))).not.toThrow();
    fail = false;
    fake.deliver(textEvent(1, 'first'));
    fake.deliver(textEvent(1, 'again'));
    expect(seen).toEqual(['first']);
  });
});
