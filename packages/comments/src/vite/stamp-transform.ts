import path from 'node:path';

/**
 * The module the JSX compilers import `jsxDEV` from in development.
 */
const REACT_DEV_RUNTIME = 'react/jsx-dev-runtime';

/**
 * Matches the dev runtime as a quoted import specifier.
 */
const DEV_RUNTIME_SPECIFIER_PATTERN = /(["'])react\/jsx-dev-runtime\1/g;

/**
 * The query string or hash Vite appends to a module id.
 */
const QUERY_PATTERN = /[?#].*$/;

/**
 * Files whose JSX is stamped: MDX slides and partials, TSX and JSX slides and components.
 */
const STAMPED_EXTENSION_PATTERN = /\.(?:mdx|tsx|jsx)$/;

/**
 * A folder of installed packages, never stamped.
 */
const NODE_MODULES_SEGMENT = '/node_modules/';

/**
 * Matches each character that has a meaning in a regular expression.
 */
const REGEX_SPECIAL_CHARACTER_PATTERN = /[.*+?^${}()|[\]\\]/g;

/**
 * Where the stamping runtime is and which deck it stamps.
 */
export type StampOptions = {
  /**
   * The absolute deck folder; only modules inside it are stamped.
   */
  deckDir: string;

  /**
   * The absolute path of the stamping `jsx-dev-runtime`.
   */
  runtime: string;
};

/**
 * The file a module id names when it is one of the deck's own MDX, TSX or JSX files, else
 * `undefined`. Installed packages inside the deck folder are left out.
 *
 * @param id - A Vite module id, possibly with a query string.
 * @param deckDir - The absolute deck folder.
 */
export function deckSourceFile(id: string, deckDir: string): string | undefined {
  const file = id.replace(QUERY_PATTERN, '');
  const relative = path.relative(deckDir, file);
  const isInside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  const isSource =
    STAMPED_EXTENSION_PATTERN.test(file) && !toPosix(file).includes(NODE_MODULES_SEGMENT);
  return isInside && isSource ? file : undefined;
}

/**
 * Points a compiled deck module at the stamping runtime. Both the MDX compiler and the React
 * plugin's JSX transform emit `jsxDEV(type, props, key, isStatic, { fileName, lineNumber,
 * columnNumber })` in development, with the module's absolute path as the file name; this swaps the
 * `react/jsx-dev-runtime` import for the stamping one and the absolute path for the path relative
 * to the deck folder, so each element is stamped `slides/intro.mdx:14:3`.
 *
 * @param code - The module after the React plugin compiled it.
 * @param file - The module's absolute file.
 * @param options - The deck folder and the runtime.
 * @returns The new code, or `undefined` when the module has no dev JSX.
 */
export function stampDeckModule(
  code: string,
  file: string,
  options: StampOptions,
): string | undefined {
  if (!code.includes(REACT_DEV_RUNTIME)) {
    return undefined;
  }

  const runtime = JSON.stringify(toPosix(options.runtime));
  const relative = JSON.stringify(toPosix(path.relative(options.deckDir, file)));
  const fileName = new RegExp(
    `(fileName:\\s*|_jsxFileName\\s*=\\s*)${escapeRegExp(JSON.stringify(file))}`,
    'g',
  );
  return code
    .replaceAll(DEV_RUNTIME_SPECIFIER_PATTERN, runtime)
    .replaceAll(fileName, (_, prefix: string) => `${prefix}${relative}`);
}

/**
 * Escapes the characters that have a meaning in a regular expression.
 *
 * @param text - Literal text.
 */
function escapeRegExp(text: string): string {
  return text.replaceAll(REGEX_SPECIAL_CHARACTER_PATTERN, '\\$&');
}

/**
 * A path with forward slashes.
 *
 * @param file - Any path.
 */
function toPosix(file: string): string {
  return file.split(path.sep).join('/');
}
