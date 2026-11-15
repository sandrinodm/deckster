import { Effect, type FileSystem } from 'effect';

import type { BrandError } from '#validate/brand-error.ts';

import { loadBrand } from '#node/load-brand.ts';

/**
 * Spaces of indentation in the printed JSON.
 */
const JSON_INDENT_SPACES = 2;

/**
 * A brand's resolved tokens as formatted JSON, for `deck brand --json`. Every color is hex and
 * every size is in canvas pixels; each surface lists its full role set and code and diagram themes,
 * so the output is everything a tool or agent needs to stay on-brand.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param name - The brand folder name under `brands/`.
 * @returns Pretty-printed JSON with a trailing newline.
 * @throws BrandError in the error channel when the brand does not exist or fails validation.
 */
export const brandTokensJson = Effect.fn('brandTokensJson')(function* (
  workspaceRoot: string,
  name: string,
): Effect.fn.Return<string, BrandError, FileSystem.FileSystem> {
  const brand = yield* loadBrand(workspaceRoot, name);
  return `${JSON.stringify(brand.tokens, null, JSON_INDENT_SPACES)}\n`;
});
