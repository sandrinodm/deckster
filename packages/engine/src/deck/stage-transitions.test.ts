import { describe, expect, it } from 'vite-plus/test';

import type { TransitionKind } from '#contract/transition.ts';

import { stageTransition, type StageTransitionInput } from '#deck/stage-transitions.ts';

/**
 * Each slide's own transition in a five-slide deck: slide 2 pushes in, slide 3 cuts, the others
 * leave it to the brand.
 */
const OWN: readonly (TransitionKind | undefined)[] = [undefined, undefined, 'push', 'none', 'fade'];

/**
 * The input for a deck on `current` that arrived from `previousSlide`.
 */
function at(current: number, previousSlide: number | undefined): StageTransitionInput {
  return { current, previousSlide, transitionOf: (index) => OWN[index] };
}

describe('stageTransition', () => {
  it('gives each neighbour the transition of the later slide of its pair', () => {
    const input = at(2, 1);
    expect(stageTransition(1, input)).toBe('push');
    expect(stageTransition(3, input)).toBe('none');
    expect(stageTransition(1, at(1, 0))).toBeUndefined();
    expect(stageTransition(2, at(1, 0))).toBe('push');
  });

  it('keeps the transition of the move that brought the slide on screen, both ways', () => {
    expect(stageTransition(2, at(2, 1))).toBe('push');
    expect(stageTransition(1, at(1, 2))).toBe('push');
    expect(stageTransition(3, at(3, 2))).toBe('none');
    expect(stageTransition(4, at(4, 3))).toBe('fade');
    expect(stageTransition(1, at(1, 0))).toBeUndefined();
  });

  it('leaves the slide on screen to the brand before the first move', () => {
    expect(stageTransition(2, at(2, undefined))).toBeUndefined();
  });

  it('cuts on a move to a slide that is not a neighbour', () => {
    expect(stageTransition(4, at(4, 0))).toBe('none');
    expect(stageTransition(0, at(0, 2))).toBe('none');
    expect(stageTransition(3, at(4, 0))).toBe('fade');
  });

  it('pairs slides that follow one another in a talk, skipping hidden ones', () => {
    const hidden = [false, true, false, false, false];
    const input = { ...at(2, 0), hidden };
    expect(stageTransition(2, input)).toBe('push');
    expect(stageTransition(1, { ...at(1, 0), hidden })).toBeUndefined();
    expect(stageTransition(3, { ...at(3, 0), hidden })).toBe('none');
  });
});
