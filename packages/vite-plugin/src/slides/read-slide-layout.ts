import { Effect, Predicate } from 'effect';
import path from 'node:path';

import { readMdxFrontmatter } from '#slides/frontmatter.ts';
import { readTsxMeta } from '#slides/tsx-meta.ts';

/**
 * The extension of a TSX slide; any other file is read as MDX.
 */
const TSX_EXTENSION = '.tsx';

/**
 * The `layout` a slide names in its frontmatter, read with the build's own parsers: the YAML block
 * of an MDX slide, the `export const frontmatter` literal of a TSX slide. Nothing is validated and
 * the slide is not compiled.
 *
 * @param file - The slide's path, whose extension says MDX or TSX (`.tsx`, else MDX).
 * @param text - The slide's source.
 * @returns The layout name, or `undefined` when the slide names none or its frontmatter cannot be
 *   read.
 */
export function readSlideLayout(file: string, text: string): string | undefined {
  const data = readSlideFrontmatter(file, text);
  const layout = Predicate.isObject(data) ? data.layout : undefined;
  return typeof layout === 'string' ? layout : undefined;
}

/**
 * The frontmatter of a slide as written, read with the build's own parsers: the YAML block of an
 * MDX slide, the `export const frontmatter` literal of a TSX slide. Nothing is validated and the
 * slide is not compiled.
 *
 * @param file - The slide's path, whose extension says MDX or TSX (`.tsx`, else MDX).
 * @param text - The slide's source.
 * @returns The parsed fields (`{}` for an MDX slide without frontmatter), or `undefined` when they
 *   cannot be read.
 */
export function readSlideFrontmatter(file: string, text: string): unknown {
  const ref = { file, displayPath: file };
  return path.extname(file) === TSX_EXTENSION ? tsxFrontmatter(text, ref) : mdxData(text, ref);
}

/**
 * The parsed frontmatter of an MDX slide, or `undefined` when it does not parse.
 *
 * @param text - The slide's source.
 * @param ref - The file, for the parsers' errors.
 */
function mdxData(text: string, ref: { file: string; displayPath: string }): unknown {
  return Effect.runSync(
    readMdxFrontmatter(text, ref).pipe(
      Effect.map((source) => source.data),
      Effect.orElseSucceed(() => undefined),
    ),
  );
}

/**
 * The frontmatter literal of a TSX slide, or `undefined` when it does not parse.
 *
 * @param text - The slide's source.
 * @param ref - The file, for the parsers' errors.
 */
function tsxFrontmatter(text: string, ref: { file: string; displayPath: string }): unknown {
  try {
    return readTsxMeta(text, ref).frontmatter;
  } catch {
    return undefined;
  }
}
