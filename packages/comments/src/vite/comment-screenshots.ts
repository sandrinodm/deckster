import { guardedWrite } from '@deckster/brand/node';
import { Context, Effect, FileSystem, Layer, Scope, Semaphore } from 'effect';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

import type { Comment, Rect } from '#model/comment-schema.ts';

import { feedbackError, type FeedbackError } from '#node/feedback-error.ts';
import { assertNoFeedbackLinks } from '#node/feedback-guard.ts';

/**
 * The canvas size in canvas pixels, which the static page is opened at so canvas and page pixels
 * are the same.
 */
const CANVAS = {
  /**
   * The canvas width.
   */
  width: 1920,

  /**
   * The canvas height.
   */
  height: 1080,
} as const;

/**
 * Canvas pixels of context kept around the element in its screenshot.
 */
const CONTEXT_PX = 48;

/**
 * How long a screenshot may wait for the deck to start and its slide to be ready, in milliseconds.
 */
const READY_TIMEOUT_MS = 30_000;

/**
 * The outline drawn around the element in its screenshot: a white line between two dark ones, so it
 * reads on any surface, light, dark or a saturated accent.
 */
const OUTLINE_COLORS = {
  /**
   * The middle line.
   */
  light: '#ffffff',

  /**
   * The lines on either side of it.
   */
  dark: '#161514',
} as const;

/**
 * The width of the outline's light line, in canvas pixels.
 */
const OUTLINE_WIDTH_PX = 4;

/**
 * The width of each dark line beside it, in canvas pixels.
 */
const OUTLINE_EDGE_PX = 2;

/**
 * The part of `window.__deck` a screenshot waits on; declared here because the page script runs
 * where the engine's types are not loaded.
 */
type DeckWindow = {
  /**
   * The deck's automation API, once the deck has mounted.
   */
  __deck?: {
    /**
     * Resolves once the slide on screen is ready to capture.
     */
    ready: () => Promise<void>;

    /**
     * Every slide, with its step count once known; static mode knows them all after `ready()`.
     */
    slides: readonly { stepCount: number | undefined }[];
  };
};

/**
 * What one screenshot shows and where it goes.
 */
export type ScreenshotRequest = {
  /**
   * The dev server's page URL, such as `http://localhost:5173/`.
   */
  pageUrl: string;

  /**
   * The slide's zero-based position in the deck.
   */
  slideIndex: number;

  /**
   * The comment: its step, box and region.
   */
  comment: Pick<Comment, 'step' | 'box' | 'region' | 'target'>;

  /**
   * The absolute deck folder, whose `.feedback` folder holds the PNG.
   */
  deckDir: string;

  /**
   * The absolute PNG file to write, inside the deck's `.feedback` folder.
   */
  file: string;
};

/**
 * Takes comment screenshots in headless Chromium, the way `deck shot` does: the deck in static mode
 * (no overlay, no source stamps) at 1920x1080, cropped to the element with some context and the
 * element outlined. Chromium is launched on the first screenshot and closed with the layer;
 * screenshots are taken one at a time.
 */
export class CommentScreenshots extends Context.Service<
  CommentScreenshots,
  {
    /**
     * Writes one screenshot.
     *
     * @throws FeedbackError (`io`) in the error channel when Chromium is missing or fails.
     */
    readonly capture: (
      request: ScreenshotRequest,
    ) => Effect.Effect<void, FeedbackError, FileSystem.FileSystem>;

    /**
     * Reads every slide's step count from the deck in static mode, where every slide mounts.
     *
     * @throws FeedbackError (`io`) in the error channel when Chromium is missing or fails.
     */
    readonly stepCounts: (
      pageUrl: string,
    ) => Effect.Effect<readonly (number | undefined)[], FeedbackError>;
  }
>()('comments/CommentScreenshots') {
  /**
   * Headless Chromium through Playwright, launched on first use.
   */
  static readonly layer = Layer.effect(
    CommentScreenshots,
    Effect.gen(function* () {
      const layerScope = yield* Effect.scope;
      const browser = yield* Effect.cached(
        Effect.acquireRelease(launchBrowser(), (opened) =>
          closeQuietly('browser', () => opened.close()),
        ).pipe(Scope.provide(layerScope)),
      );
      const oneAtATime = yield* Semaphore.make(1);
      return CommentScreenshots.of({
        capture: (request) =>
          oneAtATime.withPermits(1)(
            Effect.gen(function* () {
              const opened = yield* browser;
              yield* captureScreenshot(opened, request);
            }),
          ),
        stepCounts: (pageUrl) =>
          oneAtATime.withPermits(1)(
            Effect.gen(function* () {
              const opened = yield* browser;
              return yield* readStepCounts(opened, pageUrl);
            }),
          ),
      });
    }),
  );
}

