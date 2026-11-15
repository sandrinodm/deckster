import type { KeyedTokensInfo } from '@shikijs/magic-move/types';
import type { HighlighterCore, LanguageRegistration } from 'shiki/core';

import { codeToKeyedTokens } from '@shikijs/magic-move/core';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

import type { HighlightOptions } from '#code/highlight-with.ts';
import type { HighlightedCode } from '#code/highlighted-code.ts';

import { CODE_THEME_NAME, codeTheme } from '#code/code-theme.ts';
import { highlightWith, PLAIN_LANG } from '#code/highlight-with.ts';

/**
 * A loader for one language grammar.
 */
type LanguageLoader = () => Promise<{ default: LanguageRegistration[] }>;

/**
 * The languages the browser can highlight when a block was not highlighted at build time, each a
 * lazy chunk. Any other language falls back to plain text there; a block in the MDX file itself is
 * highlighted at build time with every language Shiki has.
 */
const RUNTIME_LANGS: Readonly<Record<string, LanguageLoader>> = {
  /**
   * TypeScript.
   */
  typescript: () => import('shiki/langs/typescript.mjs'),

  /**
   * TSX.
   */
  tsx: () => import('shiki/langs/tsx.mjs'),

  /**
   * JavaScript.
   */
  javascript: () => import('shiki/langs/javascript.mjs'),

  /**
   * JSX.
   */
  jsx: () => import('shiki/langs/jsx.mjs'),

  /**
   * JSON.
   */
  json: () => import('shiki/langs/json.mjs'),

  /**
   * Shell scripts.
   */
  bash: () => import('shiki/langs/bash.mjs'),

  /**
   * Python.
   */
  python: () => import('shiki/langs/python.mjs'),

  /**
   * Go.
   */
  go: () => import('shiki/langs/go.mjs'),

  /**
   * Rust.
   */
  rust: () => import('shiki/langs/rust.mjs'),

  /**
   * CSS.
   */
  css: () => import('shiki/langs/css.mjs'),

  /**
   * HTML.
   */
  html: () => import('shiki/langs/html.mjs'),

  /**
   * YAML.
   */
  yaml: () => import('shiki/langs/yaml.mjs'),

  /**
   * SQL.
   */
  sql: () => import('shiki/langs/sql.mjs'),
};

/**
 * Names that mean one of {@link RUNTIME_LANGS}.
 */
const ALIASES: Readonly<Record<string, string>> = {
  /**
   * TypeScript.
   */
  ts: 'typescript',

  /**
   * JavaScript.
   */
  js: 'javascript',

  /**
   * Shell.
   */
  sh: 'bash',

  /**
   * Shell.
   */
  shell: 'bash',

  /**
   * Shell sessions.
   */
  zsh: 'bash',

  /**
   * Python.
   */
  py: 'python',

  /**
   * YAML.
   */
  yml: 'yaml',

  /**
   * Rust.
   */
  rs: 'rust',
};

/**
 * The browser's highlighter, created the first time a block needs it.
 */
let instance: Promise<HighlighterCore> | undefined;

/**
 * The languages already loaded into the browser's highlighter.
 */
const loaded = new Set<string>();

/**
 * Highlights code in the browser, loading Shiki's JavaScript engine and the language on first use.
 * Slides whose blocks were highlighted at build time never call this, so the engine stays out of
 * their bundle.
 *
 * @param source - The code.
 * @param requested - The language as written; unknown ones are highlighted as plain text.
 * @param options - Diff notation and words to mark.
 */
export async function highlightInBrowser(
  source: string,
  requested: string | undefined,
  options: HighlightOptions,
): Promise<HighlightedCode> {
  const highlighter = await browserHighlighter();
  return highlightWith(highlighter, source, await loadLang(highlighter, requested), options);
}

/**
 * Highlights and keys each state of a `CodeMove` in the browser.
 *
 * @param states - The code of each state, and its language when it has its own.
 * @param fallbackLang - The language for states that name none.
 */
export async function keyStatesInBrowser(
  states: readonly { code: string; lang?: string }[],
  fallbackLang: string | undefined,
): Promise<KeyedTokensInfo[]> {
  const highlighter = await browserHighlighter();
  const keyed: KeyedTokensInfo[] = [];
  for (const state of states) {
    const lang = await loadLang(highlighter, state.lang ?? fallbackLang);
    const options = { lang, theme: CODE_THEME_NAME };
    keyed.push(codeToKeyedTokens(highlighter, state.code, options, false));
  }

  return keyed;
}

/**
 * Creates the highlighter once.
 */
function browserHighlighter(): Promise<HighlighterCore> {
  instance ??= createHighlighterCore({
    themes: [codeTheme],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return instance;
}

/**
 * Loads a language if the browser build has it.
 *
 * @param highlighter - The browser's highlighter.
 * @param requested - The language as written.
 * @returns The id to highlight with; plain text for an unknown language.
 */
async function loadLang(
  highlighter: HighlighterCore,
  requested: string | undefined,
): Promise<string> {
  const name = (requested ?? PLAIN_LANG).toLowerCase();
  const id = ALIASES[name] ?? name;
  const loader = RUNTIME_LANGS[id];
  if (loader === undefined) {
    return PLAIN_LANG;
  }

  if (!loaded.has(id)) {
    await highlighter.loadLanguage((await loader()).default);
    loaded.add(id);
  }

  return id;
}
