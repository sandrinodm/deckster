import { describe, expect, it } from 'vite-plus/test';

import { startUp } from '#main/start-up.ts';

describe('start-up', () => {
  it('sends the displays before it starts clearing, and hands back the clearing', async () => {
    const calls: string[] = [];
    let finish: () => void = () => undefined;
    const clearing = startUp({
      listOnly: false,
      sendDisplays: () => void calls.push('displays'),
      clearDefault: () => {
        calls.push('clear');
        return new Promise<void>((resolve) => (finish = resolve));
      },
    });
    expect(calls).toEqual(['displays', 'clear']);
    let done = false;
    void clearing.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    finish();
    await clearing;
    expect(done).toBe(true);
  });

  it('clears nothing in list-only mode', async () => {
    const calls: string[] = [];
    await startUp({
      listOnly: true,
      sendDisplays: () => void calls.push('displays'),
      clearDefault: () => {
        calls.push('clear');
        return Promise.resolve();
      },
    });
    expect(calls).toEqual(['displays']);
  });
});
