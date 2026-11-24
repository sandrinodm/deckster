import type { BrandError } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';
import type { FileSystem, Scope } from 'effect';

import { loadBrand, type LoadedBrand } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import {
  BRAND_CODE_SOURCE_PREFIX,
  deckBrandName,
  deckCatalog,
  DECK_SOURCE_PREFIX,
  findDeck,
  LAYOUTS_DIR,
  loadDeck,
  type DeckBuildError,
  type DeckCatalog,
  type DeckLocation,
  type LayoutProblem,
} from '@deckster/vite-plugin';
import { Effect } from 'effect';
import path from 'node:path';

import type { DeckBrowser } from '#browser/deck-browser.ts';
import type { LayoutsOwner } from '#layouts/layouts-owner.ts';
import type { LintFinding, LintRule } from '#lint/types.ts';
import type { DeckServer } from '#server/deck-server.ts';
import type { Workspace } from '#workspace.ts';

import { cliError, type CliError, type FileSystemError } from '#cli-error.ts';
import { checkReplacements } from '#layouts/check-brand-layouts.ts';
import { writeCheckWorkspace } from '#layouts/check-workspace.ts';
import { loadLayoutLimits, LIMITS_FILE } from '#layouts/layout-limits.ts';
import { exampleSlide, limitSlides, type LimitSlide } from '#layouts/limit-deck.ts';
import { LINT_RULES } from '#lint/rules/index.ts';
import { lintDeck, type LintError } from '#lint/run-lint.ts';

/**
 * The id of the generated deck when the layouts are a brand's.
 */
const BRAND_CHECK_DECK = 'layouts-check';

/**
 * Rules about a deck as a talk, not about one slide's layout: they would only report the generated
 * deck's shape (one layout repeated, no builds, no notes, no timing).
 */
const TALK_RULES: ReadonlySet<string> = new Set([
  'layout-repetition',
  'few-builds',
  'time-budget',
  'open-comments',
  'missing-notes',
  'brand-layout-fallback',
]);

/**
 * The rules `deckster layouts check` runs on the rendered slides.
 */
const CHECK_RULES: readonly LintRule[] = LINT_RULES.filter((rule) => !TALK_RULES.has(rule.id));

/**
 * One thing `deckster layouts check` found.
 */
export type LayoutCheckProblem = {
  /**
   * Whether it fails the check: only errors do. A warning is something a deck loses (a replacement
   * without the replaced layout's PowerPoint mapping, an off-brand style on a rendered slide); a
   * note is worth knowing (a replacement's budget differs from the replaced layout's).
   */
  severity: 'error' | 'warning' | 'note';

  /**
   * The problem id (`layout-name-mismatch`, `layout-limits-invalid`) or the lint rule id
   * (`content-budget`, `container-overflow`).
   */
  code: string;

  /**
   * The file at fault, relative to the workspace: the layout's `contract.ts`, `layout.tsx` or
   * `limits.ts`, or its folder.
   */
  file: string;

  /**
   * What is wrong.
   */
  message: string;

  /**
   * How to fix it.
   */
  fix: string;

  /**
   * The case of a rendered slide: `example`, or a case name from `limits.ts`.
   */
  case?: string;

  /**
   * The generated slide's id, `<layout>-example` or `<layout>-<case>-<text|list>`.
   */
  slide?: string;

  /**
   * The build step of a rendered slide's finding, when it depends on one.
   */
  step?: number;

  /**
   * A CSS-like path to the element at fault on a rendered slide.
   */
  selector?: string;
};

/**
 * What `deckster layouts check` found for one layout.
 */
export type LayoutCheckResult = {
  /**
   * The layout name, which is its folder's.
   */
  name: string;

  /**
   * The layout's folder, relative to the workspace.
   */
  dir: string;

  /**
   * The cases rendered: `example` and the names in `limits.ts`; empty when the layout was not
   * rendered because of an error found before.
   */
  cases: string[];

  /**
   * Whether the layout has no errors.
   */
  ok: boolean;

  /**
   * Its problems: parity and contract problems, `limits.ts` problems, then lint findings of its
   * slides.
   */
  problems: LayoutCheckProblem[];
};

