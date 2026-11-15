import { describe, expect, it } from 'vite-plus/test';

import { bandScale, pointPositions } from '#charts/scale/band-scale.ts';
import {
  linearScale,
  tickCountFor,
  ticksAt,
  tickStep,
  valueAxis,
} from '#charts/scale/linear-scale.ts';

describe('tickStep', () => {
  it('rounds the raw step to 1, 2 or 5 times a power of ten', () => {
    expect(tickStep(0, 18_420, 4)).toBe(5000);
    expect(tickStep(0, 7.4, 5)).toBe(2);
    expect(tickStep(80, 95, 4)).toBe(5);
    expect(tickStep(0, 0.37, 4)).toBe(0.1);
  });

  it('is zero for an empty range', () => {
    expect(tickStep(3, 3, 4)).toBe(0);
  });
});

describe('ticksAt', () => {
  it('rounds away floating-point noise', () => {
    expect(ticksAt(0, 0.6, 0.1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  });
});

describe('valueAxis', () => {
  it('starts bars at zero and ends on a whole tick', () => {
    expect(valueAxis([4480, 18_420], { zero: true, count: 4 })).toEqual({
      min: 0,
      max: 20_000,
      ticks: [0, 5000, 10_000, 15_000, 20_000],
      step: 5000,
    });
  });

  it('hugs the data when zero is not required', () => {
    const axis = valueAxis([81, 95], { zero: false, count: 3 });
    expect(axis.min).toBe(80);
    expect(axis.max).toBe(95);
  });

  it('keeps fixed ends as given', () => {
    const axis = valueAxis([3, 7], { zero: true, count: 4, max: 7.4 });
    expect(axis.max).toBe(7.4);
    expect(axis.min).toBe(0);
  });

  it('gives a flat or empty series a range', () => {
    expect(valueAxis([5, 5], { zero: false, count: 4 }).max).toBeGreaterThan(5);
    expect(valueAxis([], { zero: true, count: 4 })).toMatchObject({ min: 0, max: 1 });
  });
});

describe('linearScale', () => {
  it('maps a domain onto a range, upside down for a y axis', () => {
    const scale = linearScale([0, 100], [500, 100]);
    expect(scale.at(0)).toBe(500);
    expect(scale.at(50)).toBe(300);
  });

  it('maps everything to the middle for a flat domain', () => {
    expect(linearScale([4, 4], [0, 10]).at(4)).toBe(5);
  });
});

describe('tickCountFor', () => {
  it('keeps between two and seven ticks', () => {
    expect(tickCountFor(100, 150)).toBe(2);
    expect(tickCountFor(600, 150)).toBe(4);
    expect(tickCountFor(5000, 150)).toBe(7);
  });
});

describe('bandScale', () => {
  it('caps the mark width and centres it in its band', () => {
    const scale = bandScale(['a', 'b'], [0, 1000], { padding: 0.3, maxBandwidth: 120 });
    expect(scale.step).toBe(500);
    expect(scale.bandwidth).toBe(120);
    expect(scale.at('a')).toBe(190);
    expect(scale.center('b')).toBe(750);
    expect(scale.at('c')).toBeNaN();
  });
});

describe('pointPositions', () => {
  it('puts the first point at the start and the last at the end', () => {
    expect(pointPositions(3, [0, 100])).toEqual([0, 50, 100]);
    expect(pointPositions(1, [0, 100])).toEqual([50]);
  });
});

describe('valueAxis with fixed ends', () => {
  it('runs from a fixed min above every value to a max above it', () => {
    const axis = valueAxis([3, 5, 8], { zero: false, count: 4, min: 20 });
    expect(axis.min).toBe(20);
    expect(axis.max).toBeGreaterThan(axis.min);
    expect(axis.ticks[0]).toBe(20);
  });

  it('runs from a min below a fixed max under every value', () => {
    const axis = valueAxis([30, 50], { zero: false, count: 4, max: 10 });
    expect(axis.max).toBe(10);
    expect(axis.min).toBeLessThan(axis.max);
  });

  it('refuses a fixed min at or above a fixed max', () => {
    expect(() => valueAxis([1], { zero: false, count: 4, min: 10, max: 10 })).toThrow(
      'must be below its `max`',
    );
  });
});

describe('valueAxis on extreme data', () => {
  it('finishes for large values whose neighbours cannot be told apart', () => {
    expect(() => valueAxis([1e16, 1e16 + 2], { zero: false, count: 7 })).toThrow(
      /too close together/u,
    );
  });

  it('writes tiny values without a RangeError', () => {
    const axis = valueAxis([1e-101, 2e-101], { zero: false, count: 5 });
    expect(axis.ticks.every((tick) => Number.isFinite(tick))).toBe(true);
    expect(axis.ticks.length).toBeGreaterThan(1);
  });

  it('refuses a span that is not a number', () => {
    expect(() => valueAxis([1e308, -1e308], { zero: false, count: 5 })).toThrow(/too wide/u);
  });

  it('refuses values below the smallest number', () => {
    expect(() => valueAxis([5e-324, 1e-323], { zero: false, count: 5 })).toThrow(/too small/u);
  });

  it('caps the ticks of a fixed end far from the data', () => {
    const axis = valueAxis([0, 1], { zero: true, count: 5, max: 1e9 });
    expect(axis.ticks.length).toBeLessThan(20);
    expect(axis.max).toBe(1e9);
  });

  it('takes 200,000 values', () => {
    const values = Array.from({ length: 200_000 }, (_, index) => index);
    expect(valueAxis(values, { zero: true, count: 5 }).max).toBe(200_000);
  });
});

describe('ticksAt', () => {
  it('never builds more than a bounded run', () => {
    expect(ticksAt(0, 1e12, 1e-3).length).toBeLessThanOrEqual(2);
  });
});
