import { describe, expect, it, vi } from 'vite-plus/test';

import { assertValidStep, createStepRegistry, stepValueAt } from '#steps/step-registry.ts';

describe('createStepRegistry', () => {
  it('counts one step for a slide with no registered steps', () => {
    expect(createStepRegistry().getStepCount()).toBe(1);
  });

  it('compacts gaps: one deck step per distinct at, plus step 0', () => {
    const registry = createStepRegistry();
    registry.register(3);
    registry.register(1);
    registry.register(3);
    expect(registry.getSteps()).toEqual([1, 3]);
    expect(registry.getStepCount()).toBe(3);
  });

  it('keeps a step while any registration of it remains', () => {
    const registry = createStepRegistry();
    const first = registry.register(2);
    const second = registry.register(2);
    first();
    expect(registry.getSteps()).toEqual([2]);
    second();
    expect(registry.getStepCount()).toBe(1);
  });

  it('ignores a second call to the same unregister function', () => {
    const registry = createStepRegistry();
    const unregister = registry.register(2);
    registry.register(2);
    unregister();
    unregister();
    expect(registry.getSteps()).toEqual([2]);
  });

  it('notifies listeners only when the set of steps changes, and keeps the array until then', () => {
    const registry = createStepRegistry();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    registry.register(2);
    const steps = registry.getSteps();
    registry.register(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(registry.getSteps()).toBe(steps);

    registry.register(1);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    registry.register(5);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('stepValueAt', () => {
  it('maps deck steps to the at values they reveal, clamping past the last step', () => {
    const steps = [1, 3, 10];
    expect([0, 1, 2, 3, 9].map((step) => stepValueAt(steps, step))).toEqual([0, 1, 3, 10, 10]);
    expect(stepValueAt([], 4)).toBe(0);
  });
});

describe('assertValidStep', () => {
  it('rejects step 0, negative and fractional steps with the fix', () => {
    for (const at of [0, -1, 1.5, Number.NaN]) {
      expect(() => assertValidStep(at), String(at)).toThrow(/Use an integer of 1 or more/);
    }
  });

  it('accepts positive integers', () => {
    expect(() => assertValidStep(1)).not.toThrow();
  });
});
