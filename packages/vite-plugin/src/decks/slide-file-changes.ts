import { readdirSync } from 'node:fs';
import path from 'node:path';

import { isSlideFileName } from '#decks/resolve-slides.ts';

/**
 * Tracks when the set of slide files changes. Atomic saves can look like a file being added or
 * removed even though the same path still holds a slide. Vite can hot-update those files without
 * reloading the manifest.
 *
 * @param slidesDir - The absolute path of the deck's slides folder.
 */
export function trackSlideFileChanges(slidesDir: string): (event: string, file: string) => boolean {
  let files = slideFileNames(slidesDir);
  return (event, file) => {
    if (event !== 'add' && event !== 'unlink') {
      return false;
    }

    if (path.dirname(file) !== slidesDir || !isSlideFileName(path.basename(file))) {
      return false;
    }

    const current = slideFileNames(slidesDir);
    const changed = current === undefined || files !== current;
    files = current;
    return changed;
  };
}

/**
 * Returns the sorted slide filenames as a snapshot. A failed read leaves validation and its
 * diagnostics to the deck loader.
 *
 * @param slidesDir - The absolute path of the deck's slides folder.
 */
function slideFileNames(slidesDir: string): string | undefined {
  try {
    return readdirSync(slidesDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isSlideFileName(entry.name))
      .map((entry) => entry.name)
      .sort()
      .join('\0');
  } catch {
    return undefined;
  }
}
