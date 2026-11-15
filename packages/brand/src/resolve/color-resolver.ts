import type { BrandProblem } from '#validate/brand-error.ts';

import { formatHex, fromHex, parseColorLiteral, type Rgba } from '#color/color.ts';
import { ownValue } from '#resolve/own-value.ts';
import { PALETTE_REF_PATTERN } from '#schema/primitives.ts';
import { pickFrom } from '#validate/suggest.ts';

/**
 * Shown in place of a color that could not be resolved, so the rest of the brand still checks.
 */
const UNRESOLVED: Rgba = fromHex('#ff00ff');

/**
 * Divides a reference's opacity percentage into an alpha.
 */
const PERCENT = 100;

/**
 * Shrinks an opacity above 100 into the example the fix suggests: `/250` suggests `/25`, the
 * likeliest intended value.
 */
const EXAMPLE_DIVISOR = 10;

/**
 * The brand's palette: scale name to step name to literal color, as decoded.
 */
type Palette = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * Resolves color literals and palette references, collecting a problem for each bad reference.
 */
export type ColorResolver = {
  /**
   * The color for a literal or `palette.step[/alpha]` reference.
   */
  rgba: (ref: string, path: string) => Rgba;

  /**
   * The same color as hex.
   */
  hex: (ref: string, path: string) => string;

  /**
   * Problems found so far: unknown palettes and steps, and opacities above 100%.
   */
  problems: BrandProblem[];
};

/**
 * Creates a resolver over a brand's palette.
 *
 * @param palette - Scale name to step name to literal color, as decoded.
 */
export function createColorResolver(palette: Palette): ColorResolver {
  const problems: BrandProblem[] = [];
  /**
   * Resolves one literal or reference; a bad reference records a problem at `path` and gives the
   * placeholder color.
   */
  const rgba = (ref: string, path: string): Rgba => {
    const literal = parseColorLiteral(ref);
    if (literal !== undefined) {
      return literal;
    }

    const resolved = resolveReference(palette, ref);
    if ('message' in resolved) {
      problems.push({ path, ...resolved });
      return UNRESOLVED;
    }

    return resolved;
  };
  return { rgba, hex: (ref, path) => formatHex(rgba(ref, path)), problems };
}

/**
 * The color a reference names, or why it names none and how to fix it.
 */
function resolveReference(palette: Palette, ref: string): Rgba | Omit<BrandProblem, 'path'> {
  const [, scaleName = '', step = '', alpha] = PALETTE_REF_PATTERN.exec(ref) ?? [];
  const scale = ownValue(palette, scaleName);
  if (scale === undefined) {
    return {
      message: `"${ref}" refers to a palette "${scaleName}" that does not exist.`,
      fix: referenceFix(palette, ref),
    };
  }

  const literal = ownValue(scale, step);
  const color = literal === undefined ? undefined : parseColorLiteral(literal);
  if (color === undefined) {
    return {
      message: `"${ref}" refers to a step "${step}" that the "${scaleName}" palette does not have.`,
      fix: referenceFix(palette, ref),
    };
  }

  if (alpha === undefined) {
    return color;
  }

  const percent = Number(alpha);
  if (percent > PERCENT) {
    const example = `${scaleName}.${step}/${Math.round(percent / EXAMPLE_DIVISOR)}`;
    return {
      message: `"${ref}" asks for ${percent}% opacity; opacity runs from 0 to ${PERCENT}.`,
      fix:
        `Write an opacity from 0 to ${PERCENT}, such as "${example}", ` +
        'or leave it out for an opaque color.',
    };
  }

  return { ...color, alpha: percent / PERCENT };
}

/**
 * The fix for a bad reference: the closest palette name when the palette does not exist, else the
 * closest step in that palette.
 *
 * @param palette - The brand's palette.
 * @param ref - The reference as written.
 */
function referenceFix(palette: Palette, ref: string): string {
  const [, scaleName = '', step = ''] = PALETTE_REF_PATTERN.exec(ref) ?? [];
  const scale = ownValue(palette, scaleName);
  if (scale === undefined) {
    return pickFrom(scaleName, Object.keys(palette), 'palette');
  }

  return pickFrom(step, Object.keys(scale), `step in "${scaleName}"`);
}
