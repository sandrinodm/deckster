import type { KeyedTokensInfo } from '@shikijs/magic-move/types';
import type { HighlighterCore, LanguageRegistration } from 'shiki/core';

import { codeToKeyedTokens } from '@shikijs/magic-move/core';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import { bundledLanguages, bundledLanguagesAlias } from 'shiki/langs';

import type { HighlightOptions } from '#code/highlight-with.ts';
import type { HighlightedCode } from '#code/highlighted-code.ts';

import { CODE_THEME_NAME, codeTheme } from '#code/code-theme.ts';
import { highlightWith, PLAIN_LANG } from '#code/highlight-with.ts';

/**
 * The build's highlighter, created on first use and kept for the life of the process.
 */
let highlighter: Promise<HighlighterCore> | undefined;

/**
 * A loader for one language grammar.
 */
type LanguageLoader = () => Promise<{ default: LanguageRegistration[] }>;

/**
 * A language the build resolved: the id to highlight with, and whether it had to fall back.
 */
export type ResolvedLang = {
  /**
   * The id Shiki highlights with.
   */
  lang: string;

  /**
   * Whether the requested language is unknown, so plain text was used.
   */
  fallback: boolean;
};

/**
 * Loads a language into the build's highlighter if Shiki knows it.
 *
 * @param requested - The language as the author wrote it; `undefined` or empty for plain text.
 * @returns The language to use. An unknown one falls back to plain text.
 */
export async function resolveLang(requested: string | undefined): Promise<ResolvedLang> {
  const name = requested === undefined || requested === '' ? PLAIN_LANG : requested.toLowerCase();
  const instance = await sharedHighlighter();
  if (name === PLAIN_LANG || name === 'plaintext' || name === 'txt') {
    return { lang: PLAIN_LANG, fallback: false };
  }

  const loader = loaderFor(name);
  if (loader === undefined) {
    return { lang: PLAIN_LANG, fallback: true };
  }

  await instance.loadLanguage((await loader()).default);
  return { lang: name, fallback: false };
}

/**
 * Highlights code at build time.
 *
 * @param source - The code.
 * @param lang - A language id from {@link resolveLang}.
 * @param options - Diff notation and words to mark.
 */
export async function highlightAtBuild(
  source: string,
  lang: string,
  options: HighlightOptions,
): Promise<HighlightedCode> {
  return highlightWith(await sharedHighlighter(), source, lang, options);
}

/**
 * Highlights each state of a `CodeMove` and keys the tokens so the browser can animate between
 * them.
 *
 * @param states - The code of each state, with its language id from {@link resolveLang}.
 */
export async function keyStatesAtBuild(
  states: readonly { code: string; lang: string }[],
): Promise<KeyedTokensInfo[]> {
  const instance = await sharedHighlighter();
  return states.map((state) =>
    codeToKeyedTokens(instance, state.code, { lang: state.lang, theme: CODE_THEME_NAME }, false),
  );
}

/**
 * Finds a language's loader by its name or alias in Shiki's bundled tables. Shiki types those
 * tables by their literal language names, so they are widened to plain records for the lookup.
 *
 * @param name - The lower-cased language id.
 * @returns The loader, or `undefined` when Shiki does not bundle the language.
 */
function loaderFor(name: string): LanguageLoader | undefined {
  return (
    (bundledLanguages as Record<string, LanguageLoader | undefined>)[name] ??
    (bundledLanguagesAlias as Record<string, LanguageLoader | undefined>)[name]
  );
}

/**
 * The shared highlighter, created once with the kit's theme.
 */
function sharedHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [codeTheme],
    langs: [],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });
  return highlighter;
}
