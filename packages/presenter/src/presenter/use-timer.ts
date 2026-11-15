import { useCallback, useEffect, useRef, useState } from 'react';

import {
  elapsedMs,
  parseTimer,
  pauseTimer,
  resetTimer,
  startTimer,
  type TimerState,
} from '#presenter/timer.ts';

/**
 * Milliseconds per second.
 */
const MS_PER_SECOND = 1000;

/**
 * How often the clocks redraw, in milliseconds.
 */
const TICK_MS = 250;

/**
 * What {@link useTimer} gives the presenter view.
 */
export type TimerControls = {
  /**
   * Seconds on the timer.
   */
  elapsedSeconds: number;

  /**
   * Whether the timer is running.
   */
  running: boolean;

  /**
   * The wall-clock time now, in milliseconds since the epoch, updated with the timer.
   */
  now: number;

  /**
   * Starts the timer, or pauses it when it runs.
   */
  toggle: () => void;

  /**
   * Sets the timer back to zero and stops it.
   */
  reset: () => void;
};

/**
 * The talk's stopwatch and the wall clock, redrawn four times a second. The timer survives a reload
 * of the presenter window: it is saved in localStorage per deck, and a running timer keeps counting
 * while the window is closed.
 *
 * @param deckId - The deck's folder name, which keys the saved timer.
 */
export function useTimer(deckId: string): TimerControls {
  const key = `deck-presenter:timer:${deckId}`;
  const [timer, setTimer] = useState<TimerState>(() => parseTimer(readSaved(key)));
  const currentTimer = useRef(timer);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  const change = useCallback(
    (update: (state: TimerState, at: number) => TimerState) => {
      const next = update(currentTimer.current, Date.now());
      currentTimer.current = next;
      setTimer(next);
      save(key, next);
      setNow(Date.now());
    },
    [key],
  );

  return {
    elapsedSeconds: elapsedMs(timer, now) / MS_PER_SECOND,
    running: timer.startedAt !== undefined,
    now,
    toggle: () =>
      change((state, at) =>
        state.startedAt === undefined ? startTimer(state, at) : pauseTimer(state, at),
      ),
    reset: () => change(() => resetTimer()),
  };
}

/**
 * Reads the saved timer text; `null` when there is none or storage is unavailable.
 *
 * @param key - The storage key.
 */
function readSaved(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Saves the timer; a blocked or full storage only means a reload forgets it.
 *
 * @param key - The storage key.
 * @param state - The timer.
 */
function save(key: string, state: TimerState): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Without storage the timer simply restarts from zero after a reload.
  }
}
