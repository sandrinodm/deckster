import { Effect, Result } from 'effect';

import type { BrandTokens } from '#resolve/brand-tokens.ts';

import { checkOpaqueBackgrounds, checkPictureBackgrounds } from '#checks/background-checks.ts';
import { checkContrast } from '#checks/contrast-checks.ts';
import { checkDataPalettes } from '#checks/data-palette-checks.ts';
import { checkLayouts } from '#checks/layout-checks.ts';
import { checkReferences } from '#checks/reference-checks.ts';
import { checkPositiveNegative } from '#checks/semantic-color-checks.ts';
import { checkSubstitutes } from '#checks/substitute-checks.ts';
import { buildTokens } from '#resolve/build-tokens.ts';
import { createColorResolver } from '#resolve/color-resolver.ts';
import { completeSurfaces } from '#resolve/derive-surfaces.ts';
import { resolveLayouts } from '#resolve/resolve-layouts.ts';
import { tokenProblems } from '#resolve/token-checks.ts';
import { brandError, type BrandError, type BrandProblem } from '#validate/brand-error.ts';
import { decodeBrand } from '#validate/decode-brand.ts';
import { decodeLayouts } from '#validate/decode-layouts.ts';

/**
 * The fix for a brand whose resolution fails outright, which the checks should have prevented.
 */
const UNRESOLVABLE_FIX =
  'Look for an extreme number, an unusual color or a name such as "constructor" in the field ' +
  'the message points at; if the brand looks fine, report it, since the checks should name it.';

/**
 * Where the brand came from, for error messages.
 */
export type BrandSource = {
  /**
   * The brand as shown to authors, such as `brands/acme/brand.ts`. Defaults to "the brand".
   */
  source?: string;

  /**
   * The absolute path of the brand file.
   */
  file?: string;
};

/**
 * The brand's `layouts.ts`, when it has one.
 */
export type LayoutsSource = {
  /**
   * The default export of `layouts.ts`.
   */
  input: unknown;

  /**
   * The layouts file as shown to authors, such as `brands/acme/layouts.ts`.
   */
  source: string;

  /**
   * The absolute path of the layouts file.
   */
  file: string;
};

/**
 * A brand that passed every check, and what the checks want a person to look at.
 */
export type ResolvedBrand = {
  /**
   * The brand's resolved tokens: hex colors and canvas-pixel sizes on every surface.
   */
  tokens: BrandTokens;

  /**
   * Findings that do not stop the build: waived contrast shortfalls, data colors that are
   * distinguishable but closer than is comfortable, and positive and negative colors that look
   * alike under a color-vision deficiency.
   */
  warnings: BrandProblem[];
};

/**
 * Validates a brand and resolves it to tokens, in three passes that each report every problem they
 * find: the schema (types, ranges, unknown fields), references (palette steps and opacities,
 * gradients, surfaces, logo variants, font weights, waivers, opaque backgrounds), then quality
 * (WCAG contrast on every surface, and data palettes on every surface's chart plate and against
 * color-vision deficiencies). Required surfaces the brand leaves out are derived from its roles
 * before the checks run. Warnings cover waived contrast, close data colors, `positive` and
 * `negative` colors that merge under a color-vision deficiency, and font substitutes of another
 * kind than their family.
 *
 * @param input - The default export of `brand.ts`.
 * @param where - The brand file, for error messages.
 * @param layouts - The brand's `layouts.ts` export, when it has one. It is decoded and checked
 *   after the brand, and its layouts are in the tokens; without it `tokens.layouts` is empty.
 * @returns The brand's resolved tokens and any warnings.
 * @throws BrandError in the error channel, listing every problem of the first pass that finds any,
 *   each with its field and fix.
 */
