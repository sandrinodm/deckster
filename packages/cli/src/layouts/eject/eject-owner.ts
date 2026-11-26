import type { BrandError } from '@deckster/brand';

import { BRANDS_DIR, loadBrand, type LoadedBrand } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import {
  deckBrandName,
  discoverDecks,
  findDeck,
  LAYOUTS_DIR,
  loadDeck,
  type DeckBuildError,
  type DeckLocation,
} from '@deckster/vite-plugin';
import { Effect, FileSystem, Option } from 'effect';
import path from 'node:path';

import type { LayoutsOwner } from '#layouts/layouts-owner.ts';

import { cliError, fileSystemError, type CliError, type FileSystemError } from '#cli-error.ts';

/**
 * The folder installed packages live in; nothing under it is the user's to write layouts into.
 */
const INSTALLED_PACKAGES_DIR = 'node_modules';

/**
 * The brand or deck whose `layouts/` folder `deckster layouts new`, `eject` and `diff` work in.
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
   * The absolute path of the brand's or the deck's folder.
   */
  readonly dir: string;

  /**
   * The absolute path of the owner's `layouts/` folder, which may not exist yet.
   */
  readonly layoutsDir: string;
};

/**
 * Where a brand or deck folder is, before and after links are followed, for
 * {@link isWorkspaceFolder}.
 */
export type FolderPlace = {
  /**
   * The absolute workspace root.
   */
  readonly root: string;

  /**
   * The workspace root with links followed.
   */
  readonly realRoot: string;

  /**
   * The brand or deck.
   */
  readonly owner: LayoutsOwner;

  /**
   * The absolute path the brand or deck was loaded from.
   */
  readonly dir: string;

  /**
   * That path with links followed.
   */
  readonly realDir: string;
};

/**
 * Finds the owner's folder and makes sure it is one of this workspace (see
 * {@link isWorkspaceFolder}): the framework's own brands, brands reached through a link that leaves
 * the workspace and anything under `node_modules` are not the user's to write layouts into.
 *
 * @param root - The absolute workspace root.
 * @param owner - The brand or deck.
 * @returns The owner's brand, deck and folders.
 * @throws BrandError | DeckBuildError in the error channel when the brand or deck does not load;
 *   CliError when its folder is not the workspace's own.
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
  if (!isWorkspaceFolder({ root, realRoot, owner, dir, realDir })) {
    return yield* cliError(
      `The ${owner.kind} ${owner.name} is not a folder of this workspace (it is ${realDir}), so ` +
        'its layouts are not yours to change.\n' +
        (owner.kind === 'brand'
          ? 'Use a brand of your own under brands/, or a deck with `--deck`.'
          : 'Use a deck under decks/ in this workspace.'),
    );
  }

  return { owner, brand, deck, dir, layoutsDir: path.join(dir, LAYOUTS_DIR) };
});

/**
 * Whether a brand or deck folder is the workspace's own: once links are followed it is inside the
 * workspace and not under `node_modules`, and a brand was found at `brands/<name>` of the workspace
 * rather than as the framework's built-in brand, which a CLI installed in the workspace keeps under
 * its own `node_modules`.
 *
 * @param place - The folder before and after links are followed.
 */
export function isWorkspaceFolder(place: FolderPlace): boolean {
  const { root, realRoot, owner, dir, realDir } = place;
  if (owner.kind === 'brand' && dir !== path.join(root, BRANDS_DIR, owner.name)) {
    return false;
  }

  const relative = path.relative(realRoot, realDir);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  return !relative.split(path.sep).includes(INSTALLED_PACKAGES_DIR);
}

/**
 * Fails when a path a command is about to write runs through a link, or through a file where a
 * folder belongs, below the owner's folder. The owner's folder itself was checked by
 * {@link findOwnerFolder}; what is below it (`layouts/`, `layouts/<name>/`, `layouts/_shared/` and
 * the files in them) is checked here, so a write cannot leave the workspace through a link there.
 * Paths that do not exist yet pass.
 *
 * With `use` set to `read`, the paths are about to be read rather than written (as `layouts diff`
 * reads `.eject/`): only a link is refused, and a file where a folder belongs is left for the
 * reader to report as missing.
 *
 * @param root - The absolute workspace root, for the message.
 * @param folder - The owner's folder.
 * @param targets - Absolute paths below the owner's folder.
 * @param use - Whether the paths are written or read.
 * @throws CliError in the error channel for a link or, when writing, a misplaced file;
 *   FileSystemError when a path cannot be looked at.
 */
