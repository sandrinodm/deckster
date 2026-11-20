import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';

import { openDeck } from '#browser/open-deck.ts';
import { cliLayer } from '#cli.ts';
import { DEMO_WORKSPACE } from '#lint/lint.fixtures.ts';
import { Workspace } from '#workspace.ts';

/**
 * Chromium starts a local deck and compiles every lookbook slide before capturing it.
 */
const BROWSER_TIMEOUT_MS = 120_000;

layer(cliLayer(Workspace.at(DEMO_WORKSPACE)))('the lookbook in the browser', (it) => {
  it.effect(
    'hides the opened cutaway with its slide after moving between static captures',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openDeck({ deck: 'lookbook', brand: undefined, scale: 1 });
        const cutaway = page.slides.find((slide) => slide.id === 'product-cutaway');
        if (cutaway === undefined || page.playwright === undefined) {
          return yield* Effect.die('Expected the product cutaway and a Chromium page.');
        }

        const browser = page.playwright;
        const stepCount = yield* page.stepCount(cutaway.index);
        expect(stepCount).toBe(3);

        yield* page.show(cutaway.index, stepCount - 1);
        const labels = browser.locator('.kit-cutaway-label[aria-hidden="false"]');
        expect(yield* Effect.promise(() => labels.count())).toBe(3);
        expect(yield* Effect.promise(() => labels.first().isVisible())).toBe(true);

        yield* page.show(cutaway.index + 1, 0);
        expect(yield* Effect.promise(() => labels.count())).toBe(3);
        expect(yield* Effect.promise(() => labels.first().isVisible())).toBe(false);
      }),
    BROWSER_TIMEOUT_MS,
  );
});
