import type { BrandProblem } from '#validate/brand-error.ts';

/**
 * A color as tokens hold it: lowercase `#rrggbb` or `#rrggbbaa`.
 */
const TOKEN_HEX_PATTERN = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/;

/**
 * Token sections that hold free text, such as a footer, a label or a font's reason, where a leading
 * `#` is not a color.
 */
const TEXT_KEYS = new Set(['label', 'text', 'reason', 'format', 'family', 'stack', 'package']);

/**
 * The fix for a token that is not finite or not a color: the schema and the color parser should
 * have refused what produced it.
 */
const TOKEN_FIX =
  'Check the field this token comes from for an extreme number or an unusual color; ' +
  'if it looks fine, report it, since the brand checks should have named it.';

/**
 * The last check before tokens leave the resolver: every number in them is finite and every color
 * is hex. The schema and the color parser already refuse what could break this, so a problem here
 * means a gap in them, reported as a brand problem rather than written as `NaNpx` or `#NaNNaNNaN`.
 *
 * @param tokens - The resolved tokens, or any part of them.
 * @param path - The path of `tokens` in the brand's tokens, for the problem.
 * @returns One problem per number that is not finite and per color that is not hex.
 */
export function tokenProblems(tokens: unknown, path = ''): BrandProblem[] {
  if (typeof tokens === 'number') {
    return Number.isFinite(tokens) ? [] : [problem(path, `is ${tokens}, not a finite number`)];
  }

  if (typeof tokens === 'string') {
    const key = path.split('.').at(-1) ?? '';
    const isColor = tokens.startsWith('#') && !TEXT_KEYS.has(key);
    return isColor && !TOKEN_HEX_PATTERN.test(tokens)
      ? [problem(path, `is "${tokens}", not a hex color`)]
      : [];
  }

  if (typeof tokens !== 'object' || tokens === null) {
    return [];
  }

  return Object.entries(tokens).flatMap(([key, value]) =>
    tokenProblems(value, Array.isArray(tokens) ? `${path}[${key}]` : join(path, key)),
  );
}

/**
 * A dotted path with one more key.
 *
 * @param path - The path so far, empty at the root.
 * @param key - The key to add.
 */
function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/**
 * The problem for one bad token.
 *
 * @param path - Where the token is.
 * @param what - What is wrong with it.
 */
function problem(path: string, what: string): BrandProblem {
  return { path, message: `The resolved token ${what}.`, fix: TOKEN_FIX };
}
