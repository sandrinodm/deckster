import type { PlatformError } from 'effect/PlatformError';
import type { ServerResponse } from 'node:http';
import type { Connect } from 'vite';

import { Effect, FileSystem, Option, Result, Schema, type Scope } from 'effect';

import type { Comment } from '#model/comment-schema.ts';
import type { FeedbackDeck } from '#node/feedback-deck.ts';

import { SCREENSHOT_PATH, type FeedbackAnswer } from '#model/feedback-api.ts';
import { changeComment, saveNewComment, type ChangeOutcome } from '#node/comment-actions.ts';
import { buildCommentReport } from '#node/comment-report.ts';
import { FeedbackRequest } from '#node/comment-request.ts';
import { FeedbackError, feedbackError, type FeedbackFailure } from '#node/feedback-error.ts';
import { assertNoFeedbackLinks } from '#node/feedback-guard.ts';
import { screenshotFile } from '#node/feedback-paths.ts';
import { findComment } from '#node/feedback-store.ts';
import { requestUrl } from '#vite/dev-session.ts';

/**
 * The largest request body read, in bytes; a comment with its anchor is a few kilobytes.
 */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * The media type of requests and answers; as a non-simple request type it makes browsers preflight
 * a cross-origin post, which the dev server never allows.
 */
const JSON_TYPE = 'application/json';

/**
 * The HTTP status of a successful answer with a body.
 */
const HTTP_OK = 200;

/**
 * The HTTP status of a request that is not JSON or does not match the request schema.
 */
const HTTP_BAD_REQUEST = 400;

/**
 * The HTTP status of a request from somewhere that may not use the endpoint.
 */
const HTTP_FORBIDDEN = 403;

/**
 * The HTTP status of an unknown path.
 */
const HTTP_NOT_FOUND = 404;

/**
 * The HTTP status of a method the path does not take.
 */
const HTTP_METHOD_NOT_ALLOWED = 405;

/**
 * The HTTP status of a body larger than {@link MAX_BODY_BYTES}.
 */
const HTTP_PAYLOAD_TOO_LARGE = 413;

/**
 * The HTTP status of a body that is not `application/json`.
 */
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;

/**
 * The HTTP status of an unexpected failure.
 */
const HTTP_SERVER_ERROR = 500;

/**
 * The HTTP status of a feedback file that another writer kept locked for too long.
 */
const HTTP_SERVICE_UNAVAILABLE = 503;

/**
 * The HTTP status for each kind of feedback failure.
 */
const FAILURE_STATUS: Readonly<Record<FeedbackFailure, number>> = {
  /**
   * A request or file the store cannot use.
   */
  invalid: HTTP_BAD_REQUEST,

  /**
   * A comment or slide that does not exist.
   */
  missing: HTTP_NOT_FOUND,

  /**
   * A feedback file another writer kept locked.
   */
  busy: HTTP_SERVICE_UNAVAILABLE,

  /**
   * A file that cannot be read or written.
   */
  io: HTTP_SERVER_ERROR,
};

/**
 * Checks a request body strictly: unknown keys are errors.
 */
const decodeRequest = Schema.decodeUnknownResult(FeedbackRequest, {
  errors: 'all',
  onExcessProperty: 'error',
});

/**
 * Runs a feedback effect with the file system and the services the comments plugin provides.
 */
export type RunFeedback = <A>(
  effect: Effect.Effect<A, FeedbackError, FileSystem.FileSystem>,
) => Promise<A>;

/**
 * What the middleware needs from the comments plugin.
 */
export type FeedbackMiddlewareOptions = {
  /**
   * The absolute workspace root, for report paths.
   */
  workspaceRoot: string;

  /**
   * The deck being served and its current slides.
   */
  deck: () => Promise<FeedbackDeck>;

  /**
   * The name comments are signed with when the overlay sends none.
   */
  author: () => Promise<string>;

  /**
   * Runs the store's effects.
   */
  run: RunFeedback;

  /**
   * Called after a comment is added, to take its screenshot.
   */
  onAdded: (deck: FeedbackDeck, comment: Comment) => void;

  /**
   * The step count of a slide by its index, to refuse a comment on a step the slide does not have;
   * `undefined` when it cannot be known, which skips the check.
   */
  stepCount?: (slideIndex: number) => Promise<number | undefined>;

  /**
   * Why a request may not use the endpoint (where it comes from, no dev session cookie), or
   * undefined. The comments plugin passes the dev server's session check
   * (`@deckster/comments/dev-session`); left out, every request may.
   */
  guard?: (request: Connect.IncomingMessage) => string | undefined;
};

