import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';

import { cliLayer } from '#cli.ts';
import { FIXTURE_WORKSPACE } from '#lint/lint.fixtures.ts';
import { lintDeck } from '#lint/run-lint.ts';
import { Workspace } from '#workspace.ts';

/**
 * Room for a dev server and Chromium to start and render the fixture deck.
 */
const BROWSER_TEST_TIMEOUT_MS = 120_000;

/**
 * The chart rules, which the kit's charts feed through their `data-chart-*` attributes.
 */
const CHART_RULES = new Set([
  'chart-empty',
  'chart-funnel-grows',
  'chart-truncated-axis',
  'chart-too-many-series',
  'chart-too-many-categories',
  'chart-pie-slices',
  'chart-no-highlight',
  'chart-topic-title',
  'chart-missing-unit',
  'chart-legend-avoidable',
]);

describe('chart rules on rendered charts', () => {
  layer(cliLayer(Workspace.at(FIXTURE_WORKSPACE)))('the chart-rules fixture deck', (it) => {
    it.effect(
      'reports each chart rule on the chart that breaks it and nothing on the fine slides',
      () =>
        Effect.gen(function* () {
          const report = yield* lintDeck({ deck: 'chart-rules', brand: undefined });
          const fired = report.findings
            .filter((finding) => CHART_RULES.has(finding.rule))
            .map((finding) => `${finding.slide ?? ''}:${finding.rule}`)
            .toSorted();
          expect(fired).toEqual([
            'broken:chart-legend-avoidable',
            'broken:chart-missing-unit',
            'broken:chart-no-highlight',
            'broken:chart-too-many-categories',
            'broken:chart-topic-title',
            'broken:chart-truncated-axis',
            'crowded:chart-pie-slices',
            'empty:chart-empty',
            'funnel-grows:chart-funnel-grows',
            'single-point:chart-empty',
            'spaghetti:chart-no-highlight',
            'spaghetti:chart-too-many-series',
          ]);
          expect(report.findings.filter((finding) => finding.slide === 'fine')).toEqual([]);
          expect(report.findings.filter((finding) => finding.slide === 'highlighted-many')).toEqual(
            [],
          );
        }),
      BROWSER_TEST_TIMEOUT_MS,
    );
  });
});
