import { Effect, Layer } from 'effect';

import type { CollectedPage } from '#browser/collect-snapshot.ts';
import type { DeckPage, PageSlide } from '#browser/deck-page.ts';

import { DeckBrowser } from '#browser/deck-browser.ts';
import { slideNotReadyError } from '#browser/deck-page.ts';
import { DeckServer } from '#server/deck-server.ts';

/**
 * One slide of a fake deck: what `window.__deck.slides` says about it and what each step measures.
 */
export type FakeSlide = {
  /**
   * The slide as the page lists it.
   */
  page: PageSlide;

  /**
   * One measured page per step, from step 0.
   */
  steps: readonly CollectedPage[];

  /**
   * Uncaught errors the page throws when each step is shown, by step.
   */
  errors?: Readonly<Record<number, readonly string[]>>;
};

/**
 * A deck served by nothing and shown in no browser: its slides, its load errors, and the slides a
 * component never releases.
 */
export type FakeDeck = {
  /**
   * The slides, in order.
   */
  slides: readonly FakeSlide[];

  /**
   * Uncaught errors the page throws while it loads.
   */
  loadErrors?: readonly string[];

  /**
   * The 1-based numbers of the slides `ready()` gives up on.
   */
  held?: readonly number[];
};

/**
 * A page slide with defaults for the fields a test does not care about.
 *
 * @param index - The zero-based index.
 * @param id - The slide id; its file is `slides/<id>.mdx`.
 * @param overrides - Other fields.
 */
export function pageSlide(
  index: number,
  id: string,
  overrides: Partial<PageSlide> = {},
): PageSlide {
  return {
    index,
    id,
    file: `slides/${id}.mdx`,
    title: id,
    layout: 'default',
    notes: 'Say this.',
    budget: null,
    hidden: false,
    frontmatter: { layout: 'default' },
    ...overrides,
  };
}

/**
 * Test layers for {@link DeckServer} and {@link DeckBrowser} that start no server and no Chromium:
 * the server compiles every module, and the browser opens the fake deck.
 *
 * @param deck - The fake deck.
 * @param screenshots - Receives the path of every screenshot taken.
 */
export function fakeDeckLayer(
  deck: FakeDeck,
  screenshots: string[] = [],
): Layer.Layer<DeckServer | DeckBrowser> {
  const server = Layer.succeed(
    DeckServer,
    DeckServer.of({
      start: () =>
        Effect.succeed({ url: 'http://fake.invalid/', compile: () => Effect.succeed([]) }),
    }),
  );
  const browser = Layer.succeed(
    DeckBrowser,
    DeckBrowser.of({ open: () => Effect.sync(() => fakePage(deck, screenshots)) }),
  );
  return Layer.mergeAll(server, browser);
}

/**
 * The {@link DeckPage} of a fake deck.
 *
 * @param deck - The fake deck.
 * @param screenshots - Receives the path of every screenshot taken.
 */
function fakePage(deck: FakeDeck, screenshots: string[]): DeckPage {
  const position = { slide: 0, step: 0 };
  const pending = [...(deck.loadErrors ?? [])];
  const slides = deck.slides.map((slide) => slide.page);

  /**
   * The fake slide on screen.
   */
  const current = () => deck.slides[position.slide];

  /**
   * The measured page on screen.
   */
  const measured = (): CollectedPage | undefined => {
    const steps = current()?.steps ?? [];
    return steps[Math.min(position.step, steps.length - 1)];
  };
  const show: DeckPage['show'] = (index, step) =>
    Effect.gen(function* () {
      const held = deck.held ?? [];
      if (held.length > 0) {
        return yield* slideNotReadyError(held, slides);
      }

      position.slide = index;
      position.step = step;
      pending.push(...(current()?.errors?.[step] ?? []));
    });
  return {
    slides,
    show,
    stepCount: (index) =>
      show(index, 0).pipe(Effect.as(Math.max(1, deck.slides[index]?.steps.length ?? 1))),
    measure: () =>
      Effect.sync(() => {
        const page = measured();
        if (page === undefined) {
          throw new Error(`The fake deck has no snapshot for slide ${position.slide}.`);
        }

        return page;
      }),
    renderError: () => Effect.sync(() => measured()?.renderError ?? null),
    screenshot: (file) =>
      Effect.sync(() => {
        screenshots.push(file);
      }),
    takeErrors: () => Effect.sync(() => pending.splice(0)),
  };
}
