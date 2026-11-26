import { playwrightInstallCommand } from '@deckster/brand/node';
import { invalidMdx } from '@deckster/vite-plugin/errors';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import path from 'node:path';
import { chromium } from 'playwright';
import { vi } from 'vite-plus/test';

import { DeckBrowser } from '#browser/deck-browser.ts';
import { cliError, ViteError } from '#cli-error.ts';
import { checkLayouts } from '#layouts/check-layouts.ts';
import {
  CODE_BRAND,
  codeLayoutsWorkspace,
  contractRan,
  writeMarkedLayout,
} from '#layouts/code-layouts.fixture.ts';
import { DeckServer, type RunningDeckServer } from '#server/deck-server.ts';
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
 * A second valid layout in tests that exercise a batch.
 */
const OTHER_LAYOUT = 'other-layout';

/**
 * A scoped workspace with two layouts available to the render pass.
 */
const batchWorkspace = Effect.fn('batchWorkspace')(function* () {
  const root = yield* codeLayoutsWorkspace();
  const marker = '__deckCheckLayoutsBatchRan';
  writeMarkedLayout(path.join(root, 'brands', CODE_BRAND, 'layouts'), OTHER_LAYOUT, marker);
  yield* Effect.addFinalizer(() => Effect.sync(() => contractRan(marker)));
  return root;
});

/**
 * A server that starts successfully and passes generated slides through the supplied compiler.
 *
 * @param compile - How the server compiles each generated slide.
 */
function serverWith(compile: RunningDeckServer['compile'] = () => Effect.succeed([])) {
  return Layer.succeed(
    DeckServer,
    DeckServer.of({
      start: () => Effect.succeed({ url: 'http://fake.invalid/', compile }),
    }),
  );
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
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            serverWith(),
            Layer.succeed(DeckBrowser, DeckBrowser.of({ open: opening })),
            Workspace.at(root),
          ),
        ),
      );
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
        expect(problem?.fix).toContain('Fix the TypeError at the reported location.');
      }),
    CHECK_TIMEOUT_MS,
  );

  it.effect(
    'keeps compile findings on layouts set aside before the page failed',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* batchWorkspace();
          const server = serverWith((file) => {
            if (path.basename(file).startsWith(`${OTHER_LAYOUT}-`)) {
              const cause = invalidMdx(
                { file, displayPath: path.basename(file) },
                { message: 'The example did not compile.', fix: 'Fix the example.' },
              );
              return Effect.fail(new ViteError({ cause }));
            }

            return Effect.succeed([]);
          });
          const browser = Layer.succeed(
            DeckBrowser,
            DeckBrowser.of({
              open: () => Effect.fail(cliError('The deck did not start: the page failed.')),
            }),
          );
          const report = yield* checkLayouts({
            root,
            owner: { kind: 'brand', name: CODE_BRAND },
          }).pipe(Effect.provide(Layer.mergeAll(server, browser, Workspace.at(root))));
          expect(report.layouts).toMatchObject([
            { name: LAYOUT, cases: [], problems: [{ code: 'layout-render-failed' }] },
            {
              name: OTHER_LAYOUT,
              cases: [],
              problems: [{ message: 'The example did not compile.' }],
            },
          ]);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    CHECK_TIMEOUT_MS,
  );

  it.effect(
    'fails the whole check with one Chromium launch error and the install command',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const launch = vi
            .spyOn(chromium, 'launch')
            .mockRejectedValue(new Error('Executable missing'));
          yield* Effect.addFinalizer(() => Effect.sync(() => launch.mockRestore()));
          const root = yield* batchWorkspace();
          const result = yield* checkLayouts({
            root,
            owner: { kind: 'brand', name: CODE_BRAND },
          }).pipe(
            Effect.provide(Layer.mergeAll(serverWith(), DeckBrowser.layer, Workspace.at(root))),
            Effect.result,
          );
          expect(result).toMatchObject({
            _tag: 'Failure',
            failure: {
              _tag: 'CliError',
              message: `Could not start Chromium: Executable missing\nInstall the browser with \`${playwrightInstallCommand()}\`.`,
            },
          });
          expect(launch).toHaveBeenCalledTimes(1);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    CHECK_TIMEOUT_MS,
  );
});
