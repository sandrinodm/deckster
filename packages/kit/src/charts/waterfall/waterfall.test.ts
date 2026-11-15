import { describe, expect, it } from 'vite-plus/test';

import { runningSteps } from '#charts/waterfall/waterfall.tsx';

describe('runningSteps', () => {
  it('takes the running total for a total with no value', () => {
    const steps = runningSteps(['Start', 'Up', 'End'], [10, 5, null], ['Start', 'End']);
    expect(steps.at(-1)).toMatchObject({ from: 0, to: 15, total: true, missing: false });
  });

  it('counts a change with no value as no change and marks it missing', () => {
    const steps = runningSteps(['Start', 'Gap', 'Down'], [10, null, -4], undefined);
    expect(steps.map((step) => [step.from, step.to, step.missing])).toEqual([
      [0, 10, false],
      [10, 10, true],
      [10, 6, false],
    ]);
  });

  it('makes the first step the total when no totals are named', () => {
    expect(runningSteps(['A', 'B'], [3, 2], undefined).map((step) => step.total)).toEqual([
      true,
      false,
    ]);
  });
});
