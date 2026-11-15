import { describeProblem } from '@deckster/brand';
import { loadBrand, type LoadedBrand } from '@deckster/brand/node';
import { Effect, type FileSystem } from 'effect';

import { deckBuildError, type DeckBuildError } from '#errors.ts';

/**
 * Loads and compiles the brand a deck uses. Brand failures become `DeckBuildError`s, so the CLI
 * prints them without a stack trace and Vite's overlay links to the brand file.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param name - The brand folder name under `brands/`.
 * @throws DeckBuildError in the error channel, naming the brand file, each field at fault and its
 *   fix.
 */
export const loadDeckBrand = Effect.fn('loadDeckBrand')(function* (
  workspaceRoot: string,
  name: string,
): Effect.fn.Return<LoadedBrand, DeckBuildError, FileSystem.FileSystem> {
  return yield* loadBrand(workspaceRoot, name).pipe(
    Effect.mapError((error) =>
      deckBuildError({
        file: error.file ?? workspaceRoot,
        displayPath: error.source,
        summary: error.summary,
        problems: error.problems.map((problem) => ({
          message: describeProblem(problem),
          fix: problem.fix,
        })),
      }),
    ),
  );
});
