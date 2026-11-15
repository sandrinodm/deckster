import { loadLayoutCatalog } from '@deckster/vite-plugin';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';

import type { LintReport } from '#lint/run-lint.ts';

import { cliLayer } from '#cli.ts';
import { BUDGET_DECK, LIMIT_TEST_BRAND, writeLimitWorkspace } from '#lint/budget-limits.fixture.ts';
import { lintDeck } from '#lint/run-lint.ts';
import { Workspace } from '#workspace.ts';

/**
 * Rendering and linting every limit case in one brand takes a while in Chromium.
 */
const STRESS_TIMEOUT_MS = 300_000;

/**
 * The brands every budget is calibrated against: the kit's two, and a fixture brand with other
 * metrics (a wide sans, body at 30 px).
 */
const BRANDS = ['default', 'nocturne', LIMIT_TEST_BRAND] as const;

/**
 * Lints the stress deck in a brand, at the limits or one word over them.
 *
 * @param brand - The brand to render in.
 * @param over - Whether every slot holds one word more than its budget.
 */
const lintLimits = Effect.fn('lintLimits')(function* (brand: string, over: boolean) {
  const catalog = yield* loadLayoutCatalog();
  const contracts = [...catalog.values()].map((layout) => layout.contract);
  const root = writeLimitWorkspace(contracts, over);
  return yield* lintDeck({ deck: BUDGET_DECK, brand }).pipe(
    Effect.provide(cliLayer(Workspace.at(root))),
    Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
  );
});

/**
 * The content-budget findings of a report, as `slide selector` lines.
 *
 * @param report - A lint report.
 */
function budgetFindings(report: LintReport): string[] {
  return report.findings
    .filter((finding) => finding.rule === 'content-budget')
    .map((finding) => `${finding.slide ?? 'deck'} ${finding.selector ?? ''}`)
    .toSorted();
}

describe('the kit layouts at their budget limits', () => {
  for (const brand of BRANDS) {
    it.effect(
      `render with no lint errors in the ${brand} brand`,
      () =>
        Effect.gen(function* () {
          const report = yield* lintLimits(brand, false);
          const errors = report.findings
            .filter((finding) => finding.severity === 'error')
            .map((finding) => `${finding.slide ?? 'deck'} ${finding.rule}: ${finding.message}`);
          expect(errors).toEqual([]);
          expect(report.summary.slides).toBeGreaterThan(30);
        }).pipe(Effect.provide(NodeServices.layer)),
      STRESS_TIMEOUT_MS,
    );
  }

  // Budgets count words and bullets, which do not change with the brand's type, so a slide over
  // its budget is over it in every brand, and one within it is within it in every brand.
  it.effect(
    'go over budget one word past it, alike in every brand',
    () =>
      Effect.gen(function* () {
        const reports = yield* Effect.forEach(BRANDS, (brand) => lintLimits(brand, true), {
          concurrency: 1,
        });
        const [first, ...rest] = reports.map(budgetFindings);
        expect(first?.length ?? 0).toBeGreaterThan(30);
        for (const findings of rest) {
          expect(findings).toEqual(first);
        }

        expect(first?.every((line) => line.endsWith('(maxWords)'))).toBe(true);
      }).pipe(Effect.provide(NodeServices.layer)),
    STRESS_TIMEOUT_MS * 2,
  );
});