/**
 * The part of the canvas a comment's screenshot shows: an element's box with {@link CONTEXT_PX}
 * around it, kept inside the canvas; the whole canvas for a comment on the slide, and for a region,
 * which is often empty space that only the rest of the slide explains (the region is outlined on
 * it).
 *
 * @param comment - The comment's box and region.
 */
export function screenshotClip(comment: Pick<Comment, 'box' | 'region'>): Rect {
  const box = comment.box;
  if (box === null || comment.region !== null) {
    return { x: 0, y: 0, ...CANVAS };
  }

  const x = clamp(Math.floor(box.x - CONTEXT_PX), 0, CANVAS.width - 1);
  const y = clamp(Math.floor(box.y - CONTEXT_PX), 0, CANVAS.height - 1);
  const right = clamp(Math.ceil(box.x + box.width + CONTEXT_PX), x + 1, CANVAS.width);
  const bottom = clamp(Math.ceil(box.y + box.height + CONTEXT_PX), y + 1, CANVAS.height);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Launches headless Chromium.
 */
function launchBrowser(): Effect.Effect<Browser, FeedbackError> {
  return Effect.tryPromise({
    try: () => chromium.launch(),
    catch: (cause) =>
      feedbackError(
        'io',
        `Could not start Chromium for the comment screenshot: ${firstLine(cause)}\n` +
          'Install it with `pnpm exec playwright install chromium`.',
      ),
  });
}

/**
 * Opens the slide at the comment's step, outlines the element and writes the cropped PNG.
 *
 * @param browser - The browser.
 * @param request - What to capture and where.
 */
const captureScreenshot = Effect.fn('captureCommentScreenshot')(function* (
  browser: Browser,
  request: ScreenshotRequest,
): Effect.fn.Return<void, FeedbackError, FileSystem.FileSystem> {
  /**
   * The error for a step of the screenshot that failed.
   */
  const failed = (cause: unknown) =>
    feedbackError(
      'io',
      `Could not take the comment screenshot ${request.file}: ${firstLine(cause)}`,
    );
  const png = yield* Effect.acquireUseRelease(
    Effect.tryPromise({
      try: () =>
        browser.newContext({ viewport: CANVAS, deviceScaleFactor: 1, reducedMotion: 'reduce' }),
      catch: failed,
    }),
    (context) =>
      Effect.tryPromise({
        try: async () => shoot(await context.newPage(), request),
        catch: failed,
      }),
    (context) => closeQuietly('page', () => context.close()),
  );
  yield* writeScreenshotFile(request.deckDir, request.file, png);
});

/**
 * Writes a comment's PNG into the deck's `.feedback` folder: never through a symbolic link (the
 * store's guard, `assertNoFeedbackLinks`, on the folder, the slide's screenshot folder and the
 * file, before and after the folder is made), always through a new temporary file next to the
 * target that is renamed into place, so a link planted at the target is replaced, not followed.
 * This is the only place a screenshot reaches the disk.
 *
 * @param deckDir - The absolute deck folder.
 * @param file - The absolute PNG path inside its `.feedback` folder.
 * @param bytes - The PNG.
 * @throws FeedbackError (`invalid`) for a path through a symbolic link, (`io`) when writing fails.
 */
export const writeScreenshotFile = Effect.fn('writeScreenshotFile')(function* (
  deckDir: string,
  file: string,
  bytes: Uint8Array,
): Effect.fn.Return<void, FeedbackError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  /**
   * The error for a write that failed.
   */
  const failed = (cause: { readonly message: string }) =>
    feedbackError('io', `Could not write the comment screenshot ${file}: ${cause.message}`);
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  const removeTemporary = fs.remove(temporary, { force: true }).pipe(Effect.ignore);
  // While an agent turn runs, the turn guard keeps this write (it is the framework's own).
  yield* guardedWrite(
    file,
    Effect.gen(function* () {
      yield* assertNoFeedbackLinks(deckDir, file);
      yield* fs
        .makeDirectory(path.dirname(file), { recursive: true })
        .pipe(Effect.mapError(failed));
      yield* assertNoFeedbackLinks(deckDir, file);
      yield* fs.writeFile(temporary, bytes, { flag: 'wx' }).pipe(
        Effect.mapError(failed),
        Effect.andThen(assertNoFeedbackLinks(deckDir, file)),
        Effect.andThen(fs.rename(temporary, file).pipe(Effect.mapError(failed))),
        Effect.tapError(() => removeTemporary),
      );
    }),
  );
});

