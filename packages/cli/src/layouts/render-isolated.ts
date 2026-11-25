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

  /**
   * The failure and the ids in the pass that encountered it.
   */
  readonly failure?:
    | (RenderFailure & {
        /**
         * The slide ids still in the deck when rendering failed.
         */
        readonly attempted: ReadonlySet<string>;
      })
    | undefined;
};

/**
 * What stopped a render pass and the action to take before retrying.
 */
type RenderFailure = {
  /**
   * Why the pass stopped.
   */
  readonly message: string;

  /**
   * How to address the cause.
   */
  readonly fix: string;
};

/**
 * What a render gives instead of a report when it could not run, such as a deck that did not start
 * before its timeout, a browser that would not open the page or a server that failed.
 */
export type RenderFailed = {
  /**
   * What went wrong and how to address it.
   */
  readonly failed: RenderFailure;
};

/**
 * The failure when a render returns nothing at all.
 */
const NO_REPORT: RenderFailure = {
  /**
   * Why the pass stopped.
   */
  message: 'Rendering the generated deck returned no report.',

  /**
   * Where to look for more detail.
   */
  fix: 'Check the server and browser logs for the render failure.',
};

/**
 * Renders the generated slides, and when the deck does not build because some slides fail to
 * compile, renders the rest without them: one case with frontmatter its layout rejects must not
 * stop the other layouts from being checked, or make them pass without being rendered. Each pass
 * that fails to render sets aside the slides it reports an error for and tries again with the
 * others.
 *
 * It stops when a pass renders, when a failure names no slide of the deck (a problem with the deck
 * itself) or when no slide is left. Nothing is then rendered. It also stops, with the cause in
 * {@link RenderOutcome.failure}, when a pass could not run (it gives a {@link RenderFailed}) or
 * returned no report.
 *
 * @param slides - The generated slides.
 * @param render - Renders and lints a deck of these slides; a report with no slide rendered means
 *   the deck did not build.
 * @returns The findings of every pass and the slides that rendered.
 */
export const renderIsolated = Effect.fn('renderIsolated')(function* <E, R>(
  slides: readonly LimitSlide[],
  render: (
    slides: readonly LimitSlide[],
  ) => Effect.Effect<LintReport | RenderFailed | undefined, E, R>,
): Effect.fn.Return<RenderOutcome, E, R> {
  const notRendered = new Set<string>();
  const setAside: LintFinding[] = [];
  let attempt = slides;
  while (attempt.length > 0) {
    const ids = new Set(attempt.map((slide) => slide.id));
    const report = yield* render(attempt);
    if (report === undefined || 'failed' in report) {
      return {
        findings: setAside,
        rendered: notRendered,
        failure: { ...(report?.failed ?? NO_REPORT), attempted: ids },
      };
    }

    const findings = [...setAside, ...report.findings];
    if (report.summary.slides > 0) {
      return { findings, rendered: ids };
    }

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
