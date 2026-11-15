import type { FileSystem as FileSystemService, Scope } from 'effect';

import { findDeck } from '@deckster/vite-plugin';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { DeckBrowser } from '#browser/deck-browser.ts';
import type { DeckPage, PageSlide } from '#browser/deck-page.ts';
import type { DeckServer } from '#server/deck-server.ts';

import { openDeck, type OpenDeckError } from '#browser/open-deck.ts';
import {
  cliError,
  fileSystemError,
  firstLine,
  type BrowserError,
  type CliError,
  type FileSystemError,
  type SlideNotReadyError,
} from '#cli-error.ts';
import { SHOT_FILE_PATTERN, shotFileName } from '#shot/shot-names.ts';
import { CANVAS_SIZE, Workspace } from '#workspace.ts';

/**
 * What to capture and where to put it.
 */
export type ShotOptions = {
  /**
   * The deck folder name.
   */
  deck: string;

  /**
   * One slide, by id or 1-based number; every slide when `undefined`.
   */
  slide: string | undefined;

  /**
   * A brand folder that replaces the deck config's `brand`; `undefined` keeps the deck's own.
   */
  brand: string | undefined;

  /**
   * One PNG per step instead of one per slide.
   */
  steps: boolean;

  /**
   * The absolute output folder.
   */
  outDir: string;

  /**
   * Pixel density: a scale of 2 writes 3840x2160 images.
   */
  scale: number;

  /**
   * Render from this workspace instead of the current one, such as a checkout of an older revision;
   * leave it out for the current workspace.
   */
  workspaceRoot?: string;
};

/**
 * One PNG that was written.
 */
export type ShotFile = {
  /**
   * The absolute path.
   */
  path: string;

  /**
   * The slide id.
   */
  slide: string;

  /**
   * The 1-based slide number, as in the URL hash and the file name.
   */
  number: number;

  /**
   * The step shown, or `null` for the slide's finished state.
   */
  step: number | null;

  /**
   * The image width in pixels: 1920 times the scale.
   */
  width: number;

  /**
   * The image height in pixels: 1080 times the scale.
   */
  height: number;

  /**
   * Why the image shows a broken slide: the error the slide threw or an uncaught page error while
   * it was shown; `null` when it rendered.
   */
  error: string | null;
};

/**
 * What a run wrote, and what went wrong while the deck loaded.
 */
export type ShotResult = {
  /**
   * The brand the deck rendered with.
   */
  brand: string;

  /**
   * The files written, in slide and step order.
   */
  files: ShotFile[];

  /**
   * Uncaught errors the page threw while the deck loaded, before any slide was shown.
   */
  pageErrors: string[];
};

/**
 * Every way taking screenshots can fail.
 */
export type ShotError =
  | OpenDeckError
  | BrowserError
  | CliError
  | FileSystemError
  | SlideNotReadyError;

/**
 * Renders a deck in `?static` mode and writes PNGs of its slides. The output folder is created once
 * the deck is known to exist, before the browser starts, so a bad `--out` fails at once. Without
 * `steps`, each slide is captured at its last step, which shows everything; with `steps`, every
 * step of each slide is captured as `NN-id.stepK.png`. A run over the whole deck first removes
 * older screenshots in the output folder that follow this naming, so removed slides leave nothing
 * behind. A slide that throws is still captured (the image shows the error) and its file carries
 * the error.
 *
 * @param options - What to capture.
 * @returns The files written and the errors the page threw while loading.
 * @throws CliError in the error channel for an unknown slide; FileSystemError when the output
 *   folder cannot be written; DeckBuildError, BrandError or DeckProblemsError for a deck that does
 *   not compile; SlideNotReadyError when a slide never becomes ready.
 */
export const takeShots = Effect.fn('takeShots')(function* (
  options: ShotOptions,
): Effect.fn.Return<
  ShotResult,
  ShotError,
  Workspace | FileSystemService.FileSystem | DeckServer | DeckBrowser | Scope.Scope
> {
  const root = options.workspaceRoot ?? (yield* Workspace).root;
  yield* findDeck(root, options.deck);
  yield* makeOutDir(options.outDir);
  const { deck, brand, page } = yield* openDeck({
    deck: options.deck,
    brand: options.brand,
    scale: options.scale,
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
  });
  const pageErrors = yield* page.takeErrors();
  const listed = yield* manifestSlides(page.slides, deck.slides, options.deck);
  const targets = yield* chooseSlides(listed, options.slide, options.deck);
  if (options.slide === undefined) {
    yield* removeStaleShots(options.outDir);
  }

  const files: ShotFile[] = [];
  for (const slide of targets) {
    const stepCount = yield* page.stepCount(slide.index);
    const steps = options.steps ? Array.from({ length: stepCount }, (_, step) => step) : [null];
    for (const step of steps) {
      const name = shotFileName(slide.index, slide.id, step, deck.slides.length);
      const file = path.join(options.outDir, name);
      yield* assertInside(options.outDir, file);
      const error = yield* capture(page, slide, step ?? stepCount - 1, file);
      files.push({
        path: file,
        slide: slide.id,
        number: slide.index + 1,
        step,
        width: CANVAS_SIZE.width * options.scale,
        height: CANVAS_SIZE.height * options.scale,
        error,
      });
    }
  }

  return { brand: brand.tokens.name, files, pageErrors };
}, Effect.scoped);

