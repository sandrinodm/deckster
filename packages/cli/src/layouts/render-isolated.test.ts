import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { LimitSlide } from '#layouts/limit-deck.ts';
import type { LintReport } from '#lint/run-lint.ts';
import type { LintFinding } from '#lint/types.ts';

import { renderIsolated } from '#layouts/render-isolated.ts';

/**
 * A generated slide of a layout.
 *
 * @param id - The slide id.
 */
function slideOf(id: string): LimitSlide {
  return { id, mdx: '', layout: id.split('-')[0] ?? id, case: 'example' };
}

/**
 * A finding on a slide.
 *
 * @param slide - The slide id, or `null` for one of the deck.
 * @param severity - The severity.
 */
function findingOn(slide: string | null, severity: LintFinding['severity']): LintFinding {
  return {
    slide,
    file: 'x.mdx',
    step: null,
    rule: 'rule',
    severity,
    message: 'm',
    fix: 'f',
    selector: null,
  };
}

/**
 * A fake lint of a deck: slides in `broken` fail to compile, so a deck with any of them renders
 * nothing and reports an error per broken slide; else every slide renders with a warning.
 *
 * @param broken - The ids of the slides that do not compile.
 * @param calls - Records the ids of each deck rendered.
 * @param deckProblem - Whether the deck itself has an error.
 */
function fakeRender(broken: readonly string[], calls: string[][], deckProblem = false) {
  return (slides: readonly LimitSlide[]): Effect.Effect<LintReport> => {
    calls.push(slides.map((slide) => slide.id));
    const failing = slides.filter((slide) => broken.includes(slide.id));
    const findings =
      failing.length > 0 || deckProblem
        ? [
            ...failing.map((slide) => findingOn(slide.id, 'error')),
            ...(deckProblem ? [findingOn(null, 'error')] : []),
          ]
        : slides.map((slide) => findingOn(slide.id, 'warning'));
    const rendered = failing.length > 0 || deckProblem ? 0 : slides.length;
    return Effect.succeed({
      deck: 'd',
      brand: null,
      ok: false,
      summary: {
        errors: 0,
        warnings: 0,
        info: 0,
        slides: rendered,
        steps: rendered,
        budgetSeconds: null,
      },
      findings,
    });
  };
}

describe('renderIsolated', () => {
  it.effect('renders every slide in one pass when the deck builds', () =>
    Effect.gen(function* () {
      const calls: string[][] = [];
      const slides = [slideOf('a-1'), slideOf('b-1')];
      const outcome = yield* renderIsolated(slides, fakeRender([], calls));
      expect(calls).toEqual([['a-1', 'b-1']]);
      expect([...outcome.rendered]).toEqual(['a-1', 'b-1']);
      expect(outcome.findings).toHaveLength(2);
    }),
  );

  it.effect('renders the slides that compile without the ones that do not', () =>
    Effect.gen(function* () {
      const calls: string[][] = [];
      const slides = [slideOf('a-1'), slideOf('b-1'), slideOf('c-1')];
      const outcome = yield* renderIsolated(slides, fakeRender(['b-1'], calls));
      expect(calls).toEqual([
        ['a-1', 'b-1', 'c-1'],
        ['a-1', 'c-1'],
      ]);
      expect([...outcome.rendered]).toEqual(['a-1', 'c-1']);
      expect(outcome.findings.filter((finding) => finding.severity === 'error')).toEqual([
        findingOn('b-1', 'error'),
      ]);
      expect(outcome.findings.filter((finding) => finding.severity === 'warning')).toHaveLength(2);
    }),
  );

  it.effect('renders nothing when the deck itself fails or every slide does', () =>
    Effect.gen(function* () {
      const calls: string[][] = [];
      const slides = [slideOf('a-1'), slideOf('b-1')];
      const deck = yield* renderIsolated(slides, fakeRender([], calls, true));
      expect(deck.rendered.size).toBe(0);
      expect(calls).toHaveLength(1);
      const all = yield* renderIsolated(slides, fakeRender(['a-1', 'b-1'], []));
      expect(all.rendered.size).toBe(0);
      expect(all.findings).toHaveLength(2);
    }),
  );
});
