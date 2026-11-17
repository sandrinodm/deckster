import { describe, expect, it } from 'vite-plus/test';

import {
  createNavigationState,
  currentPosition,
  isStepPending,
  navigate,
  UNRESOLVED_LAST_STEP,
  type NavigationAction,
  type NavigationState,
} from '#navigation/navigation.ts';

/**
 * Builds state for a deck whose slides have the given step counts, all known.
 */
function deckWithSteps(stepCounts: readonly number[], slide = 0, step = 0): NavigationState {
  const initial = createNavigationState(stepCounts.length);
  const counted = stepCounts.reduce(
    (state, count, index) => navigate(state, { type: 'step-count', slide: index, count }),
    initial,
  );
  return navigate(counted, { type: 'goto', position: { slide, step } });
}

function run(state: NavigationState, ...actions: NavigationAction[]): NavigationState {
  return actions.reduce(navigate, state);
}

describe('createNavigationState', () => {
  it('starts on the first slide at step 0 with no step counts known', () => {
    const state = createNavigationState(3);
    expect(state.position).toEqual({ slide: 0, step: 0 });
    expect(state.stepCounts).toEqual([undefined, undefined, undefined]);
  });

  it('clamps a starting slide beyond the deck to the last slide', () => {
    expect(createNavigationState(3, { slide: 7, step: 0 }).position.slide).toBe(2);
  });

  it('rejects a deck without slides', () => {
    expect(() => createNavigationState(0)).toThrow(RangeError);
  });
});

