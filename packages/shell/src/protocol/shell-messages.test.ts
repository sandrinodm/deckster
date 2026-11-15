import { describe, expect, it } from 'vite-plus/test';

import {
  decodeCommand,
  decodeEvent,
  encodeMessage,
  type ShellCommand,
  type ShellDisplay,
  type ShellEvent,
} from '#protocol/shell-messages.ts';

const RECT = { x: 0, y: 0, width: 1920, height: 1080 };
const DISPLAY: ShellDisplay = {
  id: 1,
  label: 'Built-in',
  bounds: RECT,
  workArea: RECT,
  scaleFactor: 2,
  primary: true,
};

describe('the stdio protocol', () => {
  it('writes one JSON object per line', () => {
    const line = encodeMessage({ type: 'quit' });
    expect(line).toBe('{"type":"quit"}\n');
  });

  it('round-trips every event', () => {
    const events: ShellEvent[] = [
      { type: 'displays', displays: [DISPLAY] },
      {
        type: 'ready',
        windows: [{ window: 'audience', displayId: 1, bounds: RECT }],
        url: 'http://127.0.0.1:5640/',
        title: 'Hello',
        hasDeck: true,
      },
      { type: 'window-opened', info: { window: 'presenter', displayId: 2, bounds: RECT } },
      { type: 'window-closed', window: 'audience' },
      { type: 'fullscreen', window: 'audience', on: true },
      { type: 'captured', path: '/tmp/a.png' },
      { type: 'error', message: 'boom' },
    ];
    for (const event of events) {
      const decoded = decodeEvent(encodeMessage(event).trim());
      expect(decoded).toEqual({ ok: true, message: event });
    }
  });

  it('round-trips every command', () => {
    const commands: ShellCommand[] = [
      {
        type: 'open',
        plan: {
          audience: { displayId: 1, fullscreen: true },
          presenter: { displayId: 2 },
          kiosk: false,
        },
      },
      { type: 'open', plan: { audience: { displayId: 1, fullscreen: false }, kiosk: true } },
      {
        type: 'open',
        plan: { audience: { displayId: 1, fullscreen: false }, kiosk: false },
        target: { url: 'http://127.0.0.1:5392/', title: 'Hello', backgroundColor: '#0b0b10' },
      },
      {
        type: 'open',
        plan: { audience: { displayId: 1, fullscreen: false }, kiosk: false },
        target: {
          url: 'http://localhost:5392/',
          title: 'Hello',
          backgroundColor: '#0b0b10',
          agentCode: 'abcDEF0123456789_-xyz',
        },
      },
      { type: 'list-displays' },
      { type: 'open-presenter' },
      { type: 'open-presenter', displayId: 3 },
      { type: 'set-fullscreen', on: false },
      { type: 'move-to-display', window: 'presenter', displayId: 2 },
      { type: 'focus' },
      { type: 'quit' },
    ];
    for (const command of commands) {
      expect(decodeCommand(encodeMessage(command).trim())).toEqual({ ok: true, message: command });
    }
  });

  it('reports lines that are not messages instead of throwing', () => {
    expect(decodeEvent('Electron: warning something')).toEqual({ ok: false, reason: 'not JSON' });
    expect(decodeEvent('[1]')).toEqual({ ok: false, reason: 'not an object' });
    expect(decodeEvent('{"type":"nope"}')).toMatchObject({ ok: false });
    expect(decodeEvent('{"type":"displays","displays":[{"id":"x"}]}')).toMatchObject({ ok: false });
    expect(decodeEvent('{"type":"error"}')).toMatchObject({ ok: false });
    expect(decodeCommand('{"type":"open","plan":{}}')).toMatchObject({ ok: false });
    expect(decodeCommand('{"type":"open-presenter","displayId":"2"}')).toMatchObject({ ok: false });
    expect(decodeCommand('{"type":"move-to-display","window":"x","displayId":1}')).toMatchObject({
      ok: false,
    });
    expect(decodeCommand('nonsense')).toEqual({ ok: false, reason: 'not JSON' });
  });
});

