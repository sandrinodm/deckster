/**
 * Where an arrow key moves the overview's selection.
 *
 * @param input - The current selection, the key, the number of columns and the slide count.
 * @returns The new zero-based selection, or `undefined` when the key is not a selection key.
 */
export function moveOverviewSelection(input: {
  selected: number;
  key: string;
  columns: number;
  count: number;
}): number | undefined {
  const { selected, key, columns, count } = input;
  const last = count - 1;
  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, selected - 1);
    case 'ArrowRight':
      return Math.min(last, selected + 1);
    case 'ArrowUp':
      return selected - columns >= 0 ? selected - columns : selected;
    case 'ArrowDown':
      return selected + columns <= last ? selected + columns : selected;
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return undefined;
  }
}
