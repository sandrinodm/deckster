/**
 * Display names for common language ids, shown in a block's title bar.
 */
const LABELS: Readonly<Record<string, string>> = {
  /**
   * TypeScript.
   */
  ts: 'TypeScript',

  /**
   * TypeScript.
   */
  typescript: 'TypeScript',

  /**
   * TypeScript with JSX.
   */
  tsx: 'TSX',

  /**
   * JavaScript.
   */
  js: 'JavaScript',

  /**
   * JavaScript.
   */
  javascript: 'JavaScript',

  /**
   * JavaScript with JSX.
   */
  jsx: 'JSX',

  /**
   * JSON.
   */
  json: 'JSON',

  /**
   * Shell.
   */
  bash: 'Shell',

  /**
   * Shell.
   */
  sh: 'Shell',

  /**
   * Shell.
   */
  shell: 'Shell',

  /**
   * Shell.
   */
  zsh: 'Shell',

  /**
   * Python.
   */
  python: 'Python',

  /**
   * Python.
   */
  py: 'Python',

  /**
   * Go.
   */
  go: 'Go',

  /**
   * Rust.
   */
  rust: 'Rust',

  /**
   * Rust.
   */
  rs: 'Rust',

  /**
   * CSS.
   */
  css: 'CSS',

  /**
   * HTML.
   */
  html: 'HTML',

  /**
   * YAML.
   */
  yaml: 'YAML',

  /**
   * YAML.
   */
  yml: 'YAML',

  /**
   * SQL.
   */
  sql: 'SQL',

  /**
   * Markdown.
   */
  md: 'Markdown',

  /**
   * Markdown.
   */
  markdown: 'Markdown',

  /**
   * TOML.
   */
  toml: 'TOML',

  /**
   * Diffs.
   */
  diff: 'Diff',
};

/**
 * The language ids that carry no information worth a label.
 */
const UNLABELED = new Set(['text', 'txt', 'plaintext', 'plain']);

/**
 * The label for a language id: a display name for common ones, the id in upper case otherwise.
 *
 * @param lang - A language id.
 * @returns The label; `undefined` for plain text or no language.
 */
export function langLabel(lang: string | undefined): string | undefined {
  if (lang === undefined || lang === '' || UNLABELED.has(lang)) {
    return undefined;
  }

  return LABELS[lang.toLowerCase()] ?? lang.toUpperCase();
}
