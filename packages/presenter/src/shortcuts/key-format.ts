/**
 * How special `KeyboardEvent.key` values read on a keyboard cap in the help overlay.
 */
const KEY_LABELS: ReadonlyMap<string, string> = new Map([
  ['ArrowLeft', '←'],
  ['ArrowRight', '→'],
  ['ArrowUp', '↑'],
  ['ArrowDown', '↓'],
  [' ', 'Space'],
  ['Escape', 'Esc'],
  ['PageUp', 'PgUp'],
  ['PageDown', 'PgDn'],
]);

/**
 * Normalizes a `KeyboardEvent.key` for matching: single characters compare case-insensitively, so
 * Caps Lock does not break a shortcut, and named keys stay as they are.
 *
 * @param key - A `KeyboardEvent.key` value.
 */
export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/**
 * The text shown for a key in the help overlay.
 *
 * @param key - A key as listed in a shortcut, such as `ArrowLeft`, `' '` or `s`.
 */
export function formatKey(key: string): string {
  const label = KEY_LABELS.get(key);
  if (label !== undefined) {
    return label;
  }

  return key.length === 1 ? key.toUpperCase() : key;
}
