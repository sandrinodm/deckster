/**
 * Values of a flag parameter that leave the flag off, compared case-insensitively.
 */
const FALSE_VALUES = new Set(['0', 'false', 'no']);

/**
 * Reads an on-off flag from a query string. The bare parameter (`?name`), an empty value and any
 * value other than `0`, `false` or `no` (in any case) turn it on; a missing parameter leaves it
 * off. Only the first occurrence of the parameter counts.
 *
 * @param search - `location.search`, with or without the leading `?`.
 * @param name - The parameter name, such as `static`.
 * @returns `true` when the flag is on.
 */
export function readQueryFlag(search: string, name: string): boolean {
  const value = new URLSearchParams(search).get(name);
  if (value === null) {
    return false;
  }

  return !FALSE_VALUES.has(value.toLowerCase());
}
