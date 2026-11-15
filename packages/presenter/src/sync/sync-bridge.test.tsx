// @vitest-environment happy-dom
import { Step, useReadyHold } from '@deckster/engine';
import { act, useEffect, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { AUDIENCE_GONE_MS, AUDIENCE_RELOAD_MS } from '#sync/sync-bridge.tsx';
import { channelName } from '#sync/sync-protocol.ts';
import {
  find,
  press,
  renderPresenterDeck,
  slide,
  TEST_DECK,
  type MountedPresenterDeck,
} from '#testing/presenter-deck.fixture.tsx';
import { uiState, updateUi } from '#ui/ui-state.ts';

/**
 * The deck under test, unmounted after each test.
 */
let mounted: MountedPresenterDeck | undefined;

/**
 * The other window, played by the test.
 */
let peer: BroadcastChannel;

/**
 * Every message the deck window posted, in order.
 */
let received: Record<string, unknown>[];

beforeEach(() => {
  received = [];
  peer = new BroadcastChannel(channelName(TEST_DECK.id));
  peer.onmessage = (event: MessageEvent) => {
    received.push(event.data as Record<string, unknown>);
  };
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  peer.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * Lets channel messages travel both ways.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

/**
 * Posts a message as the other window.
 *
 * @param message - The message, without `from`.
 */
async function send(message: Record<string, unknown>): Promise<void> {
  peer.postMessage({ from: 'peer', ...message });
  await settle();
}

/**
 * How long the late slide takes to register its last steps, in milliseconds.
 */
const LATE_STEPS_MS = 100;

/**
 * A step at once and two more after a timer, holding the slide's readiness until then.
 */
function LateSteps(): ReactNode {
  const [loaded, setLoaded] = useState(false);
  useReadyHold(!loaded);
  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), LATE_STEPS_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <Step at={1}>first</Step>
      {loaded ? (
        <>
          <Step at={2}>second</Step>
          <Step at={3}>third</Step>
        </>
      ) : null}
    </>
  );
}

/**
 * The kinds of the messages the deck window posted.
 */
function kinds(): unknown[] {
  return received.map((message) => message['kind']);
}

describe('SyncBridge', () => {
  it('says hello on open and answers a hello with its position and blackout', async () => {
    mounted = renderPresenterDeck('/#/2/1');
    await settle();
    expect(received[0]).toMatchObject({ kind: 'hello', role: 'audience' });
    received.length = 0;
    await send({ kind: 'hello', role: 'presenter' });
    expect(received).toEqual([
      expect.objectContaining({ kind: 'position', slide: 1, step: 1, role: 'audience' }),
      expect.objectContaining({ kind: 'blackout', mode: null }),
    ]);
  });

  it('follows a peer and sends its own moves once, without echoing', async () => {
    mounted = renderPresenterDeck('/#/1/0');
    await settle();
    received.length = 0;
    await send({ kind: 'position', role: 'presenter', slide: 1, step: 2 });
    expect(window.__deck?.position).toEqual({ slide: 1, step: 2 });
    expect(kinds()).toEqual([]);
    press('ArrowRight');
    await settle();
    expect(received).toEqual([expect.objectContaining({ kind: 'position', slide: 1, step: 3 })]);
  });

  it('follows a peer to a step that registers late without echoing an earlier one', async () => {
    const manifest = {
      ...TEST_DECK,
      slides: [slide('late', LateSteps), ...TEST_DECK.slides.slice(1)],
    };
    mounted = renderPresenterDeck('/#/2/0', manifest);
    await settle();
    received.length = 0;
    await send({ kind: 'position', role: 'presenter', slide: 0, step: 3 });
    expect(window.__deck?.position).toEqual({ slide: 0, step: 3 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, LATE_STEPS_MS * 2));
    });
    await settle();
    expect(window.__deck?.slides[0]?.stepCount).toBe(4);
    expect(window.__deck?.position).toEqual({ slide: 0, step: 3 });
    expect(kinds()).toEqual([]);
  });

  it('shares a blackout set in either window', async () => {
    mounted = renderPresenterDeck('/#/1/0');
    await settle();
    await send({ kind: 'blackout', role: 'presenter', mode: 'white' });
    expect(uiState.get().blackout).toBe('white');
    received.length = 0;
    act(() => updateUi({ blackout: undefined }));
    await settle();
    expect(received).toEqual([expect.objectContaining({ kind: 'blackout', mode: null })]);
  });

  it('says bye when the page goes away', async () => {
    mounted = renderPresenterDeck('/#/1/0');
    await settle();
    received.length = 0;
    window.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(kinds()).toEqual(['bye']);
  });

  it('closes the presenter window once the audience window is gone', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    mounted = renderPresenterDeck('/?presenter#/1/0');
    await settle();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    peer.postMessage({ from: 'peer', kind: 'bye', role: 'audience' });
    await act(async () => {
      await vi.waitFor(() => expect(kinds()).toContain('hello'));
    });
    act(() => {
      vi.advanceTimersByTime(AUDIENCE_GONE_MS);
    });
    expect(close).toHaveBeenCalledOnce();
    expect(find('[data-testid="audience-gone"]').textContent).toBe('Audience window closed');
  });

  it('stays open when the audience window comes back from a reload', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    mounted = renderPresenterDeck('/?presenter#/1/0');
    await settle();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    peer.postMessage({ from: 'peer', kind: 'bye', role: 'audience' });
    peer.postMessage({ from: 'peer-2', kind: 'hello', role: 'audience' });
    await act(async () => {
      await vi.waitFor(() => expect(kinds()).toContain('position'));
    });
    act(() => {
      vi.advanceTimersByTime(AUDIENCE_GONE_MS);
    });
    expect(close).not.toHaveBeenCalled();
  });

  it('does not close while its opener is open and the audience page is slow to reload', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const opener = { closed: false } as Window;
    vi.spyOn(window, 'opener', 'get').mockReturnValue(opener);
    mounted = renderPresenterDeck('/?presenter#/1/0');
    await settle();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    peer.postMessage({ from: 'peer', kind: 'bye', role: 'audience' });
    await act(async () => {
      await vi.waitFor(() => expect(kinds()).toContain('hello'));
    });
    act(() => {
      vi.advanceTimersByTime(AUDIENCE_GONE_MS * 5);
    });
    expect(close).not.toHaveBeenCalled();
    peer.postMessage({ from: 'peer-2', kind: 'hello', role: 'audience' });
    await act(async () => {
      await vi.waitFor(() => expect(kinds()).toContain('position'));
    });
    act(() => {
      vi.advanceTimersByTime(AUDIENCE_RELOAD_MS * 2);
    });
    expect(close).not.toHaveBeenCalled();
  });

  it('closes when the opener closes during the wait, and after the reload limit', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const opener = { closed: false } as Window;
    vi.spyOn(window, 'opener', 'get').mockReturnValue(opener);
    mounted = renderPresenterDeck('/?presenter#/1/0');
    await settle();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    peer.postMessage({ from: 'peer', kind: 'bye', role: 'audience' });
    await act(async () => {
      await vi.waitFor(() => expect(kinds()).toContain('hello'));
    });
    act(() => {
      vi.advanceTimersByTime(AUDIENCE_GONE_MS * 3);
    });
    expect(close).not.toHaveBeenCalled();
    Object.assign(opener, { closed: true });
    act(() => {
      vi.advanceTimersByTime(AUDIENCE_GONE_MS);
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('gives up waiting for a reload after the limit even with an open opener', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    vi.spyOn(window, 'opener', 'get').mockReturnValue({ closed: false } as Window);
    mounted = renderPresenterDeck('/?presenter#/1/0');
    await settle();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    peer.postMessage({ from: 'peer', kind: 'bye', role: 'audience' });
    await act(async () => {
      await vi.waitFor(() => expect(kinds()).toContain('hello'));
    });
    act(() => {
      vi.advanceTimersByTime(AUDIENCE_RELOAD_MS + AUDIENCE_GONE_MS * 2);
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