/**
 * What `deckster layouts check` found.
 */
export type LayoutsCheckReport = {
  /**
   * Whether no layout and nothing shared has an error.
   */
  ok: boolean;

  /**
   * The brand the layouts render in.
   */
  brand: string;

  /**
   * The deck whose layouts were checked, or `null` for a brand's.
   */
  deck: string | null;

  /**
   * The checked `layouts/` folder, relative to the workspace.
   */
  dir: string;

  /**
   * Each checked layout, by name.
   */
  layouts: LayoutCheckResult[];

  /**
   * Problems that belong to no one layout, such as a `deckster` version range that does not match
   * or a page error on the generated deck.
   */
  problems: LayoutCheckProblem[];
};

/**
 * What to check.
 */
export type CheckLayoutsOptions = {
  /**
   * The absolute workspace root.
   */
  readonly root: string;

  /**
   * The brand or deck whose `layouts/` to check.
   */
  readonly owner: LayoutsOwner;

  /**
   * One layout to check, or `undefined` for all of them.
   */
  readonly layout?: string | undefined;
};

/**
 * Every way the check can fail instead of reporting.
 */
export type CheckLayoutsError =
  | BrandError
  | CliError
  | DeckBuildError
  | FileSystemError
  | LintError;

/**
 * Where the layouts are and what they render in.
 */
type Target = {
  /**
   * The brand the layouts render in: the brand checked, or the deck's.
   */
  readonly brand: LoadedBrand;

  /**
   * The deck, for a deck's layouts.
   */
  readonly deck: DeckLocation | undefined;

  /**
   * The `source` the catalog gives the owner's layouts.
   */
  readonly source: string;

  /**
   * The owner's absolute `layouts/` folder.
   */
  readonly layoutsDir: string;
};

/**
 * Checks the code layouts of a brand or a deck, as `deckster layouts check` does. First the checks
 * the build makes (a folder with both files, names that match, a contract that loads, passes the
 * contract checks and takes no name already taken); for a layout that replaces a kit layout, that
 * it keeps what slides written for the kit layout use, including the slides of the workspace's
 * decks on the brand (or of the deck); and each `limits.ts`. Then every layout with no error is
 * rendered through the lint server in a temporary workspace: its contract's `example`, and every
 * limit case filled to its budget, in the deck's brand or, for a brand's layouts, in that brand.
 * The lint findings of each slide are the layout's. Rules about a deck as a talk (repetition,
 * builds, notes, timing, comments) are not run, and `info` findings are left out. Nothing is
 * written to the workspace.
 *
 * @param options - The workspace, the owner and the layout to check.
 * @returns What was found, per layout.
 * @throws BrandError in the error channel when the brand does not load; DeckBuildError when the
 *   deck does not exist or its config does not load, or the kit catalog does not load; CliError
 *   when the named layout is not one of the owner's; FileSystemError when the temporary workspace
 *   cannot be written; the lint errors when the server or the browser fails.
 */
export const checkLayouts = Effect.fn('checkLayouts')(function* (
  options: CheckLayoutsOptions,
): Effect.fn.Return<
  LayoutsCheckReport,
  CheckLayoutsError,
  FileSystem.FileSystem | DeckServer | DeckBrowser | Workspace | Scope.Scope
> {
  const { root } = options;
  const target = yield* resolveTarget(root, options.owner);
  const catalog = yield* deckCatalog({
    root,
    brand: target.brand,
    deck: target.deck,
    code: 'load',
  });
  const checked = yield* pickLayouts(ownLayoutNames(catalog, target), options);
  const results = new Map(
    checked.map((name): [string, LayoutCheckResult] => [
      name,
      {
        name,
        dir: display(root, path.join(target.layoutsDir, name)),
        cases: [],
        ok: true,
        problems: [],
      },
    ]),
  );
  const shared = attachCatalogProblems(root, catalog, target, results);
  // A replacement must also fit the slides the workspace's decks already have on the kit layout.
  const replacing = yield* checkReplacements(root, target.brand, catalog.local, target.deck);
  attachProblems(root, replacing, target, results, shared);

  const slides = yield* layoutSlides(root, target, readyLayouts(catalog, target, results), results);
  if (slides.length > 0 && !hasError(shared)) {
    const findings = yield* renderSlides(root, target, slides);
    attachFindings(root, target, findings, slides, results, shared);
  }

  const layouts = [...results.values()].map((result) => ({
    ...result,
    ok: !hasError(result.problems),
  }));
  return {
    ok: layouts.every((layout) => layout.ok) && !hasError(shared),
    brand: target.brand.tokens.name,
    deck: target.deck?.id ?? null,
    dir: display(root, target.layoutsDir),
    layouts,
    problems: shared,
  };
});

