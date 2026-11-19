import type { Page } from 'playwright';

import { deckCommand } from '@deckster/engine/command';
import { Effect } from 'effect';

import type { OpenDeckPageOptions } from '#browser/deck-browser.ts';
import type { RenderErrorSnapshot } from '#lint/types.ts';

import { collectElements, type CollectedPage } from '#browser/collect-snapshot.ts';
import {
  readStartState,
  START_TIMING,
  startFailureMessage,
  waitForStart,
  type ReportedProblem,
} from '#browser/deck-start.ts';
import { sampleMediaBackgrounds } from '#browser/sample-media.ts';
import {
  browserError,
  cliError,
  SlideNotReadyError,
  type BrowserError,
  type CliError,
} from '#cli-error.ts';

/**
 * How long the deck gets to mount and publish `window.__deck`, and how long `ready()` waits for a
 * held slide.
 */
const DECK_READY_TIMEOUT_MS = START_TIMING.timeoutMs;

/**
 * The lowest HTTP status of a failed module request.
 */
const FIRST_ERROR_STATUS = 400;

/**
 * Milliseconds per second, for the timeout in the error message.
 */
const MS_PER_SECOND = 1000;

/**
 * Finds the held slide numbers in the message `ready()` rejects with: `slide 2, 5 is still held`.
 */
const HELD_SLIDES_PATTERN = /slides? ([\d, ]+) (?:is|are) still held/;

/**
 * The slide fields the browser tools read from `window.__deck.slides`.
 */
export type PageSlide = {
  /**
   * The zero-based slide index.
   */
  index: number;

  /**
   * The slide id.
   */
  id: string;

  /**
   * The slide file, relative to the deck folder, such as `slides/title.mdx`.
   */
  file: string;

  /**
   * The frontmatter title, else the first heading, else the id.
   */
  title: string;

  /**
   * The layout the slide names.
   */
  layout: string;

  /**
   * The speaker notes; empty when there are none.
   */
  notes: string;

  /**
   * The speaking budget in seconds, or `null` when the slide sets none.
   */
  budget: number | null;

  /**
   * Whether the slide is hidden (`hidden: true` in its frontmatter): a talk skips it, the page
   * still shows it when asked.
   */
  hidden: boolean;

  /**
   * The validated frontmatter, with defaults applied.
   */
  frontmatter: Readonly<Record<string, unknown>>;
};

/**
 * A deck open in a browser in `?static` mode. The real one drives Chromium; tests use a fake that
 * returns prepared snapshots.
 */
export type DeckPage = {
  /**
   * The slides the deck lists, in order.
   */
  slides: readonly PageSlide[];

  /**
   * Shows a slide at a step and waits until it is ready to capture.
   *
   * @param index - The zero-based slide index.
   * @param step - The step to show; clamped to the slide's last step.
   */
  show: (index: number, step: number) => Effect.Effect<void, SlideNotReadyError | BrowserError>;

  /**
   * The number of steps a slide has (step 0 included). Shows the slide first so it has mounted.
   *
   * @param index - The zero-based slide index.
   */
  stepCount: (index: number) => Effect.Effect<number, SlideNotReadyError | BrowserError>;

  /**
   * Measures the slide on screen.
   */
  measure: () => Effect.Effect<CollectedPage, BrowserError>;

  /**
   * The error the slide on screen shows in place of its content (the engine's `data-slide-error`
   * marker), or `null` when it rendered.
   */
  renderError: () => Effect.Effect<RenderErrorSnapshot | null, BrowserError>;

  /**
   * Writes a PNG of the page.
   *
   * @param file - The absolute path to write.
   */
  screenshot: (file: string) => Effect.Effect<void, BrowserError>;

  /**
   * The uncaught errors the page threw since the last call, oldest first.
   */
  takeErrors: () => Effect.Effect<string[]>;

  /**
   * The Playwright page itself, for `deck export`, which prints PDFs and measures scenes; absent in
   * fakes.
   */
  playwright?: Page;
};

/**
 * The part of `window.__deck` the page methods drive.
 */
type DeckWindow = {
  /**
   * The deck's automation API.
   */
  __deck?: {
    /**
     * Shows a slide at a step.
     */
    goto: (slide: number, step: number) => void;

    /**
     * Resolves once the slides are ready to capture; rejects naming the held slides.
     */
    ready: () => Promise<void>;

    /**
     * The slides, with the step count of each once it has mounted.
     */
    slides: (Omit<PageSlide, 'budget'> & {
      stepCount: number | undefined;
      budget: number | undefined;
    })[];
  };
};

