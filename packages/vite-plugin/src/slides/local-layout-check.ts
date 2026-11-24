import type { Dirent } from 'node:fs';

import { isSafeName } from '@deckster/brand';
import { BRANDS_DIR } from '@deckster/brand/node';
import { DEFAULT_LAYOUT } from '@deckster/engine/frontmatter';
import { KEBAB_CASE_PATTERN } from '@deckster/engine/names';
import { Effect, Predicate } from 'effect';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type { SkippedCodeLayouts } from '#layouts/brand-source.ts';
import type { LayoutProblemCode } from '#layouts/layout-problem.ts';
import type { LayoutCatalogIndex } from '#layouts/load-layout-catalog.ts';
import type { BrandFallback } from '#slides/brand-layout-fallback.ts';

import { unusableLayout, type DeckBuildError, type FileRef, type Problem } from '#errors.ts';
import {
  COMPONENT_FILE,
  CONTRACT_FILE,
  LAYOUTS_DIR,
  type LocalLayout,
  type LocalLayouts,
} from '#layouts/local-layouts.ts';

/**
 * The problem id of a slide on a code layout that this brand does not have as code: one `brand add`
 * left out, or one only another brand has.
 */
const SKIPPED_CODE = 'layout-code-skipped' satisfies LayoutProblemCode;

/**
 * What a slide's layout is checked against besides the catalog: the code layouts of the deck and
 * its brand, with their problems, and the code layouts `brand add` left out of the brand.
 */
export type SlideLocalLayouts = {
  /**
   * The code layouts found, from `deckCatalog`.
   */
  readonly found: LocalLayouts;

  /**
   * The code layouts `brand add` left out of the deck's brand, when it recorded any.
   */
  readonly skipped?: SkippedCodeLayouts | undefined;
};

/**
 * Fails a slide whose layout is a code layout that cannot be used, with the reason instead of
 * "there is no such layout", so one broken layout breaks the slides on it and nothing else:
 *
 * - The layout has a problem of its own (an incomplete folder, a contract that does not load or is
 *   invalid, a name that is taken, a contract held by an agent turn);
 * - The layout's brand or deck declares a deckster version this is not;
 * - `brand add` left the layout out of the brand;
 * - Only another brand in the workspace has the layout as code. That is found by listing folders, and
 *   nothing of the other brand is ever imported.
 *
 * The first three hold even when a kit layout has the name (see {@link checkOwnLayout}): a
 * replacement that did not load, or that `brand add` left out, never renders as the kit layout it
 * replaces. A slide that names no layout is checked as one on `default`. A slide on any other
 * layout, known or not, passes; the frontmatter check reports unknown names.
 *
 * @param data - The parsed frontmatter, after a brand data layout's fallback was applied.
 * @param catalog - Every layout the deck can use.
 * @param context - The code layouts, and the workspace and brand to look for other brands in.
 * @param ref - The slide file, for the error.
 * @throws DeckBuildError in the error channel naming the slide, the layout's problem and its fix.
 */
export const checkLocalLayout = Effect.fn('checkLocalLayout')(function* (
  data: unknown,
  catalog: LayoutCatalogIndex,
  context: { local?: SlideLocalLayouts | undefined; fallback?: BrandFallback | undefined },
  ref: FileRef,
): Effect.fn.Return<void, DeckBuildError> {
  yield* checkOwnLayout(data, context, ref);
  const name = layoutNameOf(data);
  const { fallback } = context;
  if (name === undefined || catalog.has(name) || fallback === undefined) {
    return;
  }

  const owners = yield* Effect.promise(() =>
    brandsWithCodeLayout(fallback.workspaceRoot, name, fallback.brand),
  );
  const [owner] = owners;
  if (owner !== undefined) {
    return yield* unusableLayout(ref, [otherBrandProblem(name, owner, owners, fallback.brand)]);
  }
});

/**
 * The part of {@link checkLocalLayout} that is about the deck's and its brand's own code layouts:
 * fails a slide whose layout has a problem of its own, belongs to a brand or deck whose version
 * range keeps its layouts from loading, or was left out by `brand add`, whether or not a kit layout
 * or another brand's data layout has the same name. A build runs it on the layout the slide names
 * before swapping in another brand's fallback, so a broken layout of its own is never hidden by
 * that swap.
 *
 * @param data - The parsed frontmatter, as written.
 * @param context - The code layouts, and the deck's brand.
 * @param ref - The slide file, for the error.
 * @throws DeckBuildError in the error channel naming the slide, the layout's problem and its fix.
 */
export const checkOwnLayout = Effect.fn('checkOwnLayout')(function* (
  data: unknown,
  context: { local?: SlideLocalLayouts | undefined; fallback?: BrandFallback | undefined },
  ref: FileRef,
): Effect.fn.Return<void, DeckBuildError> {
  const name = layoutNameOf(data);
  const { local, fallback } = context;
  if (name === undefined || local === undefined) {
    return;
  }

  const own = ownProblems(local, name);
  if (own.length > 0) {
    return yield* unusableLayout(ref, own);
  }

  const isInstalled = local.found.layouts.some((layout) => layout.name === name);
  if (local.skipped?.names.includes(name) === true && !isInstalled && fallback !== undefined) {
    return yield* unusableLayout(ref, [skippedProblem(name, fallback.brand, local.skipped)]);
  }
});

