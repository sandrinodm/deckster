import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import type { LintFinding } from '#lint/types.ts';

import { fakeDeckLayer, pageSlide, type FakeDeck } from '#browser/fake-deck.fixture.ts';
import { cliLayer } from '#cli.ts';
import { FIXTURE_WORKSPACE } from '#lint/lint.fixtures.ts';
import { lintDeck } from '#lint/run-lint.ts';
import { collectedPage, textElement } from '#lint/snapshot.fixture.ts';
import { Workspace } from '#workspace.ts';

const BROWSER_TEST_TIMEOUT_MS = 120_000;

/**
 * How long a deck that cannot start may take to fail, server start included: well under the 30 s a
 * hanging deck gets.
 */
const START_FAILS_WITHIN_MS = 20_000;

/**
 * The services for linting a fake deck in the fixture workspace: real files, no server, no
 * Chromium.
 */
function fakeServices(deck: FakeDeck) {
  return Layer.mergeAll(fakeDeckLayer(deck), Workspace.at(FIXTURE_WORKSPACE), NodeServices.layer);
}

/**
 * `slide:rule` for every finding, to compare what fired where.
 */
function firedRules(findings: readonly LintFinding[]): string[] {
  return findings.map((finding) => `${finding.slide ?? 'deck'}:${finding.rule}`);
}

describe('lintDeck with a fake browser', () => {
  const tiny = textElement('tiny', { fontSizePx: 12 });
  const deck: FakeDeck = {
    slides: [
      {
        page: pageSlide(0, 'eight-bullets', { notes: '' }),
        steps: [collectedPage({ elements: [tiny] }), collectedPage({ elements: [tiny] })],
        errors: { 1: ['late failure'] },
      },
    ],
    loadErrors: ['early failure'],
  };

  it.effect('runs step rules on every step, slide rules once, and reports each finding once', () =>
    Effect.gen(function* () {
      const report = yield* lintDeck({ deck: 'over-budget', brand: undefined });
      expect(firedRules(report.findings)).toEqual([
        'eight-bullets:min-font-size',
        'eight-bullets:off-brand',
        'eight-bullets:render-error',
        'eight-bullets:missing-notes',
        'deck:render-error',
      ]);
      expect(report.findings[0]).toMatchObject({
        file: 'decks/over-budget/slides/eight-bullets.mdx',
        step: 0,
        severity: 'error',
      });
      expect(report.findings[2]).toMatchObject({
        step: 1,
        message: 'The page threw while this slide was shown: late failure',
      });
      expect(report.findings[3]).toMatchObject({ step: null, severity: 'warning' });
      expect(report.findings[4]).toMatchObject({ file: 'decks/over-budget/deck.config.ts' });
      expect(report).toMatchObject({ ok: false, brand: 'default' });
      expect(report.summary).toMatchObject({ errors: 3, warnings: 2, slides: 1, steps: 2 });
    }).pipe(Effect.provide(fakeServices(deck))),
  );

  it.effect('checks the slide budgets against the deck config duration', () =>
    Effect.gen(function* () {
      const report = yield* lintDeck({ deck: 'over-duration', brand: undefined });
      const finding = report.findings.find((candidate) => candidate.rule === 'time-budget');
      expect(finding).toMatchObject({
        file: 'decks/over-duration/deck.config.ts',
        severity: 'error',
        message: "The slides' budgets add up to 1:30; the talk has 1:00.",
      });
    }).pipe(
      Effect.provide(
        fakeServices({
          slides: [
            {
              page: pageSlide(0, 'long-talk', { budget: 90 }),
              steps: [collectedPage({ elements: [] })],
            },
          ],
        }),
      ),
    ),
  );

  it.effect('fails with the held slides when ready() gives up', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(lintDeck({ deck: 'over-budget', brand: undefined }));
      expect(error._tag).toBe('SlideNotReadyError');
      expect(error.message).toContain(
        'slide 1 "eight-bullets" (slides/eight-bullets.mdx) is still held',
      );
    }).pipe(Effect.provide(fakeServices({ ...deck, held: [1] }))),
  );

  it.effect('reports a brand that does not exist as a finding at the brand file', () =>
    Effect.gen(function* () {
      const report = yield* lintDeck({ deck: 'over-budget', brand: 'nope' });
      expect(report.ok).toBe(false);
      expect(report.findings[0]).toMatchObject({
        rule: 'brand',
        file: 'brands/nope/brand.ts',
        message: 'There is no brands/nope/brand.ts.',
      });
    }).pipe(Effect.provide(fakeServices(deck))),
  );
});

