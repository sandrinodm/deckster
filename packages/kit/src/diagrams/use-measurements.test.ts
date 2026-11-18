import { describe, expect, it } from 'vite-plus/test';

import {
  nextMeasurement,
  type MeasurementRead,
  type MeasurementState,
  type Measurements,
} from '#diagrams/use-measurements.ts';

/**
 * Measurements for one node of the given height.
 *
 * @param height - The node's height in pixels.
 */
function measurementsOf(height: number): Measurements {
  return {
    nodeHeight: height,
    nodeHeights: new Map([['a', height]]),
    labels: new Map(),
    groupLabels: new Map(),
  };
}

/**
 * A read of the diagram for a key.
 *
 * @param height - The node height read.
 * @param key - The key the diagram had.
 */
function readOf(height: number, key = 'one'): MeasurementRead {
  return { key, value: measurementsOf(height) };
}

/**
 * The state after a first read of the hidden copy.
 *
 * @param height - The node height read.
 */
function hiddenState(height: number): MeasurementState {
  return nextMeasurement(undefined, readOf(height), 'hidden');
}

describe('nextMeasurement', () => {
  it('takes the first read of the hidden copy as an unsettled value', () => {
    const state = hiddenState(89);
    expect(state.value.nodeHeight).toBe(89);
    expect(state.settled).toBe(false);
  });

  it('takes the first read of a drawing that has no earlier value as an unsettled value', () => {
    const state = nextMeasurement(undefined, readOf(103), 'drawn');
    expect(state.value.nodeHeight).toBe(103);
    expect(state.settled).toBe(false);
  });

  it('settles when the first drawn read equals the value, without a new value', () => {
    const before = hiddenState(89);
    const after = nextMeasurement(before, readOf(89), 'drawn');
    expect(after.settled).toBe(true);
    expect(after.value).toBe(before.value);
  });

  it('takes a different first drawn read as the value and stays unsettled', () => {
    const after = nextMeasurement(hiddenState(89), readOf(103), 'drawn');
    expect(after.value.nodeHeight).toBe(103);
    expect(after.settled).toBe(false);
  });

  it('settles on the second drawn read and keeps the value even when it differs', () => {
    const first = nextMeasurement(hiddenState(89), readOf(103), 'drawn');
    const second = nextMeasurement(first, readOf(110), 'drawn');
    expect(second.settled).toBe(true);
    expect(second.value).toBe(first.value);
  });

  it('settles on the second read of a drawing that was seeded from the drawing', () => {
    const seeded = nextMeasurement(undefined, readOf(103), 'drawn');
    expect(nextMeasurement(seeded, readOf(103), 'drawn').settled).toBe(true);
    expect(nextMeasurement(seeded, readOf(120), 'drawn').settled).toBe(false);
  });

  it('ignores a read of the hidden copy after the drawing was read', () => {
    const drawn = nextMeasurement(hiddenState(89), readOf(103), 'drawn');
    expect(nextMeasurement(drawn, readOf(89), 'hidden')).toBe(drawn);
  });

  it('replaces the value for a later read of the hidden copy before any drawing', () => {
    const after = nextMeasurement(hiddenState(89), readOf(95), 'hidden');
    expect(after.value.nodeHeight).toBe(95);
    expect(after.settled).toBe(false);
  });

  it('takes a resized drawing as the new value without unsettling it', () => {
    const settled = nextMeasurement(hiddenState(89), readOf(89), 'drawn');
    const after = nextMeasurement(settled, readOf(109), 'resized');
    expect(after.value.nodeHeight).toBe(109);
    expect(after.settled).toBe(true);
  });

  it('keeps the same state for a resize that changes nothing', () => {
    const settled = nextMeasurement(hiddenState(89), readOf(89), 'drawn');
    expect(nextMeasurement(settled, readOf(89), 'resized')).toBe(settled);
  });

  it('starts over for a new key', () => {
    const settled = nextMeasurement(hiddenState(89), readOf(89), 'drawn');
    const after = nextMeasurement(settled, readOf(89, 'two'), 'hidden');
    expect(after.key).toBe('two');
    expect(after.settled).toBe(false);
  });
});
