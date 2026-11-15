import { describe, expect, it } from 'vite-plus/test';

import type { ShellEvent, ShellPlan } from '#protocol/shell-messages.ts';

import { createCommandHandler, type CommandWindows } from '#main/shell-commands.ts';

/**
 * A stand-in for a window: only its identity matters here.
 */
type FakeWindow = { name: string };

const TARGET = { url: 'http://127.0.0.1:5173/', title: 'Deck', backgroundColor: '#000000' };

const PLAN: ShellPlan = { audience: { displayId: 1, fullscreen: false }, kiosk: false };

/**
 * A command handler over a fake window manager that records what it was asked to do.
 *
 * @param open - Which windows are open.
 */
function handler(
  open: Partial<Record<'audience' | 'presenter', FakeWindow>>,
  hasDeck = true,
  adoption: Promise<void> = Promise.resolve(),
) {
  const calls: string[] = [];
  const events: ShellEvent[] = [];
  const failures: string[] = [];
  let deck = hasDeck;
  const windows: CommandWindows<FakeWindow> = {
    open: async () => {
      calls.push('open');
    },
    openPresenter: () => {
      calls.push('open-presenter');
      return undefined;
    },
    setAudienceFullscreen: (on) => void calls.push(`fullscreen ${on}`),
    moveToDisplay: (win, displayId) => void calls.push(`move ${win.name} ${displayId}`),
    focus: () => void calls.push('focus'),
    window: (role) => open[role],
  };
  const handle = createCommandHandler({
    windows,
    hasTarget: () => deck,
    adoptTarget: async (next) => {
      calls.push(`adopt ${next.url}`);
      await adoption;
      deck = true;
    },
    leaving: () => false,
    installMenu: (kiosk) => void calls.push(`menu ${kiosk}`),
    send: (event) => void events.push(event),
    displays: () => [],
    leave: (code) => void calls.push(`leave ${code}`),
    fail: (message) => void failures.push(message),
  });
  return { handle, calls, events, failures };
}

describe('the commands from the CLI', () => {
  it('moves the presenter window when asked to', () => {
    const { handle, calls } = handler({
      audience: { name: 'audience' },
      presenter: { name: 'presenter' },
    });
    handle({ type: 'move-to-display', window: 'presenter', displayId: 2 });
    handle({ type: 'move-to-display', window: 'audience', displayId: 3 });
    expect(calls).toEqual(['move presenter 2', 'move audience 3']);
  });

  it('answers a second open with an error and keeps running', () => {
    const { handle, calls, events, failures } = handler({ audience: { name: 'audience' } });
    handle({ type: 'open', plan: PLAN });
    expect(calls).toEqual([]);
    expect(failures).toEqual([]);
    expect(events).toEqual([
      { type: 'error', message: expect.stringContaining('already open') as unknown as string },
    ]);
  });

  it('opens the windows of the first plan', async () => {
    const { handle, calls } = handler({});
    handle({ type: 'open', plan: { ...PLAN, kiosk: true } });
    await flush();
    expect(calls).toEqual(['menu true', 'open']);
  });

  it('adopts the target of the first open, before the menu and the windows', async () => {
    const { handle, calls, events } = handler({}, false);
    handle({ type: 'open', plan: PLAN, target: TARGET });
    await flush();
    expect(calls).toEqual(['adopt http://127.0.0.1:5173/', 'menu false', 'open']);
    expect(events).toEqual([]);
  });

  it('refuses an open without a target when the shell has no deck', () => {
    const { handle, calls, events } = handler({}, false);
    handle({ type: 'open', plan: PLAN });
    expect(calls).toEqual([]);
    expect(events).toEqual([
      {
        type: 'error',
        message: expect.stringContaining('open needs a target') as unknown as string,
      },
    ]);
  });

  it('refuses a target when the deck is already set, and opens nothing', () => {
    const { handle, calls, events } = handler({}, true);
    handle({ type: 'open', plan: PLAN, target: TARGET });
    expect(calls).toEqual([]);
    expect(events).toEqual([
      { type: 'error', message: expect.stringContaining('already set') as unknown as string },
    ]);
  });

  it('opens without a target when the configuration had the deck', async () => {
    const { handle, calls } = handler({}, true);
    handle({ type: 'open', plan: PLAN });
    await flush();
    expect(calls).toEqual(['menu false', 'open']);
  });

  it('answers a second open with an error while the first is still adopting the deck', async () => {
    let finish: () => void = () => undefined;
    const adoption = new Promise<void>((resolve) => (finish = resolve));
    const { handle, calls, events, failures } = handler({}, false, adoption);
    handle({ type: 'open', plan: PLAN, target: TARGET });
    handle({ type: 'open', plan: PLAN, target: TARGET });
    handle({ type: 'open', plan: PLAN });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'error' });
    finish();
    await flush();
    expect(calls).toEqual(['adopt http://127.0.0.1:5173/', 'menu false', 'open']);
    expect(failures).toEqual([]);
  });

  it('treats a failing adoption as fatal and opens nothing', async () => {
    const { handle, calls, failures } = handler({}, false, Promise.reject(new Error('no session')));
    handle({ type: 'open', plan: PLAN, target: TARGET });
    await flush();
    expect(failures).toEqual(['no session']);
    expect(calls).not.toContain('open');
  });
});

/**
 * Lets pending promise callbacks run.
 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
