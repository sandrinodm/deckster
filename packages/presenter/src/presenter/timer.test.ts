import { describe, expect, it } from 'vite-plus/test';

import {
  elapsedMs,
  INITIAL_TIMER,
  parseTimer,
  pauseTimer,
  resetTimer,
  startTimer,
} from '#presenter/timer.ts';

describe('timer', () => {
  it('counts only while running', () => {
    const running = startTimer(INITIAL_TIMER, 1_000);
    expect(elapsedMs(running, 4_000)).toBe(3_000);
    const paused = pauseTimer(running, 4_000);
    expect(elapsedMs(paused, 90_000)).toBe(3_000);
    const resumed = startTimer(paused, 100_000);
    expect(elapsedMs(resumed, 102_000)).toBe(5_000);
  });

  it('leaves a running timer running when started again and a paused one paused', () => {
    const running = startTimer(INITIAL_TIMER, 1_000);
    expect(startTimer(running, 5_000)).toBe(running);
    expect(pauseTimer(INITIAL_TIMER, 5_000)).toBe(INITIAL_TIMER);
  });

  it('resets to zero and stopped', () => {
    expect(resetTimer()).toEqual({ accumulatedMs: 0, startedAt: undefined });
  });

  it('never goes negative when the clock is set back', () => {
    expect(elapsedMs(startTimer(INITIAL_TIMER, 5_000), 1_000)).toBe(0);
  });

  it('restores a saved timer and falls back to zero for bad data', () => {
    const saved = JSON.stringify(startTimer(INITIAL_TIMER, 1_000));
    expect(parseTimer(saved)).toEqual({ accumulatedMs: 0, startedAt: 1_000 });
    expect(parseTimer(null)).toBe(INITIAL_TIMER);
    expect(parseTimer('not json')).toBe(INITIAL_TIMER);
    expect(parseTimer('{"accumulatedMs":"x"}')).toBe(INITIAL_TIMER);
    expect(parseTimer('{"accumulatedMs":-5}')).toBe(INITIAL_TIMER);
  });
});
