import { describe, expect, it } from 'vite-plus/test';

import { adoptTarget, type AdoptDeps } from '#main/adopt-target.ts';

const TARGET = {
  url: 'http://127.0.0.1:5391/',
  title: 'Hello',
  backgroundColor: '#112233',
  agentCode: 'abcDEF0123456789_-xyz',
};

/**
 * Deps that record the order of the steps.
 */
function deps() {
  const calls: string[] = [];
  const targets: Array<{ partition: string }> = [];
  const value: AdoptDeps<{ name: string }> = {
    sessionFor: (name) => ({ name }),
    installHooks: (session, origin) => void calls.push(`hooks ${session.name} ${origin}`),
    setName: (name) => void calls.push(`name ${name}`),
    defaultCleared: async () => void calls.push('default'),
    activateDock: async () => void calls.push('dock'),
    setTarget: (target) => {
      calls.push('target');
      targets.push(target);
    },
  };
  return { value, calls, targets };
}

describe('adopting a deck', () => {
  it('names the app, hooks a fresh in-memory session, waits for the default session and the dock, and sets the target last', async () => {
    const { value, calls, targets } = deps();
    await adoptTarget(TARGET, value);
    const partition = targets[0]?.partition ?? '';
    expect(partition).toMatch(/^deck-[0-9a-f]{32}$/);
    expect(calls).toEqual([
      'name Deckster: Hello',
      `hooks ${partition} http://127.0.0.1:5391`,
      'default',
      'dock',
      'target',
    ]);
    expect(targets[0]).toEqual({
      url: TARGET.url,
      title: 'Hello',
      backgroundColor: '#112233',
      partition,
      agentCode: TARGET.agentCode,
    });
  });

  it('sets no target when a step throws', async () => {
    const { value, calls } = deps();
    value.activateDock = () => Promise.reject(new Error('no dock'));
    await expect(adoptTarget(TARGET, value)).rejects.toThrow('no dock');
    expect(calls).not.toContain('target');
  });
});