/**
 * Builds the dev server middleware for `FEEDBACK_ENDPOINT`. `GET` answers a {@link FeedbackAnswer}
 * with every comment; `POST` with a JSON {@link FeedbackRequest} adds a comment or updates,
 * resolves, reopens or deletes one and answers `{ comment, changed }` (`changed: false` for a
 * resolve of a resolved comment or a reopen of an open one, which leave it as it was); `GET
 * /screenshot?id=` serves a comment's PNG. Errors answer `{ error }` with 400 (bad request), 404
 * (no such comment or slide), 405, 415, 503 (a lock held too long) or 500.
 *
 * @param options - The workspace, the deck, the author, the effect runner and the screenshot hook.
 */
export function feedbackMiddleware(options: FeedbackMiddlewareOptions): Connect.NextHandleFunction {
  return (request, response) => {
    const refused = options.guard?.(request);
    if (refused !== undefined) {
      reply(response, HTTP_FORBIDDEN, { error: refused });
      return;
    }

    const url = requestUrl(request.url);
    if (url === undefined) {
      reply(response, HTTP_BAD_REQUEST, { error: 'The request target is not a plain path.' });
      return;
    }

    if (url.pathname === SCREENSHOT_PATH) {
      void answer(response, () =>
        serveScreenshot(options, url.searchParams.get('id') ?? '', response),
      );
      return;
    }

    if (url.pathname !== '/') {
      reply(response, HTTP_NOT_FOUND, { error: `No comments endpoint at ${url.pathname}.` });
      return;
    }

    if (request.method === 'GET') {
      void answer(response, async () => reply(response, HTTP_OK, await readAnswer(options)));
      return;
    }

    if (request.method !== 'POST') {
      reply(response, HTTP_METHOD_NOT_ALLOWED, { error: 'Use GET or POST.' });
      return;
    }

    if (!(request.headers['content-type'] ?? '').startsWith(JSON_TYPE)) {
      reply(response, HTTP_UNSUPPORTED_MEDIA_TYPE, { error: `Send the body as ${JSON_TYPE}.` });
      return;
    }

    void answer(response, async () => {
      const outcome = await applyRequest(options, await readJson(request, response));
      reply(response, HTTP_OK, { comment: outcome.comment ?? null, changed: outcome.changed });
    });
  };
}

/**
 * Every comment of the deck, for the overlay.
 *
 * @param options - The middleware options.
 */
async function readAnswer(options: FeedbackMiddlewareOptions): Promise<FeedbackAnswer> {
  const deck = await options.deck();
  const report = await options.run(
    buildCommentReport(options.workspaceRoot, deck, { status: 'all' }),
  );
  return { ...report, author: await options.author() };
}

/**
 * Validates a request body and applies it.
 *
 * @param options - The middleware options.
 * @param body - The parsed JSON body.
 * @returns The comment as it now is (`undefined` after a delete) and whether it changed.
 * @throws FeedbackError (`invalid`) for a body that does not match {@link FeedbackRequest}.
 */
async function applyRequest(
  options: FeedbackMiddlewareOptions,
  body: unknown,
): Promise<ChangeOutcome> {
  const decoded = decodeRequest(body);
  if (Result.isFailure(decoded)) {
    throw feedbackError(
      'invalid',
      `The request does not match the comment schema: ${decoded.failure.message}`,
    );
  }

  const deck = await options.deck();
  const request = decoded.success;
  if (request.action === 'add') {
    await checkStep(options, deck, request.comment);
    const comment = await options.run(
      saveNewComment(deck, request.comment, await options.author()),
    );
    options.onAdded(deck, comment);
    return { comment, changed: true };
  }

  if (request.action === 'resolve') {
    const by = request.author ?? (await options.author());
    return options.run(
      changeComment(deck, { action: 'resolve', id: request.id, note: request.note ?? '', by }),
    );
  }

  return options.run(changeComment(deck, request));
}

/**
 * Refuses a new comment on a step its slide does not have, when the slide's step count is known.
 *
 * @param options - The middleware options.
 * @param deck - The deck.
 * @param comment - The new comment's slide and step.
 * @throws FeedbackError (`invalid`) naming the slide's steps.
 */
async function checkStep(
  options: FeedbackMiddlewareOptions,
  deck: FeedbackDeck,
  comment: { slide: string; step: number },
): Promise<void> {
  const index = deck.slides.findIndex((slide) => slide.id === comment.slide);
  const count = index < 0 ? undefined : await options.stepCount?.(index);
  if (count === undefined || comment.step < count) {
    return;
  }

  const steps = count === 1 ? 'only step 0' : `steps 0 to ${count - 1}`;
  throw feedbackError(
    'invalid',
    `"${comment.slide}" has ${steps}, so there is no step ${comment.step} to comment on.`,
  );
}

