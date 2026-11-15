import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeFixtureBrandSync } from '#lint/fixture-brands.fixture.ts';
import { WORKSPACE_ROOT } from '#workspace.ts';

/**
 * What a scratch workspace links from the framework's own: the brands, the TypeScript base config
 * and the CLI's dependencies, which resolve `@deckster/*` for its decks.
 */
const LINKS = [
  ['tsconfig.base.json', 'tsconfig.base.json'],
  ['packages/cli/node_modules', 'node_modules'],
] as const;

/**
 * Makes a scratch workspace in the temp folder with the framework's brands and packages linked in
 * and an empty `decks/`, for tests that render decks they write or copy there.
 *
 * @param prefix - The start of the folder's name.
 * @param fixtureBrands - Fixture brands (`FIXTURE_BRANDS`) to write beside the framework's, such as
 *   `wide-sans`; the framework's brands are linked one by one then.
 * @returns The workspace root, a real path (Vite resolves real paths, and on macOS the temp folder
 *   is a symlink), to pass to `Workspace.at` and remove after the test.
 */
export function scratchWorkspace(prefix: string, fixtureBrands: readonly string[] = []): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  for (const [target, link] of LINKS) {
    fs.symlinkSync(path.join(WORKSPACE_ROOT, target), path.join(root, link));
  }

  const brands = path.join(WORKSPACE_ROOT, 'brands');
  if (fixtureBrands.length === 0) {
    fs.symlinkSync(brands, path.join(root, 'brands'));
  } else {
    fs.mkdirSync(path.join(root, 'brands'));
    for (const entry of fs.readdirSync(brands, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        fs.symlinkSync(path.join(brands, entry.name), path.join(root, 'brands', entry.name));
      }
    }

    for (const name of fixtureBrands) {
      writeFixtureBrandSync(path.join(root, 'brands'), name);
    }
  }

  fs.mkdirSync(path.join(root, 'decks'));
  return root;
}