describe('navigate', () => {
  it('moves through every step before moving to the next slide', () => {
    const state = deckWithSteps([1, 3, 1]);
    const positions = [1, 2, 3, 4].map(
      (presses) =>
        run(state, ...Array.from({ length: presses }, () => ({ type: 'next' }) as const)).position,
    );
    expect(positions).toEqual([
      { slide: 1, step: 0 },
      { slide: 1, step: 1 },
      { slide: 1, step: 2 },
      { slide: 2, step: 0 },
    ]);
  });

  it('enters the previous slide on its last step', () => {
    const state = deckWithSteps([1, 3, 1], 2, 0);
    expect(navigate(state, { type: 'prev' }).position).toEqual({ slide: 1, step: 2 });
  });

  it('steps back within a slide before leaving it', () => {
    const state = deckWithSteps([1, 3], 1, 2);
    expect(run(state, { type: 'prev' }, { type: 'prev' }).position).toEqual({ slide: 1, step: 0 });
    expect(run(state, { type: 'prev' }, { type: 'prev' }, { type: 'prev' }).position).toEqual({
      slide: 0,
      step: 0,
    });
  });

  it('enters an unmounted previous slide on its last step once the slide reports its steps', () => {
    const state = run(createNavigationState(3, { slide: 2, step: 0 }), {
      type: 'step-count',
      slide: 2,
      count: 1,
    });
    const entered = navigate(state, { type: 'prev' });
    expect(entered.position).toEqual({ slide: 1, step: UNRESOLVED_LAST_STEP });

    const resolved = navigate(entered, { type: 'step-count', slide: 1, count: 4 });
    expect(currentPosition(resolved)).toEqual({ slide: 1, step: 3 });
  });

  it('stays put at the ends of the deck', () => {
    const atStart = deckWithSteps([2, 1]);
    expect(navigate(atStart, { type: 'prev' })).toBe(atStart);

    const atEnd = deckWithSteps([2, 1], 1, 0);
    expect(navigate(atEnd, { type: 'next' })).toBe(atEnd);
  });

  it('jumps to the first slide and to the last step of the last slide', () => {
    const state = deckWithSteps([1, 2, 3], 1, 1);
    expect(navigate(state, { type: 'first' }).position).toEqual({ slide: 0, step: 0 });
    expect(navigate(state, { type: 'last' }).position).toEqual({ slide: 2, step: 2 });
  });

  it('clamps goto targets to the deck and to known step counts', () => {
    const state = deckWithSteps([1, 3]);
    expect(navigate(state, { type: 'goto', position: { slide: 1, step: 9 } }).position).toEqual({
      slide: 1,
      step: 2,
    });
    expect(navigate(state, { type: 'goto', position: { slide: -4, step: -1 } }).position).toEqual({
      slide: 0,
      step: 0,
    });
  });

  it('keeps a goto step on a slide whose steps are not known yet, then clamps it', () => {
    const state = navigate(createNavigationState(2), {
      type: 'goto',
      position: { slide: 1, step: 5 },
    });
    expect(state.position).toEqual({ slide: 1, step: 5 });
    expect(currentPosition(navigate(state, { type: 'step-count', slide: 1, count: 2 }))).toEqual({
      slide: 1,
      step: 1,
    });
  });

  it("keeps the requested step while a slide's steps remount", () => {
    const state = deckWithSteps([1, 4], 1, 2);
    const unmounted = navigate(state, { type: 'step-count', slide: 1, count: 1 });
    expect(currentPosition(unmounted)).toEqual({ slide: 1, step: 0 });

    const remounted = navigate(unmounted, { type: 'step-count', slide: 1, count: 4 });
    expect(currentPosition(remounted)).toEqual({ slide: 1, step: 2 });
  });

  it('moves from the clamped step, not the requested one', () => {
    const state = navigate(createNavigationState(2), {
      type: 'goto',
      position: { slide: 0, step: 9 },
    });
    const counted = navigate(state, { type: 'step-count', slide: 0, count: 3 });
    expect(navigate(counted, { type: 'prev' }).position).toEqual({ slide: 0, step: 1 });
  });

  it('waits for the step count of the slide on screen before moving forward', () => {
    const waiting = navigate(createNavigationState(2), { type: 'next' });
    expect(waiting.position).toEqual({ slide: 0, step: 0 });
    expect(waiting.queued).toEqual(['next']);

    const counted = navigate(waiting, { type: 'step-count', slide: 0, count: 3 });
    expect(counted.position).toEqual({ slide: 0, step: 1 });
    expect(counted.queued).toEqual([]);
  });

  it('does not skip the steps of a slide that mounts during a burst of moves', () => {
    const start = run(
      createNavigationState(4),
      { type: 'step-count', slide: 0, count: 1 },
      { type: 'step-count', slide: 1, count: 4 },
    );
    const pressed = run(start, ...Array.from({ length: 6 }, () => ({ type: 'next' }) as const));
    expect(pressed.position).toEqual({ slide: 2, step: 0 });
    expect(pressed.queued).toEqual(['next']);

    const mounted = navigate(pressed, { type: 'step-count', slide: 2, count: 2 });
    expect(currentPosition(mounted)).toEqual({ slide: 2, step: 1 });
  });

  it('keeps waiting moves queued until the slide they land on reports its steps', () => {
    const state = run(
      createNavigationState(3),
      { type: 'step-count', slide: 0, count: 1 },
      { type: 'next' },
      { type: 'next' },
      { type: 'next' },
    );
    expect(state.position).toEqual({ slide: 1, step: 0 });
    expect(state.queued).toEqual(['next', 'next']);

    const counted = navigate(state, { type: 'step-count', slide: 1, count: 1 });
    expect(counted.position).toEqual({ slide: 2, step: 0 });
    expect(counted.queued).toEqual(['next']);
  });

  it('waits before stepping back from an unresolved last step, and goto drops waiting moves', () => {
    const entered = run(
      createNavigationState(3, { slide: 2, step: 0 }),
      { type: 'step-count', slide: 2, count: 1 },
      { type: 'prev' },
      { type: 'prev' },
    );
    expect(entered.position).toEqual({ slide: 1, step: UNRESOLVED_LAST_STEP });
    expect(entered.queued).toEqual(['prev']);
    expect(currentPosition(navigate(entered, { type: 'step-count', slide: 1, count: 3 }))).toEqual({
      slide: 1,
      step: 1,
    });
    expect(navigate(entered, { type: 'goto', position: { slide: 0, step: 0 } }).queued).toEqual([]);
  });

  it('records the direction of the last move', () => {
    const state = deckWithSteps([2, 1]);
    expect(state.direction).toBe('none');
    const forward = navigate(state, { type: 'next' });
    expect(forward.direction).toBe('forward');
    expect(navigate(forward, { type: 'prev' }).direction).toBe('backward');
  });

  it('records the slide the last move between slides left, through moves between steps', () => {
    const state = deckWithSteps([2, 2, 1]);
    expect(state.previousSlide).toBeUndefined();
    const stepped = navigate(state, { type: 'next' });
    expect(stepped.previousSlide).toBeUndefined();
    const crossed = navigate(stepped, { type: 'next' });
    expect(crossed.previousSlide).toBe(0);
    expect(navigate(crossed, { type: 'next' }).previousSlide).toBe(0);
    const jumped = navigate(crossed, { type: 'goto', position: { slide: 0, step: 0 } });
    expect(jumped.previousSlide).toBe(1);
    expect(navigate(jumped, { type: 'last' }).previousSlide).toBe(0);
  });

  it('records step counts without moving when the current step still fits', () => {
    const state = deckWithSteps([4], 0, 2);
    const shrunk = navigate(state, { type: 'step-count', slide: 0, count: 3 });
    expect(currentPosition(shrunk)).toEqual({ slide: 0, step: 2 });
    expect(shrunk.stepCounts).toEqual([3]);
  });

  it('ignores step counts for slides outside the deck and repeated counts', () => {
    const state = deckWithSteps([2]);
    expect(navigate(state, { type: 'step-count', slide: 5, count: 3 })).toBe(state);
    expect(navigate(state, { type: 'step-count', slide: 0, count: 2 })).toBe(state);
  });
});

