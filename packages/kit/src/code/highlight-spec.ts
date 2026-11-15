/**
 * The ways an author gives a code block's line highlights: a string of steps separated by `|`
 * (`'2-4|7'`), a list with one entry per step, or an object keyed by step number (`{ 1: '2-4', 2:
 * '7' }`).
 */
export type HighlightInput = string | readonly string[] | Readonly<Record<number, string>>;

/**
 * The lines a step focuses.
 */
export type HighlightStep = {
  /**
   * The deck step that shows these lines, an integer of 1 or more.
   */
  at: number;

  /**
   * The 1-based line numbers in focus, or `undefined` to clear the focus at this step.
   */
  lines: ReadonlySet<number> | undefined;
};

/**
 * The separator between steps in a highlight string.
 */
export const STEP_SEPARATOR = '|';

/**
 * Entries of a step that clear the focus instead of naming lines.
 */
const CLEAR_ENTRIES = new Set(['', '*', '-', 'none']);

/**
 * One range inside a step: a line number, or two joined by a dash.
 */
const RANGE_PATTERN = /^(\d+)(?:-(\d+))?$/;

/**
 * The most lines a range may cover, which keeps a typo such as `1-99999999` from allocating.
 */
const MAX_RANGE_LINES = 2000;

/**
 * Parses the line numbers of one step: comma-separated numbers and ranges such as `2-4,7`.
 *
 * @param spec - The step's entry. `''`, `'*'`, `'-'` and `'none'` clear the focus.
 * @returns The lines in focus, or `undefined` when the entry clears the focus.
 * @throws RangeError naming the bad entry and the fix, for anything that is not a number or a range
 *   from a smaller to a larger line.
 */
export function parseLineRanges(spec: string): ReadonlySet<number> | undefined {
  const trimmed = spec.trim();
  if (CLEAR_ENTRIES.has(trimmed)) {
    return undefined;
  }

  const lines = new Set<number>();
  for (const part of trimmed.split(',')) {
    const match = RANGE_PATTERN.exec(part.trim());
    if (match === null) {
      throw badRange(part, spec);
    }

    const first = Number(match[1]);
    const last = match[2] === undefined ? first : Number(match[2]);
    if (first < 1 || last < first || last - first >= MAX_RANGE_LINES) {
      throw badRange(part, spec);
    }

    for (let line = first; line <= last; line += 1) {
      lines.add(line);
    }
  }

  return lines;
}

/**
 * Turns an author's highlight input into steps, in ascending order of `at`.
 *
 * @param input - A `'2-4|7'` string, a list or an object keyed by step; `undefined` for none.
 * @param firstAt - The step the first entry of a string or a list shows at; an object names its
 *   steps itself. Defaults to 1.
 * @returns The steps; empty for no input.
 * @throws RangeError for a step that is not an integer of 1 or more, or an entry that
 *   {@link parseLineRanges} rejects.
 */
export function parseHighlight(input: HighlightInput | undefined, firstAt = 1): HighlightStep[] {
  if (input === undefined) {
    return [];
  }

  const entries = highlightEntries(input, firstAt);
  const steps = entries.map(([at, spec]) => {
    if (!Number.isInteger(at) || at < 1) {
      throw new RangeError(
        `A highlight step of ${at} is not valid. Use an integer of 1 or more, for example ` +
          '`highlight={{ 1: "2-4", 2: "7" }}`.',
      );
    }

    return { at, lines: parseLineRanges(spec) };
  });
  return steps.sort((a, b) => a.at - b.at);
}

/**
 * The step in force at the deck's current step: the latest step whose `at` has been reached.
 *
 * @param steps - Steps in ascending order of `at`, from {@link parseHighlight}.
 * @param current - The slide's current step value (`useStep()`), 0 before any step.
 * @returns The lines in focus, or `undefined` when nothing is in focus: before the first step, or
 *   at a step that clears the focus.
 */
export function focusAt(
  steps: readonly HighlightStep[],
  current: number,
): ReadonlySet<number> | undefined {
  const reached = steps.filter((step) => step.at <= current);
  return reached.at(-1)?.lines;
}

/**
 * The `at` values a block registers as slide steps.
 *
 * @param steps - Steps from {@link parseHighlight}.
 */
export function highlightAts(steps: readonly HighlightStep[]): number[] {
  return steps.map((step) => step.at);
}

/**
 * The `[at, entry]` pairs of an input, whatever its form.
 *
 * @param input - A string, list or object.
 * @param firstAt - The step of the first string or list entry.
 */
function highlightEntries(input: HighlightInput, firstAt: number): [number, string][] {
  if (typeof input === 'string') {
    return input.split(STEP_SEPARATOR).map((spec, index) => [firstAt + index, spec]);
  }

  if (Array.isArray(input)) {
    return input.map((spec: string, index) => [firstAt + index, spec]);
  }

  return Object.entries(input).map(([at, spec]) => [Number(at), String(spec)]);
}

/**
 * The error for an entry that is not a line range.
 *
 * @param part - The comma-separated part that failed.
 * @param spec - The whole step entry, for context.
 */
function badRange(part: string, spec: string): RangeError {
  return new RangeError(
    `"${part.trim()}" in the highlight "${spec}" is not a line or a range. Write line numbers ` +
      'and ranges like `2-4,7`, with the first line before the last, and `|` between steps.',
  );
}

/**
 * The lines each step names that a block of `lineCount` lines does not have: a step whose lines are
 * all out of range focuses nothing, and so adds a step that changes nothing.
 *
 * @param steps - Steps from {@link parseHighlight}.
 * @param lineCount - The number of lines in the block.
 * @returns One entry per step that names a missing line, with those lines in order.
 */
export function linesOutOfRange(
  steps: readonly HighlightStep[],
  lineCount: number,
): { at: number; lines: number[] }[] {
  return steps.flatMap((step) => {
    const missing = [...(step.lines ?? [])].filter((line) => line > lineCount);
    return missing.length === 0 ? [] : [{ at: step.at, lines: missing }];
  });
}
