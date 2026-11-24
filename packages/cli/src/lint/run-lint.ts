import type { BrandTokens } from '@deckster/brand';
import type { FileSystem } from 'effect';

import { openCommentCounts } from '@deckster/comments/node';
import { budgetSeconds } from '@deckster/engine/frontmatter';
import {
  findDeck,
  loadLayoutCatalog,
  type DeckBuildError,
  type LayoutCatalogIndex,
} from '@deckster/vite-plugin';
import { Effect } from 'effect';
import path from 'node:path';

import type { DeckBrowser } from '#browser/deck-browser.ts';
import type { DeckPage, PageSlide } from '#browser/deck-page.ts';
import type { BrowserError, CliError, SlideNotReadyError, ViteError } from '#cli-error.ts';
import type {
  BrandContext,
  BrandFallback,
  DeckContext,
  DeckRule,
  DeckRuleInput,
  LintFinding,
  LintRule,
  RuleViolation,
  SlideContext,
  SlideRule,
  SlideRuleInput,
  StepSnapshot,
} from '#lint/types.ts';
import type { DeckServer } from '#server/deck-server.ts';

import { openDeck, type OpenedDeck } from '#browser/open-deck.ts';
import { brandContext } from '#lint/brand-context.ts';
import { findBrandFallbacks } from '#lint/brand-fallbacks.ts';
import {
  displayFile,
  findingsFromBrandError,
  findingsFromBrandWarnings,
  findingsFromError,
  findingsFromWarnings,
  type DeckPlace,
} from '#lint/deck-problems.ts';
import { LINT_RULES } from '#lint/rules/index.ts';
import { collectDeckErrors } from '#report-error.ts';
import { Workspace } from '#workspace.ts';

/**
 * The surface a slide uses when its frontmatter names none.
 */
const DEFAULT_SURFACE = 'default';

/**
 * The outcome of linting one deck.
 */
export type LintReport = {
  /**
   * The deck folder name.
   */
  deck: string;

  /**
   * The brand the deck was rendered with, or `null` when the deck config did not load.
   */
  brand: string | null;

  /**
   * `true` when there are no errors; warnings and info findings do not fail a deck.
   */
  ok: boolean;

  /**
   * The error, warning and info counts, how many slides and steps were rendered (0 when the deck
   * does not compile), and the total of the slides' speaking budgets in seconds (`null` when no
   * slide has one).
   */
  summary: {
    errors: number;
    warnings: number;
    info: number;
    slides: number;
    steps: number;
    budgetSeconds: number | null;
  };

  /**
   * Every finding: schema problems first, then each slide's in slide and step order, then the
   * deck's.
   */
  findings: LintFinding[];
};

/**
 * What to lint.
 */
export type LintOptions = {
  /**
   * The deck folder name.
   */
  deck: string;

  /**
   * A brand folder that replaces the deck config's `brand`; `undefined` keeps the deck's own.
   */
  brand: string | undefined;

  /**
   * The rules to run. Defaults to {@link LINT_RULES}.
   */
  rules?: readonly LintRule[];
};

/**
 * Every way linting can fail instead of producing a report.
 */
export type LintError = BrowserError | CliError | DeckBuildError | SlideNotReadyError | ViteError;

/**
 * One slide with its snapshots, one per step.
 */
type MeasuredSlide = {
  /**
   * The slide as the rules see it.
   */
  slide: SlideContext;

  /**
   * One snapshot per step, from step 0.
   */
  snapshots: StepSnapshot[];
};

/**
 * A finding, and what makes it the same finding at another step.
 */
export type KeyedFinding = {
  /**
   * The finding.
   */
  finding: LintFinding;

  /**
   * The slide, rule and the violation's own key.
   */
  key: string;
};

/**
 * Lints a deck: first the build pipeline's checks on the deck config, the brand and every slide
 * file, then, when everything compiles, the rendered rules on every step of every slide and the
 * deck rules on the whole deck.
 *
 * @param options - The deck, the brand override and the rules.
 * @throws DeckBuildError in the error channel when the deck does not exist; CliError, BrowserError
 *   or ViteError when the browser or the server fails; SlideNotReadyError when a slide never
 *   becomes ready. Problems in the deck's files are findings, not failures.
 */
