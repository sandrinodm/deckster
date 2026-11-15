import { maxOf, minOf } from '#foundation/lists.ts';

/**
 * Tick steps grow through 1, 2 and 5 times a power of ten: these thresholds (the square roots of
 * 50, 10 and 2) decide which one a raw step rounds to, as d3's `tickIncrement` does.
 */
const STEP_THRESHOLDS = {
  /**
   * Above this, the step rounds up to the next power of ten.
   */
  ten: Math.sqrt(50),

  /**
   * Above this, to five times the power.
   */
  five: Math.sqrt(10),

  /**
   * Above this, to twice the power.
   */
  two: Math.sqrt(2),
} as const;

/**
 * Floating-point slack when deciding whether a value sits on a tick.
 */
const EPSILON = 1e-9;

/**
 * The most ticks one axis ever builds: a step finer than this many to the span is coarsened.
 */
const MAX_TICK_COUNT = 500;

/**
 * The finest step, as a share of the largest value's magnitude, that numbers that large can still
 * tell apart (a few times the machine epsilon).
 */
const MIN_RELATIVE_STEP = Number.EPSILON * 4;

/**
 * The most fraction digits `Number.prototype.toFixed` takes.
 */
const MAX_FIXED_DIGITS = 100;

/**
 * The significant digits kept when a tick is too fine for `toFixed`.
 */
const TICK_PRECISION = 15;

/**
 * The fewest ticks a value axis aims for, however little room it has.
 */
const MIN_TICKS = 2;

/**
 * The most ticks a value axis shows, however much room it has.
 */
const MAX_TICKS = 7;

/**
 * Maps a value from a domain onto a range in a straight line.
 */
export type LinearScale = {
  /**
   * The value at each end, low first.
   */
  domain: readonly [number, number];

  /**
   * The pixel position of each end of the domain.
   */
  range: readonly [number, number];

  /**
   * The pixel position of a value; values outside the domain extrapolate.
   */
  at: (value: number) => number;
};

/**
 * A value axis: its domain, the ticks it labels and the step between them.
 */
export type ValueAxis = {
  /**
   * The lowest value.
   */
  min: number;

  /**
   * The highest value.
   */
  max: number;

  /**
   * The tick values, low first.
   */
  ticks: readonly number[];

  /**
   * The distance between ticks.
   */
  step: number;
};

/**
 * How {@link valueAxis} chooses a domain.
 */
export type ValueAxisOptions = {
  /**
   * Include zero: bars and areas, whose length encodes the value, always do.
   */
  zero: boolean;

  /**
   * About how many ticks to aim for; the result has a nice step near it.
   */
  count: number;

  /**
   * A lowest value the chart sets itself, instead of the data's.
   */
  min?: number;

  /**
   * A highest value the chart sets itself, instead of the data's.
   */
  max?: number;
};

/**
 * A linear scale from a domain to a pixel range. A domain of zero width maps every value to the
 * middle of the range.
 *
 * @param domain - The low and high values.
 * @param range - The pixel positions they map to; the second may be smaller (a y axis grows up).
 */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return {
    domain,
    range,
    at: (value) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0)),
  };
}

/**
 * The nice step between about `count` ticks from `min` to `max`: 1, 2 or 5 times a power of ten.
 *
 * @param min - The low end.
 * @param max - The high end.
 * @param count - About how many intervals; at least 1.
 * @returns The step, or 0 when the range is empty.
 */
export function tickStep(min: number, max: number, count: number): number {
  const span = Math.abs(max - min);
  if (span === 0 || !Number.isFinite(span)) {
    return 0;
  }

  const raw = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const error = raw / power;
  if (error >= STEP_THRESHOLDS.ten) {
    return power * 10;
  }

  if (error >= STEP_THRESHOLDS.five) {
    return power * 5;
  }

  return error >= STEP_THRESHOLDS.two ? power * 2 : power;
}

/**
 * The ticks from `min` to `max` at a step, rounded so `0.1 + 0.2` reads as `0.3`.
 *
 * @param min - The low end.
 * @param max - The high end.
 * @param step - The distance between ticks, from {@link tickStep}.
 */