/**
 * Whether any of the problems is an error.
 *
 * @param problems - Problems.
 */
function hasError(problems: readonly LayoutCheckProblem[]): boolean {
  return problems.some((problem) => problem.severity === 'error');
}

/**
 * Hands the catalog's problems, warnings and notes about the owner's code layouts to the layouts
 * they belong to: the build's checks and, for a layout that says `replaces: true`, the check that
 * slides written for the kit layout it replaces still work (fields, slots, title, the kit's example
 * and limit cases), its PowerPoint mapping and the limits it changes.
 *
 * @param root - The absolute workspace root.
 * @param catalog - The catalog.
 * @param target - The owner.
 * @param results - The checked layouts, which get their problems.
 * @returns The problems of no one layout, such as a version range that does not match.
 */
function attachCatalogProblems(
  root: string,
  catalog: DeckCatalog,
  target: Target,
  results: ReadonlyMap<string, LayoutCheckResult>,
): LayoutCheckProblem[] {
  const shared: LayoutCheckProblem[] = [];
  attachProblems(
    root,
    [...catalog.local.problems, ...catalog.local.warnings],
    target,
    results,
    shared,
  );
  return shared;
}

/**
 * Hands problems about the owner's code layouts to the layouts they belong to, and the owner's
 * problems of no one layout to `shared`. Problems about other layouts (the brand's, when a deck's
 * layouts are checked) are dropped: they are the other owner's to check.
 *
 * @param root - The absolute workspace root.
 * @param problems - The problems.
 * @param target - The owner.
 * @param results - The checked layouts, which get their problems.
 * @param shared - The problems of no one layout, which get the rest.
 */
function attachProblems(
  root: string,
  problems: readonly LayoutProblem[],
  target: Target,
  results: ReadonlyMap<string, LayoutCheckResult>,
  shared: LayoutCheckProblem[],
): void {
  for (const problem of problems.filter((found) => isUnder(found.file, target))) {
    if (problem.layout === undefined) {
      shared.push(layoutProblem(root, problem));
    } else {
      results.get(problem.layout)?.problems.push(layoutProblem(root, problem));
    }
  }
}

/**
 * The slides of the layouts to render: each one's example and, when its `limits.ts` holds valid
 * cases, every case. A `limits.ts` that does not load or is not valid is the layout's error, and
 * only its example is rendered then.
 *
 * @param root - The absolute workspace root.
 * @param target - The owner.
 * @param ready - The layouts to render.
 * @param results - The checked layouts, which get their cases and `limits.ts` problems.
 */
const layoutSlides = Effect.fn('layoutSlides')(function* (
  root: string,
  target: Target,
  ready: readonly ReadyLayout[],
  results: ReadonlyMap<string, LayoutCheckResult>,
): Effect.fn.Return<LimitSlide[], never, FileSystem.FileSystem> {
  const subjects = ready.map((layout) => ({
    ...layout,
    dir: path.join(target.layoutsDir, layout.name),
  }));
  const limits = yield* loadLayoutLimits(subjects, root);
  return ready.flatMap(({ name, contract }, index) => {
    const load = limits[index];
    const result = results.get(name);
    if (load === undefined || result === undefined) {
      return [];
    }

    if (load.kind === 'problem') {
      result.problems.push({
        severity: 'error',
        ...load.problem,
        file: display(root, load.problem.file),
      });
    }

    const cases = load.kind === 'cases' ? load.cases : [];
    const slides = [exampleSlide(contract), ...limitSlides([{ contract, cases }])];
    result.cases = [...new Set(slides.map((slide) => slide.case))];
    return slides;
  });
});

