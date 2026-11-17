import type { Position } from '#navigation/navigation.ts';

import { formatHash } from '#navigation/hash.ts';
import { readQueryFlag } from '#url/query-flag.ts';

/**
 * The query parameter that turns on embed mode.
 */
const EMBED_PARAM = 'embed';

/**
 * Reads embed mode from a query string, with the same rules as `?static`: `?embed`, `?embed=1` and
 * `?embed=true` turn it on; `?embed=0`, `false` or `no` leave it off. Embed mode is for a deck
 * shown in an iframe on another page: no presenter tools, and a small previous/next control
 * instead.
 *
 * @param search - `location.search`, with or without the leading `?`.
 * @returns `true` in embed mode.
 */
export function readEmbedMode(search: string): boolean {
  return readQueryFlag(search, EMBED_PARAM);
}

/**
 * The URL of the whole deck at a position, relative to the page: the same path and query without
 * `embed`, and the hash of `position`. The position is passed in because `location.hash` is written
 * after the render that shows a move. Other query parameters are kept, re-encoded by
 * `URLSearchParams` (a bare `?static` becomes `?static=`, which reads the same).
 *
 * @param location - The page's path and query, usually `window.location`.
 * @param position - The slide and step to open, 0-based.
 * @returns A relative URL such as `/decks/hello/#/2/1`.
 */
export function fullDeckUrl(
  location: Pick<Location, 'pathname' | 'search'>,
  position: Position,
): string {
  const params = new URLSearchParams(location.search);
  params.delete(EMBED_PARAM);
  const query = params.size === 0 ? '' : `?${params.toString()}`;
  return `${location.pathname}${query}${formatHash(position)}`;
}