/**
 * Streams a comment's screenshot. The `.feedback` folder, the slide's screenshot folder and the PNG
 * must not be symbolic links (the store's guard, `assertNoFeedbackLinks`), and the PNG is opened
 * without following a link, so a linked screenshot never serves a file from outside the deck.
 *
 * @param options - The middleware options.
 * @param id - The comment id from the query string.
 * @param response - The response.
 * @throws FeedbackError (`missing`) when the comment has no screenshot, or its path goes through a
 *   symbolic link.
 */
async function serveScreenshot(
  options: FeedbackMiddlewareOptions,
  id: string,
  response: ServerResponse,
): Promise<void> {
  const deck = await options.deck();
  const png = await options.run(
    Effect.gen(function* () {
      const { slide } = yield* findComment(deck.dir, id);
      const file = screenshotFile(deck.dir, slide, id);
      if (file === undefined) {
        return yield* feedbackError('missing', `The comment "${id}" has no screenshot.`);
      }

      yield* assertNoFeedbackLinks(deck.dir, file);
      return yield* readScreenshot(file).pipe(
        Effect.mapError(() =>
          feedbackError('missing', `The comment "${id}" has no screenshot yet.`),
        ),
      );
    }).pipe(
      Effect.mapError((error) =>
        error.failure === 'invalid' ? feedbackError('missing', error.message) : error,
      ),
    ),
  );
  response.statusCode = HTTP_OK;
  response.setHeader('content-type', 'image/png');
  response.setHeader('cache-control', 'no-store');
  response.end(Buffer.from(png));
}

/**
 * Reads a regular file without following a symbolic link at its path.
 *
 * @param file - The absolute path.
 */
const readScreenshot = Effect.fn('readScreenshot')(function* (
  file: string,
): Effect.fn.Return<Uint8Array, PlatformError, FileSystem.FileSystem | Scope.Scope> {
  const fs = yield* FileSystem.FileSystem;
  const handle = yield* fs.open(file, { flag: 'r', noFollow: true });
  const size = Number((yield* handle.stat).size);
  const chunks: Uint8Array[] = [];
  let chunk = yield* handle.readAlloc(Math.max(1, size));
  while (Option.isSome(chunk)) {
    chunks.push(chunk.value);
    chunk = yield* handle.readAlloc(Math.max(1, size));
  }

  return Buffer.concat(chunks);
}, Effect.scoped);

/**
 * Runs a handler and answers its failure: a {@link FeedbackError} with its status, a body that is
 * not JSON with 400, anything else with 500.
 *
 * @param response - The response.
 * @param handle - The handler.
 */
async function answer(response: ServerResponse, handle: () => Promise<void>): Promise<void> {
  try {
    await handle();
  } catch (error) {
    if (response.headersSent) {
      return;
    }

    if (error instanceof FeedbackError) {
      reply(response, FAILURE_STATUS[error.failure], { error: error.message });
      return;
    }

    const status = error instanceof SyntaxError ? HTTP_BAD_REQUEST : HTTP_SERVER_ERROR;
    reply(response, status, { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Reads and parses a JSON request body. A body larger than {@link MAX_BODY_BYTES} is refused as
 * soon as it is: reading stops, the answer is 413 with `Connection: close`, and the request (with
 * its socket) is destroyed once the answer is sent, so the client cannot keep streaming into the
 * server.
 *
 * @param request - The incoming request.
 * @param response - The response, for the 413.
 * @throws SyntaxError when the body is not JSON; RangeError, after answering 413, when it is too
 *   large.
 */
function readJson(request: Connect.IncomingMessage, response: ServerResponse): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    /**
     * Stops listening to the request.
     */
    const stop = () => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
    };
    /**
     * Collects a chunk, or refuses the body once it is too large.
     *
     * @param chunk - The chunk.
     */
    const onData = (chunk: Uint8Array | string) => {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size <= MAX_BODY_BYTES) {
        chunks.push(buffer);
        return;
      }

      stop();
      request.pause();
      const message = `The body is larger than ${MAX_BODY_BYTES} bytes.`;
      response.once('finish', () => request.destroy());
      response.setHeader('connection', 'close');
      reply(response, HTTP_PAYLOAD_TOO_LARGE, { error: message });
      reject(new RangeError(message));
    };
    /**
     * Parses the whole body.
     */
    const onEnd = () => {
      stop();
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    };
    /**
     * Fails on a broken request.
     *
     * @param error - What the stream reported.
     */
    const onError = (error: Error) => {
      stop();
      reject(error);
    };
    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', onError);
  });
}

/**
 * Answers with a status and a JSON body.
 *
 * @param response - The response.
 * @param status - The HTTP status.
 * @param body - The JSON body.
 */
function reply(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', JSON_TYPE);
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(body));
}
