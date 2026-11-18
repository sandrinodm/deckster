import { findLayoutInBrands } from '@deckster/brand/node';
import { readSlideLayout } from '@deckster/vite-plugin';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { BrandFallback } from '#lint/types.ts';

/**
 * Finds the slides of a deck whose source names a layout the active brand lacks but other brands in
 * the workspace define. The build renders those slides with the layout's fallback, so only the
 * source says what was asked for.
 *
 * @param input - The workspace, the deck's folder, the active brand and the slides' files.
 * @returns The fallbacks by slide file (relative to the deck folder); slides that name a layout the
 *   active catalog has, or one no brand defines, are left out. A slide file that cannot be read is
 *   skipped, because the build already reports it.
 */
export const findBrandFallbacks = Effect.fn('findBrandFallbacks')(function* (input: {
  workspaceRoot: string;
  deckDir: string;
  brand: string;
  files: readonly string[];
  hasLayout: (name: string) => boolean;
}): Effect.fn.Return<ReadonlyMap<string, BrandFallback>, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const found = new Map<string, BrandFallback>();
  for (const file of input.files) {
    const absolute = path.join(input.deckDir, file);
    const code = yield* fs.readFileString(absolute).pipe(Effect.orElseSucceed(() => ''));
    const sourceLayout = readSlideLayout(absolute, code);
    if (sourceLayout === undefined || input.hasLayout(sourceLayout)) {
      continue;
    }

    const brands = yield* findLayoutInBrands(input.workspaceRoot, sourceLayout, input.brand);
    if (brands.length > 0) {
      found.set(file, { sourceLayout, brands });
    }
  }

  return found;
});