/**
 * A small seeded random generator (mulberry32), so a failing fuzz case can be replayed.
 *
 * @param seed - The seed.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The keys the protocol reads, so random objects often look like messages.
 */
const FUZZ_KEYS = [
  'type',
  'plan',
  'audience',
  'presenter',
  'displayId',
  'fullscreen',
  'kiosk',
  'window',
  'on',
  'displays',
  'windows',
  'info',
  'bounds',
  'workArea',
  'x',
  'y',
  'width',
  'height',
  'id',
  'label',
  'scaleFactor',
  'primary',
  'url',
  'title',
  'hasDeck',
  'path',
  'message',
  '__proto__',
  'constructor',
];

/**
 * The type names the protocol knows, and a few it does not.
 */
const FUZZ_TYPES = [
  'open',
  'list-displays',
  'open-presenter',
  'set-fullscreen',
  'move-to-display',
  'focus',
  'quit',
  'displays',
  'ready',
  'window-opened',
  'window-closed',
  'fullscreen',
  'captured',
  'error',
  'toString',
];

/**
 * A random JSON value of bounded depth.
 *
 * @param random - The generator.
 * @param depth - How many levels may still nest.
 */
function randomJson(random: () => number, depth: number): unknown {
  const pick = Math.floor(random() * (depth > 0 ? 9 : 6));
  switch (pick) {
    case 0:
      return null;
    case 1:
      return random() < 0.5;
    case 2:
      return Math.floor(random() * 2000) - 1000;
    case 3:
      return FUZZ_TYPES[Math.floor(random() * FUZZ_TYPES.length)];
    case 4:
      return 'audience';
    case 5:
      return random() * 1e6;
    case 6:
      return Array.from({ length: Math.floor(random() * 4) }, () => randomJson(random, depth - 1));
    default: {
      const value: Record<string, unknown> = {};
      for (let index = Math.floor(random() * 6); index > 0; index -= 1) {
        value[FUZZ_KEYS[Math.floor(random() * FUZZ_KEYS.length)] ?? 'type'] = randomJson(
          random,
          depth - 1,
        );
      }

      if (random() < 0.7) {
        value['type'] = FUZZ_TYPES[Math.floor(random() * FUZZ_TYPES.length)];
      }

      return value;
    }
  }
}

describe('the target of an open command', () => {
  const plan = { audience: { displayId: 1, fullscreen: false }, kiosk: false };
  const target = { url: 'http://127.0.0.1:5392/', title: 'Hello', backgroundColor: '#0b0b10' };

  /**
   * Decodes an `open` whose target has some fields replaced.
   *
   * @param changes - Fields to set; `undefined` removes one.
   */
  const decode = (changes: Record<string, unknown>) =>
    decodeCommand(JSON.stringify({ type: 'open', plan, target: { ...target, ...changes } }));

  it('refuses an address that is not the local deck server', () => {
    for (const url of [
      'https://example.com/',
      'file:///etc/passwd',
      'http://192.168.1.2:5392/',
      'nope',
      3,
      null,
    ]) {
      expect(decode({ url }), String(url)).toMatchObject({ ok: false });
    }

    expect(decode({ url: undefined })).toMatchObject({ ok: false });
  });

  it('holds the title, colour and agent code to their rules', () => {
    expect(decode({ title: 'x'.repeat(200) })).toMatchObject({ ok: true });
    expect(decode({ title: 'x'.repeat(201) })).toMatchObject({ ok: false });
    expect(decode({ title: 3 })).toMatchObject({ ok: false });
    expect(decode({ backgroundColor: 3 })).toMatchObject({ ok: false });
    expect(decode({ backgroundColor: 'x'.repeat(65) })).toMatchObject({ ok: false });
    expect(decode({ agentCode: 'short' })).toMatchObject({ ok: false });
    expect(decode({ agentCode: 'abcdefgh\nX-Other: 1' })).toMatchObject({ ok: false });
    expect(decode({ agentCode: 'abcDEF0123456789_-xyz' })).toMatchObject({ ok: true });
  });

  it('needs an object, and leaves an open without a target as it was', () => {
    for (const bad of ['a', 3, null, [], true]) {
      expect(
        decodeCommand(JSON.stringify({ type: 'open', plan, target: bad })),
        String(bad),
      ).toMatchObject({ ok: false });
    }

    expect(decodeCommand(JSON.stringify({ type: 'open', plan }))).toEqual({
      ok: true,
      message: { type: 'open', plan },
    });
  });
});

