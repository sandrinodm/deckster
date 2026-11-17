import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';

import { openDeck } from '#browser/open-deck.ts';
import { cliLayer } from '#cli.ts';
import { FIXTURE_WORKSPACE } from '#lint/lint.fixtures.ts';
import { lintDeck } from '#lint/run-lint.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';
import { Workspace } from '#workspace.ts';

/**
 * Room for a dev server and Chromium to render the probe deck.
 */
const BROWSER_TEST_TIMEOUT_MS = 240_000;

/**
 * The fixture deck of surface background layers and slide backgrounds.
 */
const PROBE_DECK = 'backdrop-probes';

/**
 * Runs an effect against a copy of the probe deck in a scratch workspace with the `layered` brand.
 *
 * @param effect - What to do with the deck.
 */
function withProbes<A, E, R>(effect: Effect.Effect<A, E, R>) {
  const root = scratchWorkspace('deck-backdrop-probes-', ['layered']);
  fs.cpSync(
    path.join(FIXTURE_WORKSPACE, 'decks', PROBE_DECK),
    path.join(root, 'decks', PROBE_DECK),
    { recursive: true },
  );
  return effect.pipe(
    Effect.provide(cliLayer(Workspace.at(root))),
    Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
  );
}

/**
 * The background layers drawn on one slide of the probe deck, as `kind@index`.
 */
const layersOn = Effect.fn('layersOn')(function* (slide: number) {
  const { page } = yield* openDeck({ deck: PROBE_DECK, brand: undefined, scale: 1 });
  yield* page.show(slide, 0);
  const playwright = page.playwright;
  if (playwright === undefined) {
    return [];
  }

  return yield* Effect.promise(() =>
    playwright.evaluate(() =>
      Array.from(
        document.querySelectorAll('section[data-slide-active="true"] [data-backdrop-layer]'),
        (element) =>
          `${element.getAttribute('data-backdrop-kind') ?? ''}@` +
          `${element.getAttribute('data-backdrop-layer') ?? ''}`,
      ),
    ),
  );
});

describe('the backdrop probes', () => {
  it.effect(
    'report contrast only for text over the untinted photo, with the backdrop fix',
    () =>
      withProbes(
        Effect.gen(function* () {
          const report = yield* lintDeck({ deck: PROBE_DECK, brand: undefined });
          const errors = report.findings.filter((finding) => finding.severity === 'error');
          // centred-cover passes only because a centred cover fades the bright mark out of the
          // middle of the slide, behind its text.
          expect([...new Set(errors.map((finding) => `${finding.slide} ${finding.rule}`))]).toEqual(
            ['raw-photo-content contrast'],
          );
          for (const error of errors) {
            expect(error.fix).toContain('`background: none`');
          }
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'draw the surface layers, hide them for an override, and leave them out of the image layout',
    () =>
      withProbes(
        Effect.scoped(
          Effect.gen(function* () {
            // photo-title, override-tinted, override-over, override-none, image-on-photo.
            expect(yield* layersOn(0)).toEqual(['image@0', 'tint@0', 'placed@1']);
            expect(yield* layersOn(5)).toEqual(['image@slide', 'tint@slide']);
            expect(yield* layersOn(6)).toEqual(['gradient@0', 'placed@1', 'image@slide']);
            expect(yield* layersOn(7)).toEqual([]);
            expect(yield* layersOn(8)).toEqual([]);
            // override-path: the string form.
            expect(yield* layersOn(10)).toEqual(['image@slide']);
            // centred-cover: the mark is still drawn, only faded out behind the text.
            expect(yield* layersOn(11)).toEqual(['placed@0']);
          }),
        ),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );
});