/**
 * Opens the deck at a URL in a page, in `?static` mode, waits until it publishes `window.__deck`
 * and returns the page's {@link DeckPage} methods. A page that fails before the deck mounts (a
 * slide importing a name its module does not export, a module that does not compile or load) fails
 * as soon as that is clear, with the error, its file and the fix; only a deck that hangs waits the
 * full 30 s.
 *
 * @param page - A fresh page sized to the canvas.
 * @param url - The deck server's URL.
 * @param options - Whether to open the first reachable slide, and the workspace for naming files.
 * @throws CliError in the error channel when the deck does not start, with what the page logged;
 *   BrowserError when Chromium fails.
 */
export const loadDeckPage = Effect.fn('loadDeckPage')(function* (
  page: Page,
  url: string,
  options: Pick<OpenDeckPageOptions, 'opening' | 'workspaceRoot'> = {},
): Effect.fn.Return<DeckPage, CliError | BrowserError> {
  const problems = recordPageProblems(page);
  const hash = options.opening === true ? '' : '#/1/0';
  yield* Effect.tryPromise({
    try: () => page.goto(`${url}?static${hash}`),
    catch: (cause) => browserError('open the deck', cause),
  });
  yield* waitForDeck(page, problems, options.workspaceRoot);
  problems.starting = false;
  const slides = yield* Effect.tryPromise({
    try: () => readSlides(page),
    catch: (cause) => browserError('read the slide list', cause),
  });
  return buildDeckPage(page, slides, problems);
});

/**
 * What a page has logged: every error and console error, for a deck that does not start, and the
 * uncaught errors not yet taken.
 */
type PageProblems = {
  /**
   * Uncaught errors and console errors, as they arrive.
   */
  logged: string[];

  /**
   * Uncaught errors since the last {@link DeckPage.takeErrors}.
   */
  pending: string[];

  /**
   * Uncaught errors and failed module requests while the deck is starting, which may be what stops
   * it.
   */
  startup: ReportedProblem[];

  /**
   * Whether the deck is still starting; `startup` stops collecting once it has.
   */
  starting: boolean;
};

/**
 * Collects the page's uncaught errors and console errors, and while the deck starts, its failed
 * module requests.
 *
 * @param page - The page to listen to.
 */
function recordPageProblems(page: Page): PageProblems {
  const problems: PageProblems = { logged: [], pending: [], startup: [], starting: true };
  /**
   * Records a problem that may stop the deck from starting.
   */
  const startupProblem = (message: string, file: string) => {
    if (problems.starting) {
      problems.startup.push({ message, file, at: Date.now() });
    }
  };
  page.on('pageerror', (error) => {
    problems.logged.push(error.message);
    problems.pending.push(error.message);
    startupProblem(`${error.name}: ${error.message}`, '');
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.logged.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() >= FIRST_ERROR_STATUS && response.request().resourceType() === 'script') {
      const file = new URL(response.url()).pathname;
      startupProblem(`The server answered ${response.status()} for the module ${file}.`, file);
    }
  });
  page.on('requestfailed', (request) => {
    if (request.resourceType() === 'script') {
      const file = new URL(request.url()).pathname;
      startupProblem(
        `The page could not load the module ${file}: ${request.failure()?.errorText ?? 'failed'}.`,
        file,
      );
    }
  });
  return problems;
}

/**
 * Waits until the deck publishes `window.__deck`. It fails at once on Vite's error overlay, and
 * soon after an uncaught error or a failed module request the deck does not recover from, with that
 * error, its file and the fix; after 30 s without either, with what the page logged.
 *
 * @param page - The deck page.
 * @param problems - What the page reports.
 * @param workspaceRoot - The workspace root, for relative file names.
 */
function waitForDeck(
  page: Page,
  problems: PageProblems,
  workspaceRoot: string | undefined,
): Effect.Effect<void, CliError | BrowserError> {
  return Effect.tryPromise({
    try: () =>
      waitForStart(
        { state: () => page.evaluate(readStartState), reported: () => problems.startup },
        START_TIMING,
      ),
    catch: (cause) => browserError('wait for the deck to start', cause),
  }).pipe(
    Effect.flatMap((outcome) => {
      if (outcome.kind === 'started') {
        return Effect.void;
      }

      if (outcome.kind === 'failed') {
        return Effect.fail(cliError(startFailureMessage(outcome.problems, workspaceRoot)));
      }

      const { logged } = problems;
      const detail = logged.length === 0 ? 'The page logged no errors.' : logged.join('\n');
      return Effect.fail(
        cliError(
          `The deck did not start within ${DECK_READY_TIMEOUT_MS / MS_PER_SECOND}s.\n${detail}\n` +
            'Run `' +
            deckCommand() +
            ' lint <deck>` to check the slide files, ' +
            'or `' +
            deckCommand() +
            ' dev <deck>` to see the error in the browser.',
        ),
      );
    }),
  );
}