describe('decoding hostile lines', () => {
  it('rejects a plan whose presenter is null instead of throwing', () => {
    const line = JSON.stringify({
      type: 'open',
      plan: { audience: { displayId: 1, fullscreen: false }, presenter: null, kiosk: false },
    });
    expect(decodeCommand(line)).toMatchObject({ ok: false });
  });

  it('rejects numbers JSON turns into Infinity', () => {
    expect(
      decodeCommand('{"type":"move-to-display","window":"audience","displayId":1e999}'),
    ).toMatchObject({ ok: false });
    expect(decodeCommand('{"type":"open-presenter","displayId":-1e999}')).toMatchObject({
      ok: false,
    });
  });

  it('never throws on random JSON, and accepts only well-formed plans', () => {
    const random = seeded(20261114);
    const malformed: string[] = [];
    for (let index = 0; index < 20_000; index += 1) {
      const line = JSON.stringify(randomJson(random, 4)) ?? 'null';
      expect(() => decodeCommand(line)).not.toThrow();
      expect(() => decodeEvent(line)).not.toThrow();
      const decoded = decodeCommand(line);
      const plan = decoded.ok && decoded.message.type === 'open' ? decoded.message.plan : undefined;
      const wellFormed =
        plan === undefined ||
        (Number.isFinite(plan.audience.displayId) &&
          (plan.presenter === undefined || Number.isFinite(plan.presenter.displayId)));
      if (!wellFormed) {
        malformed.push(line);
      }
    }

    expect(malformed).toEqual([]);
  });

  it('never throws when one field of a valid message is replaced with random JSON', () => {
    const random = seeded(7);
    const valid = [
      {
        type: 'open',
        plan: {
          audience: { displayId: 1, fullscreen: true },
          presenter: { displayId: 2 },
          kiosk: false,
        },
      },
      { type: 'move-to-display', window: 'presenter', displayId: 2 },
      { type: 'displays', displays: [DISPLAY] },
      {
        type: 'ready',
        windows: [{ window: 'audience', displayId: 1, bounds: RECT }],
        url: 'http://127.0.0.1:5640/',
        title: 'Hello',
        hasDeck: true,
      },
      { type: 'window-opened', info: { window: 'presenter', displayId: 2, bounds: RECT } },
    ];
    /**
     * Replaces one randomly chosen field, at any depth, with random JSON.
     */
    const mutate = (value: unknown): unknown => {
      if (typeof value !== 'object' || value === null || random() < 0.25) {
        return randomJson(random, 2);
      }

      const copy: Record<string, unknown> = Array.isArray(value)
        ? Object.fromEntries(value.entries())
        : { ...(value as Record<string, unknown>) };
      const keys = Object.keys(copy);
      const key = keys[Math.floor(random() * keys.length)];
      if (key !== undefined) {
        copy[key] = mutate(copy[key]);
      }

      return Array.isArray(value) ? Object.values(copy) : copy;
    };
    for (let index = 0; index < 20_000; index += 1) {
      const base = valid[index % valid.length];
      const line = JSON.stringify(mutate(base)) ?? 'null';
      expect(() => decodeCommand(line), line).not.toThrow();
      expect(() => decodeEvent(line), line).not.toThrow();
    }
  });
});
