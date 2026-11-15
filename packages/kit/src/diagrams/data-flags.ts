/**
 * A `data-*` flag that is `"true"` when on and absent when off.
 *
 * @param on - Whether the flag is set.
 */
export function flag(on: boolean): 'true' | undefined {
  return on ? 'true' : undefined;
}

/**
 * A `data-*` attribute that is present (empty) when on and absent when off, such as
 * `data-decorative`.
 *
 * @param on - Whether the attribute is present.
 */
export function presence(on: boolean): '' | undefined {
  return on ? '' : undefined;
}
