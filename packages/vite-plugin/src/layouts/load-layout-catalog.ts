import type { BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import engineCatalog from '@deckster/engine/catalog';
import { deckCommand } from '@deckster/engine/command';
import { brandLayoutCatalog, checkBrandLayouts, checkReplacement } from '@deckster/kit/catalog';
import { Effect, Predicate } from 'effect';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { LayoutProblem } from '#layouts/layout-problem.ts';

import {
  invalidBrandLayouts,
  invalidCodeLayouts,
  invalidLayoutCatalog,
  type DeckBuildError,
  type FileRef,
  type Problem,
} from '#errors.ts';
import { checkContract } from '#layouts/check-contract.ts';
import { BRAND_CODE_SOURCE_PREFIX, type LocalCatalog } from '#layouts/local-layouts.ts';

/**
 * The layout catalogs every deck loads after the engine's own: the kit's.
 */
export const DEFAULT_LAYOUT_CATALOGS: readonly string[] = ['@deckster/kit/catalog'];

/**
 * The sources of the catalog layouts a code layout may replace with `replaces: true`.
 */
const REPLACEABLE_SOURCES = new Set(['@deckster/engine', '@deckster/kit']);

/**
 * The fix for a deck code layout that takes the name of a layout of its brand.
 */
const RENAME_DECK_LAYOUT_FIX =
  "Rename the deck layout's folder and the `name` in its contract and component. A deck " +
  'layout cannot replace a brand layout.';

/**
 * One layout a deck can use: its contract and the package that provides it.
 */
export type CatalogLayout = {
  /**
   * The layout's contract.
   */
  contract: AnyLayoutContract;

  /**
   * The package that provides it, such as `@deckster/kit`.
   */
  source: string;

  /**
   * The kit layout a brand layout falls back to; set only for layouts whose source is
   * `brand:<name>`.
   */
  fallback?: string;

  /**
   * The source of the layout this one replaces, such as `@deckster/kit`; set only for a code layout
   * whose contract says `replaces: true`. The replacement keeps the replaced layout's place in the
   * order.
   */
  replaces?: string;
};

/**
 * Every layout a deck can use, by name, in the order `deckster layouts` lists them.
 */
export type LayoutCatalogIndex = ReadonlyMap<string, CatalogLayout>;

/**
 * Options for {@link loadLayoutCatalog}.
 */
export type LayoutCatalogOptions = {
  /**
   * The deck's brand. Its `layouts` are checked against the other catalogs and appended after them,
   * with the source `brand:<name>`. Without it, only the catalogs load.
   */
  brand?: BrandTokens | undefined;

  /**
   * The absolute path of the brand's `layouts.ts`, so an error names the file; defaults to the
   * conventional `brands/<name>/layouts.ts`, relative.
   */
  layoutsFile?: string | undefined;

  /**
   * The code layouts of the brand and the deck, loaded and checked: `LocalLayouts['catalogs']` from
   * `localLayouts`. The brand's join after the catalog modules and before the brand's data layouts,
   * the deck's last.
   */
  local?: readonly LocalCatalog[] | undefined;

  /**
   * The brand's code layouts that were found but are not in `local`, by name, each with the
   * problems that kept it out (none when its code was not loaded on purpose). A data layout that
   * falls back to one of them is left out and reported in `unavailable`, instead of failing the
   * catalog as a fallback that is not a layout, and a deck code layout of that name is still a
   * clash with the brand.
   */
  withheld?: ReadonlyMap<string, readonly Problem[]> | undefined;
};

/**
 * A layout catalog, with the code layouts that could not join it.
 */
export type MergedLayoutCatalog = {
  /**
   * The layouts by name, without the code layouts left out.
   */
  readonly index: LayoutCatalogIndex;

  /**
   * The problems of the code layouts left out, on their `contract.ts`: a `layout-name-clash`, a
   * `layout-replace-breaks` (one per thing the replacement breaks), or a `layout-contract-invalid`
   * for `replaces: true` on a name no kit or engine layout has.
   */
  readonly clashes: readonly LayoutProblem[];

  /**
   * The brand's data layouts left out because their fallback is one of the brand's code layouts
   * that is not in the catalog (see {@link LayoutCatalogOptions.withheld}), each a
   * `layout-fallback-unavailable` problem on the brand's `layouts.ts`.
   */
  readonly unavailable: readonly LayoutProblem[];

  /**
   * The names of the kit and engine layouts a code layout in `index` replaces.
   */
  readonly replaced: readonly string[];

  /**
   * The warnings and notes of the replacements in `index`: `layout-replace-pptx` and
   * `layout-replace-budget`, each with its `level`.
   */
  readonly warnings: readonly LayoutProblem[];
};

/**
 * Loads the engine's layout catalog and then each catalog module in order, in Node. A later
 * catalog's layout replaces an earlier one of the same name, as the runtime plugins' components do;
 * the replaced layout keeps its place in the order. Each module's default export must be a
 * `defineLayoutCatalog(...)` whose contracts pass the build's checks.
 *
 * The other layouts join in this order: the brand's code layouts, the brand's data layouts
 * (`layouts.ts`, checked against the layouts before them: a clash with a catalog module's layout,
 * an unknown fallback, bindings the fallback lacks; a fallback may be a brand code layout), then
 * the deck's code layouts. A code layout replaces a kit or engine layout of the same name only when
 * its contract says `replaces: true` and `checkReplacement` finds no error; it then keeps the
 * replaced layout's place. A layout of another catalog module cannot be replaced. No other layout
 * replaces another.
 *
 * @param specifiers - Catalog modules: bare specifiers resolve from this package, absolute paths
 *   are used as they are.
 * @param options - The deck's brand, whose layouts join the catalog, and the code layouts.
 * @returns The layouts by name.
 * @throws DeckBuildError in the error channel naming the catalog file, for a module that does not
 *   load or does not export a catalog, and for every problem with its contracts; naming the brand's
 *   `layouts.ts` for a brand layout that does not fit its fallback; naming a code layout's
 *   `contract.ts` when its name is taken by a kit or engine layout it does not replace (or replaces
 *   with an incompatible contract), by another catalog module's layout, by a data layout of the
 *   same brand or, for a deck's layout, by a brand layout (one left out of the catalog included),
 *   and when it says `replaces: true` on a name no layout has; naming the brand's `layouts.ts` for
 *   a data layout whose fallback is a withheld brand code layout. `deckCatalog` reports those as
 *   values instead.
 */
export const loadLayoutCatalog = Effect.fn('loadLayoutCatalog')(function* (
  specifiers: readonly string[] = DEFAULT_LAYOUT_CATALOGS,
  options: LayoutCatalogOptions = {},
): Effect.fn.Return<LayoutCatalogIndex, DeckBuildError> {
  const merged = yield* mergeLayoutCatalog(specifiers, options);
  const [first] = [...merged.clashes, ...merged.unavailable];
  if (first !== undefined) {
    const displayPath = options.local?.find((entry) => entry.ref.file === first.file)?.ref
      .displayPath;
    return yield* invalidCodeLayouts({ file: first.file, displayPath: displayPath ?? first.file }, [
      ...merged.clashes,
      ...merged.unavailable,
    ]);
  }

  return merged.index;
});

/**
 * {@link loadLayoutCatalog}, except that a code layout that may not take its name is left out and
 * reported as a problem instead of failing, so the other layouts still load.
 *
 * @param specifiers - Catalog modules, as {@link loadLayoutCatalog} takes them.
 * @param options - The deck's brand and the code layouts.
 * @returns The catalog, the problems of the layouts left out, the replaced layouts and the
 *   replacements' warnings.
 * @throws DeckBuildError in the error channel, as {@link loadLayoutCatalog} does for catalog
 *   modules and brand data layouts.
 */
export const mergeLayoutCatalog = Effect.fn('mergeLayoutCatalog')(function* (
  specifiers: readonly string[] = DEFAULT_LAYOUT_CATALOGS,
  options: LayoutCatalogOptions = {},
): Effect.fn.Return<MergedLayoutCatalog, DeckBuildError> {
  const layouts = new Map<string, CatalogLayout>();
  const catalogs = [
    { ref: catalogRef('@deckster/engine/catalog'), exported: engineCatalog as unknown },
    ...(yield* Effect.forEach(specifiers, importCatalog)),
  ];
  for (const { ref, exported } of catalogs) {
    for (const layout of yield* readCatalog(exported, ref)) {
      layouts.set(layout.contract.name, layout);
    }
  }

  const { brand } = options;
  const local = options.local ?? [];
  const modules = new Set(layouts.values());
  const replaceable = new Set([...modules].filter((layout) => isReplaceable(layout)));
  const dataNames = new Set(brand?.layouts.map((layout) => layout.name));
  const brandCode = local.filter((entry) => entry.source.startsWith(BRAND_CODE_SOURCE_PREFIX));
  const brandJoin = yield* joinCodeLayouts(brandCode, layouts, (layout, entry, taken) => {
    if (taken !== undefined) {
      return replaceable.has(taken)
        ? replacementOf(layout, entry, taken)
        : joinsUnlessProblem(layout, otherCatalogClash(layout, entry, taken));
    }

    return joinsUnlessProblem(
      layout,
      replacesNothing(layout, entry) ?? dataLayoutClash(layout, entry, dataNames, brand),
    );
  });
  const withheld = withheldLayouts(options.withheld, brandJoin.problems);
  // A data layout may fall back to a brand code layout, so it is checked against those too.
  const base = [...layouts.values()];
  const data = yield* brandDataLayouts(brand, options.layoutsFile, base, withheld);
  for (const layout of data.layouts) {
    layouts.set(layout.contract.name, layout);
  }

  const deckCode = local.filter((entry) => !entry.source.startsWith(BRAND_CODE_SOURCE_PREFIX));
  const deckJoin = yield* joinCodeLayouts(deckCode, layouts, (layout, entry, taken) => {
    const name = layout.contract.name;
    const isBrandsName = withheld.has(name) || data.leftOut.has(name);
    if (isBrandsName && (taken === undefined || modules.has(taken))) {
      return joinsUnlessProblem(layout, withheldBrandClash(layout, entry));
    }

    if (taken === undefined) {
      return joinsUnlessProblem(layout, replacesNothing(layout, entry));
    }

    if (replaceable.has(taken)) {
      return replacementOf(layout, entry, taken);
    }

    return modules.has(taken)
      ? joinsUnlessProblem(layout, otherCatalogClash(layout, entry, taken))
      : joinsUnlessProblem(layout, brandLayoutClash(layout, entry, taken));
  });
  return {
    index: layouts,
    clashes: [...brandJoin.problems, ...deckJoin.problems],
    unavailable: data.unavailable,
    replaced: [...brandJoin.replaced, ...deckJoin.replaced],
    warnings: [...brandJoin.warnings, ...deckJoin.warnings],
  };
});

/**
 * Whether a code layout may replace a catalog layout: only the engine's and the kit's, the ones the
 * generated kit runtime leaves out for a replacement. A later catalog's runtime plugin would still
 * render its own component over a code layout.
 *
 * @param layout - A layout of a catalog module.
 */
function isReplaceable(layout: CatalogLayout): boolean {
  return REPLACEABLE_SOURCES.has(layout.source);
}

/**
 * The brand's code layouts that are not in the catalog, with why: the ones the caller found but did
 * not load, and the ones that loaded but could not take their name.
 *
 * @param given - The caller's withheld layouts.
 * @param rejected - The problems of the brand's code layouts left out of the catalog.
 */
function withheldLayouts(
  given: ReadonlyMap<string, readonly Problem[]> | undefined,
  rejected: readonly LayoutProblem[],
): ReadonlyMap<string, readonly Problem[]> {
  const withheld = new Map(given ?? []);
  for (const problem of rejected) {
    if (problem.layout !== undefined) {
      withheld.set(problem.layout, [...(withheld.get(problem.layout) ?? []), problem]);
    }
  }

  return withheld;
}

/**
 * Whether a code layout joins the catalog under its name, and what to report.
 */
type JoinDecision = {
  /**
   * The layout as it joins, or `undefined` when it is left out.
   */
  readonly joins: CatalogLayout | undefined;

  /**
   * Why it is left out; empty when it joins.
   */
  readonly problems: readonly LayoutProblem[];

  /**
   * Warnings and notes for a layout that joins.
   */
  readonly warnings: readonly LayoutProblem[];
};

/**
 * Decides whether a code layout may take its name, given the layout that has the name now.
 */
type JoinCheck = (
  layout: CatalogLayout,
  entry: LocalCatalog,
  taken: CatalogLayout | undefined,
) => JoinDecision;

/**
 * What code layouts did when they joined the catalog.
 */
type JoinResult = {
  /**
   * The problems of the layouts left out.
   */
  readonly problems: readonly LayoutProblem[];

  /**
   * The names of the catalog module layouts they replace.
   */
  readonly replaced: readonly string[];

  /**
   * The warnings and notes of the layouts that joined.
   */
  readonly warnings: readonly LayoutProblem[];
};

/**
 * Adds code layouts to the catalog, leaving out the ones that may not take their name.
 *
 * @param entries - The loaded contracts.
 * @param layouts - The catalog so far, which the layouts are added to; a replacement takes the
 *   replaced layout's place.
 * @param decide - Whether a layout joins, given the layout that has the name now.
 * @returns The problems, the replaced names and the warnings.
 * @throws DeckBuildError in the error channel for an entry that is not a valid contract.
 */
const joinCodeLayouts = Effect.fn('joinCodeLayouts')(function* (
  entries: readonly LocalCatalog[],
  layouts: Map<string, CatalogLayout>,
  decide: JoinCheck,
): Effect.fn.Return<JoinResult, DeckBuildError> {
  const problems: LayoutProblem[] = [];
  const replaced: string[] = [];
  const warnings: LayoutProblem[] = [];
  for (const entry of entries) {
    const [layout] = yield* readCatalog(codeCatalog(entry), entry.ref);
    if (layout === undefined) {
      continue;
    }

    const name = layout.contract.name;
    const decision = decide(layout, entry, layouts.get(name));
    problems.push(...decision.problems);
    if (decision.joins !== undefined) {
      layouts.set(name, decision.joins);
      warnings.push(...decision.warnings);
      if (decision.joins.replaces !== undefined) {
        replaced.push(name);
      }
    }
  }

  return { problems, replaced, warnings };
});

/**
 * The decision for a layout that joins as it is unless there is a problem.
 *
 * @param layout - The code layout.
 * @param problem - The problem that keeps it out, if any.
 */
function joinsUnlessProblem(
  layout: CatalogLayout,
  problem: LayoutProblem | undefined,
): JoinDecision {
  return problem === undefined
    ? { joins: layout, problems: [], warnings: [] }
    : { joins: undefined, problems: [problem], warnings: [] };
}

/**
 * What {@link brandDataLayouts} returns.
 */
type BrandDataJoin = {
  /**
   * The data layouts that join the catalog.
   */
  readonly layouts: readonly CatalogLayout[];

  /**
   * The names of the data layouts left out because their fallback is withheld.
   */
  readonly leftOut: ReadonlySet<string>;

  /**
   * One `layout-fallback-unavailable` problem per layout left out.
   */
  readonly unavailable: readonly LayoutProblem[];
};

/**
 * The brand's data layouts (`layouts.ts`) as catalog layouts, each with its fallback, after
 * checking them against the layouts of the catalog modules. A data layout whose fallback is a
 * withheld brand code layout is left out with a problem instead.
 *
 * @param brand - The deck's brand, when it has one.
 * @param layoutsFile - The absolute path of the brand's `layouts.ts`, when known.
 * @param base - The layouts a data layout may fall back to: the catalog modules' and the brand's
 *   code layouts.
 * @param withheld - The brand's code layouts that are not in `base`, with why.
 * @returns The layouts that join, and the ones left out with their problems.
 * @throws DeckBuildError in the error channel, naming the brand's `layouts.ts`, for a layout that
 *   clashes with a base layout or does not fit its fallback.
 */
const brandDataLayouts = Effect.fn('brandDataLayouts')(function* (
  brand: BrandTokens | undefined,
  layoutsFile: string | undefined,
  base: readonly CatalogLayout[],
  withheld: ReadonlyMap<string, readonly Problem[]>,
): Effect.fn.Return<BrandDataJoin, DeckBuildError> {
  if (brand === undefined || brand.layouts.length === 0) {
    return { layouts: [], leftOut: new Set(), unavailable: [] };
  }

  const ref = brandLayoutsRef(brand, layoutsFile);
  const contracts = base.map((layout) => layout.contract);
  const baseNames = new Set(contracts.map((contract) => contract.name));
  /**
   * Whether a brand layout's fallback is a code layout that did not load and no base layout stands
   * in for.
   */
  const isWithheld = (fallback: string): boolean =>
    withheld.has(fallback) && !baseNames.has(fallback);
  const usable = brand.layouts.filter((layout) => !isWithheld(layout.fallback));
  const unavailable = brand.layouts
    .filter((layout) => isWithheld(layout.fallback))
    .map((layout) => unavailableFallback(layout.name, layout.fallback, ref, withheld));
  const leftOut = new Set(unavailable.flatMap((problem) => problem.layout ?? []));
  const { errors } = checkBrandLayouts(usable, contracts);
  if (errors.length > 0) {
    return yield* invalidBrandLayouts(
      ref,
      errors.map(({ path: field, message, fix }) => ({ message: `${field}: ${message}`, fix })),
    );
  }

  const exported = brandLayoutCatalog({ ...brand, layouts: usable }, contracts) as unknown;
  const fallbacks = new Map(usable.map((layout) => [layout.name, layout.fallback]));
  const layouts = (yield* readCatalog(exported, ref, 'brand')).map((layout) => {
    const fallback = fallbacks.get(layout.contract.name);
    return fallback === undefined ? layout : { ...layout, fallback };
  });
  return { layouts, leftOut, unavailable };
});

/**
 * The problem for a data layout whose fallback is a brand code layout that is not in the catalog,
 * with the reasons that layout is not there.
 *
 * @param name - The data layout.
 * @param fallback - The code layout it falls back to.
 * @param ref - The brand's `layouts.ts`.
 * @param withheld - The withheld code layouts, with why.
 */
function unavailableFallback(
  name: string,
  fallback: string,
  ref: FileRef,
  withheld: ReadonlyMap<string, readonly Problem[]>,
): LayoutProblem {
  const reasons = withheld.get(fallback) ?? [];
  const lead =
    `The data layout "${name}" (${ref.displayPath}) falls back to the brand's code layout ` +
    `"${fallback}", which is not loaded`;
  return {
    code: 'layout-fallback-unavailable',
    file: ref.file,
    layout: name,
    message:
      reasons.length === 0
        ? `${lead}.`
        : `${lead}: ${reasons.map((reason) => reason.message).join(' ')}`,
    fix:
      reasons[0]?.fix ??
      `Make the "${fallback}" layout load, or give "${name}" a kit layout as its fallback.`,
  };
}

/**
 * One code layout's contract as the catalog its source provides.
 *
 * @param entry - The loaded contract and where it comes from.
 */
function codeCatalog(entry: LocalCatalog): unknown {
  return { source: entry.source, layouts: [entry.exported] };
}

/**
 * The decision for a code layout named like a layout of a catalog module (the kit's or the
 * engine's): a name clash unless its contract says `replaces: true`; then it replaces the taken
 * layout, in its place, when `checkReplacement` finds no error, and is left out with one
 * `layout-replace-breaks` problem per error otherwise.
 *
 * @param layout - The code layout.
 * @param entry - Its contract file.
 * @param taken - The catalog module's layout that has the name.
 */
function replacementOf(
  layout: CatalogLayout,
  entry: LocalCatalog,
  taken: CatalogLayout,
): JoinDecision {
  if (layout.contract.replaces !== true) {
    return joinsUnlessProblem(layout, moduleLayoutClash(layout, entry, taken));
  }

  const name = layout.contract.name;
  const at = { file: entry.ref.file, layout: name };
  const lead =
    `The code layout "${name}" (${entry.ref.displayPath}) replaces the ${name} layout of ` +
    taken.source;
  const check = checkReplacement(taken.contract, layout.contract);
  if (check.errors.length > 0) {
    const problems = check.errors.map((problem): LayoutProblem => ({
      ...at,
      code: 'layout-replace-breaks',
      message:
        `${lead}, and slides written for that layout would stop building: ` + problem.message,
      fix: problem.fix,
    }));
    return { joins: undefined, problems, warnings: [] };
  }

  const warnings = [
    ...check.warnings.map((problem): LayoutProblem => ({
      ...at,
      code: 'layout-replace-pptx',
      level: 'warning',
      message: `${lead}: ${problem.message}`,
      fix: problem.fix,
    })),
    ...check.notes.map((problem): LayoutProblem => ({
      ...at,
      code: 'layout-replace-budget',
      level: 'note',
      message: `${lead}: ${problem.message}`,
      fix: problem.fix,
    })),
  ];
  return { joins: { ...layout, replaces: taken.source }, problems: [], warnings };
}

/**
 * The problem for a code layout named like a layout of a catalog module, the kit's or the engine's,
 * whose contract does not say `replaces: true`.
 *
 * @param layout - The code layout.
 * @param entry - Its contract file.
 * @param taken - The layout that has the name.
 */
function moduleLayoutClash(
  layout: CatalogLayout,
  entry: LocalCatalog,
  taken: CatalogLayout,
): LayoutProblem {
  const name = layout.contract.name;
  return {
    code: 'layout-name-clash',
    file: entry.ref.file,
    layout: name,
    message:
      `The code layout "${name}" (${entry.ref.displayPath}) has the name of a layout from ` +
      `${taken.source}.`,
    fix:
      "Rename the layout's folder and the `name` in its contract and component, or, to replace " +
      `the ${taken.source} layout, write \`replaces: true\` in its contract.`,
  };
}

/**
 * The problem for a code layout named like a layout of a catalog module other than the kit's or the
 * engine's. Only those can be replaced: another catalog's runtime plugin registers its component
 * after the code layouts, so it would render instead of the replacement.
 *
 * @param layout - The code layout.
 * @param entry - Its contract file.
 * @param taken - The catalog module's layout that has the name.
 */
function otherCatalogClash(
  layout: CatalogLayout,
  entry: LocalCatalog,
  taken: CatalogLayout,
): LayoutProblem {
  const name = layout.contract.name;
  return {
    code: 'layout-name-clash',
    file: entry.ref.file,
    layout: name,
    message:
      `The code layout "${name}" (${entry.ref.displayPath}) has the name of a layout from ` +
      `${taken.source}, which a code layout cannot replace: only kit and engine layouts can be.`,
    fix: "Rename the layout's folder and the `name` in its contract and component.",
  };
}

/**
 * The problem for a code layout whose contract says `replaces: true` although no kit or engine
 * layout has its name, or `undefined` when it does not say so.
 *
 * @param layout - The code layout, whose name no catalog module's layout has.
 * @param entry - Its contract file.
 */
function replacesNothing(layout: CatalogLayout, entry: LocalCatalog): LayoutProblem | undefined {
  const name = layout.contract.name;
  if (layout.contract.replaces !== true) {
    return undefined;
  }

  return {
    code: 'layout-contract-invalid',
    file: entry.ref.file,
    layout: name,
    message:
      `The code layout "${name}" (${entry.ref.displayPath}) says \`replaces: true\`, but no ` +
      'kit or engine layout is named that, so it replaces nothing.',
    fix:
      'Remove `replaces: true` from its contract, or name it after the kit layout it ' +
      `replaces (\`${deckCommand()} layouts\` lists them).`,
  };
}

/**
 * The problem for a brand's code layout named like one of the same brand's data layouts, or
 * `undefined` when the name is free.
 *
 * @param layout - The code layout.
 * @param entry - Its contract file.
 * @param dataNames - The names of the brand's data layouts.
 * @param brand - The brand.
 */
function dataLayoutClash(
  layout: CatalogLayout,
  entry: LocalCatalog,
  dataNames: ReadonlySet<string>,
  brand: BrandTokens | undefined,
): LayoutProblem | undefined {
  const name = layout.contract.name;
  if (brand === undefined || !dataNames.has(name)) {
    return undefined;
  }

  return {
    code: 'layout-name-clash',
    file: entry.ref.file,
    layout: name,
    message:
      `The ${brand.name} brand defines "${name}" twice: as a code layout ` +
      `(${entry.ref.displayPath}) and in brands/${brand.name}/layouts.ts.`,
    fix: 'Rename or remove one of them, so the name means one layout in the brand.',
  };
}

/**
 * The problem for a deck's code layout named like a layout of the deck's brand.
 *
 * @param layout - The deck's code layout.
 * @param entry - Its contract file.
 * @param taken - The brand layout that has the name.
 */
function brandLayoutClash(
  layout: CatalogLayout,
  entry: LocalCatalog,
  taken: CatalogLayout,
): LayoutProblem {
  const name = layout.contract.name;
  return {
    code: 'layout-name-clash',
    file: entry.ref.file,
    layout: name,
    message:
      `The deck layout "${name}" (${entry.ref.displayPath}) has the name of a layout of the ` +
      `deck's brand (${taken.source}).`,
    fix: RENAME_DECK_LAYOUT_FIX,
  };
}

/**
 * The problem for a deck's code layout named like a layout of the deck's brand that is not in the
 * catalog (a code layout that did not load, or a data layout left out with it): the name still
 * belongs to the brand, and the clash would appear once the brand's layout loads.
 *
 * @param layout - The deck's code layout.
 * @param entry - Its contract file.
 */
function withheldBrandClash(layout: CatalogLayout, entry: LocalCatalog): LayoutProblem {
  const name = layout.contract.name;
  return {
    code: 'layout-name-clash',
    file: entry.ref.file,
    layout: name,
    message:
      `The deck layout "${name}" (${entry.ref.displayPath}) has the name of a layout of the ` +
      "deck's brand, which is left out of the catalog for now.",
    fix: RENAME_DECK_LAYOUT_FIX,
  };
}

/**
 * Imports a catalog module and returns its default export.
 *
 * @param specifier - A bare specifier or an absolute path.
 */
const importCatalog = Effect.fn('importCatalog')(function* (
  specifier: string,
): Effect.fn.Return<{ ref: FileRef; exported: unknown }, DeckBuildError> {
  const ref = catalogRef(specifier);
  const loaded = yield* Effect.tryPromise({
    try: (): Promise<unknown> => import(/* @vite-ignore */ pathToFileURL(ref.file).href),
    catch: (error) =>
      invalidLayoutCatalog(ref, [
        {
          message: `Importing it failed: ${error instanceof Error ? error.message : String(error)}`,
          fix:
            'A catalog runs in Node: import only layout contracts and `effect`, never ' +
            'components, JSX or browser code.',
        },
      ]),
  });
  return { ref, exported: Predicate.isObject(loaded) ? loaded.default : undefined };
});

/**
 * Validates a catalog module's default export and its contracts.
 *
 * @param exported - The default export.
 * @param ref - The catalog file.
 * @param kind - Whether the catalog was generated from the brand's regions or loaded as a module.
 */
const readCatalog = Effect.fn('readCatalog')(function* (
  exported: unknown,
  ref: FileRef,
  kind: 'module' | 'brand' = 'module',
): Effect.fn.Return<CatalogLayout[], DeckBuildError> {
  if (
    !Predicate.isObject(exported) ||
    typeof exported.source !== 'string' ||
    !Array.isArray(exported.layouts)
  ) {
    return yield* invalidLayoutCatalog(ref, [
      {
        message: 'The default export is not a layout catalog.',
        fix:
          'Export `defineLayoutCatalog({ source, layouts: [contract, ...] })` as the default ' +
          'export.',
      },
    ]);
  }

  const problems: Problem[] = exported.layouts.flatMap((contract) =>
    checkContract(contract, kind === 'brand'),
  );
  if (problems.length > 0) {
    return yield* invalidLayoutCatalog(ref, problems);
  }

  const source = exported.source;
  // checkContract accepted every entry, so each one is a contract.
  const contracts = exported.layouts as AnyLayoutContract[];
  return contracts.map((contract) => ({ contract, source }));
});

/**
 * The file of a catalog module, for messages and for importing it.
 *
 * @param specifier - A bare specifier or an absolute path.
 */
function catalogRef(specifier: string): FileRef {
  const file = path.isAbsolute(specifier)
    ? specifier
    : fileURLToPath(import.meta.resolve(specifier));
  return { file, displayPath: specifier };
}

/**
 * The brand's `layouts.ts`, for messages.
 *
 * @param brand - The brand.
 * @param file - The absolute path of its `layouts.ts`, when known.
 */
function brandLayoutsRef(brand: BrandTokens, file: string | undefined): FileRef {
  const displayPath = `brands/${brand.name}/layouts.ts`;
  return { file: file ?? displayPath, displayPath };
}
