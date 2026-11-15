// @vitest-environment happy-dom
import { act, StrictMode, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { useTimer, type TimerControls } from '#presenter/use-timer.ts';

/**
 * The clock and storage key shared by the hook's fixtures.
 */
const START_TIME_MS = Date.UTC(2026, 10, 15);

/**
 * The storage key of the fixture deck's timer.
 */
const STORAGE_KEY = 'deck-presenter:timer:demo';

/**
 * The elapsed interval used when toggles are batched before React renders.
 */
const ELAPSED_MS = 1000;

/**
 * The mounted hook and its latest public controls.
 */
let root: Root | undefined;

/**
 * The controls supplied by the most recent render.
 */
let controls: TimerControls | undefined;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(START_TIME_MS);
  window.localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  controls = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

/**
 * Publishes the hook's controls for the test to invoke its actual transitions.
 */
function Probe(): ReactNode {
  const timer = useTimer('demo');
  useLayoutEffect(() => {
    controls = timer;
    return () => {
      controls = undefined;
    };
  }, [timer]);
  return null;
}

/**
 * The mounted controls, failing immediately if the fixture did not render.
 */
function current(): TimerControls {
  if (controls === undefined) {
    throw new Error('The timer fixture has not rendered.');
  }

  return controls;
}

/**
 * Mounts the hook under StrictMode, which replays React state updaters in development.
 */
function mount(): void {
  root = createRoot(document.createElement('div'));
  act(() =>
    root?.render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    ),
  );
}

describe('useTimer', () => {
  it('persists a transition once before its event handler returns in StrictMode', () => {
    const writes = vi.spyOn(window.localStorage, 'setItem');
    mount();
    act(() => {
      current().toggle();
      expect(writes).toHaveBeenCalledExactlyOnceWith(
        STORAGE_KEY,
        JSON.stringify({ accumulatedMs: 0, startedAt: START_TIME_MS }),
      );
    });
    expect(current().running).toBe(true);
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('applies consecutive transitions to the latest timer before React renders', () => {
    const writes = vi.spyOn(window.localStorage, 'setItem');
    mount();
    act(() => {
      current().toggle();
      vi.setSystemTime(START_TIME_MS + ELAPSED_MS);
      current().toggle();
    });
    expect(current().running).toBe(false);
    expect(current().elapsedSeconds).toBe(1);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({ accumulatedMs: ELAPSED_MS }),
    );
    expect(writes).toHaveBeenCalledTimes(2);
  });
});
