/**
 * The talk's stopwatch. It is plain data so it can be saved, restored and tested; the clock is
 * always passed in.
 */
export type TimerState = {
  /**
   * Milliseconds counted before the current run started.
   */
  accumulatedMs: number;

  /**
   * The wall-clock time the current run started, in milliseconds since the epoch; `undefined` while
   * the timer is paused or never started.
   */
  startedAt: number | undefined;
};

/**
 * A timer at zero, not running.
 */
export const INITIAL_TIMER: TimerState = {
  /**
   * Nothing counted yet.
   */
  accumulatedMs: 0,

  /**
   * Not running.
   */
  startedAt: undefined,
};

/**
 * Starts or resumes the timer; a running timer is unchanged.
 *
 * @param state - The timer.
 * @param now - The current time in milliseconds since the epoch.
 */
export function startTimer(state: TimerState, now: number): TimerState {
  if (state.startedAt !== undefined) {
    return state;
  }

  return { accumulatedMs: state.accumulatedMs, startedAt: now };
}

/**
 * Pauses the timer, keeping what it has counted; a paused timer is unchanged.
 *
 * @param state - The timer.
 * @param now - The current time in milliseconds since the epoch.
 */
export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.startedAt === undefined) {
    return state;
  }

  return { accumulatedMs: elapsedMs(state, now), startedAt: undefined };
}

/**
 * Sets the timer back to zero and stops it.
 */
export function resetTimer(): TimerState {
  return INITIAL_TIMER;
}

/**
 * How long the timer has counted.
 *
 * @param state - The timer.
 * @param now - The current time in milliseconds since the epoch; a clock set back never gives a
 *   negative run.
 */
export function elapsedMs(state: TimerState, now: number): number {
  if (state.startedAt === undefined) {
    return state.accumulatedMs;
  }

  return state.accumulatedMs + Math.max(0, now - state.startedAt);
}

/**
 * Reads a saved timer, such as the one in localStorage.
 *
 * @param text - The saved JSON; anything else gives a timer at zero.
 */
export function parseTimer(text: string | null): TimerState {
  if (text === null) {
    return INITIAL_TIMER;
  }

  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) {
      return INITIAL_TIMER;
    }

    const accumulated: unknown = Reflect.get(value, 'accumulatedMs');
    const startedAt: unknown = Reflect.get(value, 'startedAt');
    if (typeof accumulated !== 'number' || !Number.isFinite(accumulated) || accumulated < 0) {
      return INITIAL_TIMER;
    }

    if (startedAt === undefined || startedAt === null) {
      return { accumulatedMs: accumulated, startedAt: undefined };
    }

    const isTime = typeof startedAt === 'number' && Number.isFinite(startedAt);
    return isTime ? { accumulatedMs: accumulated, startedAt } : INITIAL_TIMER;
  } catch {
    return INITIAL_TIMER;
  }
}
