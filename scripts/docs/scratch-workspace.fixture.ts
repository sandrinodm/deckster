import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The repository checkout this package sits in.
 */
export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * What a scratch workspace links from the repository: the brands, the TypeScript base config and
 * this package's dependencies, which resolve `@deckster/*` for its decks.
 */
const LINKS = [
  ['brands', 'brands'],
  ['tsconfig.base.json', 'tsconfig.base.json'],
  ['scripts/docs/node_modules', 'node_modules'],
] as const;

/**
 * Makes a scratch workspace in the temp folder with the repository's brands and packages linked in
 * and an empty `decks/`, for tests that write their own decks.
 *
 * @param prefix - The start of the folder's name.
 * @returns The workspace root, a real path (on macOS the temp folder is a symlink), to remove after
 *   the test.
 */
export function scratchWorkspace(prefix: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  for (const [target, link] of LINKS) {
    fs.symlinkSync(path.join(REPO_ROOT, target), path.join(root, link));
  }

  fs.mkdirSync(path.join(root, 'decks'));
  return root;
}
