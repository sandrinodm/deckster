/**
 * The largest of some numbers, or `floor` when none is larger. A loop, not `Math.max(...values)`,
 * which throws a `RangeError` on a long array.
 *
 * @param values - The numbers.
 * @param floor - What an empty list, or one of smaller numbers, gives.
 */
export function maxOf(values: readonly number[], floor = Number.NEGATIVE_INFINITY): number {
  let largest = floor;
  for (const value of values) {
    if (value > largest) {
      largest = value;
    }
  }

  return largest;
}

/**
 * The smallest of some numbers, or `ceiling` when none is smaller. A loop, not
 * `Math.min(...values)`, which throws a `RangeError` on a long array.
 *
 * @param values - The numbers.
 * @param ceiling - What an empty list, or one of larger numbers, gives.
 */
export function minOf(values: readonly number[], ceiling = Number.POSITIVE_INFINITY): number {
  let smallest = ceiling;
  for (const value of values) {
    if (value < smallest) {
      smallest = value;
    }
  }

  return smallest;
}

/**
 * Sets an own property on a plain object, whatever the key: `target[key] = value` with the key
 * `__proto__` would replace the object's prototype instead.
 *
 * @param target - The object.
 * @param key - The property name.
 * @param value - The value.
 */
export function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Appends every item of a list to another. A loop, not `target.push(...items)`, which throws a
 * `RangeError` on a long list.
 *
 * @param target - The list to add to.
 * @param items - The items to append.
 */
export function pushAll<T>(target: T[], items: readonly T[]): void {
  for (const item of items) {
    target.push(item);
  }
}
