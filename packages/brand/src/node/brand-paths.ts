import { Effect, FileSystem } from 'effect';
import path from 'node:path';

/**
 * The folder under the workspace root that holds one folder per brand.
 */
export const BRANDS_DIR = 'brands';

/**
 * The token file every brand folder contains.
 */
export const BRAND_FILE = 'brand.ts';

/**
 * Where a brand lives on disk.
 */
export type BrandLocation = {
  /**
   * The brand folder name, such as `acme`.
   */
  name: string;

  /**
   * The absolute brand folder.
   */
  dir: string;

  /**
   * The absolute path of the brand's `brand.ts`.
   */
  file: string;

  /**
   * The brand file relative to the workspace, for messages: `brands/acme/brand.ts`.
   */
  displayPath: string;
};

/**
 * Builds the paths of a brand from its folder name.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param name - The brand folder name.
 */
export function brandLocation(workspaceRoot: string, name: string): BrandLocation {
  const dir = path.join(workspaceRoot, BRANDS_DIR, name);
  return {
    name,
    dir,
    file: path.join(dir, BRAND_FILE),
    displayPath: `${BRANDS_DIR}/${name}/${BRAND_FILE}`,
  };
}

/**
 * Lists the brands in a workspace: each folder under `brands/` with a `brand.ts`.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @returns Brand names, sorted; empty when `brands/` does not exist or cannot be read.
 */
export const listBrands = Effect.fn('listBrands')(function* (
  workspaceRoot: string,
): Effect.fn.Return<string[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const entries = yield* fs
    .readDirectoryEntries(path.join(workspaceRoot, BRANDS_DIR))
    .pipe(Effect.orElseSucceed(() => []));
  const names = entries.filter((entry) => entry.type === 'Directory').map((entry) => entry.name);
  const present = yield* Effect.forEach(
    names,
    (name) => fileExists(brandLocation(workspaceRoot, name).file),
    { concurrency: 'unbounded' },
  );
  return names.filter((_, index) => present[index]).sort();
});

/**
 * Whether a file exists. Any failure to check, such as a permission error, counts as missing.
 *
 * @param file - An absolute path.
 */
export const fileExists = Effect.fn('fileExists')(function* (
  file: string,
): Effect.fn.Return<boolean, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
});
