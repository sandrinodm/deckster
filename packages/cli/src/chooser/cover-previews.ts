import { DEFAULT_BRAND } from '@deckster/brand';
import { loadDeck, type DeckLocation } from '@deckster/vite-plugin';
import { Effect, FileSystem, Semaphore } from 'effect';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { debuglog } from 'node:util';

import { DeckBrowser } from '#browser/deck-browser.ts';
import { previewFingerprint } from '#chooser/preview-fingerprint.ts';
import { DeckServer } from '#server/deck-server.ts';

/**
 * The device pixel ratio for a 480 by 270 pixel cover of the 1920 by 1080 canvas.
 */
const COVER_SCALE = 0.25;

/**
 * The longest time a preview may hold the render slot.
 */
const COVER_TIMEOUT = '45 seconds';

/**
 * Retries a capture once when its source changes during the render.
 */
const COVER_BUILD_ATTEMPTS = 2;

/**
 * Lets NODE_DEBUG=deck-chooser explain fallback covers without adding routine terminal noise.
 */
const debug = debuglog('deck-chooser');

/**
 * The workspace and optional brand for a set of covers.
 */
type CoverOptions = {
  /**
   * The absolute workspace root.
   */
  readonly workspaceRoot: string;

  /**
   * The CLI brand override, or undefined for the deck’s configured brand.
   */
  readonly brand: string | undefined;
};

/**
 * Makes a lazy, serial cover renderer. Successful PNGs are reused across runs and unavailable
 * covers are retried when their inputs change. An interrupted request leaves no partial PNG.
 */
export const makeCoverPreviews = Effect.fn('makeCoverPreviews')(function* (
  options: CoverOptions,
): Effect.fn.Return<
  (deck: DeckLocation) => Effect.Effect<Uint8Array | undefined>,
  never,
  FileSystem.FileSystem | DeckServer | DeckBrowser
> {
  const context = yield* Effect.context<FileSystem.FileSystem | DeckServer | DeckBrowser>();
  const fs = yield* FileSystem.FileSystem;
  const queue = yield* Semaphore.make(1);
  const unavailable = new Map<string, string>();

  return (location) =>
    readCover(location).pipe(
      Effect.tapError((error) => reportFailure(location, error)),
      Effect.provide(context),
      Effect.orElseSucceed(() => undefined),
    );

  /**
   * Reads existing covers without waiting for other decks to render.
   */
  function readCover(location: DeckLocation) {
    return Effect.gen(function* () {
      const deck = yield* loadDeck(options.workspaceRoot, location);
      const brand = options.brand ?? deck.config.brand ?? DEFAULT_BRAND;
      const stamp = fingerprint(options.workspaceRoot, location, brand);
      const folder = path.join(options.workspaceRoot, '.deck', 'chooser', 'previews', location.id);

      for (let attempt = 0; attempt < COVER_BUILD_ATTEMPTS; attempt += 1) {
        const key = yield* stamp;
        const file = path.join(folder, `${key}.png`);
        if (yield* fs.exists(file)) {
          return yield* fs.readFile(file);
        }

        const status = yield* queue.withPermits(1)(render(location, file, key, stamp));
        if (status === 'ready') {
          return yield* fs.readFile(file);
        }

        if (status === 'unavailable') {
          return undefined;
        }
      }

      return undefined;
    });
  }

  /**
   * Takes a render slot only for a miss and checks again once another request may have filled it.
   */
  function render(
    location: DeckLocation,
    target: string,
    key: string,
    stamp: Effect.Effect<string, unknown>,
  ) {
    return Effect.scoped(
      Effect.gen(function* () {
        if (yield* fs.exists(target)) {
          return 'ready';
        }

        if (unavailable.get(location.id) === key) {
          return 'unavailable';
        }

        const folder = path.dirname(target);
        const staged = path.join(folder, `${randomUUID()}.png`);
        yield* fs.makeDirectory(folder, { recursive: true });
        yield* Effect.addFinalizer(() => fs.remove(staged, { force: true }).pipe(Effect.ignore));
        const ready = yield* captureCover(location, options, staged).pipe(
          Effect.timeout(COVER_TIMEOUT),
          Effect.tapError((error) => reportFailure(location, error)),
          Effect.orElseSucceed(() => false),
        );
        if ((yield* stamp) !== key) {
          return 'changed';
        }

        if (!ready) {
          unavailable.set(location.id, key);
          return 'unavailable';
        }

        yield* fs.rename(staged, target);
        unavailable.delete(location.id);
        return 'ready';
      }),
    );
  }
});

/**
 * Reports filesystem failures from a fingerprint as a recoverable effect error.
 */
function fingerprint(
  root: string,
  deck: DeckLocation,
  brand: string,
): Effect.Effect<string, unknown> {
  return Effect.tryPromise(() => previewFingerprint(root, deck, brand));
}

/**
 * Renders the first visible slide at step zero using the regular static deck browser.
 */
function captureCover(location: DeckLocation, options: CoverOptions, file: string) {
  return Effect.gen(function* () {
    const server = yield* (yield* DeckServer).start({
      deck: location.id,
      workspaceRoot: options.workspaceRoot,
      brand: options.brand,
    });
    const page = yield* (yield* DeckBrowser).open(server.url, {
      scale: COVER_SCALE,
      workspaceRoot: options.workspaceRoot,
      opening: true,
    });
    const opening = page.slides.find((slide) => !slide.hidden);
    if (opening === undefined) {
      return false;
    }

    yield* page.show(opening.index, 0);
    const error = yield* page.renderError();
    const problems = yield* page.takeErrors();
    if (error !== null || problems.length > 0) {
      yield* reportFailure(location, [error?.message, ...problems].filter(Boolean).join('\n'));
      return false;
    }

    yield* page.screenshot(file);
    return true;
  });
}

/**
 * Reports why a cover was unavailable when diagnostic logging is enabled.
 */
function reportFailure(location: DeckLocation, error: unknown): Effect.Effect<void> {
  return Effect.sync(() => {
    if (debug.enabled) {
      const message = error instanceof Error ? error.message : String(error);
      debug('The cover for %s was unavailable: %s', location.id, message);
    }
  });
}
