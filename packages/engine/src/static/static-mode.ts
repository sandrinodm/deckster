import { createContext, useContext } from 'react';

/**
 * The query parameter that turns on static mode.
 */
const STATIC_PARAM = 'static';

/**
 * Values of the parameter that leave static mode off, compared case-insensitively.
 */
const FALSE_VALUES = new Set(['0', 'false', 'no']);

/**
 * Whether the deck renders in static mode; provided by the engine.
 */
export const StaticModeContext = createContext(false);

/**
 * Whether the deck is in static mode (`?static` in the URL). Motion primitives read this and jump
 * straight to their end state, so export, lint and screenshots see finished frames.
 *
 * @returns `true` in static mode.
 */
export function useStatic(): boolean {
  return useContext(StaticModeContext);
}

/**
 * Reads static mode from a query string. `?static`, `?static=1` and `?static=true` turn it on;
 * `?static=0`, `false` or `no` leave it off.
 *
 * @param search - `location.search`, with or without the leading `?`.
 */
export function readStaticMode(search: string): boolean {
  const value = new URLSearchParams(search).get(STATIC_PARAM);
  if (value === null) {
    return false;
  }

  return !FALSE_VALUES.has(value.toLowerCase());
}
