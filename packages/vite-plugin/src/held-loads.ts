import { isCodeHeld } from '@deckster/brand/node';
import path from 'node:path';

/**
 * The files a loader read while an agent turn held them. While a turn holds a deck config or a
 * brand file, a loader gets the value it loaded last, or the file as the turn found it, instead of
 * importing it, so what it served then may be out of date once the hold ends. Only a page that
 * loaded during the hold needs the reload that loads the file for real; a page that loaded before
 * the turn already shows it, and reloading that page after every turn would throw away its state.
 */
export type HeldLoads = {
  /**
   * Notes that a loader read these files now. Only the files an agent turn holds at this moment are
   * kept; the others are ignored.
   *
   * @param files - Absolute paths.
   */
  readonly note: (files: readonly string[]) => void;

  /**
   * Whether a noted path is the released folder or lies inside it, so what was loaded must load
   * again. Forgets those paths so each hold asks once.
   *
   * @param root - The absolute folder whose hold ended.
   */
  readonly released: (root: string) => boolean;
};

/**
 * Starts an empty record of files read while held.
 *
 * @returns The record.
 */
export function trackHeldLoads(): HeldLoads {
  const held = new Set<string>();
  return {
    note: (files) => {
      for (const file of files) {
        if (isCodeHeld(file)) {
          held.add(path.resolve(file));
        }
      }
    },
    released: (root) => {
      const dir = path.resolve(root);
      const prefix = `${dir}${path.sep}`;
      const under = [...held].filter((file) => file === dir || file.startsWith(prefix));
      for (const file of under) {
        held.delete(file);
      }

      return under.length > 0;
    },
  };
}