describe('navigate with a step count that is not final', () => {
  /**
   * Two slides; the first has reported 2 steps while something on it still loads.
   */
  const loading = run(
    createNavigationState(2),
    { type: 'step-count', slide: 0, count: 2, final: false },
    { type: 'step-count', slide: 1, count: 1 },
  );

  it('keeps a goto step beyond the count pending and reports it as requested', () => {
    const state = navigate(loading, { type: 'goto', position: { slide: 0, step: 4 } });
    expect(isStepPending(state)).toBe(true);
    expect(currentPosition(state)).toEqual({ slide: 0, step: 4 });
  });

  it('lands the pending step once the count is final, clamped to it', () => {
    const state = navigate(loading, { type: 'goto', position: { slide: 0, step: 4 } });
    const more = navigate(state, { type: 'step-count', slide: 0, count: 4, final: false });
    expect(currentPosition(more)).toEqual({ slide: 0, step: 4 });
    const settled = navigate(more, { type: 'step-count', slide: 0, count: 4, final: true });
    expect(isStepPending(settled)).toBe(false);
    expect(currentPosition(settled)).toEqual({ slide: 0, step: 3 });
  });

  it('still clamps a goto on a slide whose count is final', () => {
    const state = navigate(loading, { type: 'goto', position: { slide: 1, step: 4 } });
    expect(state.position).toEqual({ slide: 1, step: 0 });
    expect(isStepPending(state)).toBe(false);
  });

  it('gives up the pending step for the step on screen when the presenter moves', () => {
    const state = navigate(loading, { type: 'goto', position: { slide: 0, step: 4 } });
    const back = navigate(state, { type: 'prev' });
    expect(back.position).toEqual({ slide: 0, step: 0 });
    const settled = navigate(back, { type: 'step-count', slide: 0, count: 5 });
    expect(currentPosition(settled)).toEqual({ slide: 0, step: 0 });
    expect(navigate(state, { type: 'next' }).position).toEqual({ slide: 1, step: 0 });
  });

  it('enters a loading previous slide on its final last step', () => {
    const state = run(loading, { type: 'goto', position: { slide: 1, step: 0 } }, { type: 'prev' });
    expect(state.position).toEqual({ slide: 0, step: UNRESOLVED_LAST_STEP });
    const settled = navigate(state, { type: 'step-count', slide: 0, count: 3 });
    expect(currentPosition(settled)).toEqual({ slide: 0, step: 2 });
  });
});