export function ticksAt(min: number, max: number, step: number): number[] {
  if (step <= 0 || !Number.isFinite(step)) {
    return [min];
  }

  const first = Math.ceil(min / step - EPSILON);
  const last = Math.floor(max / step + EPSILON);
  if (!(last - first < MAX_TICK_COUNT) || !Number.isSafeInteger(first)) {
    return min === max ? [min] : [min, max];
  }

  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const ticks: number[] = [];
  for (let index = first; index <= last; index += 1) {
    const tick = index * step;
    ticks.push(
      decimals > MAX_FIXED_DIGITS
        ? Number(tick.toPrecision(TICK_PRECISION))
        : Number(tick.toFixed(decimals)),
    );
  }

  return ticks;
}

/**
 * Chooses a value axis for some data: a domain widened to whole ticks, and the ticks. With `zero`
 * the domain always includes zero, so bars grow from it; without it the domain hugs the data (lines
 * may zoom in). Fixed `min` and `max` are kept as given.
 *
 * @param values - Every value the axis must show.
 * @param options - Whether to include zero, how many ticks, and any fixed ends.
 */
export function valueAxis(values: readonly number[], options: ValueAxisOptions): ValueAxis {
  const finite = values.filter((value) => Number.isFinite(value));
  const floor = options.zero ? 0 : Number.POSITIVE_INFINITY;
  const ceiling = options.zero ? 0 : Number.NEGATIVE_INFINITY;
  let low = options.min ?? minOf(finite, floor);
  let high = options.max ?? maxOf(finite, ceiling);
  if (finite.length === 0 && options.min === undefined && options.max === undefined) {
    low = 0;
    high = 1;
  }

  if (options.min !== undefined && options.max !== undefined && options.min >= options.max) {
    throw new Error(
      `The axis \`min\` (${options.min}) must be below its \`max\` (${options.max}). ` +
        'Swap them, or leave one out so the data sets it.',
    );
  }

  // A fixed end past every value (min above the data, max below it) still leaves an axis that
  // runs from low to high: the other end moves out by the fixed end's size.
  if (high < low) {
    if (options.min === undefined) {
      low = high - (Math.abs(high) || 1);
    } else {
      high = low + (Math.abs(low) || 1);
    }
  }

  if (low === high) {
    high = low === 0 ? 1 : low + Math.abs(low);
  }

  if (!Number.isFinite(high - low)) {
    throw new Error(
      `The axis from ${low} to ${high} is too wide to draw. ` +
        'Rescale the values (to millions, say) or set `min` and `max`.',
    );
  }

  let step = tickStep(low, high, options.count);
  const magnitude = Math.max(Math.abs(low), Math.abs(high));
  if (step <= 0 || !Number.isFinite(step)) {
    throw new Error(
      `The axis from ${low} to ${high} is too small to draw. ` +
        'Rescale the values (to thousandths, say) or set `min` and `max`.',
    );
  }

  if (step < magnitude * MIN_RELATIVE_STEP) {
    throw new Error(
      `The values from ${low} to ${high} are too close together for numbers that large to tell ` +
        'apart. Subtract a common offset from them, or rescale.',
    );
  }

  const min = options.min ?? Math.floor(low / step + EPSILON) * step;
  const max = options.max ?? Math.ceil(high / step - EPSILON) * step;
  if ((max - min) / step > MAX_TICK_COUNT) {
    // A fixed end far from the data: the step follows the whole axis instead.
    step = tickStep(min, max, options.count);
  }

  return { min, max, ticks: ticksAt(min, max, step), step };
}

/**
 * How many ticks fit a length: one per `spacing` pixels, from two to seven.
 *
 * @param length - The axis length in pixels.
 * @param spacing - The least room each tick interval should have.
 */
export function tickCountFor(length: number, spacing: number): number {
  return Math.min(MAX_TICKS, Math.max(MIN_TICKS, Math.round(length / spacing)));
}
