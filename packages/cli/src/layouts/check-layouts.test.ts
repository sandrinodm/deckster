import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { DeckBrowser } from '#browser/deck-browser.ts';
import { cliError } from '#cli-error.ts';
import { checkLayouts } from '#layouts/check-layouts.ts';
import { CODE_BRAND, codeLayoutsWorkspace } from '#layouts/code-layouts.fixture.ts';
import { DeckServer } from '#server/deck-server.ts';
import { Workspace } from '#workspace.ts';

/**
 * Room for the catalog to load the brand's code layouts on a busy machine.
 */
const CHECK_TIMEOUT_MS = 120_000;

/**
 * The layout the tests check.
 */
const LAYOUT = 'kpi-wall';

/**
 * Layers whose server starts and whose browser fails to open the generated deck in the way given.
 *
 * @param opening - What opening the deck does instead of giving a page.
 */
function browserThat(opening: () => ReturnType<DeckBrowser['Service']['open']>) {
  const server = Layer.succeed(
    DeckServer,
    DeckServer.of({
      start: () =>
        Effect.succeed({ url: 'http://fake.invalid/', compile: () => Effect.succeed([]) }),
    }),
  );
  const browser = Layer.succeed(DeckBrowser, DeckBrowser.of({ open: opening }));
  return Layer.mergeAll(server, browser);
}

/**
 * Checks the fixture brand's layout in a scratch workspace whose browser fails as given.
 *
 * @param opening - What opening the deck does instead of giving a page.
 */
const checkWhere = (opening: () => ReturnType<DeckBrowser['Service']['open']>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* codeLayoutsWorkspace();
      return yield* checkLayouts({
        root,
        owner: { kind: 'brand', name: CODE_BRAND },
        layout: LAYOUT,
      }).pipe(Effect.provide(Layer.mergeAll(browserThat(opening), Workspace.at(root))));
    }),
  ).pipe(Effect.provide(NodeServices.layer));

describe('checkLayouts when the rendering fails', () => {
  it.effect(
    'names the layout, the timeout and how to run it again when the deck does not start',
    () =>
      Effect.gen(function* () {
        const report = yield* checkWhere(() =>
          Effect.fail(cliError('The deck did not start within 30s.')),
        );
        expect(report.ok).toBe(false);
        const [layout] = report.layouts;
        expect(layout).toMatchObject({ name: LAYOUT, ok: false, cases: [] });
        const [problem] = layout?.problems ?? [];
        expect(problem).toMatchObject({
          severity: 'error',
          code: 'layout-render-failed',
          file: `brands/${CODE_BRAND}/layouts/${LAYOUT}`,
        });
        expect(problem?.message).toContain(`The layout ${LAYOUT} was not checked`);
        expect(problem?.message).toContain('The deck did not start within 30s.');
        expect(problem?.fix).toContain(`layouts check ${LAYOUT} --brand ${CODE_BRAND}`);
      }),
    CHECK_TIMEOUT_MS,
  );

  it.effect(
    'names the layout instead of throwing when rendering dies on a missing value',
    () =>
      Effect.gen(function* () {
        const report = yield* checkWhere(() =>
          Effect.die(new TypeError("Cannot read properties of undefined (reading 'flatMap')")),
        );
        const [problem] = report.layouts[0]?.problems ?? [];
        expect(problem?.code).toBe('layout-render-failed');
        expect(problem?.message).toContain("reading 'flatMap'");
      }),
    CHECK_TIMEOUT_MS,
  );
});
