import { DEFAULT_BRAND } from '@deckster/brand';
import { loadBrand } from '@deckster/brand/node';
import { loadDeck, type DeckLocation } from '@deckster/vite-plugin';
import { Console, Effect, Exit, FileSystem } from 'effect';
import path from 'node:path';

import type { CommandError, CommandServices } from '#command.ts';
import type { GalleryEntry } from '#site/render-gallery.ts';

import { fileSystemError, firstLine, type FileSystemError } from '#cli-error.ts';
import { takeShots } from '#shot/take-shots.ts';
import { buildDeck } from '#site/build-deck.ts';
import { renderGallery } from '#site/render-gallery.ts';
import {
  checkReplaceable,
  checkSiteFolder,
  createSiteTransaction,
  removeSiteTransaction,
  SITE_MARKER,
  swapSite,
} from '#site/site-folder.ts';
import { Workspace } from '#workspace.ts';

/**
 * The pixel density of gallery thumbnails: 960x540.
 */
const THUMBNAIL_SCALE = 0.5;

/**
 * What to do when the site folder cannot be written.
 */
const SITE_FIX = 'Pass `--out` a folder that can be written.';

/**
 * Builds decks into one static site: `<out>/<deck>/` for each deck (its `dist`, plus a
 * `thumbnail.png` of the first slide) and an `index.html` gallery at the root. The site is built in
 * a staging folder beside `out` and swapped in when complete, so a failed build leaves the previous
 * site as it was and a build of one deck publishes only that deck. The folder is replaced only when
 * it is absent, empty or carries the `.deck-site` marker an earlier build wrote, and never when it
 * is, contains or sits inside the workspace root, `decks/`, `brands/` or `packages/`. A thumbnail
 * that cannot be taken is reported and left out, it does not fail the build.
 *
 * @param decks - The decks to build.
 * @param out - The absolute site folder.
 * @param withExports - Whether to export each deck's PDF and PPTX into its folder.
 * @throws CliError in the error channel when `out` is unsafe or holds other files; ViteError when a
 *   build fails; FileSystemError when the site cannot be written; the export's own errors.
 */
export const buildSite = Effect.fn('buildSite')(function* (
  decks: readonly DeckLocation[],
  out: string,
  withExports: boolean,
): Effect.fn.Return<GalleryEntry[], CommandError | FileSystemError, CommandServices> {
  const fs = yield* FileSystem.FileSystem;
  const { root } = yield* Workspace;
  const site = yield* checkSiteFolder(root, out);
  yield* checkReplaceable(site);
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const transaction = yield* createSiteTransaction(site);
      const entries = yield* restore(
        Effect.gen(function* () {
          yield* fs.makeDirectory(transaction.staging).pipe(
            Effect.flatMap(() =>
              fs.writeFileString(path.join(transaction.staging, SITE_MARKER), 'deck site\n'),
            ),
            Effect.mapError((error) =>
              fileSystemError('create the site folder', transaction.staging, error, SITE_FIX),
            ),
          );
          return yield* buildEntries(root, transaction.staging, decks, withExports);
        }),
      ).pipe(
        Effect.onExit((exit) =>
          Exit.isFailure(exit)
            ? removeSiteTransaction(transaction).pipe(
                Effect.catch((error) => Console.error(error.message)),
              )
            : Effect.void,
        ),
      );
      yield* swapSite(transaction, site, root);
      return entries;
    }),
  );
});

/**
 * Builds every deck into the staging folder and writes the gallery.
 *
 * @param root - The workspace root.
 * @param out - The staging folder.
 * @param decks - The decks to build.
 * @param withExports - Whether to export each deck's PDF and PPTX.
 */
const buildEntries = Effect.fn('buildEntries')(function* (
  root: string,
  out: string,
  decks: readonly DeckLocation[],
  withExports: boolean,
): Effect.fn.Return<GalleryEntry[], CommandError | FileSystemError, CommandServices> {
  const fs = yield* FileSystem.FileSystem;
  const entries: GalleryEntry[] = [];
  for (const location of decks) {
    yield* buildDeck(root, location, withExports);
    const target = path.join(out, location.id);
    yield* fs.remove(target, { recursive: true, force: true }).pipe(
      Effect.flatMap(() => fs.copy(path.join(location.dir, 'dist'), target)),
      Effect.mapError((error) => fileSystemError('copy the build to', target, error, SITE_FIX)),
    );
    const deck = yield* loadDeck(root, location);
    const brand = deck.config.brand ?? DEFAULT_BRAND;
    const { tokens } = yield* loadBrand(root, brand);
    const thumbnail = yield* writeThumbnail(location.id, target);
    const pdf = yield* hasFile(path.join(target, `${location.id}.pdf`));
    const pptx = yield* hasFile(path.join(target, `${location.id}.pptx`));
    entries.push({
      id: location.id,
      title: deck.config.title,
      brand,
      brandLabel: tokens.label,
      slides: deck.slides.length,
      thumbnail,
      pdf,
      pptx,
    });
  }

  const index = path.join(out, 'index.html');
  yield* fs
    .writeFileString(index, renderGallery(entries))
    .pipe(Effect.mapError((error) => fileSystemError('write the gallery', index, error, SITE_FIX)));
  return entries;
});

/**
 * Whether a file exists. A check that fails counts as absent, so the gallery simply leaves the link
 * out.
 *
 * @param file - The absolute path.
 */
const hasFile = Effect.fn('hasFile')(function* (
  file: string,
): Effect.fn.Return<boolean, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
});

/**
 * Takes the first slide's picture into a deck's folder in the site.
 *
 * @param deck - The deck folder name.
 * @param target - The deck's folder in the site.
 * @returns Whether `thumbnail.png` was written.
 */
const writeThumbnail = Effect.fn('writeThumbnail')(function* (
  deck: string,
  target: string,
): Effect.fn.Return<boolean, never, CommandServices> {
  const fs = yield* FileSystem.FileSystem;
  const scratch = path.join(target, '.thumbnail');
  const written = yield* Effect.gen(function* () {
    const { files } = yield* takeShots({
      deck,
      slide: '1',
      brand: undefined,
      steps: false,
      outDir: scratch,
      scale: THUMBNAIL_SCALE,
    });
    const [first] = files;
    if (first === undefined) {
      return false;
    }

    yield* fs.copyFile(first.path, path.join(target, 'thumbnail.png'));
    return true;
  }).pipe(
    Effect.catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      const message = `Could not take the thumbnail of "${deck}": ${firstLine(reason)}`;
      return Console.error(message).pipe(Effect.as(false));
    }),
  );
  yield* fs.remove(scratch, { recursive: true, force: true }).pipe(Effect.ignore);
  return written;
});