export const checkWriteTargets = Effect.fn('checkWriteTargets')(function* (
  root: string,
  folder: OwnerFolder,
  targets: readonly string[],
  use: 'write' | 'read' = 'write',
): Effect.fn.Return<void, CliError | FileSystemError, FileSystem.FileSystem> {
  for (const target of targets) {
    const steps = path.relative(folder.dir, target).split(path.sep);
    for (const [index, step] of steps.entries()) {
      const at = path.join(folder.dir, ...steps.slice(0, index), step);
      const type = yield* entryType(at);
      if (type === undefined) {
        break;
      }

      if (type === 'SymbolicLink') {
        return yield* cliError(
          `${displayPath(root, at)} is a link, and deckster does not ${use} layouts through a ` +
            'link: it could point outside the workspace.\n' +
            'Replace the link with a real folder or file, then run the command again.',
        );
      }

      if (use === 'write' && index < steps.length - 1 && type !== 'Directory') {
        return yield* cliError(
          `${displayPath(root, at)} is a file where a folder belongs, so nothing can be written ` +
            'under it.\nMove the file away, then run the command again.',
        );
      }
    }
  }
});

/**
 * The names among the given ones that a folder already has an entry for, matched without regard to
 * letter case: on a case-insensitive file system `Title/` is where `title/` would be written.
 *
 * @param dir - The folder, such as a `layouts/`; a missing or unreadable one has no entries.
 * @param names - The names looked for.
 * @returns The entry found for each name that has one, by name.
 */
export const existingEntries = Effect.fn('existingEntries')(function* (
  dir: string,
  names: readonly string[],
): Effect.fn.Return<ReadonlyMap<string, string>, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const entries = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
  const found = new Map<string, string>();
  for (const name of names) {
    const entry = entries.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (entry !== undefined) {
      found.set(name, entry);
    }
  }

  return found;
});

/**
 * A layout folder of a deck that a layout of the deck's brand would clash with.
 */
export type DeckClash = {
  /**
   * The name asked for.
   */
  readonly name: string;

  /**
   * The deck's folder entry for it, which may differ from the name in letter case.
   */
  readonly entry: string;

  /**
   * The deck.
   */
  readonly deck: DeckLocation;
};

/**
 * The layout folders of a brand's decks that a new layout of the brand with one of the names would
 * clash with: the deck's layout would then clash with the brand's, and every slide on it would
 * fail. Only decks with a folder of one of the names have their config loaded; a deck whose config
 * does not load is not one of the brand's as far as this check can tell, and is passed over. A deck
 * owner has none.
 *
 * @param root - The absolute workspace root.
 * @param folder - The owner's folder.
 * @param names - The names of the layouts about to be written.
 * @returns Each clash, deck by deck and in the order of the names.
 */
export const findDeckClashes = Effect.fn('findDeckClashes')(function* (
  root: string,
  folder: OwnerFolder,
  names: readonly string[],
): Effect.fn.Return<readonly DeckClash[], never, FileSystem.FileSystem> {
  if (folder.deck !== undefined) {
    return [];
  }

  const brandName = folder.owner.name;
  const clashes: DeckClash[] = [];
  for (const deck of yield* discoverDecks(root)) {
    const taken = yield* existingEntries(path.join(deck.dir, LAYOUTS_DIR), names);
    if (taken.size === 0) {
      continue;
    }

    const loaded = yield* loadDeck(root, deck).pipe(Effect.option);
    if (Option.isNone(loaded) || deckBrandName(loaded.value.config) !== brandName) {
      continue;
    }

    for (const [name, entry] of taken) {
      clashes.push({ name, entry, deck });
    }
  }

  return clashes;
});

/**
 * Fails when a new layout of a brand would take a name one of the brand's decks already gives a
 * layout folder, as {@link findDeckClashes} finds. Nothing is checked for a deck owner.
 *
 * @param root - The absolute workspace root.
 * @param folder - The owner's folder.
 * @param names - The names of the layouts about to be written.
 * @throws CliError in the error channel naming the deck's folder.
 */
export const checkDeckLayoutsFree = Effect.fn('checkDeckLayoutsFree')(function* (
  root: string,
  folder: OwnerFolder,
  names: readonly string[],
): Effect.fn.Return<void, CliError, FileSystem.FileSystem> {
  const [first] = yield* findDeckClashes(root, folder, names);
  if (first === undefined) {
    return;
  }

  const { name, entry, deck } = first;
  const brandName = folder.owner.name;
  return yield* cliError(
    `${displayPath(root, path.join(deck.dir, LAYOUTS_DIR, entry))}/ is a layout of the ` +
      `${deck.id} deck, which is on the ${brandName} brand, so a ${brandName} layout named ` +
      `"${name}" would clash with it and the deck's slides on it would fail.\n` +
      "Rename or remove the deck's layout first, or give the brand's layout another name. " +
      `\`${deckCommand()} layouts ${deck.id}\` lists the deck's layouts.`,
  );
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

/**
 * What is at a path without following a link there; `undefined` when nothing is.
 */
const entryType = Effect.fn('entryType')(function* (
  at: string,
): Effect.fn.Return<FileSystem.File.Type | undefined, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.lstat(at).pipe(
    Effect.map((info) => info.type),
    Effect.catch((error) =>
      error.reason._tag === 'NotFound'
        ? Effect.succeed(undefined)
        : Effect.fail(fileSystemError('look at', at, error, 'Check that the folder is readable.')),
    ),
  );
});
