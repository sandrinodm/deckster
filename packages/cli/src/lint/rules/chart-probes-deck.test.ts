import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';

import { cliLayer } from '#cli.ts';
import { FIXTURE_WORKSPACE } from '#lint/lint.fixtures.ts';
import { lintDeck } from '#lint/run-lint.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';
import { Workspace } from '#workspace.ts';

/**
 * Room for a dev server and Chromium to render the probe deck's slides in one brand.
 */
const BROWSER_TEST_TIMEOUT_MS = 180_000;

/**
 * The fixture deck of charts fed awkward data and set in narrow columns.
 */
const PROBE_DECK = 'chart-probes';

/**
 * The probes of every chart and figure in a narrow column: five of twelve columns (`narrow-*`),
 * beside an aside (`aside-*`), and the pictogram in a 5:7 split that once ran into the margin.
 *
 * @param slide - A slide id.
 */
function isNarrowProbe(slide: string): boolean {
  return /^(narrow|aside)-/u.test(slide) || slide === 'pictogram-split';
}

/**
 * Lints a copy of the probe deck in a scratch workspace that has the framework's brands.
 *
 * @param brand - The brand to render it in.
 */
const lintProbes = Effect.fn('lintProbes')(function* (brand: string) {
  const root = scratchWorkspace('deck-chart-probes-');
  fs.cpSync(
    path.join(FIXTURE_WORKSPACE, 'decks', PROBE_DECK),
    path.join(root, 'decks', PROBE_DECK),
    {
      recursive: true,
    },
  );
  return yield* lintDeck({ deck: PROBE_DECK, brand }).pipe(
    Effect.provide(cliLayer(Workspace.at(root))),
    Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
  );
});

describe('charts and figures in narrow columns', () => {
  for (const brand of ['default', 'nocturne']) {
    it.effect(
      `fit their room without overflowing or cutting a label in the ${brand} brand`,
      () =>
        Effect.gen(function* () {
          const report = yield* lintProbes(brand);
          const narrow = report.findings
            .filter((finding) => isNarrowProbe(finding.slide ?? '') && finding.severity === 'error')
            .map((finding) => `${finding.slide ?? ''} ${finding.rule}: ${finding.message}`);
          expect(narrow).toEqual([]);
          expect(report.summary.slides).toBeGreaterThanOrEqual(48);
          // A label a chart still has to cut is reported, never cut silently.
          expect(
            report.findings.filter(
              (finding) => finding.slide === 'negative-bars' && finding.rule === 'text-truncated',
            ),
          ).toHaveLength(2);
        }).pipe(Effect.provide(NodeServices.layer)),
      BROWSER_TEST_TIMEOUT_MS,
    );
  }
});
