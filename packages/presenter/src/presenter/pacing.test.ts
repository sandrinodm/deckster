import { describe, expect, it } from 'vite-plus/test';

import { formatDuration, formatRemaining, formatSigned } from '#presenter/format-clock.ts';
import { computePacing, planBudgets, type PacingInput } from '#presenter/pacing.ts';

/**
 * Four slides: 1 minute, 2 minutes, no budget, 1 minute.
 */
const budgets = [60, 120, undefined, 60];

/**
 * A running talk without a duration, on the given slide and times.
 *
 * @param changes - The fields that differ.
 */
function input(changes: Partial<PacingInput>): PacingInput {
  return {
    budgets,
    slide: 0,
    elapsedSeconds: 0,
    slideElapsedSeconds: 0,
    started: true,
    durationSeconds: undefined,
    ...changes,
  };
}

describe('computePacing', () => {
  it('is on pace inside the current slide window and counts down its own budget', () => {
    const pacing = computePacing(input({ slide: 1, elapsedSeconds: 100, slideElapsedSeconds: 40 }));
    expect(pacing).toEqual({
      status: 'on-pace',
      offsetSeconds: 0,
      slideBudgetSeconds: 120,
      slideRemainingSeconds: 80,
      totalRemainingSeconds: 140,
    });
  });

  it('is behind by how far past the end of the slide window the timer is', () => {
    const pacing = computePacing(input({ elapsedSeconds: 95, slideElapsedSeconds: 95 }));
    expect(pacing.status).toBe('behind');
    expect(pacing.offsetSeconds).toBe(35);
    expect(pacing.slideRemainingSeconds).toBe(-35);
  });

  it('is ahead by how far before the slide window the timer is', () => {
    const pacing = computePacing(input({ slide: 3, elapsedSeconds: 100, slideElapsedSeconds: 5 }));
    expect(pacing.status).toBe('ahead');
    expect(pacing.offsetSeconds).toBe(80);
    expect(pacing.slideRemainingSeconds).toBe(55);
  });

  it('stays neutral before the timer starts and shows the full slide budget', () => {
    const pacing = computePacing(input({ slide: 3, started: false }));
    expect(pacing.status).toBe('idle');
    expect(pacing.offsetSeconds).toBe(0);
    expect(pacing.slideRemainingSeconds).toBe(60);
  });

  it('measures the total against the deck duration and fits the budgets to it', () => {
    const pacing = computePacing(
      input({ slide: 1, elapsedSeconds: 100, slideElapsedSeconds: 0, durationSeconds: 600 }),
    );
    expect(pacing.totalRemainingSeconds).toBe(500);
    expect(pacing.slideBudgetSeconds).toBe(120);
  });

  it('leaves a slide without a budget with no countdown when there is no duration', () => {
    const pacing = computePacing(input({ slide: 2, elapsedSeconds: 180 }));
    expect(pacing.status).toBe('on-pace');
    expect(pacing.slideRemainingSeconds).toBeUndefined();
  });

  it('reports no plan when no slide has a budget, but still counts down a duration', () => {
    const pacing = computePacing(
      input({ budgets: [undefined, undefined], elapsedSeconds: 30, durationSeconds: 300 }),
    );
    expect(pacing).toEqual({
      status: 'unplanned',
      offsetSeconds: 0,
      slideBudgetSeconds: undefined,
      slideRemainingSeconds: undefined,
      totalRemainingSeconds: 270,
    });
  });
});

describe('planBudgets', () => {
  it('keeps the budgets without a duration', () => {
    expect(planBudgets(budgets, undefined)).toBe(budgets);
  });

  it('gives slides without a budget an even share of the time left', () => {
    expect(planBudgets(budgets, 600)).toEqual([60, 120, 360, 60]);
  });

  it('scales the budgets to the duration when they add up to more or less', () => {
    expect(planBudgets([20, 40], 120)).toEqual([40, 80]);
    expect(planBudgets([60, 60, undefined], 60)).toEqual([30, 30, 0]);
  });
});

describe('clock formatting', () => {
  it('formats minutes, hours and signed offsets', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(65.9)).toBe('1:05');
    expect(formatDuration(3_725)).toBe('1:02:05');
    expect(formatDuration(-4)).toBe('0:00');
    expect(formatSigned(-20)).toBe('-0:20');
    expect(formatSigned(65)).toBe('+1:05');
    expect(formatRemaining(248)).toBe('4:08');
    expect(formatRemaining(-20)).toBe('-0:20');
  });
});

describe('computePacing with hidden slides', () => {
  it('leaves hidden slides out of the schedule window and the total', () => {
    const hidden = [false, true, false, false];
    const pacing = computePacing(input({ hidden, slide: 3, elapsedSeconds: 30 }));
    expect(pacing.status).toBe('ahead');
    expect(pacing.offsetSeconds).toBe(30);
    expect(pacing.totalRemainingSeconds).toBe(90);
  });

  it('gives a hidden slide no budget of its own', () => {
    const pacing = computePacing(input({ hidden: [false, true, false, false], slide: 1 }));
    expect(pacing.slideBudgetSeconds).toBeUndefined();
    expect(pacing.slideRemainingSeconds).toBeUndefined();
  });

  it('shares the duration between the shown slides only', () => {
    const pacing = computePacing(
      input({ hidden: [false, true, false, false], slide: 2, durationSeconds: 240 }),
    );
    expect(pacing.slideBudgetSeconds).toBe(120);
    expect(pacing.totalRemainingSeconds).toBe(240);
  });

  it('plans as before when nothing is hidden', () => {
    const plain = computePacing(input({ slide: 1, elapsedSeconds: 100 }));
    const none = computePacing(
      input({ hidden: [false, false, false, false], slide: 1, elapsedSeconds: 100 }),
    );
    expect(none).toEqual(plain);
  });
});
