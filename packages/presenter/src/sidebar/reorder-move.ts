/**
 * Moves one item of a list to a new place and returns the new list.
 *
 * @param ids - The slide ids in their current order.
 * @param from - The index of the item to move.
 * @param to - The index it should end up at, after the move.
 * @returns A new list; the same ids when either index is out of range or they are equal.
 */
export function moveItem(ids: readonly string[], from: number, to: number): readonly string[] {
  const isValid = Number.isInteger(from) && Number.isInteger(to);
  const inRange = from >= 0 && from < ids.length && to >= 0 && to < ids.length;
  if (!isValid || !inRange) {
    return ids;
  }

  const moving = ids[from];
  if (from === to || moving === undefined) {
    return ids;
  }

  const rest = ids.filter((_, index) => index !== from);
  return [...rest.slice(0, to), moving, ...rest.slice(to)];
}

/**
 * Where a dragged slide ends up when it is dropped on a row: dropping on the upper half of a row
 * puts it before that row, on the lower half after it.
 *
 * @param input - The dragged index, the row dropped on and which half of it.
 * @returns The index the item should have after the move.
 */
export function dropIndex(input: { from: number; row: number; after: boolean }): number {
  const { from, row, after } = input;
  const target = after ? row + 1 : row;
  return from < target ? target - 1 : target;
}
