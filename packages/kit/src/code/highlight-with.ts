import type { HighlighterCore } from 'shiki/core';

import { CODE_THEME_NAME } from '#code/code-theme.ts';
import {
  buildHighlightedCode,
  prepareSource,
  type HighlightedCode,
} from '#code/highlighted-code.ts';

/**
 * The part of a Shiki highlighter the kit uses; the build's and the browser's both satisfy it.
 */
export type CodeHighlighter = Pick<HighlighterCore, 'codeToTokens'>;

/**
 * What to do with a source besides coloring it.
 */
export type HighlightOptions = {
  /**
   * Read a leading `+` or `-` on each line as an addition or a removal.
   */
  diff: boolean;

  /**
   * Words to mark wherever they appear.
   */
  words: readonly string[];
};

/**
 * The language used when a block names none, or one the highlighter does not know.
 */
export const PLAIN_LANG = 'text';

/**
 * Highlights a source with the kit's CSS-variable theme and applies diff notation and word marks.
 * The result carries no colors of its own, so it renders correctly on every surface.
 *
 * @param highlighter - A Shiki highlighter that has the theme and the language loaded.
 * @param source - The code.
 * @param lang - The language id, already loaded in the highlighter.
 * @param options - Diff notation and words to mark.
 */
export function highlightWith(
  highlighter: CodeHighlighter,
  source: string,
  lang: string,
  options: HighlightOptions,
): HighlightedCode {
  const prepared = prepareSource(source, { diff: options.diff });
  const { tokens } = highlighter.codeToTokens(prepared.lines.join('\n'), {
    lang,
    theme: CODE_THEME_NAME,
  });
  return buildHighlightedCode(lang, tokens, prepared, options.words);
}
