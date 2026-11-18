import {
  DECK_CONFIG_CALLEE,
  FRAMEWORK_INSTALLED,
  gatedLoad,
  isCodeHeld,
  recoverTurnGuard,
  rememberLoaded,
} from '@deckster/brand/node';
import { DECK_CONFIG_HINTS, DeckConfig } from '@deckster/engine/config';
import { Effect, FileSystem, Option, Predicate } from 'effect';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { checkShownSlides } from '#decks/check-shown-slides.ts';
import { displayPath, SLIDES_DIR, type DeckLocation } from '#decks/deck-paths.ts';
import { resolveSlideOrder, type SlideFile } from '#decks/resolve-slides.ts';
import { invalidSlideList, unreadableFile, type DeckBuildError, type FileRef } from '#errors.ts';
import { decodeFields, describeValue } from '#validation/decode-fields.ts';

/**
 * What a deck config is called in messages.
 */
const WHAT = 'deck config';

/**
 * The fix for a config whose default export is missing or cannot be read.
 */
const CONFIG_SHAPE_FIX = 'Export the config as `export default defineDeck({ title, slides })`.';

/**
 * The fix for a config that imports a package Node cannot find, usually because a new deck has not
 * been linked into the workspace yet.
 */
const MISSING_PACKAGE_FIX = FRAMEWORK_INSTALLED
  ? "Install the package in the workspace folder (`npm install <package>`), where the deck's " +
    'files can find it, then run the command again.'
  : "Run `pnpm install` at the workspace root so the deck's dependencies are linked (a deck made " +
    'with `deck new` needs this once), then run the command again. If the package is not in the ' +
    "deck's package.json, add it there first.";

/**
 * The code Node gives an import of a package it cannot find.
 */
const MODULE_NOT_FOUND_CODE = 'ERR_MODULE_NOT_FOUND';

/**
 * A listed slide with its absolute path.
 */
export type LoadedSlide = SlideFile & {
  /**
   * The absolute path of the slide file.
   */
  file: string;
};

/**
 * A deck whose config is valid and whose listed slides all exist.
 */
export type LoadedDeck = {
  /**
   * Where the deck lives on disk.
   */
  location: DeckLocation;

  /**
   * The validated deck config, with defaults applied.
   */
  config: DeckConfig;

  /**
   * The listed slides, in manifest order.
   */
  slides: LoadedSlide[];

  /**
   * Non-fatal findings, such as slide files the manifest does not list.
   */
  warnings: string[];
};

/**
 * Reads and validates a deck: its `deck.config.ts` and the slide files it lists, in order. The
 * config is imported fresh whenever it changes on disk.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param location - The deck to load.
 * @throws DeckBuildError in the error channel, for a config that fails to import or validate, a
 *   missing `slides/` folder, a slide list that does not match the files, or a deck whose every
 *   slide is hidden. These fail here, before any server starts, so every command reports them
 *   alike.
 */
export const loadDeck = Effect.fn('loadDeck')(function* (
  workspaceRoot: string,
  location: DeckLocation,
): Effect.fn.Return<LoadedDeck, DeckBuildError, FileSystem.FileSystem> {
  const ref = {
    file: location.configFile,
    displayPath: displayPath(workspaceRoot, location.configFile),
  };
  const config = yield* loadDeckConfig(workspaceRoot, location, ref);
  const fileNames = yield* listSlideFiles(location, ref);
  const order = resolveSlideOrder(config.slides, fileNames);
  if (order.problems.length > 0) {
    return yield* invalidSlideList(ref, order.problems);
  }

  const slides = order.slides.map((slide) => ({
    ...slide,
    file: path.join(location.slidesDir, slide.fileName),
  }));
  const deck = { location, config, slides, warnings: order.warnings };
  yield* checkShownSlides(workspaceRoot, deck);
  return deck;
});

/**
 * Imports `deck.config.ts` and validates its default export.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param location - The deck.
 * @param ref - The config file.
 */
