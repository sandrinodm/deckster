import type { Plugin, ViteDevServer } from 'vite-plus';

import { NodeServices } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Comment } from '#model/comment-schema.ts';
import type { FeedbackDeck } from '#node/feedback-deck.ts';

import { COMMENTS_CHANGED_EVENT, FEEDBACK_ENDPOINT } from '#model/feedback-api.ts';
import { commentAuthor } from '#node/comment-author.ts';
import { feedbackDir, screenshotFile } from '#node/feedback-paths.ts';
import { CommentScreenshots } from '#vite/comment-screenshots.ts';
import { devSessionOf } from '#vite/dev-session.ts';
import { feedbackMiddleware } from '#vite/feedback-middleware.ts';
import { deckSourceFile, stampDeckModule } from '#vite/stamp-transform.ts';

/**
 * The stamping `jsx-dev-runtime` deck modules are pointed at.
 */
const STAMP_RUNTIME = fileURLToPath(new URL('../stamp/jsx-dev-runtime.ts', import.meta.url));

/**
 * The deck as `@deckster/vite-plugin` loads it: its folder and its slides in order.
 */
export type CommentsDeck = {
  /**
   * Where the deck is.
   */
  location: {
    /**
     * The deck folder name.
     */
    id: string;

    /**
     * The absolute deck folder.
     */
    dir: string;
  };

  /**
   * The slides the deck config lists, with their absolute files.
   */
  slides: readonly { id: string; file: string }[];
};

/**
 * The plugin's runtime: Node's services and the screenshot browser, closed with the server.
 */
type CommentsRuntime = ManagedRuntime.ManagedRuntime<
  CommentScreenshots | NodeServices.NodeServices,
  never
>;

/**
 * Options for {@link commentsVitePlugin}.
 */
export type CommentsPluginOptions = {
  /**
   * The absolute workspace root.
   */
  workspaceRoot: string;

  /**
   * The deck being served, reloaded when its config changes.
   */
  deck: () => Promise<CommentsDeck>;
};

/**
 * The dev-only half of comments: it stamps every element of the deck's own MDX, TSX and JSX files
 * with its source location (by pointing their compiled JSX at a stamping `jsx-dev-runtime`), mounts
 * `/__deck/comments` for the overlay, takes each new comment's screenshot in headless Chromium, and
 * tells open pages when a feedback file changes, instead of letting the change reload them. It
 * applies only while serving, so a production build has no stamps and no endpoint.
 *
 * @param options - The workspace and the deck.
 */
export function commentsVitePlugin(options: CommentsPluginOptions): Plugin {
  let runtime: CommentsRuntime | undefined;
  let author: Promise<string> | undefined;

  /**
   * The runtime of the current server, made on first use and again after a restart.
   */
  const activeRuntime = (): CommentsRuntime => {
    runtime ??= ManagedRuntime.make(Layer.mergeAll(NodeServices.layer, CommentScreenshots.layer));
    return runtime;
  };

  /**
   * The deck in the store's terms.
   */
  const feedbackDeck = async (): Promise<FeedbackDeck> => {
    const deck = await options.deck();
    return { id: deck.location.id, dir: deck.location.dir, slides: deck.slides };
  };

  return {
    name: 'deck:comments',
    apply: 'serve',
    enforce: 'post',

    async transform(code, id) {
      const { location } = await options.deck();
      const file = deckSourceFile(id, location.dir);
      const stamped =
        file === undefined
          ? undefined
          : stampDeckModule(code, file, { deckDir: location.dir, runtime: STAMP_RUNTIME });
      return stamped === undefined ? undefined : { code: stamped, map: null };
    },

    async hotUpdate({ file }) {
      const { location } = await options.deck();
      return isInside(feedbackDir(location.dir), file) ? [] : undefined;
    },

    async configureServer(server) {
      const deck = await feedbackDeck();
      const stepCounts = cachedStepCounts(server, () => activeRuntime(), deck.dir);
      server.middlewares.use(
        FEEDBACK_ENDPOINT,
        feedbackMiddleware({
          workspaceRoot: options.workspaceRoot,
          deck: feedbackDeck,
          author: () => {
            author ??= activeRuntime().runPromise(commentAuthor(options.workspaceRoot));
            return author;
          },
          run: (effect) => activeRuntime().runPromise(effect),
          onAdded: (current, comment) => takeScreenshot(server, activeRuntime(), current, comment),
          stepCount: async (slideIndex) => (await stepCounts())?.[slideIndex],
          guard: (request) => devSessionOf(server).refusal(request),
        }),
      );
      watchFeedback(server, deck.dir);
    },

    async closeBundle() {
      const closing = runtime;
      runtime = undefined;
      await closing?.dispose();
    },
  };
}