export const resolveBrand = Effect.fn('resolveBrand')(function* (
  input: unknown,
  where: BrandSource = {},
  layouts?: LayoutsSource,
): Effect.fn.Return<ResolvedBrand, BrandError> {
  const decoded = decodeBrand(input);
  if (Result.isFailure(decoded)) {
    return yield* invalidBrand(where, 'Invalid brand', decoded.failure);
  }

  const colors = createColorResolver(decoded.success.color.palette);
  const built = yield* Effect.try({
    try: () => {
      const completed = completeSurfaces(decoded.success, colors);
      return { ...completed, tokens: buildTokens(completed.brand, colors) };
    },
    catch: (error) =>
      invalidBrand(where, 'The brand cannot be resolved', [
        {
          path: '',
          message: `Resolving it failed: ${error instanceof Error ? error.message : String(error)}`,
          fix: UNRESOLVABLE_FIX,
        },
      ]),
  });
  const { brand, derived, tokens } = built;
  const references = unique([
    ...checkReferences(brand),
    ...checkOpaqueBackgrounds(decoded.success, colors),
    ...checkPictureBackgrounds(decoded.success),
    ...colors.problems,
  ]);
  if (references.length > 0) {
    return yield* invalidBrand(where, 'The brand refers to things it does not define', references);
  }

  const badTokens = tokenProblems(tokens);
  if (badTokens.length > 0) {
    return yield* invalidBrand(where, 'The brand resolves to values CSS cannot hold', badTokens);
  }

  const contrast = checkContrast(brand, tokens, derived);
  const data = checkDataPalettes(brand, tokens, derived);
  const errors = [...contrast.errors, ...data.errors];
  if (errors.length > 0) {
    return yield* invalidBrand(where, 'The brand fails contrast or color-vision checks', errors);
  }

  const semantic = checkPositiveNegative(brand, tokens, derived);
  const substitutes = checkSubstitutes(brand);
  const brandWarnings = [...contrast.warnings, ...data.warnings, ...semantic, ...substitutes];
  if (layouts === undefined) {
    return { tokens, warnings: brandWarnings };
  }

  const resolved = yield* resolveBrandLayouts(layouts, tokens, colors);
  return {
    tokens: { ...tokens, layouts: resolved.layouts },
    warnings: [...brandWarnings, ...resolved.warnings],
  };
});

/**
 * Decodes, checks and resolves a brand's layouts against its resolved tokens.
 *
 * @param source - The `layouts.ts` export and where it came from.
 * @param tokens - The brand's resolved tokens, which name the surfaces, treatments and gradients.
 * @param colors - The brand's color resolver, for the colors in a layout's art.
 * @throws BrandError in the error channel naming `layouts.ts`, with every problem of the first pass
 *   that finds any.
 */
const resolveBrandLayouts = Effect.fn('resolveBrandLayouts')(function* (
  source: LayoutsSource,
  tokens: BrandTokens,
  colors: ReturnType<typeof createColorResolver>,
): Effect.fn.Return<{ layouts: BrandTokens['layouts']; warnings: BrandProblem[] }, BrandError> {
  const where = { source: source.source, file: source.file };
  const decoded = decodeLayouts(source.input);
  if (Result.isFailure(decoded)) {
    return yield* invalidBrand(where, 'Invalid layouts', decoded.failure);
  }

  const found = checkLayouts(decoded.success, {
    surfaces: Object.keys(tokens.surfaces),
    treatments: Object.keys(tokens.imagery.treatments),
    gradients: Object.keys(tokens.gradients),
  });
  const layouts = resolveLayouts(decoded.success, { colors, gradients: tokens.gradients });
  const problems = unique([...found.errors, ...colors.problems.filter(isLayoutProblem)]);
  if (problems.length > 0) {
    return yield* invalidBrand(where, 'The layouts have problems', problems);
  }

  return { layouts, warnings: found.warnings };
});

/**
 * Whether a color problem was found in a layout's art.
 *
 * @param problem - A problem the color resolver recorded.
 */
function isLayoutProblem(problem: BrandProblem): boolean {
  return problem.path.startsWith('layouts[');
}

/**
 * The error for one failed pass, naming the brand file.
 *
 * @param where - The brand file, or nothing for "the brand".
 * @param summary - What the pass found, such as "Invalid brand".
 * @param problems - Every problem the pass found.
 */
function invalidBrand(
  where: BrandSource,
  summary: string,
  problems: readonly BrandProblem[],
): BrandError {
  return brandError({
    summary,
    source: where.source ?? 'the brand',
    file: where.file,
    problems,
  });
}

/**
 * Drops repeats: a bad base role is resolved once per surface but reported once.
 */
function unique(problems: readonly BrandProblem[]): BrandProblem[] {
  const seen = new Set<string>();
  return problems.filter((problem) => {
    const key = `${problem.path}\n${problem.message}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