const loadDeckConfig = Effect.fn('loadDeckConfig')(function* (
  workspaceRoot: string,
  location: DeckLocation,
  ref: FileRef,
): Effect.fn.Return<DeckConfig, DeckBuildError, FileSystem.FileSystem> {
  const exported = yield* importConfig(workspaceRoot, location, ref);
  if (!Predicate.isObject(exported)) {
    return yield* unreadableFile(ref, WHAT, {
      message: `The default export is ${describeValue(exported)}, not a deck config.`,
      fix: CONFIG_SHAPE_FIX,
    });
  }

  return yield* decodeFields(exported, {
    schema: DeckConfig,
    hints: DECK_CONFIG_HINTS,
    what: WHAT,
    ref,
  });
});

/**
 * Imports the config file and returns its default export. The modification time in the URL makes
 * Node import an edited config again. While an agent turn on the deck is in flight in this process
 * the config is never imported (`gatedLoad` from `@deckster/brand/node`): the config as the turn
 * found it (or with the deck tools' slide-list edits) is read as data without running it, and
 * anything else keeps the value loaded last. Otherwise, an agent turn that a crash or a kill left
 * unfinished is finished first (`recoverTurnGuard` puts the deck back as it was before that turn),
 * so a config the turn changed is never imported.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param location - The deck.
 * @param ref - The config file.
 */
const importConfig = Effect.fn('importConfig')(function* (
  workspaceRoot: string,
  location: DeckLocation,
  ref: FileRef,
): Effect.fn.Return<unknown, DeckBuildError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  if (!isCodeHeld(ref.file)) {
    yield* recoverTurnGuard(workspaceRoot, location.id).pipe(
      Effect.mapError((error) => {
        const [message = error.message, fix = ''] = error.message.split('\n');
        return unreadableFile(ref, WHAT, { message, fix });
      }),
    );
  }

  const text = yield* fs
    .readFileString(ref.file)
    .pipe(
      Effect.mapError((error) =>
        unreadableFile(ref, WHAT, { message: error.message, fix: CONFIG_SHAPE_FIX }),
      ),
    );
  const gate = gatedLoad(ref.file, text, DECK_CONFIG_CALLEE);
  if (gate.kind === 'value') {
    return gate.value;
  }

  if (gate.kind === 'held') {
    return yield* unreadableFile(ref, WHAT, {
      message:
        'An agent turn on this deck is in flight, so the config is not loaded until it ends.',
      fix: 'Wait for the turn to end; the config is loaded again then.',
    });
  }

  const info = yield* Effect.orDie(fs.stat(ref.file));
  const mtimeMs = Option.match(info.mtime, { onNone: () => 0, onSome: (date) => date.getTime() });
  const url = `${pathToFileURL(ref.file).href}?mtime=${mtimeMs}`;
  const loaded = yield* Effect.tryPromise({
    try: (): Promise<unknown> => import(/* @vite-ignore */ url),
    catch: (error) =>
      unreadableFile(ref, WHAT, {
        message: `Importing it failed: ${error instanceof Error ? error.message : String(error)}`,
        fix: isMissingPackage(error) ? MISSING_PACKAGE_FIX : `Fix that error. ${CONFIG_SHAPE_FIX}`,
      }),
  });
  const exported = Predicate.isObject(loaded) ? loaded.default : undefined;
  rememberLoaded(ref.file, exported);
  return exported;
});

/**
 * The names of the files in the deck's `slides/` folder.
 *
 * @param location - The deck.
 * @param ref - The config file, named in the error when the folder is missing.
 */
const listSlideFiles = Effect.fn('listSlideFiles')(function* (
  location: DeckLocation,
  ref: FileRef,
): Effect.fn.Return<string[], DeckBuildError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const entries = yield* fs.readDirectoryEntries(location.slidesDir).pipe(
    Effect.mapError(() =>
      unreadableFile(ref, WHAT, {
        message: `The deck has no ${SLIDES_DIR}/ folder.`,
        fix: `Create ${SLIDES_DIR}/ next to deck.config.ts with one .mdx or .tsx file per slide.`,
      }),
    ),
  );
  return entries.filter((entry) => entry.type === 'File').map((entry) => entry.name);
});

/**
 * Whether an import failed because a package or file it names cannot be found.
 *
 * @param error - What the import threw.
 */
function isMissingPackage(error: unknown): boolean {
  return Predicate.hasProperty(error, 'code') && error.code === MODULE_NOT_FOUND_CODE;
}