/**
 * Opens the deck in static mode and reads every slide's step count.
 *
 * @param browser - The browser.
 * @param pageUrl - The dev server's page URL.
 */
const readStepCounts = Effect.fn('readCommentStepCounts')(function* (
  browser: Browser,
  pageUrl: string,
): Effect.fn.Return<readonly (number | undefined)[], FeedbackError> {
  /**
   * The error for a step of the reading that failed.
   */
  const failed = (cause: unknown) =>
    feedbackError('io', `Could not read the deck's step counts: ${firstLine(cause)}`);
  return yield* Effect.acquireUseRelease(
    Effect.tryPromise({
      try: () => browser.newContext({ viewport: CANVAS, deviceScaleFactor: 1 }),
      catch: failed,
    }),
    (context) =>
      Effect.tryPromise({
        try: async () => {
          const page = await context.newPage();
          await openStatic(page, `${pageUrl}?static`);
          return page.evaluate(() =>
            ((window as DeckWindow).__deck?.slides ?? []).map((slide) => slide.stepCount),
          );
        },
        catch: failed,
      }),
    (context) => closeQuietly('page', () => context.close()),
  );
});

/**
 * Closes a page or the browser in a finalizer, which cannot fail: a failure is mapped to a
 * {@link FeedbackError} and logged as a warning, since the screenshot itself is done.
 *
 * @param what - `page` or `browser`, for the message.
 * @param close - Closes it.
 */
const closeQuietly = Effect.fn('closeCommentBrowserPart')(function* (
  what: string,
  close: () => Promise<void>,
): Effect.fn.Return<void> {
  yield* Effect.tryPromise({
    try: close,
    catch: (cause) =>
      feedbackError('io', `Could not close the comment screenshot ${what}: ${firstLine(cause)}`),
  }).pipe(Effect.catch((error) => Effect.logWarning(error.message)));
});

/**
 * Loads a deck page and waits until it is ready.
 *
 * @param page - A fresh page.
 * @param url - The page URL.
 */
async function openStatic(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => (window as DeckWindow).__deck !== undefined, undefined, {
    timeout: READY_TIMEOUT_MS,
  });
  await page.evaluate(() => (window as DeckWindow).__deck?.ready());
}

/**
 * Drives one page through a screenshot and returns the PNG; it writes nothing.
 *
 * @param page - A fresh page.
 * @param request - What to capture.
 */
async function shoot(page: Page, request: ScreenshotRequest): Promise<Uint8Array> {
  const { comment } = request;
  await openStatic(page, `${request.pageUrl}?static#/${request.slideIndex + 1}/${comment.step}`);
  const box = comment.region ?? comment.box;
  if (box !== null) {
    await page.evaluate(outlineBox, {
      box,
      colors: OUTLINE_COLORS,
      width: OUTLINE_WIDTH_PX,
      edge: OUTLINE_EDGE_PX,
      dashed: comment.target === 'region',
    });
  }

  return page.screenshot({
    type: 'png',
    animations: 'disabled',
    clip: screenshotClip(comment),
  });
}

/**
 * Draws an outline over the canvas at a box: a light line between two dark ones, dashed when the
 * box is a region. Runs in the page, so it uses nothing from this module.
 *
 * @param mark - The box in canvas pixels, the two colors, the widths and whether it is dashed.
 */
function outlineBox(mark: {
  box: Rect;
  colors: { light: string; dark: string };
  width: number;
  edge: number;
  dashed: boolean;
}): void {
  const canvas = document.querySelector('.deck-canvas');
  if (canvas === null) {
    return;
  }

  const outline = document.createElement('div');
  const style = mark.dashed ? 'dashed' : 'solid';
  const reach = mark.width + mark.edge;
  const edgeLine = `${mark.edge}px ${mark.colors.dark}`;
  outline.style.cssText = [
    'position: absolute',
    `left: ${mark.box.x - reach}px`,
    `top: ${mark.box.y - reach}px`,
    `width: ${mark.box.width + 2 * reach}px`,
    `height: ${mark.box.height + 2 * reach}px`,
    `border: ${mark.width}px ${style} ${mark.colors.light}`,
    `box-shadow: 0 0 0 ${edgeLine}, inset 0 0 0 ${edgeLine}`,
    'border-radius: 8px',
    'box-sizing: border-box',
    'pointer-events: none',
    'z-index: 2147483647',
  ].join('; ');
  canvas.append(outline);
}

/**
 * Keeps a number inside a range.
 *
 * @param value - The number.
 * @param minimum - The lowest value.
 * @param maximum - The highest value.
 */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * The first line of what Playwright threw, without its call log.
 *
 * @param cause - What was thrown.
 */
function firstLine(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.split('\n')[0] ?? message;
}
