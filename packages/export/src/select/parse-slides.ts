/**
 * Matches one part of a slide selection: a number, a range `5-9`, or a slide id.
 */
const PART_PATTERN = /^(?:(\d+)(?:-(\d+))?|([a-z0-9][a-z0-9-]*))$/;

/**
 * The outcome of parsing a slide selection.
 */
export type SlideSelection =
  | {
      /**
       * The selection is valid.
       */
      ok: true;

      /**
       * The selected zero-based slide indexes, ascending and without repeats.
       */
      indexes: number[];
    }
  | {
      /**
       * The selection is invalid.
       */
      ok: false;

      /**
       * Why, naming the bad part and the valid range.
       */
      message: string;
    };

/**
 * Parses a `--slides` value such as `3,5-9` or `cover,heat-map`: comma-separated 1-based slide
 * numbers, inclusive ranges and slide ids. Whitespace around parts is ignored.
 *
 * @param value - The flag's value.
 * @param slideIds - The deck's slide ids, in order.
 * @returns The selected indexes, or why the value is invalid: an empty part, a number outside 1 to
 *   the slide count, a range that runs backwards, or an unknown id.
 */
export function parseSlideSelection(value: string, slideIds: readonly string[]): SlideSelection {
  const count = slideIds.length;
  const selected = new Set<number>();
  for (const raw of value.split(',')) {
    const part = raw.trim();
    const match = PART_PATTERN.exec(part);
    if (match === null) {
      return {
        ok: false,
        message: `"${part}" is not a slide number, range or id. Use a list such as 3,5-9.`,
      };
    }

    const [, first, last, id] = match;
    if (id !== undefined) {
      const index = slideIds.indexOf(id);
      if (index === -1) {
        return {
          ok: false,
          message: `There is no slide "${id}". Slide ids: ${slideIds.join(', ')}.`,
        };
      }

      selected.add(index);
      continue;
    }

    const start = Number(first);
    const end = last === undefined ? start : Number(last);
    if (start < 1 || end > count) {
      return {
        ok: false,
        message: `"${part}" is outside the deck: slides are numbered 1 to ${count}.`,
      };
    }

    if (end < start) {
      return { ok: false, message: `"${part}" runs backwards; write the lower number first.` };
    }

    for (let number = start; number <= end; number += 1) {
      selected.add(number - 1);
    }
  }

  return { ok: true, indexes: [...selected].sort((a, b) => a - b) };
}
