/**
 * Places categories in equal bands along a length, each with a mark of the band's width less its
 * padding.
 */
export type BandScale = {
  /**
   * The categories, in order.
   */
  categories: readonly string[];

  /**
   * The width of each category's mark, after padding and the cap.
   */
  bandwidth: number;

  /**
   * The distance from one category's start to the next.
   */
  step: number;

  /**
   * The start of a category's mark; `NaN` for a category that is not in the scale.
   */
  at: (category: string) => number;

  /**
   * The centre of a category's mark; `NaN` for a category that is not in the scale.
   */
  center: (category: string) => number;
};

/**
 * How a band scale pads and caps its marks.
 */
export type BandOptions = {
  /**
   * The share of each step left empty between marks, from 0 to 1.
   */
  padding: number;

  /**
   * The widest a mark may be, in pixels; wider bands centre a mark of this width.
   */
  maxBandwidth: number;
};

/**
 * A band scale over a pixel range: equal steps, a mark centred in each, never wider than the cap.
 *
 * @param categories - The categories in order.
 * @param range - The start and end of the length, in pixels.
 * @param options - The padding and the cap.
 */
export function bandScale(
  categories: readonly string[],
  range: readonly [number, number],
  options: BandOptions,
): BandScale {
  const [start, end] = range;
  const count = Math.max(1, categories.length);
  const step = (end - start) / count;
  const bandwidth = Math.max(0, Math.min(step * (1 - options.padding), options.maxBandwidth));
  const inset = (step - bandwidth) / 2;
  const index = new Map(categories.map((category, position) => [category, position]));
  /**
   * The start of a category's step.
   */
  const stepStart = (category: string): number => {
    const position = index.get(category);
    return position === undefined ? Number.NaN : start + position * step;
  };
  return {
    categories,
    bandwidth,
    step,
    at: (category) => stepStart(category) + inset,
    center: (category) => stepStart(category) + step / 2,
  };
}

/**
 * Evenly spaced points from the start of a range to its end, for categories on a line chart: the
 * first at the start, the last at the end.
 *
 * @param count - How many points.
 * @param range - The start and end, in pixels.
 * @returns The position of each point; one point sits in the middle.
 */
export function pointPositions(count: number, range: readonly [number, number]): number[] {
  const [start, end] = range;
  if (count <= 1) {
    return count === 1 ? [(start + end) / 2] : [];
  }

  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + index * step);
}
