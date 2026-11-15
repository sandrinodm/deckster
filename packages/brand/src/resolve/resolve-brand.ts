import { Effect, Result } from 'effect';

import type { BrandTokens } from '#resolve/brand-tokens.ts';

import { checkOpaqueBackgrounds, checkPictureBackgrounds } from '#checks/background-checks.ts';
import { checkContrast } from '#checks/contrast-checks.ts';
import { checkDataPalettes } from '#checks/data-palette-checks.ts';
import { checkReferences } from '#checks/reference-checks.ts';
import { checkPositiveNegative } from '#checks/semantic-color-checks.ts';
import { checkSubstitutes } from '#checks/substitute-checks.ts';
import { buildTokens } from '#resolve/build-tokens.ts';
import { createColorResolver } from '#resolve/color-resolver.ts';
import { completeSurfaces } from '#resolve/derive-surfaces.ts';
import { tokenProblems } from '#resolve/token-checks.ts';
import { brandError, type BrandError, type BrandProblem } from '#validate/brand-error.ts';
import { decodeBrand } from '#validate/decode-brand.ts';

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
 * @returns The brand's resolved tokens and any warnings.
 * @throws BrandError in the error channel, listing every problem of the first pass that finds any,
 *   each with its field and fix.
 */
export const resolveBrand = Effect.fn('resolveBrand')(function* (
  input: unknown,
  where: BrandSource = {},
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
  return {
    tokens,
    warnings: [...contrast.warnings, ...data.warnings, ...semantic, ...substitutes],
  };
});

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