layer(cliLayer(Workspace.layer))('lintDeck in Chromium', (it) => {
  for (const brand of ['default', 'nocturne']) {
    it.effect(
      `passes on the hello deck in the ${brand} brand`,
      () =>
        Effect.gen(function* () {
          const report = yield* lintDeck({ deck: 'hello', brand });
          expect(report.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
          expect(report.ok).toBe(true);
          expect(report.brand).toBe(brand);
          expect(report.summary).toMatchObject({ slides: 4, steps: 8, budgetSeconds: 165 });
        }),
      BROWSER_TEST_TIMEOUT_MS,
    );
  }

  it.effect('finds the hello deck in the real workspace', () =>
    Effect.gen(function* () {
      const { root } = yield* Workspace;
      expect(root).toBe(FRAMEWORK_ROOT);
    }),
  );
});

layer(cliLayer(Workspace.at(FIXTURE_WORKSPACE)))('lintDeck on the fixture decks', (it) => {
  it.effect(
    'reports every rule on its failing case and nothing on its passing case',
    () =>
      Effect.gen(function* () {
        const report = yield* lintDeck({ deck: 'rules', brand: undefined });
        const fired = firedRules(report.findings);
        const failing = [
          'overflowing:canvas-overflow',
          'overflowing:container-overflow',
          'small-type:min-font-size',
          'overlap:text-overlap',
          'low-contrast:contrast',
          'off-brand:off-brand',
          'images:low-res-image',
          'images:broken-image',
          'list-in-statement:slot-content',
          'throws:render-error',
          'no-notes:missing-notes',
          'too-many-bullets:content-budget',
          'repeated:layout-repetition',
        ];
        for (const rule of failing) {
          expect(fired, rule).toContain(rule);
        }

        expect(fired.filter((rule) => rule.startsWith('decoration:'))).toEqual([]);
        expect(fired.filter((rule) => rule.endsWith(':broken-image'))).toEqual([
          'images:broken-image',
        ]);
        expect(fired.filter((rule) => rule.endsWith(':slot-content'))).toEqual([
          'list-in-statement:slot-content',
        ]);
        expect(fired.filter((rule) => rule.endsWith(':render-error'))).toHaveLength(2);
        for (const rule of ['media-missing', 'code-unknown-language', 'code-step-range']) {
          expect(fired, rule).toContain(`build-warnings:${rule}`);
        }

        const missing = report.findings.find((finding) => finding.rule === 'media-missing');
        expect(missing?.severity).toBe('error');
        expect(missing?.file).toBe('decks/rules/slides/build-warnings.mdx');
        expect(missing?.fix).toContain('relative to the slide file');
        const messages = report.findings.map((finding) => `${finding.slide}: ${finding.message}`);
        expect(messages).toContainEqual(expect.stringContaining('Thrown after mount on purpose.'));
        expect(messages).toContainEqual(
          'small-type: "Eight pixels on the canvas" appears at 8px; the minimum is 20px.',
        );
        expect(messages).toContainEqual(
          expect.stringMatching(/^small-type: "Shrunk by a transform" appears at 10\.8px/),
        );
        expect(messages.filter((message) => message.includes('Six units'))).toEqual([]);
        expect(messages.filter((message) => message.includes('Muted text'))).toEqual([]);
        expect(messages.filter((message) => message.includes('Brand accent'))).toEqual([]);
        expect(messages.filter((message) => message.includes('vector'))).toEqual([]);
        expect(messages.filter((message) => message.includes('sit apart'))).toEqual([]);
        const offBrand = report.findings.filter((finding) => finding.rule === 'off-brand');
        expect(offBrand.map((finding) => finding.message)).toEqual(
          expect.arrayContaining([
            expect.stringContaining('#ff00aa'),
            expect.stringContaining('Georgia'),
            expect.stringContaining('font size 37px'),
            expect.stringContaining('padding 28px'),
          ]),
        );
        expect(fired.filter((rule) => rule.endsWith(':layout-repetition'))).toEqual([
          'repeated:layout-repetition',
        ]);
        expect(fired.filter((rule) => rule.endsWith(':missing-notes'))).toEqual([
          'throws:missing-notes',
          'no-notes:missing-notes',
        ]);
      }),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'fails fast, naming the file and the fix, when a slide imports a name its module lacks',
    () =>
      Effect.gen(function* () {
        const started = Date.now();
        const error = yield* Effect.flip(lintDeck({ deck: 'bad-import', brand: undefined }));
        expect(Date.now() - started).toBeLessThan(START_FAILS_WITHIN_MS);
        expect(error._tag).toBe('CliError');
        expect(error.message).toContain(
          'Fix the import in decks/bad-import/slides/missing-export.tsx: it imports `farewell` ' +
            'from decks/bad-import/slides/helper.ts, which does not export it.',
        );
        expect(error.message).not.toContain('within 30s');
      }),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'reports bad frontmatter per file with the fix, and skips rendering',
    () =>
      Effect.gen(function* () {
        const report = yield* lintDeck({ deck: 'bad-frontmatter', brand: undefined });
        expect(report.ok).toBe(false);
        expect(report.summary.steps).toBe(0);
        expect(report.findings.length).toBeGreaterThanOrEqual(2);
        for (const finding of report.findings) {
          expect(finding).toMatchObject({
            rule: 'schema',
            slide: 'broken',
            file: 'decks/bad-frontmatter/slides/broken.mdx',
            step: null,
          });
          expect(finding.fix).not.toBe('');
        }

        expect(report.findings.map((finding) => finding.message).join('\n')).toContain('colour');
      }),
    BROWSER_TEST_TIMEOUT_MS,
  );
});
