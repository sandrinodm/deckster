import { Effect, Option, Result, Schema } from 'effect';
import { randomUUID } from 'node:crypto';

import type { PageGotoDone, PageGotoRequest, PageStateReport } from '#protocol/page-link-events.ts';

import { agentError, type AgentError } from '#errors.ts';
import {
  PAGE_GOTO_DONE_EVENT,
  PAGE_GOTO_EVENT,
  PAGE_STATE_EVENT,
} from '#protocol/page-link-events.ts';

/**
 * How long `goto` waits for the page to answer, in milliseconds.
 */
const GOTO_TIMEOUT_MS = 5000;

/**
 * Checks one placed element reported by a page.
 */
const PlacedElementSchema = Schema.Struct({
  kind: Schema.Literals(['place', 'shape', 'text']),
  name: Schema.optionalKey(Schema.String),
  place: Schema.optionalKey(Schema.String),
  zone: Schema.optionalKey(Schema.String),
  rect: Schema.Tuple([Schema.Number, Schema.Number, Schema.Number, Schema.Number]),
});

/**
 * Checks what a page reports; anything else is dropped.
 */
const decodeReport = Schema.decodeUnknownResult(
  Schema.Struct({
    page: Schema.String,
    closed: Schema.Boolean,
    focusedAt: Schema.Number,
    slide: Schema.Struct({
      id: Schema.String,
      index: Schema.Number,
      file: Schema.String,
      layout: Schema.String,
      title: Schema.String,
    }),
    step: Schema.Number,
    stepCount: Schema.Number,
    brand: Schema.String,
    selection: Schema.String,
    placed: Schema.optionalKey(Schema.Array(PlacedElementSchema)),
  }),
);

/**
 * Checks a page's answer to a goto request.
 */
const decodeDone = Schema.decodeUnknownResult(
  Schema.Struct({
    request: Schema.String,
    ok: Schema.Boolean,
    error: Schema.String,
    slide: Schema.String,
    step: Schema.Number,
  }),
);

/**
 * One connected page as the dev server's WebSocket exposes it.
 */
export type PageClient = {
  /**
   * Sends a custom event to the page.
   */
  readonly send: (event: string, payload?: unknown) => void;

  /**
   * The raw socket, to learn when the page goes away.
   */
  readonly socket: {
    /**
     * Calls the listener once the socket closes.
     */
    readonly once: (event: 'close', listener: () => void) => unknown;
  };
};

/**
 * A listener for a custom event pages send.
 */
export type PageListener = (data: unknown, client: PageClient) => void;

/**
 * The part of Vite's `server.ws` the page link uses.
 */
export type PageChannel = {
  /**
   * Listens for a custom event pages send with `import.meta.hot.send`.
   */
  readonly on: (event: string, listener: PageListener) => void;

  /**
   * Stops listening.
   */
  readonly off: (event: string, listener: PageListener) => void;
};

/**
 * The most recently focused page, as the tools see it.
 */
export type PageSnapshot = PageStateReport & {
  /**
   * How many pages are connected.
   */
  readonly pages: number;
};

/**
 * What the dev server knows about its open deck pages, for `current_slide` and `goto`.
 */
export type PageLink = {
  /**
   * The state of the page the user focused last, or undefined when no page is open.
   */
  readonly current: Effect.Effect<PageSnapshot | undefined>;

  /**
   * Moves the most recently focused page and waits for its answer.
   *
   * @param slide - The slide id.
   * @param step - The step, from 0.
   */
  readonly goto: (slide: string, step: number) => Effect.Effect<PageGotoDone, AgentError>;

  /**
   * Starts listening on the dev server's channel; returns the function that stops it.
   *
   * @param channel - `server.ws`.
   */
  readonly attach: (channel: PageChannel) => () => void;
};

/**
 * Creates an empty page registry. It is made before the dev server so the tools and the plugin can
 * share it, and attached to the server's channel once the server exists.
 */
export function createPageLink(): PageLink {
  const pages = new Map<string, { report: PageStateReport; client: PageClient; seq: number }>();
  const waiting = new Map<string, (done: PageGotoDone) => void>();
  let sequence = 0;

  /**
   * The page with the latest focus, ties broken by the latest report.
   */
  const latest = () =>
    [...pages.values()].sort((a, b) => b.report.focusedAt - a.report.focusedAt || b.seq - a.seq)[0];

  /**
   * Records a page's report, or forgets the page when it says it is closing.
   *
   * @param data - What the page sent.
   * @param client - The page's connection.
   */
  const onState: PageListener = (data, client) => {
    const decoded = decodeReport(data);
    if (Result.isFailure(decoded)) {
      return;
    }

    const report = decoded.success;
    if (report.closed) {
      pages.delete(report.page);
      return;
    }

    if (!pages.has(report.page)) {
      client.socket.once('close', () => pages.delete(report.page));
    }

    sequence += 1;
    pages.set(report.page, { report, client, seq: sequence });
  };

  /**
   * Hands a page's goto answer to the call that waits for it.
   *
   * @param data - What the page sent.
   */
  const onDone: PageListener = (data) => {
    const decoded = decodeDone(data);
    if (Result.isSuccess(decoded)) {
      waiting.get(decoded.success.request)?.(decoded.success);
    }
  };

  return {
    current: Effect.sync(() => {
      const page = latest();
      return page === undefined ? undefined : { ...page.report, pages: pages.size };
    }),

    goto: Effect.fn('PageLink.goto')(function* (slide, step) {
      const page = latest();
      if (page === undefined) {
        return yield* agentError(
          'No deck page is open, so there is no window to move.',
          'Open the deck URL the dev server printed in a browser or in `deckster present`.',
        );
      }

      const request: PageGotoRequest = { request: randomUUID(), slide, step };
      const done = yield* Effect.callback<PageGotoDone>((resume) => {
        waiting.set(request.request, (answer) => resume(Effect.succeed(answer)));
        page.client.send(PAGE_GOTO_EVENT, request);
        return Effect.sync(() => void waiting.delete(request.request));
      }).pipe(Effect.timeoutOption(GOTO_TIMEOUT_MS));
      if (Option.isNone(done)) {
        return yield* agentError(
          'The page did not answer in time.',
          'Check that the deck page is open and visible, then try again.',
        );
      }

      if (!done.value.ok) {
        return yield* agentError(done.value.error, 'Use `deck_outline` to list the slide ids.');
      }

      return done.value;
    }),

    attach: (channel) => {
      channel.on(PAGE_STATE_EVENT, onState);
      channel.on(PAGE_GOTO_DONE_EVENT, onDone);
      return () => {
        channel.off(PAGE_STATE_EVENT, onState);
        channel.off(PAGE_GOTO_DONE_EVENT, onDone);
        pages.clear();
      };
    },
  };
}
