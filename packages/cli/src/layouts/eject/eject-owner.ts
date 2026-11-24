import type { BrandError } from '@deckster/brand';

import { loadBrand, type LoadedBrand } from '@deckster/brand/node';
import {
  deckBrandName,
  findDeck,
  LAYOUTS_DIR,
  loadDeck,
  type DeckBuildError,
  type DeckLocation,
} from '@deckster/vite-plugin';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { LayoutsOwner } from '#layouts/layouts-owner.ts';

import { cliError, type CliError } from '#cli-error.ts';

/**
 * The brand or deck whose `layouts/` folder `deckster layouts eject` and `deckster layouts diff`
 * work in.
 */
export type OwnerFolder = {
  /**
   * The brand or the deck, as the command named it.
   */
  readonly owner: LayoutsOwner;

  /**
   * The brand itself, or the brand of the deck.
   */
  readonly brand: LoadedBrand;

  /**
   * The deck, when the owner is one.
   */
  readonly deck: DeckLocation | undefined;

  /**
   * The absolute path of the owner's `layouts/` folder, which may not exist yet.
   */
  readonly layoutsDir: string;
};

/**
 * Finds the owner's folder and makes sure it is one of this workspace: the framework's own brands
 * (in an installed CLI) and brands reached through a link that leaves the workspace are not the
 * user's to write layouts into.
 *
 * @param root - The absolute workspace root.
 * @param owner - The brand or deck.
 * @returns The owner's brand, deck and `layouts/` folder.
 * @throws BrandError | DeckBuildError in the error channel when the brand or deck does not load;
 *   CliError when its folder is outside the workspace.
 */
export const findOwnerFolder = Effect.fn('findOwnerFolder')(function* (
  root: string,
  owner: LayoutsOwner,
): Effect.fn.Return<OwnerFolder, BrandError | CliError | DeckBuildError, FileSystem.FileSystem> {
  const { brand, deck } = yield* loadOwner(root, owner);
  const dir = deck?.dir ?? brand.location.dir;
  const fs = yield* FileSystem.FileSystem;
  const realRoot = yield* fs.realPath(root).pipe(Effect.orElseSucceed(() => root));
  const realDir = yield* fs.realPath(dir).pipe(Effect.orElseSucceed(() => dir));
  const relative = path.relative(realRoot, realDir);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return yield* cliError(
      `The ${owner.kind} ${owner.name} is not a folder of this workspace (it is ${realDir}), so ` +
        'its layouts are not yours to change.\n' +
        (owner.kind === 'brand'
          ? 'Use a brand of your own under brands/, or a deck with `--deck`.'
          : 'Use a deck under decks/ in this workspace.'),
    );
  }

  return { owner, brand, deck, layoutsDir: path.join(dir, LAYOUTS_DIR) };
});

/**
 * A path as authors see it: relative to the workspace, with forward slashes.
 *
 * @param root - The absolute workspace root.
 * @param file - The absolute path.
 */
export function displayPath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

/**
 * Loads the brand, or the deck and its brand.
 */
const loadOwner = Effect.fn('loadOwner')(function* (
  root: string,
  owner: LayoutsOwner,
): Effect.fn.Return<
  { brand: LoadedBrand; deck: DeckLocation | undefined },
  BrandError | DeckBuildError,
  FileSystem.FileSystem
> {
  if (owner.kind === 'brand') {
    return { brand: yield* loadBrand(root, owner.name), deck: undefined };
  }

  const deck = yield* findDeck(root, owner.name);
  const loaded = yield* loadDeck(root, deck);
  return { brand: yield* loadBrand(root, deckBrandName(loaded.config)), deck };
});