/**
 * Takes a new comment's screenshot in the background; a failure is a warning in the terminal,
 * because the comment itself is saved.
 *
 * @param server - The dev server, for its URL and logger.
 * @param runtime - The plugin's runtime, with the screenshot service.
 * @param deck - The deck.
 * @param comment - The new comment.
 */
function takeScreenshot(
  server: ViteDevServer,
  runtime: CommentsRuntime,
  deck: FeedbackDeck,
  comment: Comment,
): void {
  const pageUrl = server.resolvedUrls?.local[0];
  const file = screenshotFile(deck.dir, comment.slide, comment.id);
  const slideIndex = deck.slides.findIndex((slide) => slide.id === comment.slide);
  if (pageUrl === undefined || file === undefined || slideIndex < 0) {
    return;
  }

  const capture = Effect.gen(function* () {
    const screenshots = yield* CommentScreenshots;
    yield* screenshots.capture({ pageUrl, slideIndex, comment, deckDir: deck.dir, file });
  });
  runtime.runPromise(capture).catch((error: unknown) => {
    server.config.logger.warn(error instanceof Error ? error.message : String(error));
  });
}

/**
 * Reads the deck's step counts in headless Chromium once, and again after any deck file other than
 * feedback changes. A failure (no Chromium) is a warning, and the counts are then unknown.
 *
 * @param server - The dev server, for its URL, watcher and logger.
 * @param runtime - The plugin's runtime, with the screenshot service.
 * @param deckDir - The absolute deck folder.
 * @returns A function that gives the counts, or `undefined` when they cannot be read.
 */
function cachedStepCounts(
  server: ViteDevServer,
  runtime: () => CommentsRuntime,
  deckDir: string,
): () => Promise<readonly (number | undefined)[] | undefined> {
  let counts: Promise<readonly (number | undefined)[] | undefined> | undefined;
  server.watcher.on('all', (_event, file) => {
    if (isInside(deckDir, file) && !isInside(feedbackDir(deckDir), file)) {
      counts = undefined;
    }
  });
  return () => {
    const pageUrl = server.resolvedUrls?.local[0];
    if (pageUrl === undefined) {
      return Promise.resolve(undefined);
    }

    counts ??= runtime()
      .runPromise(
        Effect.gen(function* () {
          const screenshots = yield* CommentScreenshots;
          return yield* screenshots.stepCounts(pageUrl);
        }),
      )
      .catch((error: unknown) => {
        server.config.logger.warn(error instanceof Error ? error.message : String(error));
        counts = undefined;
        return undefined;
      });
    return counts;
  };
}

/**
 * Sends {@link COMMENTS_CHANGED_EVENT} whenever a feedback file is written or removed.
 *
 * @param server - The dev server.
 * @param deckDir - The absolute deck folder.
 */
function watchFeedback(server: ViteDevServer, deckDir: string): void {
  const dir = feedbackDir(deckDir);
  server.watcher.add(dir);
  server.watcher.on('all', (_event, file) => {
    if (path.dirname(file) === dir && file.endsWith('.json')) {
      server.ws.send({ type: 'custom', event: COMMENTS_CHANGED_EVENT });
    }
  });
}

/**
 * Whether a file is inside a folder.
 *
 * @param dir - The absolute folder.
 * @param file - An absolute path.
 */
function isInside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
