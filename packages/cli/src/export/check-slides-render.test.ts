import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { FakeDeck } from '#browser/fake-deck.fixture.ts';
import type { ExportTarget } from '#export/export-targets.ts';

import { DeckBrowser } from '#browser/deck-browser.ts';
import { fakeDeckLayer, pageSlide } from '#browser/fake-deck.fixture.ts';
import { assertShotsRender, assertSlidesRender } from '#export/check-slides-render.ts';
import { collectedPage } from '#lint/snapshot.fixture.ts';

/**
 * A deck whose second slide shows a render error and whose third throws an uncaught error.
 */
const DECK: FakeDeck = {
  slides: [
    { page: pageSlide(0, 'title'), steps: [collectedPage()] },
    {
      page: pageSlide(1, 'broken'),
      steps: [
        collectedPage({ renderError: { file: 'slides/broken.mdx', message: 'boom\nstack' } }),
      ],
    },
    {
      page: pageSlide(2, 'throws'),
      steps: [collectedPage()],
      errors: { 0: ['TypeError: nope'] },
    },
  ],
};

/**
 * Runs the check over the deck's slides, one target per slide, and returns the error message, or
 * `null` when every slide renders.
 *
 * @param deck - The fake deck.
 */
const check = (deck: FakeDeck) =>
  Effect.gen(function* () {
    const browser = yield* DeckBrowser;
    const page = yield* browser.open('http://fake.invalid/', { scale: 2 });
    const targets: ExportTarget[] = page.slides.map((slide) => ({
      slide,
      step: 0,
      stepLabel: null,
    }));
    return yield* assertSlidesRender('hello', page, targets).pipe(
      Effect.match({ onSuccess: () => null, onFailure: (error) => error.message }),
    );
  }).pipe(Effect.scoped, Effect.provide(fakeDeckLayer(deck)));

describe('assertSlidesRender', () => {
  it.effect('fails naming every slide that shows an error or throws', () =>
    Effect.gen(function* () {
      const message = yield* check(DECK);
      expect(message).toContain('slide 2 "broken": boom');
      expect(message).toContain('slide 3 "throws": TypeError: nope');
      expect(message).not.toContain('slide 1');
      expect(message).not.toContain('stack');
    }),
  );

  it.effect('fails when the page threw while the deck loaded', () =>
    Effect.gen(function* () {
      const message = yield* check({
        slides: [{ page: pageSlide(0, 'title'), steps: [collectedPage()] }],
        loadErrors: ['early'],
      });
      expect(message).toContain('early');
    }),
  );

  it.effect('passes when every slide renders', () =>
    Effect.gen(function* () {
      const message = yield* check({
        slides: [{ page: pageSlide(0, 'title'), steps: [collectedPage()] }],
      });
      expect(message).toBeNull();
    }),
  );
});

describe('assertShotsRender', () => {
  const file = (number: number, error: string | null) => ({
    path: `/out/${number}.png`,
    slide: `s${number}`,
    number,
    step: null,
    hidden: false,
    width: 1920,
    height: 1080,
    error,
  });

  it.effect('fails naming each broken slide once and the load errors', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        assertShotsRender('hello', [
          { files: [file(1, null), file(2, 'boom\nstack'), file(2, 'again')], pageErrors: [] },
          { files: [], pageErrors: ['early'] },
        ]),
      );
      expect(error.message).toContain('2 problem(s)');
      expect(error.message).toContain('slide 2 "s2": boom');
      expect(error.message).not.toContain('again');
      expect(error.message).not.toContain('stack');
      expect(error.message).toContain('early');
    }),
  );

  it.effect('passes when every file rendered and the page did not throw', () =>
    Effect.gen(function* () {
      yield* assertShotsRender('hello', [{ files: [file(1, null)], pageErrors: [] }]);
    }),
  );
});
