/**
 * The value a record holds under a key of its own, or `undefined`. Brand names, palette steps,
 * family names and surface names come from authors and slides, and a plain object also answers to
 * names it inherits (`constructor`, `toString`, `__proto__`); this never returns one of those.
 *
 * @param record - The record to look in.
 * @param key - The key, as an author wrote it.
 */
export function ownValue<Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
