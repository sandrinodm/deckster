import type { Position } from '#navigation/navigation.ts';

/**
 * Matches `#/<slide>` or `#/<slide>/<step>`, where `<slide>` is a 1-based number or a slide id.
 */
const HASH_PATTERN = /^#\/([a-z0-9-]+)(?:\/(\d+))?\/?$/;

/**
 * Matches a slide token that is a 1-based slide number rather than an id.
 */
const SLIDE_NUMBER_PATTERN = /^\d+$/;

/**
 * Formats a position as the URL hash `#/<slide>/<step>`. The slide is 1-based so the hash matches
 * page numbers; the step is 0-based, where 0 shows no `<Step>` yet.
 *
 * @param position - A zero-based slide index and a step.
 * @returns The hash, including the leading `#`.
 */
export function formatHash(position: Position): string {
  return `#/${position.slide + 1}/${position.step}`;
}

/**
 * Reads a position from a URL hash written by {@link formatHash}. The slide may also be given by id
 * (`#/request-flow/2`). A missing step means step 0.
 *
 * @param hash - `location.hash`, with its leading `#`.
 * @param slideIds - Slide ids in deck order, used to resolve ids and to range-check numbers.
 * @returns The position, or `undefined` for an empty, malformed or out-of-range hash.
 */
export function parseHash(hash: string, slideIds: readonly string[]): Position | undefined {
  const match = HASH_PATTERN.exec(hash);
  if (match === null) {
    return undefined;
  }

  const [, slideToken = '', stepToken = '0'] = match;
  const slide = resolveSlideToken(slideToken, slideIds);
  if (slide === undefined) {
    return undefined;
  }

  return { slide, step: Number(stepToken) };
}

/**
 * Resolves the slide part of a hash, a 1-based number or an id, to a zero-based index.
 *
 * @param token - The slide part of the hash.
 * @param slideIds - Slide ids in deck order.
 * @returns The index, or `undefined` for a number out of range or an unknown id.
 */
function resolveSlideToken(token: string, slideIds: readonly string[]): number | undefined {
  if (SLIDE_NUMBER_PATTERN.test(token)) {
    const index = Number(token) - 1;
    return index >= 0 && index < slideIds.length ? index : undefined;
  }

  const index = slideIds.indexOf(token);
  return index === -1 ? undefined : index;
}