export const lintDeck = Effect.fn('lintDeck')(function* (
  options: LintOptions,
): Effect.fn.Return<
  LintReport,
  LintError,
  Workspace | FileSystem.FileSystem | DeckServer | DeckBrowser
> {
  const { root: workspaceRoot } = yield* Workspace;
  const location = yield* findDeck(workspaceRoot, options.deck);
  const place: DeckPlace = { workspaceRoot, location };
  const rules = options.rules ?? LINT_RULES;
  const rendered = Effect.scoped(
    Effect.gen(function* () {
      const opened = yield* openDeck({ deck: options.deck, brand: options.brand, scale: 1 });
      const catalog = yield* loadLayoutCatalog(undefined, {
        brand: opened.brand.tokens,
        layoutsFile: opened.brand.layoutsFile,
      });
      const openComments = yield* openCommentCounts(location.dir);
      return yield* lintOpenedDeck(opened, catalog, rules, openComments);
    }),
  );
  return yield* rendered.pipe(
    Effect.catchTag('DeckProblemsError', (error) =>
      Effect.succeed(buildReport(options.deck, null, [...error.findings])),
    ),
    Effect.catchTag('BrandError', (error) =>
      Effect.succeed(buildReport(options.deck, null, findingsFromBrandError(error))),
    ),
    Effect.catchTag('DeckBuildError', (error) =>
      Effect.succeed(buildReport(options.deck, null, findingsFromError(error, place))),
    ),
    Effect.catchTag('ViteError', (error) =>
      collectDeckErrors(error).length === 0
        ? Effect.fail(error)
        : Effect.succeed(buildReport(options.deck, null, findingsFromError(error, place))),
    ),
  );
});

/**
 * Runs slide rules on one slide and attaches the file, step and rule id. `step` rules run on the
 * snapshot's step; `slide` rules report with no step.
 *
 * @param rules - The slide rules to run, in order.
 * @param input - The snapshot, the slide, the deck, the brand and the layout.
 * @returns The findings, each with the key that identifies it across steps.
 */
export function runSlideRules(rules: readonly SlideRule[], input: SlideRuleInput): KeyedFinding[] {
  return rules.flatMap((rule) =>
    rule.check(input).map((violation) =>
      toFinding(rule, violation, {
        slide: input.slide.id,
        file: input.slide.file,
        step: rule.scope === 'step' ? input.snapshot.step : null,
      }),
    ),
  );
}

/**
 * Runs deck rules and attaches the file and rule id: the slide's file for a violation about one
 * slide, else the deck config.
 *
 * @param rules - The deck rules to run, in order.
 * @param input - The deck and the brand.
 */
export function runDeckRules(rules: readonly DeckRule[], input: DeckRuleInput): KeyedFinding[] {
  return rules.flatMap((rule) =>
    rule.check(input).map((violation) => {
      const slide = input.deck.slides.find((candidate) => candidate.id === violation.slide);
      return toFinding(rule, violation, {
        slide: slide?.id ?? null,
        file: slide?.file ?? input.deck.configFile,
        step: null,
      });
    }),
  );
}

/**
 * Measures every step of every slide of an open deck and runs the rules on them.
 *
 * @param opened - The open deck, its brand and the page.
 * @param catalog - The layout catalog, for each slide's contract.
 * @param rules - The rules to run.
 * @param openComments - Open review comments by slide id.
 */
