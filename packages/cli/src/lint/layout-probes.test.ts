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
const BROWSER_TEST_TIMEOUT_MS = 240_000;

/**
 * The fixture deck of layouts fed the cases a review found broken.
 */
const PROBE_DECK = 'layout-probes';

/**
 * The errors the probe deck must report, by slide and rule: the old image caption rebuilt in plain
 * markup (text over a photo with nothing behind it) and a table slot holding text and two tables.
 * Every other slide must lint without errors.
 */
const EXPECTED_ERRORS = [
  'old-image-caption container-overflow',
  'old-image-caption contrast',
  'old-image-caption off-brand',
  'table-two slot-content',
];

/**
 * Lints a copy of the probe deck in a scratch workspace that has the framework's brands.
 *
 * @param brand - The brand to render it in.
 */
const lintProbes = Effect.fn('lintProbes')(function* (brand: string) {
  const root = scratchWorkspace('deck-layout-probes-');
  fs.cpSync(
    path.join(FIXTURE_WORKSPACE, 'decks', PROBE_DECK),
    path.join(root, 'decks', PROBE_DECK),
    { recursive: true },
  );
  return yield* lintDeck({ deck: PROBE_DECK, brand }).pipe(
    Effect.provide(cliLayer(Workspace.at(root))),
    Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
  );
});

describe('the layout probes', () => {
  for (const brand of ['default', 'nocturne']) {
    it.effect(
      `lint with only the errors they are made to show, in the ${brand} brand`,
      () =>
        Effect.gen(function* () {
          const report = yield* lintProbes(brand);
          const errors = report.findings
            .filter((finding) => finding.severity === 'error')
            .map((finding) => `${finding.slide ?? 'deck'} ${finding.rule}`);
          expect([...new Set(errors)].toSorted()).toEqual(EXPECTED_ERRORS);
          // Text over a photo in the image layout keeps its contrast on every photo.
          const imageText = report.findings.filter(
            (finding) =>
              (finding.slide ?? '').startsWith('image-') &&
              (finding.rule === 'contrast' || finding.rule === 'off-brand'),
          );
          expect(imageText).toEqual([]);
          expect(report.summary.slides).toBeGreaterThanOrEqual(30);
        }).pipe(Effect.provide(NodeServices.layer)),
      BROWSER_TEST_TIMEOUT_MS,
    );
  }
});
