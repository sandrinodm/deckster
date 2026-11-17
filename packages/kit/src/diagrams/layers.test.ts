import { describe, expect, it } from 'vite-plus/test';

import { lastLayerStep, layerState } from '#diagrams/layers.tsx';

/**
 * A stack of five bands built top down, the second marked by its author.
 */
const STACK = [
  { at: 1 },
  { at: 2, state: 'highlighted' as const },
  { at: 3 },
  { at: 4 },
  { at: 5 },
];

/**
 * The state of every band at a step of {@link STACK}.
 *
 * @param step - The step on screen.
 */
function statesAt(step: number): string[] {
  const last = lastLayerStep(STACK);
  return STACK.map((layer) => layerState(layer, step, last));
}

describe('layerState', () => {
  it('picks out the band a step just added while more bands are to come', () => {
    expect(statesAt(1)).toEqual(['highlighted', 'highlighted', 'default', 'default', 'default']);
    expect(statesAt(3)).toEqual(['default', 'highlighted', 'highlighted', 'default', 'default']);
  });

  it("leaves only the author's states once the last band is in, so the bottom band is not lit", () => {
    expect(statesAt(5)).toEqual(['default', 'highlighted', 'default', 'default', 'default']);
  });

  it('never picks out a band of a stack with no steps', () => {
    const still: { at?: number; state?: 'muted' }[] = [{}, { state: 'muted' }];
    const last = lastLayerStep(still);
    expect(last).toBeUndefined();
    expect(still.map((layer) => layerState(layer, 0, last))).toEqual(['default', 'muted']);
  });
});
