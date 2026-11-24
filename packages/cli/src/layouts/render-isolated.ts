import { Effect } from 'effect';

import type { LimitSlide } from '#layouts/limit-deck.ts';
import type { LintReport } from '#lint/run-lint.ts';
import type { LintFinding } from '#lint/types.ts';

/**
 * What rendering the generated slides gave.
 */
export type RenderOutcome = {
  /**
   * The findings: of the slides that did not compile, then of the slides that rendered.
   */
  readonly findings: readonly LintFinding[];

  /**
   * The ids of the slides that were rendered and measured; none when the deck never rendered.
   */
  readonly rendered: ReadonlySet<string>;
};

/**
 * Renders the generated slides, and when the deck does not build because some slides fail to
 * compile, renders the rest without them: one case with frontmatter its layout rejects must not
 * stop the other layouts from being checked, or make them pass without being rendered. Each pass
 * that fails to render sets aside the slides it reports an error for and tries again with the
 * others.
 *
 * It stops when a pass renders, when a failure names no slide of the deck (a problem with the deck
 * itself) or when no slide is left. Nothing is then rendered.
 *
 * @param slides - The generated slides.
 * @param render - Renders and lints a deck of these slides; a report with no slide rendered means
 *   the deck did not build.
 * @returns The findings of every pass and the slides that rendered.
 */
export const renderIsolated = Effect.fn('renderIsolated')(function* <E, R>(
  slides: readonly LimitSlide[],
  render: (slides: readonly LimitSlide[]) => Effect.Effect<LintReport, E, R>,
): Effect.fn.Return<RenderOutcome, E, R> {
  const notRendered = new Set<string>();
  const setAside: LintFinding[] = [];
  let attempt = slides;
  while (attempt.length > 0) {
    const report = yield* render(attempt);
    const findings = [...setAside, ...report.findings];
    if (report.summary.slides > 0) {
      return { findings, rendered: new Set(attempt.map((slide) => slide.id)) };
    }

    const ids = new Set(attempt.map((slide) => slide.id));
    const failed = new Set(
      report.findings.flatMap((finding) =>
        finding.severity === 'error' && finding.slide !== null && ids.has(finding.slide)
          ? [finding.slide]
          : [],
      ),
    );
    if (failed.size === 0 || failed.size === ids.size) {
      return { findings, rendered: notRendered };
    }

    setAside.push(...report.findings.filter((finding) => failed.has(finding.slide ?? '')));
    attempt = attempt.filter((slide) => !failed.has(slide.id));
  }

  return { findings: setAside, rendered: notRendered };
});
