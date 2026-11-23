import path from 'node:path';

/**
 * The folder `deckster diff` writes its report to, relative to the workspace root; one folder per
 * deck (and brand) below it.
 */
export const DEFAULT_DIFF_DIR = path.join('.deck', 'diff');

/**
 * The folder `deckster diff --save-baseline` writes to, relative to the workspace root; one folder
 * per deck (and brand) below it.
 */
export const DEFAULT_BASELINE_DIR = path.join('.deck', 'baseline');

/**
 * The character between a deck's folder name and its brand in a run with `--brand`, as `deckster
 * shot` writes it.
 */
const BRAND_FOLDER_SEPARATOR = '@';

/**
 * The folder for a deck inside a parent: `<parent>/<deck>`, or `<parent>/<deck>@<brand>` for a run
 * in another brand, so the two never overwrite each other.
 *
 * @param parent - The parent folder, such as {@link DEFAULT_DIFF_DIR}.
 * @param deck - The deck folder name.
 * @param brand - The `--brand` value, if any.
 */
export function deckFolder(parent: string, deck: string, brand: string | undefined): string {
  const folder = brand === undefined ? deck : `${deck}${BRAND_FOLDER_SEPARATOR}${brand}`;
  return path.join(parent, folder);
}
