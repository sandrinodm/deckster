import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import fs from 'node:fs';
import path from 'node:path';

import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';

/**
 * The brand the eject tests write layouts into: a copy of the default brand under another name.
 */
export const EJECT_BRAND = 'ejected';

/**
 * The brand the copy is made from.
 */
const SOURCE_BRAND = 'default';

/**
 * The folders of a deck or brand that are not copied: installed packages and build output.
 */
const SKIPPED_FOLDERS: ReadonlySet<string> = new Set(['node_modules', 'dist']);

/**
 * Makes a scratch workspace for the eject tests. Its `brands/` is a real folder, never a link to
 * the repository's, so an eject writes nothing into the repository: the framework's brands are
 * linked one by one, and {@link EJECT_BRAND} is a real copy of the default brand. The named decks
 * of the repository are copied into `decks/`.
 *
 * @param prefix - The temp folder's prefix.
 * @param decks - Deck folder names under the repository's `decks/`.
 * @returns The absolute workspace root; the caller removes it.
 */
export function ejectWorkspace(prefix: string, decks: readonly string[] = []): string {
  const root = scratchWorkspace(prefix);
  const brands = path.join(root, 'brands');
  const frameworkBrands = path.join(FRAMEWORK_ROOT, 'brands');
  fs.unlinkSync(brands);
  fs.mkdirSync(brands);
  for (const entry of fs.readdirSync(frameworkBrands, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      fs.symlinkSync(path.join(frameworkBrands, entry.name), path.join(brands, entry.name));
    }
  }

  const brandDir = path.join(brands, EJECT_BRAND);
  copyFolder(path.join(frameworkBrands, SOURCE_BRAND), brandDir);
  const brandFile = path.join(brandDir, 'brand.ts');
  const brandSource = fs.readFileSync(brandFile, 'utf8');
  fs.writeFileSync(
    brandFile,
    brandSource.replace(`name: '${SOURCE_BRAND}'`, `name: '${EJECT_BRAND}'`),
  );
  for (const deck of decks) {
    copyFolder(path.join(FRAMEWORK_ROOT, 'decks', deck), path.join(root, 'decks', deck));
  }

  return root;
}

/**
 * Copies a deck or brand folder without its installed packages and build output.
 */
function copyFolder(from: string, to: string): void {
  fs.cpSync(from, to, {
    recursive: true,
    filter: (source) => !SKIPPED_FOLDERS.has(path.basename(source)),
  });
}
