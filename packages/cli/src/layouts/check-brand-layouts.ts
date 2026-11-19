import { LAYOUTS_FILE, type BrandProblem, type BrandTokens } from '@deckster/brand';
import { checkBrandLayouts, type BrandLayoutCheck } from '@deckster/kit/catalog';
import { loadLayoutCatalog, type DeckBuildError } from '@deckster/vite-plugin';
import { Effect } from 'effect';
import path from 'node:path';

/**
 * A finding with the workspace-relative brand or layouts file it describes.
 */
export type BrandFileProblem = BrandProblem & { file: string };

/**
 * Checks the brand's layouts against the engine and kit contracts that decks use. Returns no
 * findings for a brand without layouts and fails if the catalog cannot load.
 */
export const checkCatalogLayouts = Effect.fn('checkCatalogLayouts')(function* (
  layouts: BrandTokens['layouts'],
): Effect.fn.Return<BrandLayoutCheck, DeckBuildError> {
  if (layouts.length === 0) {
    return { errors: [], warnings: [] };
  }

  const catalog = yield* loadLayoutCatalog();
  return checkBrandLayouts(
    layouts,
    [...catalog.values()].map((layout) => layout.contract),
  );
});

/**
 * The display path of `layouts.ts` next to a workspace-relative `brand.ts`.
 */
export function layoutsDisplayPath(brandFile: string): string {
  return path.posix.join(path.posix.dirname(brandFile), LAYOUTS_FILE);
}

/**
 * Attaches a display path to a finding, using `layouts.ts` for a layout field when present.
 */
export function brandProblemWithFile(
  problem: BrandProblem,
  files: { file: string; layoutsFile?: string },
): BrandFileProblem {
  const file = problem.path.startsWith('layouts[') ? (files.layoutsFile ?? files.file) : files.file;
  return { ...problem, file };
}