const lintOpenedDeck = Effect.fn('lintOpenedDeck')(function* (
  opened: OpenedDeck,
  catalog: LayoutCatalogIndex,
  rules: readonly LintRule[],
  openComments: Readonly<Record<string, number>>,
): Effect.fn.Return<LintReport, BrowserError | SlideNotReadyError, FileSystem.FileSystem> {
  const { deck, place, brand, page, buildWarnings } = opened;
  const loadErrors = yield* page.takeErrors();
  const fallbacks = yield* findBrandFallbacks({
    workspaceRoot: place.workspaceRoot,
    deckDir: place.location.dir,
    brand: brand.tokens.name,
    files: page.slides.map((pageSlide) => pageSlide.file),
    hasLayout: (name) => catalog.has(name),
  });
  const measured: MeasuredSlide[] = [];
  for (const pageSlide of page.slides) {
    measured.push(yield* measureSlide(page, pageSlide, place, fallbacks.get(pageSlide.file)));
  }

  const deckContext: DeckContext = {
    id: deck.location.id,
    title: deck.config.title,
    configFile: displayFile(place.workspaceRoot, deck.location.configFile),
    slides: measured.map(({ slide }) => slide),
    durationSeconds: budgetSeconds(deck.config.duration),
    pageErrors: loadErrors,
    openComments,
  };
  const brands = brandContexts(brand.tokens);
  const slideRules = rules.filter((rule): rule is SlideRule => rule.kind === 'slide');
  const deckRules = rules.filter((rule): rule is DeckRule => rule.kind === 'deck');
  const keyed = [
    ...checkSlides(measured, { deck: deckContext, brands, catalog, rules: slideRules }),
    ...runDeckRules(deckRules, { deck: deckContext, brand: brands(DEFAULT_SURFACE) }),
  ];
  const findings = [
    ...findingsFromWarnings(deck.warnings, place),
    ...findingsFromBrandWarnings(brand.location.displayPath, brand.warnings),
    ...buildWarnings,
    ...dedupe(keyed),
  ];
  const steps = measured.reduce((total, { snapshots }) => total + snapshots.length, 0);
  return buildReport(deck.location.id, brand.tokens.name, findings, {
    slides: measured.length,
    steps,
    budgetSeconds: totalBudget(measured.map(({ slide }) => slide)),
  });
});

/**
 * Runs the slide rules on every step of every measured slide, in slide and step order. A slide rule
 * with the `slide` scope runs only on the slide's last step; each slide sees its neighbours.
 *
 * @param measured - The slides with their snapshots, in deck order.
 * @param context - The deck, the brand per surface, the layout catalog and the slide rules.
 */
function checkSlides(
  measured: readonly MeasuredSlide[],
  context: {
    deck: DeckContext;
    brands: (surface: string) => BrandContext;
    catalog: LayoutCatalogIndex;
    rules: readonly SlideRule[];
  },
): KeyedFinding[] {
  return measured.flatMap(({ slide, snapshots }, position) => {
    const input = {
      slide,
      neighbours: {
        previous: shownNeighbour(measured, position, -1),
        next: shownNeighbour(measured, position, 1),
      },
      deck: context.deck,
      brand: context.brands(slide.surface),
      layout: context.catalog.get(slide.layout)?.contract,
    };
    return snapshots.flatMap((snapshot) => {
      const isLast = snapshot.step === slide.stepCount - 1;
      const active = context.rules.filter((rule) => rule.scope === 'step' || isLast);
      return runSlideRules(active, { ...input, snapshot });
    });
  });
}

/**
 * The nearest shown slide before (`-1`) or after (`1`) a position: what a talk shows next to it,
 * hidden slides skipped.
 *
 * @param measured - The slides, in deck order.
 * @param position - The position of the slide.
 * @param direction - `-1` for the previous slide, `1` for the next.
 */
