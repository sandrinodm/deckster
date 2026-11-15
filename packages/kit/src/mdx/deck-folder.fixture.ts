import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A deck folder on disk for path tests, and the files around it.
 */
export type DeckFolder = {
  /**
   * The temporary folder that holds the deck and a file outside it.
   */
  root: string;

  /**
   * The deck folder, which holds `deck.config.ts`, `slides/`, `assets/` and `public/`.
   */
  deck: string;

  /**
   * A slide file, `slides/slide.mdx`.
   */
  slide: string;

  /**
   * A file beside the deck folder, outside it.
   */
  outside: string;

  /**
   * Removes the temporary folder.
   */
  cleanup: () => void;
};

/**
 * Writes a deck folder: `assets/dana.svg`, `assets/clip.webm`, `assets/notes.pdf`,
 * `assets/drawing.svg`, `public/logo.svg`, a link `assets/linked.png` to a file outside the deck,
 * and `slides/slide.mdx`. The temporary folder is not resolved, so on macOS the deck sits behind
 * the `/var` link, as a real workspace might.
 */
export function deckFolder(): DeckFolder {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-deck-'));
  const deck = path.join(root, 'deck');
  for (const folder of ['slides', 'assets', 'public']) {
    fs.mkdirSync(path.join(deck, folder), { recursive: true });
  }

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect fill="#e4572e"/></svg>';
  fs.writeFileSync(path.join(deck, 'deck.config.ts'), 'export default {};');
  fs.writeFileSync(path.join(deck, 'assets', 'dana.svg'), svg);
  fs.writeFileSync(path.join(deck, 'assets', 'drawing.svg'), svg);
  fs.writeFileSync(path.join(deck, 'assets', 'clip.webm'), 'webm');
  fs.writeFileSync(path.join(deck, 'assets', 'notes.pdf'), 'pdf');
  fs.writeFileSync(path.join(deck, 'public', 'logo.svg'), svg);
  const outside = path.join(root, 'secret.png');
  fs.writeFileSync(outside, 'secret');
  fs.symlinkSync(outside, path.join(deck, 'assets', 'linked.png'));
  const slide = path.join(deck, 'slides', 'slide.mdx');
  fs.writeFileSync(slide, '');
  return {
    root,
    deck,
    slide,
    outside,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