/**
 * The layout a slide names, `default` when it names none, or `undefined` when the name is not a
 * safe kebab-case name and so cannot be a code layout's folder.
 *
 * @param data - The parsed frontmatter.
 */
function layoutNameOf(data: unknown): string | undefined {
  const name = Predicate.isObject(data) ? (data.layout ?? DEFAULT_LAYOUT) : undefined;
  return typeof name === 'string' && KEBAB_CASE_PATTERN.test(name) && isSafeName(name)
    ? name
    : undefined;
}

/**
 * The problems that keep a slide from using a code layout of its own deck or brand: the problems
 * that name the layout and, for a layout that was found but did not load (it is not in
 * `found.catalogs`, whatever other layout of that name the catalog has), the problems with every
 * layout of its brand or deck, such as a version mismatch.
 *
 * @param local - The code layouts.
 * @param name - The layout the slide names.
 */
function ownProblems(local: SlideLocalLayouts, name: string): Problem[] {
  const { problems, layouts, catalogs } = local.found;
  const loaded = new Set(catalogs.map((entry) => entry.ref.file));
  const leftOut = layouts.filter(
    (layout) => layout.name === name && !loaded.has(layout.contractFile),
  );
  const named = problems.filter((problem) => problem.layout === name);
  const shared = problems.filter(
    (problem) =>
      problem.layout === undefined &&
      leftOut.some((layout) => ownerDirOf(layout) === path.dirname(problem.file)),
  );
  return [...named, ...shared].map(({ message, fix, code }) => ({
    message: `layout: ${message}`,
    fix,
    code,
  }));
}

/**
 * The folder of the brand or deck a code layout belongs to: the folder that holds its `layouts/`,
 * where that owner's `brand.json` or `deck.config.ts` is.
 *
 * @param layout - The code layout.
 */
function ownerDirOf(layout: LocalLayout): string {
  return path.dirname(path.dirname(path.dirname(layout.contractFile)));
}

/**
 * The problem for a slide on a code layout `brand add` left out.
 *
 * @param name - The layout name.
 * @param brand - The deck's brand.
 * @param skipped - What `brand add` recorded.
 */
function skippedProblem(name: string, brand: string, skipped: SkippedCodeLayouts): Problem {
  const folder = `${BRANDS_DIR}/${brand}/${LAYOUTS_DIR}`;
  return {
    code: SKIPPED_CODE,
    message:
      `layout: "${name}" is a code layout of the ${brand} brand that \`brand add\` left out, ` +
      'because a fetched brand is added as data and its code is not copied.',
    fix:
      `Read the layout's code at ${skipped.source}, then copy its ${LAYOUTS_DIR}/${name}/ ` +
      `folder (and what it imports from ${LAYOUTS_DIR}/_shared/) into ${folder}/. Or use a ` +
      'layout the brand has here.',
  };
}

/**
 * The problem for a slide on a layout only another brand has as code.
 *
 * @param name - The layout name.
 * @param owner - The first brand that has it.
 * @param owners - Every brand that has it.
 * @param brand - The deck's brand.
 */
function otherBrandProblem(
  name: string,
  owner: string,
  owners: readonly string[],
  brand: string,
): Problem {
  return {
    code: SKIPPED_CODE,
    message:
      `layout: There is no "${name}" layout in the ${brand} brand. It is a code layout of ` +
      `the ${owners.join(', ')} brand, and a code layout has no fallback in another brand.`,
    fix:
      `Switch the deck back to that brand (\`brand: "${owner}"\` in deck.config.ts), copy ` +
      `${BRANDS_DIR}/${owner}/${LAYOUTS_DIR}/${name}/ into ${BRANDS_DIR}/${brand}/${LAYOUTS_DIR}/, ` +
      'or use another layout.',
  };
}

/**
 * The brands in the workspace, other than `except`, that have a code layout folder with this name:
 * `brands/<brand>/layouts/<name>/` holding a `contract.ts` or a `layout.tsx`. Only folders are
 * listed; no file of another brand is read or imported. Like `findLayoutInBrands`, it reads the
 * disk directly, so checking a slide needs no file system service.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param name - The layout name, a safe kebab-case name.
 * @param except - The brand folder to leave out, the deck's own.
 * @returns The brand names, sorted; empty when `brands/` cannot be read.
 */
async function brandsWithCodeLayout(
  workspaceRoot: string,
  name: string,
  except: string,
): Promise<string[]> {
  const brandsDir = path.join(workspaceRoot, BRANDS_DIR);
  const entries = await readdir(brandsDir, { withFileTypes: true }).catch((): Dirent[] => []);
  const brands = entries
    .filter((entry) => entry.isDirectory() && isSafeName(entry.name) && entry.name !== except)
    .map((entry) => entry.name)
    .toSorted();
  const found = await Promise.all(
    brands.map(async (brand) => {
      const folder = path.join(brandsDir, brand, LAYOUTS_DIR, name);
      const files = await readdir(folder).catch((): string[] => []);
      return files.includes(CONTRACT_FILE) || files.includes(COMPONENT_FILE) ? [brand] : [];
    }),
  );
  return found.flat();
}