function shownNeighbour(
  measured: readonly MeasuredSlide[],
  position: number,
  direction: -1 | 1,
): SlideContext | undefined {
  for (let at = position + direction; at >= 0 && at < measured.length; at += direction) {
    const candidate = measured[at]?.slide;
    if (candidate !== undefined && !candidate.hidden) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Shows every step of one slide and measures it, with the errors the page threw at each step.
 *
 * @param page - The open deck.
 * @param pageSlide - The slide.
 * @param place - The deck's location, for the slide's file.
 * @param brandFallback - Set when the slide names a layout only another brand defines.
 */
const measureSlide = Effect.fn('measureSlide')(function* (
  page: DeckPage,
  pageSlide: PageSlide,
  place: DeckPlace,
  brandFallback: BrandFallback | undefined,
): Effect.fn.Return<MeasuredSlide, BrowserError | SlideNotReadyError> {
  const stepCount = yield* page.stepCount(pageSlide.index);
  const snapshots: StepSnapshot[] = [];
  for (let step = 0; step < stepCount; step += 1) {
    yield* page.show(pageSlide.index, step);
    const collected = yield* page.measure();
    const pageErrors = yield* page.takeErrors();
    snapshots.push({ step, ...collected, pageErrors });
  }

  const surface = pageSlide.frontmatter['surface'];
  const slide: SlideContext = {
    index: pageSlide.index,
    id: pageSlide.id,
    file: displayFile(place.workspaceRoot, path.join(place.location.dir, pageSlide.file)),
    title: pageSlide.title,
    layout: pageSlide.layout,
    surface: typeof surface === 'string' ? surface : DEFAULT_SURFACE,
    frontmatter: pageSlide.frontmatter,
    notes: pageSlide.notes,
    budgetSeconds: pageSlide.budget ?? undefined,
    hidden: pageSlide.hidden,
    stepCount,
    ...(brandFallback === undefined ? {} : { brandFallback }),
  };
  return { slide, snapshots };
});

/**
 * Resolves the brand for a surface, once per surface.
 *
 * @param tokens - The brand's tokens.
 */
function brandContexts(tokens: BrandTokens): (surface: string) => BrandContext {
  const cache = new Map<string, BrandContext>();
  return (surface) => {
    const cached = cache.get(surface);
    if (cached !== undefined) {
      return cached;
    }

    const context = brandContext(tokens.name, tokens, surface);
    cache.set(surface, context);
    return context;
  };
}

/**
 * A violation as a finding, with the key that identifies it across steps.
 *
 * @param rule - The rule that found it.
 * @param violation - What the rule reported.
 * @param where - The slide, file and step.
 */
function toFinding(
  rule: LintRule,
  violation: RuleViolation,
  where: { slide: string | null; file: string; step: number | null },
): KeyedFinding {
  const own = violation.key ?? violation.selector ?? violation.message;
  return {
    key: `${where.slide ?? ''}|${rule.id}|${own}`,
    finding: {
      slide: where.slide,
      file: where.file,
      step: where.step,
      rule: rule.id,
      severity: violation.severity ?? rule.severity,
      message: violation.message,
      fix: violation.fix,
      selector: violation.selector,
    },
  };
}

/**
 * Keeps the first step where the same rule reports the same thing on the same slide.
 *
 * @param findings - The findings in slide and step order.
 */
function dedupe(findings: readonly KeyedFinding[]): LintFinding[] {
  const seen = new Set<string>();
  return findings.flatMap(({ key, finding }) => {
    if (seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [finding];
  });
}

/**
 * The total of the shown slides' speaking budgets in seconds, or `null` when none has one. Hidden
 * slides are not part of the talk, so their budgets stay out.
 *
 * @param slides - The slides.
 */
function totalBudget(slides: readonly SlideContext[]): number | null {
  const budgets = slides.flatMap((slide) =>
    slide.hidden || slide.budgetSeconds === undefined ? [] : [slide.budgetSeconds],
  );
  return budgets.length === 0 ? null : budgets.reduce((total, seconds) => total + seconds, 0);
}

/**
 * The report for a deck's findings, counting errors, warnings and info findings.
 *
 * @param deck - The deck folder name.
 * @param brand - The brand it rendered with, or `null`.
 * @param findings - Every finding.
 * @param rendered - How many slides and steps were rendered, and the budget total.
 */
function buildReport(
  deck: string,
  brand: string | null,
  findings: LintFinding[],
  rendered: { slides: number; steps: number; budgetSeconds: number | null } = {
    slides: 0,
    steps: 0,
    budgetSeconds: null,
  },
): LintReport {
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;
  const info = findings.filter((finding) => finding.severity === 'info').length;
  return {
    deck,
    brand,
    ok: errors === 0,
    summary: { errors, warnings, info, ...rendered },
    findings,
  };
}
