import { Effect, Result } from 'effect';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { BRANDS_DIR } from '#node/brand-paths.ts';
import { LAYOUTS_CALLEE, readStaticModule } from '#node/static-module.ts';
import { LAYOUTS_FILE } from '#schema/layout-schema.ts';
import { isSafeName } from '#schema/safe-name.ts';
import { decodeLayouts } from '#validate/decode-layouts.ts';

/**
 * A brand whose `layouts.ts` defines a layout, and the kit layout that layout falls back to.
 */
export type LayoutInBrand = {
  /**
   * The brand folder name.
   */
  brand: string;

  /**
   * The kit layout the layout falls back to.
   */
  fallback: string;
};

/**
 * What was read from one layouts file, with the modification time it was read at.
 */
type CachedLayouts = {
  /**
   * The file's modification time in milliseconds.
   */
  mtimeMs: number;

  /**
   * The fallback of each layout, by layout name; empty when the file could not be read.
   */
  fallbacks: ReadonlyMap<string, string>;
};

/**
 * The layouts files read so far, by absolute path, so a slide transform does not parse every brand
 * again for each slide.
 */
const CACHE = new Map<string, CachedLayouts>();

/**
 * Every brand in the workspace, other than `except`, whose `layouts.ts` defines a layout with this
 * name. It reads each file as data without running it, so it never imports another brand's code,
 * and it loads no fonts and resolves nothing else of the brand. A file that cannot be read or
 * decoded, and a brand without one, is skipped; so is a brand folder that is a symlink, as
 * `listBrands` skips it. Results are cached by file and modification time.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param layoutName - The layout name a slide asks for.
 * @param except - The brand folder to leave out, normally the active brand.
 * @returns The matches, sorted by brand name; empty when none define the layout.
 */
export const findLayoutInBrands = Effect.fn('findLayoutInBrands')(function* (
  workspaceRoot: string,
  layoutName: string,
  except: string,
): Effect.fn.Return<readonly LayoutInBrand[]> {
  const brands = yield* Effect.promise(() => listBrandFolders(workspaceRoot));
  const found = yield* Effect.forEach(
    brands.filter((brand) => brand !== except),
    (brand) =>
      Effect.promise(async () => {
        const fallbacks = await readLayoutFallbacks(
          path.join(workspaceRoot, BRANDS_DIR, brand, LAYOUTS_FILE),
        );
        const fallback = fallbacks.get(layoutName);
        return fallback === undefined ? [] : [{ brand, fallback }];
      }),
    // A workspace has a handful of brands.
    { concurrency: 'unbounded' },
  );
  return found.flat();
});

/**
 * The folder names under `brands/`, sorted; empty when `brands/` cannot be read.
 *
 * @param workspaceRoot - The absolute workspace root.
 */
async function listBrandFolders(workspaceRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(workspaceRoot, BRANDS_DIR), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && isSafeName(entry.name))
      .map((entry) => entry.name)
      .toSorted();
  } catch {
    return [];
  }
}

/**
 * The fallback of each layout a layouts file defines, from the cache when the file has not changed.
 *
 * @param file - The absolute path of a `layouts.ts`.
 */
async function readLayoutFallbacks(file: string): Promise<ReadonlyMap<string, string>> {
  try {
    const { mtimeMs } = await stat(file);
    const cached = CACHE.get(file);
    if (cached?.mtimeMs === mtimeMs) {
      return cached.fallbacks;
    }

    const fallbacks = parseFallbacks(await readFile(file, 'utf8'));
    CACHE.set(file, { mtimeMs, fallbacks });
    return fallbacks;
  } catch {
    return new Map();
  }
}

/**
 * Reads the text of a layouts file as data and maps each layout name to its fallback.
 *
 * @param text - The file's content.
 * @returns The map; empty when the file is more than a data literal or does not decode.
 */
function parseFallbacks(text: string): ReadonlyMap<string, string> {
  const read = readStaticModule(text, LAYOUTS_CALLEE);
  if (!read.ok) {
    return new Map();
  }

  const decoded = decodeLayouts(read.value);
  return Result.isSuccess(decoded)
    ? new Map(decoded.success.map((layout) => [layout.name, layout.fallback]))
    : new Map();
}

/**
 * Forgets every cached layouts file, for tests.
 */
export function resetLayoutCache(): void {
  CACHE.clear();
}
