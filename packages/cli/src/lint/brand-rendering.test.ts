import { NodeServices } from '@effect/platform-node';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { openDeck } from '#browser/open-deck.ts';
import { cliLayer } from '#cli.ts';
import { BrandScratch } from '#lint/fixture-brands.fixture.ts';
import { lintDeck } from '#lint/run-lint.ts';
import { Workspace } from '#workspace.ts';

/**
 * Room for a dev server and Chromium to start and render a fixture deck.
 */
const BROWSER_TEST_TIMEOUT_MS = 120_000;

/**
 * The CLI's services in a scratch workspace with the role-text and logo-cover decks and the fixture
 * brands.
 */
const services = Layer.unwrap(
  Effect.gen(function* () {
    const { root } = yield* BrandScratch;
    return cliLayer(Workspace.at(root));
  }),
).pipe(
  Layer.provide(BrandScratch.withDecks(['role-text', 'logo-cover'])),
  Layer.provide(NodeServices.layer),
);

/**
 * The selectors of the logo images on the cover slide of `logo-cover` in a brand.
 */
const coverLogos = Effect.fn('coverLogos')(function* (brand: string) {
  const { page } = yield* openDeck({ deck: 'logo-cover', brand, scale: 1 });
  yield* page.show(0, 0);
  const { elements } = yield* page.measure();
  return elements
    .filter((element) => element.tag === 'img' && element.selector.includes('kit-logo'))
    .map((element) => element.selector);
});

describe('brands rendered by the kit', () => {
  layer(services, { timeout: BROWSER_TEST_TIMEOUT_MS })('fixture decks in fixture brands', (it) => {
    it.effect(
      'set small text in a role color at 4.5:1 on every surface when the roles reach only 3:1',
      () =>
        Effect.gen(function* () {
          const report = yield* lintDeck({ deck: 'role-text', brand: 'weak-accent' });
          expect(report.brand).toBe('weak-accent');
          expect(report.summary.slides).toBe(10);
          expect(report.findings.filter((finding) => finding.rule === 'contrast')).toEqual([]);
          expect(report.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
        }),
      BROWSER_TEST_TIMEOUT_MS,
    );

    it.effect(
      'draw the cover logo only for a brand that shows one, and no placeholder without one',
      () =>
        Effect.gen(function* () {
          expect(yield* Effect.scoped(coverLogos('weak-accent'))).toHaveLength(1);
          expect(yield* Effect.scoped(coverLogos('hidden-logo'))).toEqual([]);
          expect(yield* Effect.scoped(coverLogos('no-logo'))).toEqual([]);
        }),
      BROWSER_TEST_TIMEOUT_MS,
    );
  });
});
