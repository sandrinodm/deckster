import { describe, expect, it } from 'vite-plus/test';

import { channelName, createPositionSync, parseSyncMessage } from '#sync/sync-protocol.ts';

describe('parseSyncMessage', () => {
  it('accepts every message kind', () => {
    expect(parseSyncMessage({ kind: 'hello', from: 'a', role: 'audience' })).toEqual({
      kind: 'hello',
      from: 'a',
      role: 'audience',
    });
    expect(parseSyncMessage({ kind: 'bye', from: 'a', role: 'audience' })?.kind).toBe('bye');
    expect(
      parseSyncMessage({ kind: 'position', from: 'a', role: 'presenter', slide: 2, step: 1 }),
    ).toEqual({
      kind: 'position',
      from: 'a',
      role: 'presenter',
      slide: 2,
      step: 1,
    });
    expect(
      parseSyncMessage({ kind: 'blackout', from: 'a', role: 'audience', mode: 'white' })?.kind,
    ).toBe('blackout');
    expect(parseSyncMessage({ kind: 'blackout', from: 'a', role: 'audience', mode: null })).toEqual(
      {
        kind: 'blackout',
        from: 'a',
        role: 'audience',
        mode: null,
      },
    );
    expect(
      parseSyncMessage({ kind: 'laser', from: 'a', role: 'presenter', point: { x: 0.5, y: 1 } }),
    ).toEqual({
      kind: 'laser',
      from: 'a',
      role: 'presenter',
      point: { x: 0.5, y: 1 },
    });
    expect(parseSyncMessage({ kind: 'laser', from: 'a', role: 'presenter', point: null })).toEqual({
      kind: 'laser',
      from: 'a',
      role: 'presenter',
      point: null,
    });
  });

  it('rejects anything else another page might post', () => {
    expect(parseSyncMessage(undefined)).toBeUndefined();
    expect(parseSyncMessage('position')).toBeUndefined();
    expect(
      parseSyncMessage({ kind: 'position', from: 'a', role: 'audience', slide: -1, step: 0 }),
    ).toBeUndefined();
    expect(
      parseSyncMessage({ kind: 'position', from: 'a', role: 'audience', slide: 1.5, step: 0 }),
    ).toBeUndefined();
    expect(
      parseSyncMessage({ kind: 'position', role: 'audience', slide: 1, step: 0 }),
    ).toBeUndefined();
    expect(
      parseSyncMessage({ kind: 'blackout', from: 'a', role: 'audience', mode: 'red' }),
    ).toBeUndefined();
    expect(
      parseSyncMessage({ kind: 'laser', from: 'a', role: 'audience', point: { x: 2, y: 0 } }),
    ).toBeUndefined();
    expect(parseSyncMessage({ kind: 'nope', from: 'a', role: 'audience' })).toBeUndefined();
    expect(parseSyncMessage({ kind: 'hello', from: 'a' })).toBeUndefined();
    expect(parseSyncMessage({ kind: 'hello', from: 'a', role: 'stage' })).toBeUndefined();
  });
});

describe('channelName', () => {
  it('is per deck', () => {
    expect(channelName('hello')).not.toBe(channelName('exemplars'));
  });
});

describe('createPositionSync', () => {
  it('records the first position without sending it', () => {
    const sync = createPositionSync();
    expect(sync.local({ slide: 3, step: 0 })).toBeUndefined();
  });

  it('sends a move once and not again while nothing changes', () => {
    const sync = createPositionSync();
    sync.local({ slide: 0, step: 0 });
    expect(sync.local({ slide: 1, step: 0 })).toEqual({ slide: 1, step: 0 });
    expect(sync.local({ slide: 1, step: 0 })).toBeUndefined();
  });

  it('does not echo a position it received and applied', () => {
    const sync = createPositionSync();
    sync.local({ slide: 0, step: 0 });
    expect(sync.remote({ slide: 4, step: 2 }, { slide: 0, step: 0 })).toEqual({
      slide: 4,
      step: 2,
    });
    expect(sync.local({ slide: 4, step: 2 })).toBeUndefined();
  });

  it('sends back a position the deck clamped to something else', () => {
    const sync = createPositionSync();
    sync.local({ slide: 0, step: 0 });
    sync.remote({ slide: 4, step: 9 }, { slide: 0, step: 0 });
    expect(sync.local({ slide: 4, step: 3 })).toEqual({ slide: 4, step: 3 });
  });

  it('does not echo a position it was sent when it shows it after a later one arrived', () => {
    const sync = createPositionSync();
    sync.local({ slide: 1, step: 2 });
    sync.remote({ slide: 1, step: 1 }, { slide: 1, step: 2 });
    sync.remote({ slide: 1, step: 0 }, { slide: 1, step: 2 });
    sync.remote({ slide: 0, step: 0 }, { slide: 1, step: 2 });
    expect(sync.local({ slide: 1, step: 1 })).toBeUndefined();
    expect(sync.local({ slide: 0, step: 0 })).toBeUndefined();
    expect(sync.local({ slide: 0, step: 1 })).toEqual({ slide: 0, step: 1 });
  });

  it('moves nowhere for a position the window is on already', () => {
    const sync = createPositionSync();
    expect(sync.remote({ slide: 2, step: 0 }, { slide: 2, step: 0 })).toBeUndefined();
  });
});