/**
 * The page's slides with the ids of the loaded manifest. File names come from the manifest, which
 * the build validated, never from what the page reports about itself.
 *
 * @param pageSlides - The slides `window.__deck` lists.
 * @param manifest - The deck's slides as loaded from disk.
 * @param deck - The deck folder name, for the error.
 * @throws CliError in the error channel when the page lists slides the manifest does not.
 */
const manifestSlides = Effect.fn('manifestSlides')(function* (
  pageSlides: readonly PageSlide[],
  manifest: readonly { readonly id: string }[],
  deck: string,
): Effect.fn.Return<PageSlide[], CliError> {
  const listed: PageSlide[] = [];
  for (const slide of pageSlides) {
    const known = manifest[slide.index];
    if (known === undefined) {
      return yield* cliError(
        `The page of deck "${deck}" lists slide ${slide.index + 1}, which its manifest does not.\n` +
          'Run the command again; if it keeps failing, restart the dev server.',
      );
    }

    listed.push({ ...slide, id: known.id });
  }

  return listed;
});

/**
 * Fails when a path to write is not inside the output folder.
 *
 * @param outDir - The output folder.
 * @param file - The file about to be written.
 * @throws CliError in the error channel when the file would land outside the folder.
 */
const assertInside = Effect.fn('assertInside')(function* (
  outDir: string,
  file: string,
): Effect.fn.Return<void, CliError> {
  const relative = path.relative(outDir, file);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return yield* cliError(
      `The screenshot ${file} would be written outside the output folder ${outDir}, so it was not taken.\n` +
        'Slide ids must be kebab-case; fix the id in the deck config.',
    );
  }
});

/**
 * Shows one step, writes its PNG, and returns why the slide is broken, if it is.
 *
 * @param page - The open deck.
 * @param slide - The slide.
 * @param step - The step to show.
 * @param file - The PNG to write.
 */
const capture = Effect.fn('capture')(function* (
  page: DeckPage,
  slide: PageSlide,
  step: number,
  file: string,
): Effect.fn.Return<string | null, BrowserError | SlideNotReadyError> {
  yield* page.show(slide.index, step);
  yield* page.screenshot(file);
  const problem = yield* page.renderError();
  const thrown = yield* page.takeErrors();
  if (problem !== null) {
    return firstLine(problem.message);
  }

  const [first] = thrown;
  return first === undefined ? null : firstLine(first);
});

/**
 * The slides to capture: every slide, or the one named by id or 1-based number.
 *
 * @param slides - The deck's slides.
 * @param requested - The slide asked for, if any.
 * @param deck - The deck folder name, for the error.
 * @throws CliError in the error channel, listing the valid slides, when no slide matches.
 */
const chooseSlides = Effect.fn('chooseSlides')(function* (
  slides: readonly PageSlide[],
  requested: string | undefined,
  deck: string,
): Effect.fn.Return<PageSlide[], CliError> {
  if (requested === undefined) {
    return [...slides];
  }

  const match = slides.find(
    (slide) => slide.id === requested || String(slide.index + 1) === requested,
  );
  if (match === undefined) {
    const ids = slides.map((slide, index) => `${index + 1} ${slide.id}`).join(', ');
    return yield* cliError(
      `Deck "${deck}" has no slide "${requested}".\nUse a slide id or its 1-based number: ${ids}.`,
    );
  }

  return [match];
});

/**
 * Creates the output folder, before the deck is opened so a bad `--out` fails at once.
 *
 * @param outDir - The output folder.
 * @throws FileSystemError in the error channel when the folder cannot be created.
 */
const makeOutDir = Effect.fn('makeOutDir')(function* (
  outDir: string,
): Effect.fn.Return<void, FileSystemError, FileSystemService.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .makeDirectory(outDir, { recursive: true })
    .pipe(
      Effect.mapError((error) =>
        fileSystemError(
          'create the output folder',
          outDir,
          error,
          'Pass `--out` a folder that can be created, or leave it out to use the default.',
        ),
      ),
    );
});

/**
 * Removes earlier screenshots that follow this tool's naming from the output folder.
 *
 * @param outDir - The output folder.
 * @throws FileSystemError in the error channel when a stale file cannot be removed.
 */
const removeStaleShots = Effect.fn('removeStaleShots')(function* (
  outDir: string,
): Effect.fn.Return<void, FileSystemError, FileSystemService.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs.readDirectory(outDir).pipe(Effect.orElseSucceed(() => []));
  const stale = names.filter((name) => SHOT_FILE_PATTERN.test(name));
  yield* Effect.forEach(
    stale,
    (name) => {
      const file = path.join(outDir, name);
      return fs
        .remove(file)
        .pipe(
          Effect.mapError((error) =>
            fileSystemError(
              'remove the old screenshot',
              file,
              error,
              'Delete it by hand or pick another `--out` folder.',
            ),
          ),
        );
    },
    { concurrency: 'unbounded' },
  );
});
