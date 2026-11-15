import path from 'node:path';

/**
 * The folder under the workspace root that holds one folder per deck.
 */
export const DECKS_DIR = 'decks';

/**
 * The manifest file every deck folder contains.
 */
export const DECK_CONFIG_FILE = 'deck.config.ts';

/**
 * The folder inside a deck that holds one file per slide.
 */
export const SLIDES_DIR = 'slides';

/**
 * Where a deck lives on disk.
 */
export type DeckLocation = {
  /**
   * The deck folder name, such as `hello`.
   */
  id: string;

  /**
   * The absolute deck folder, `decks/<id>`.
   */
  dir: string;

  /**
   * The absolute path of the deck's `deck.config.ts`.
   */
  configFile: string;

  /**
   * The absolute path of the deck's `slides/` folder.
   */
  slidesDir: string;
};

/**
 * Builds the paths of a deck from its folder name.
 *
 * @param workspaceRoot - The absolute workspace root (the folder with `decks/`).
 * @param id - The deck folder name.
 */
export function deckLocation(workspaceRoot: string, id: string): DeckLocation {
  const dir = path.join(workspaceRoot, DECKS_DIR, id);
  return {
    id,
    dir,
    configFile: path.join(dir, DECK_CONFIG_FILE),
    slidesDir: path.join(dir, SLIDES_DIR),
  };
}

/**
 * The path to show authors in messages: relative to the workspace root, with forward slashes.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param file - An absolute path.
 */
export function displayPath(workspaceRoot: string, file: string): string {
  return path.relative(workspaceRoot, file).split(path.sep).join('/');
}
