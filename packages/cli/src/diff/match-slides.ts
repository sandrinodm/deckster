/**
 * A slide of one version of a deck, by id and 1-based position.
 */
export type OrderedSlide = {
  /**
   * The slide id.
   */
  id: string;

  /**
   * The 1-based position in the deck.
   */
  number: number;
};

/**
 * One slide id matched across the two versions.
 */
export type SlideMatch = {
  /**
   * The slide id.
   */
  id: string;

  /**
   * The 1-based position in the base, or `null` when the slide was added.
   */
  beforeNumber: number | null;

  /**
   * The 1-based position now, or `null` when the slide was removed.
   */
  afterNumber: number | null;

  /**
   * Whether the slide left its place among the slides both versions have.
   */
  moved: boolean;
};

/**
 * A screenshot name: a slide number, the slide id and an optional step.
 */
export type ParsedShotName = {
  /**
   * The slide's 1-based position from the file name.
   */
  number: number;

  /**
   * The slide id.
   */
  id: string;

  /**
   * The step, or `null` for a finished-state picture.
   */
  step: number | null;
};

/**
 * Matches `03-request-flow.png` and `03-request-flow.step2.png`, the names `deckster shot` writes.
 */
const SHOT_NAME_PATTERN = /^(\d{2,})-([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.step(\d+))?\.png$/;

/**
 * Reads a screenshot's slide number, id and step from its file name.
 *
 * @param name - The file name, without a folder.
 * @returns The parts, or `undefined` when the name is not one `deckster shot` writes.
 */
export function parseShotName(name: string): ParsedShotName | undefined {
  const match = SHOT_NAME_PATTERN.exec(name);
  const [, number, id, step] = match ?? [];
  if (number === undefined || id === undefined) {
    return undefined;
  }

  return { number: Number(number), id, step: step === undefined ? null : Number(step) };
}

/**
 * Matches the slides of two versions by id, never by position. The result lists the current slides
 * in order, then the removed ones in their old order. A slide is `moved` when it is not on the
 * longest run of shared slides that keep their relative order, so moving one slide marks that slide
 * alone and inserting or deleting slides marks none.
 *
 * @param before - The base slides.
 * @param after - The current slides.
 */
export function matchSlides(
  before: readonly OrderedSlide[],
  after: readonly OrderedSlide[],
): SlideMatch[] {
  const beforeById = new Map(before.map((slide) => [slide.id, slide]));
  const shared = after.filter((slide) => beforeById.has(slide.id));
  const oldNumbers = shared.map((slide) => beforeById.get(slide.id)?.number ?? 0);
  const stayed = new Set(longestIncreasingRun(oldNumbers).map((index) => shared[index]?.id ?? ''));
  const afterIds = new Set(after.map((slide) => slide.id));
  const present = after.map((slide): SlideMatch => {
    const old = beforeById.get(slide.id);
    return {
      id: slide.id,
      beforeNumber: old?.number ?? null,
      afterNumber: slide.number,
      moved: old !== undefined && !stayed.has(slide.id),
    };
  });
  const removed = before
    .filter((slide) => !afterIds.has(slide.id))
    .map((slide): SlideMatch => ({
      id: slide.id,
      beforeNumber: slide.number,
      afterNumber: null,
      moved: false,
    }));
  return [...present, ...removed];
}

/**
 * The indexes of a longest strictly increasing subsequence of numbers.
 *
 * @param values - The numbers.
 */
function longestIncreasingRun(values: readonly number[]): number[] {
  const tails: number[] = [];
  const previous: number[] = [];
  values.forEach((value, index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((values[tails[middle] ?? 0] ?? 0) < value) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    previous[index] = low > 0 ? (tails[low - 1] ?? -1) : -1;
    tails[low] = index;
  });
  const run: number[] = [];
  let cursor = tails[tails.length - 1] ?? -1;
  while (cursor >= 0) {
    run.unshift(cursor);
    cursor = previous[cursor] ?? -1;
  }

  return run;
}