/**
 * The slides the deck lists, read from `window.__deck.slides`.
 *
 * @param page - The deck page, once the deck has started.
 */
async function readSlides(page: Page): Promise<PageSlide[]> {
  return page.evaluate(() =>
    ((window as DeckWindow).__deck?.slides ?? []).map((slide) => ({
      index: slide.index,
      id: slide.id,
      file: slide.file,
      title: slide.title,
      layout: slide.layout,
      notes: slide.notes,
      budget: slide.budget ?? null,
      hidden: slide.hidden === true,
      frontmatter: slide.frontmatter,
    })),
  );
}

/**
 * The {@link DeckPage} methods over an open page.
 *
 * @param page - The deck page.
 * @param slides - The slides the deck lists.
 * @param problems - What the page logs.
 */
function buildDeckPage(page: Page, slides: readonly PageSlide[], problems: PageProblems): DeckPage {
  /**
   * Shows a slide at a step and waits for `ready()`.
   */
  const show = (index: number, step: number) =>
    Effect.tryPromise({
      try: () =>
        page.evaluate(
          async ([slideIndex, stepIndex]) => {
            const deck = (window as DeckWindow).__deck;
            deck?.goto(slideIndex ?? 0, stepIndex ?? 0);
            await deck?.ready();
          },
          [index, step],
        ),
      catch: (cause) => readyFailure(cause, slides),
    });
  return {
    slides,
    show,
    stepCount: (index) =>
      show(index, 0).pipe(
        Effect.andThen(
          Effect.tryPromise({
            try: () =>
              page.evaluate(
                (slide) => (window as DeckWindow).__deck?.slides[slide]?.stepCount ?? 1,
                index,
              ),
            catch: (cause) => browserError('read the step count', cause),
          }),
        ),
      ),
    measure: () =>
      Effect.tryPromise({
        try: () => page.evaluate(collectElements),
        catch: (cause) => browserError('measure the slide', cause),
      }).pipe(Effect.flatMap((collected) => sampleMediaBackgrounds(page, collected))),
    renderError: () =>
      Effect.tryPromise({
        try: () =>
          page.evaluate(() => {
            const problem = document.querySelector(
              'section[data-slide-active="true"] [data-slide-error]',
            );
            if (problem === null) {
              return null;
            }

            const file = problem.querySelector('.deck-problem-file')?.textContent ?? '';
            const message =
              problem.querySelector('.deck-problem-message')?.textContent ?? problem.textContent;
            return { file, message: (message ?? '').trim() };
          }),
        catch: (cause) => browserError('check the slide for errors', cause),
      }),
    screenshot: (file) =>
      Effect.tryPromise({
        try: () => page.screenshot({ path: file, type: 'png', animations: 'disabled' }),
        catch: (cause) => browserError(`write ${file}`, cause),
      }).pipe(Effect.asVoid),
    takeErrors: () => Effect.sync(() => problems.pending.splice(0)),
    playwright: page,
  };
}

/**
 * The error for a `show` that failed: a {@link SlideNotReadyError} naming the slides when `ready()`
 * gave up on held slides, else a {@link BrowserError}.
 *
 * @param cause - What Playwright threw.
 * @param slides - The deck's slides, to name the held ones.
 */
function readyFailure(
  cause: unknown,
  slides: readonly PageSlide[],
): SlideNotReadyError | BrowserError {
  const message = cause instanceof Error ? cause.message : String(cause);
  const held = HELD_SLIDES_PATTERN.exec(message)?.[1];
  if (held === undefined) {
    return browserError('show the slide', cause);
  }

  return slideNotReadyError(
    held
      .split(',')
      .map((number) => Number(number.trim()))
      .filter((number) => Number.isInteger(number) && number > 0),
    slides,
  );
}

/**
 * Builds a {@link SlideNotReadyError} that names each held slide by number, id and file.
 *
 * @param numbers - The held slides, 1-based.
 * @param slides - The deck's slides.
 */
export function slideNotReadyError(
  numbers: readonly number[],
  slides: readonly PageSlide[],
): SlideNotReadyError {
  const named = numbers.map((number) => {
    const slide = slides[number - 1];
    return slide === undefined
      ? `slide ${number}`
      : `slide ${number} "${slide.id}" (${slide.file})`;
  });
  return new SlideNotReadyError({
    slides: numbers,
    message:
      `The deck was not ready after ${DECK_READY_TIMEOUT_MS / MS_PER_SECOND}s: ` +
      `${named.join(', ')} ${numbers.length === 1 ? 'is' : 'are'} still held.\n` +
      'A component on that slide called `useReadyHold(true)` and never released it. Pass `false` ' +
      'once its content has loaded, or fix whatever it is waiting for.',
  });
}