/**
 * Loads the brand, and the deck for a deck's layouts, and names where the layouts are.
 *
 * @param root - The absolute workspace root.
 * @param owner - The brand or deck.
 */
const resolveTarget = Effect.fn('resolveTarget')(function* (
  root: string,
  owner: LayoutsOwner,
): Effect.fn.Return<Target, BrandError | DeckBuildError, FileSystem.FileSystem> {
  if (owner.kind === 'brand') {
    const brand = yield* loadBrand(root, owner.name);
    return {
      brand,
      deck: undefined,
      source: `${BRAND_CODE_SOURCE_PREFIX}${owner.name}`,
      layoutsDir: path.join(brand.location.dir, LAYOUTS_DIR),
    };
  }

  const deck = yield* findDeck(root, owner.name);
  const loaded = yield* loadDeck(root, deck);
  const brand = yield* loadBrand(root, deckBrandName(loaded.config));
  return {
    brand,
    deck,
    source: `${DECK_SOURCE_PREFIX}${deck.id}`,
    layoutsDir: path.join(deck.dir, LAYOUTS_DIR),
  };
});

/**
 * The names of the owner's code layouts: every folder found, with both files or not.
 *
 * @param catalog - The catalog with the code layouts.
 * @param target - The owner.
 */
function ownLayoutNames(catalog: DeckCatalog, target: Target): string[] {
  const found = catalog.local.layouts
    .filter((layout) => layout.source === target.source)
    .map((layout) => layout.name);
  const troubled = catalog.local.problems
    .filter((problem) => isUnder(problem.file, target))
    .flatMap((problem) => (problem.layout === undefined ? [] : [problem.layout]));
  return [...new Set([...found, ...troubled])].toSorted();
}

/**
 * The layouts to check: all, or the one named.
 *
 * @param names - The owner's layouts.
 * @param options - The owner and the layout named on the command line.
 * @throws CliError in the error channel when the named layout is not one of them.
 */
const pickLayouts = Effect.fn('pickLayouts')(function* (
  names: readonly string[],
  options: CheckLayoutsOptions,
): Effect.fn.Return<readonly string[], CliError> {
  const { layout, owner } = options;
  if (layout === undefined || names.includes(layout)) {
    return layout === undefined ? names : [layout];
  }

  const has = names.length === 0 ? 'has no code layouts' : `has ${names.join(', ')}`;
  return yield* cliError(
    `The ${owner.kind} ${owner.name} has no code layout named "${layout}"; it ${has}.\n` +
      `Name one of those, or add it with \`${deckCommand()} layouts new ${layout} --${owner.kind} ` +
      `${owner.name}\`.`,
  );
});

/**
 * A checked layout whose contract loaded cleanly, so it can be rendered.
 */
type ReadyLayout = {
  /**
   * The layout name.
   */
  readonly name: string;

  /**
   * Its contract.
   */
  readonly contract: AnyLayoutContract;
};

/**
 * The checked layouts that are in the catalog as the owner's and have no error so far.
 *
 * @param catalog - The catalog.
 * @param target - The owner.
 * @param results - The checked layouts so far.
 */
function readyLayouts(
  catalog: DeckCatalog,
  target: Target,
  results: ReadonlyMap<string, LayoutCheckResult>,
): ReadyLayout[] {
  return [...results.values()].flatMap((result) => {
    const entry = catalog.index.get(result.name);
    return entry === undefined || entry.source !== target.source || hasError(result.problems)
      ? []
      : [{ name: result.name, contract: entry.contract }];
  });
}

