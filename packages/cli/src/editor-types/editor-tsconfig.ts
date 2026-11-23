/**
 * The workspace file that carries the global declarations (Node, MDX, Vite client, icons), relative
 * to the workspace root.
 */
export const EDITOR_ENV_FILE = '.deck/env.d.ts';

/**
 * The files the workspace's `tsconfig.json` covers when it has no `include` of its own.
 */
const DEFAULT_INCLUDE = ['decks/**/*', 'brands/**/*'];

/**
 * The compiler options a workspace needs to type-check decks and brands, matching the framework's
 * own: strict, bundler resolution and React's automatic JSX runtime. A workspace's existing options
 * win; these only fill in what it does not set.
 */
const DEFAULT_COMPILER_OPTIONS: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  ['target', 'es2023'],
  ['lib', ['es2023', 'DOM', 'DOM.Iterable']],
  ['module', 'preserve'],
  ['moduleResolution', 'bundler'],
  ['jsx', 'react-jsx'],
  ['strict', true],
  ['noUncheckedIndexedAccess', true],
  ['exactOptionalPropertyTypes', true],
  ['noEmit', true],
  ['skipLibCheck', true],
  ['allowImportingTsExtensions', true],
  ['verbatimModuleSyntax', true],
  ['isolatedModules', true],
  ['erasableSyntaxOnly', true],
  ['resolveJsonModule', true],
  ['esModuleInterop', true],
  ['moduleDetection', 'force'],
  ['types', []],
]);

/**
 * Spaces of indentation in the written JSON.
 */
const JSON_INDENT_SPACES = 2;

/**
 * The packages decks and brands import directly, whose specifiers `deckster types` maps one by one
 * because TypeScript does not read `exports` for a path mapped to a folder. Other packages a deck
 * imports resolve through the catch-all.
 */
export const USER_PACKAGES = ['effect', 'react', 'react-dom'];

/**
 * Whether a key of `compilerOptions.paths` is one `deckster types` owns: the framework's own
 * packages, the packages in {@link USER_PACKAGES} with their subpaths, and the catch-all for its
 * other dependencies. Other keys are the workspace's and stay.
 *
 * @param key - A `paths` key.
 */
function isManagedPathKey(key: string): boolean {
  const isUserPackage = USER_PACKAGES.some((name) => key === name || key.startsWith(`${name}/`));
  return key === '*' || key.startsWith('@deckster/') || isUserPackage;
}

/**
 * Merges the framework's path mappings into a workspace `tsconfig.json`, keeping everything else
 * the workspace wrote.
 *
 * @param existing - The current file's text, or `undefined` when there is none.
 * @param paths - The `compilerOptions.paths` entries to write.
 * @returns The new text, or `undefined` when the existing file is not plain JSON (comments,
 *   trailing commas) or not an object, so it is never overwritten by guesswork.
 */
export function mergeTsconfig(
  existing: string | undefined,
  paths: Readonly<Record<string, readonly string[]>>,
): string | undefined {
  const current = existing === undefined ? {} : parseObject(existing);
  if (current === undefined) {
    return undefined;
  }

  const options = asObject(current['compilerOptions']);
  // A workspace that extends another config already has its compiler options there.
  const defaults = 'extends' in current ? {} : Object.fromEntries(DEFAULT_COMPILER_OPTIONS);
  const kept = Object.entries(asObject(options['paths'])).filter(([key]) => !isManagedPathKey(key));
  const include = Array.isArray(current['include']) ? [...current['include']] : DEFAULT_INCLUDE;
  const merged = {
    ...current,
    compilerOptions: {
      ...defaults,
      ...options,
      paths: { ...Object.fromEntries(kept), ...paths },
    },
    include: include.includes(EDITOR_ENV_FILE) ? include : [...include, EDITOR_ENV_FILE],
  };
  return `${JSON.stringify(merged, null, JSON_INDENT_SPACES)}\n`;
}

/**
 * The text of the declaration file: a triple-slash reference for each file of global declarations.
 *
 * @param files - Absolute paths of `.d.ts` files.
 */
export function envDeclarations(files: readonly string[]): string {
  return [
    '// Written by `deckster types`. Do not edit: run `deckster types` again after upgrading.',
    ...files.map((file) => `/// <reference path=${JSON.stringify(file)} />`),
    '',
  ].join('\n');
}

/**
 * Parses text that must be a JSON object.
 *
 * @param text - The text.
 */
function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { ...value }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A JSON value as an object, or an empty one.
 *
 * @param value - A parsed value.
 */
function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : {};
}