/**
 * Renders the slides in a temporary workspace and lints them.
 *
 * @param root - The absolute workspace root.
 * @param target - The owner and the brand.
 * @param slides - The generated slides.
 * @returns The lint findings.
 */
const renderSlides = Effect.fn('renderSlides')(function* (
  root: string,
  target: Target,
  slides: readonly LimitSlide[],
): Effect.fn.Return<
  readonly LintFinding[],
  FileSystemError | LintError,
  FileSystem.FileSystem | DeckServer | DeckBrowser | Workspace | Scope.Scope
> {
  const brand = target.brand.tokens.name;
  const brandDir = target.brand.location.dir;
  const workspaceRoot = yield* writeCheckWorkspace({
    root,
    brandDir: isInside(root, brandDir) ? brandDir : undefined,
    deck: target.deck,
    deckId: target.deck?.id ?? BRAND_CHECK_DECK,
    slides,
    brand,
  });
  const report = yield* lintDeck({
    deck: target.deck?.id ?? BRAND_CHECK_DECK,
    brand,
    rules: CHECK_RULES,
    workspaceRoot,
  });
  return report.findings;
});

/**
 * Hands each lint finding to the layout whose slide it is on, or to the shared problems, naming the
 * layout's own file instead of the generated slide.
 *
 * @param root - The absolute workspace root.
 * @param target - The owner.
 * @param findings - The lint findings.
 * @param slides - The generated slides.
 * @param results - The checked layouts.
 * @param shared - The problems of no one layout.
 */
function attachFindings(
  root: string,
  target: Target,
  findings: readonly LintFinding[],
  slides: readonly LimitSlide[],
  results: ReadonlyMap<string, LayoutCheckResult>,
  shared: LayoutCheckProblem[],
): void {
  const bySlide = new Map(slides.map((slide) => [slide.id, slide]));
  for (const finding of findings) {
    if (finding.severity === 'info') {
      continue;
    }

    const slide = finding.slide === null ? undefined : bySlide.get(finding.slide);
    const result = slide === undefined ? undefined : results.get(slide.layout);
    if (slide === undefined || result === undefined) {
      shared.push({ ...lintProblem(finding), file: display(root, target.layoutsDir) });
      continue;
    }

    const file = slide.case === 'example' ? 'contract.ts' : LIMITS_FILE;
    result.problems.push({
      ...lintProblem(finding),
      file: display(root, path.join(target.layoutsDir, slide.layout, file)),
      case: slide.case,
      slide: slide.id,
    });
  }
}

/**
 * A lint finding as a problem, without its file.
 *
 * @param finding - The finding.
 */
function lintProblem(finding: LintFinding): LayoutCheckProblem {
  return {
    severity: finding.severity === 'error' ? 'error' : 'warning',
    code: finding.rule,
    file: finding.file,
    message: finding.message,
    fix: finding.fix,
    ...(finding.step === null ? {} : { step: finding.step }),
    ...(finding.selector === null ? {} : { selector: finding.selector }),
  };
}

/**
 * A code layout's problem from the catalog.
 *
 * @param root - The absolute workspace root.
 * @param problem - The problem.
 */
function layoutProblem(root: string, problem: LayoutProblem): LayoutCheckProblem {
  return {
    severity: problem.level ?? 'error',
    code: problem.code,
    file: display(root, problem.file),
    message: problem.message,
    fix: problem.fix,
  };
}

/**
 * Whether a problem's file is the owner's: under its `layouts/`, or the file that declares its
 * version range.
 *
 * @param file - The absolute file.
 * @param target - The owner.
 */
function isUnder(file: string, target: Target): boolean {
  const ownerDir = path.dirname(target.layoutsDir);
  return isInside(target.layoutsDir, file) || path.dirname(file) === ownerDir;
}

/**
 * Whether a path is inside a folder.
 *
 * @param dir - The absolute folder.
 * @param file - The absolute path.
 */
function isInside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * A path as authors see it: relative to the workspace, with forward slashes.
 *
 * @param root - The absolute workspace root.
 * @param file - The absolute path.
 */
function display(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}
