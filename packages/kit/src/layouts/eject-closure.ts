import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Which kit layout files a code layout would need if it were a copy of a kit layout (`deckster
 * layouts eject`), and which of the kit's own modules it must not copy because they keep state the
 * kit's other code shares.
 *
 * Everything here reads source text and never imports the code it reads, so it runs in plain Node
 * and a layout's React code is never loaded. The walk follows `#` imports and relative imports; a
 * module imported only through names that `@deckster/kit/layout-parts`,
 * `@deckster/kit/layout-fields`, `@deckster/kit` or `@deckster/kit/diagrams` export is a public
 * boundary: the walk stops there and records the import as one the eject rewrite can point at the
 * package instead of copying.
 */

/**
 * The folder holding the kit's source (`packages/kit/src`).
 */
export const KIT_SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

/**
 * The public entry modules of the kit, in the order a module found in several of them is credited
 * to: the layout building blocks first, then the package's two component entries.
 */
export const PUBLIC_ENTRIES: readonly PublicEntry[] = [
  { file: 'layout-parts.ts', target: '@deckster/kit/layout-parts' },
  { file: 'layout-fields.ts', target: '@deckster/kit/layout-fields' },
  { file: 'index.ts', target: '@deckster/kit' },
  { file: 'diagrams.ts', target: '@deckster/kit/diagrams' },
];

/**
 * Modules that keep state shared with the kit's other code, and what that state is. A layout whose
 * eject closure copies one gets a second, empty or unconnected instance, so each must be public
 * (reached through a boundary export) for every layout. Modules in this list are never copied.
 */
export const SHARED_STATE_MODULES: ReadonlyMap<string, string> = new Map([
  [
    'foundation/frontmatter-assets.ts',
    'module-level registry that every MDX slide fills by importing this exact file',
  ],
  ['foundation/table-context.ts', 'TableLayoutContext, provided by `table` and read by kit tables'],
  ['motion/still-motion.ts', 'RevealContext, provided by `Step` and read by counting numbers'],
  ['motion/step.tsx', 'provides RevealContext to the step content'],
  ['media/media-frame.ts', 'MediaFrameContext, provided by TreatedMedia'],
]);

/**
 * Modules with module-level mutable-looking state that is safe to copy, each with the reason. A
 * module that holds such state and is not listed here, nor in {@link SHARED_STATE_MODULES}, fails
 * the generic check in {@link findUnsafeCopies} when it reaches a closure.
 */
export const SAFE_STATE_MODULES: ReadonlyMap<string, string> = new Map([
  [
    'foundation/initials.ts',
    'constant lookup sets of honorifics, suffixes and name particles, built once and never changed',
  ],
  ['layouts/stat-value.ts', 'constant lookup sets of sign and arrow characters, never changed'],
  ['links/link-target.ts', 'the constant set of safe URL schemes, never changed'],
]);

/**
 * One public entry module of the kit and the specifier a package user imports it by.
 */
export type PublicEntry = {
  /**
   * The module's path under the kit's `src` folder.
   */
  file: string;

  /**
   * The specifier a layout in a brand or a deck imports it by.
   */
  target: string;
};

/**
 * An import in a closure that the eject rewrite points at the package instead of copying.
 */
export type PublicImport = {
  /**
   * The file that has the import, as a path under the kit's `src` folder.
   */
  file: string;

  /**
   * The module the import names, as a path under the kit's `src` folder.
   */
  module: string;

  /**
   * The names it imports, as the module exports them.
   */
  symbols: string[];

  /**
   * The package specifier they are public under.
   */
  target: string;
};

/**
 * What an eject of one layout would carry.
 */
export type LayoutClosure = {
  /**
   * The layout's own files (`<name>-layout.tsx`, `.contract.ts`, `.css`), under the kit's `src`.
   */
  own: string[];

  /**
   * Imports of public names, with the package specifier each rewrites to.
   */
  publicImports: PublicImport[];

  /**
   * Kit source modules that would be copied next to the layout, under the kit's `src` folder.
   */
  copied: string[];

  /**
   * Stylesheets reached through the layout's files and the copied modules, under the kit's `src`.
   */
  css: string[];
};

/**
 * A copied module that must not be copied.
 */
export type UnsafeCopy = {
  /**
   * The module's path under the kit's `src` folder.
   */
  module: string;

  /**
   * Why a copy would not work.
   */
  reason: string;
};

/**
 * One import, re-export or dynamic import in a module.
 */
type ImportEdge = {
  /**
   * The specifier as written, without resolving it.
   */
  specifier: string;

  /**
   * The names it takes from the module, as the module exports them; empty for a side-effect import.
   */
  symbols: string[];
};

/**
 * Matches the source files of the kit that can import.
 */
const CODE_FILE = /\.(?:ts|tsx)$/u;

/**
 * Matches test and fixture files, which no layout copies.
 */
const TEST_OR_FIXTURE_FILE = /\.(?:test|render\.test|fixture)\.(?:ts|tsx)$/u;

/**
 * Matches a block comment, JSDoc included.
 */
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//gu;

/**
 * Matches a line that holds only a `//` comment.
 */
const LINE_COMMENT = /^[ \t]*\/\/.*$/gmu;

/**
 * Matches `import <clause> from '<specifier>'` at the start of a line.
 */
const IMPORT_STATEMENT = /^import\s+([^'";]*?)\s+from\s+'([^']+)'/gmu;

/**
 * Matches `import '<specifier>'`, as the layouts import stylesheets.
 */
const SIDE_EFFECT_IMPORT = /^import\s+'([^']+)'/gmu;

/**
 * Matches `export { … } from '<specifier>'` and `export * from`.
 */
const REEXPORT_STATEMENT = /^export\s+(?:type\s+)?(\{[^}]*\}|\*)\s+from\s+'([^']+)'/gmu;

/**
 * Matches `import('<specifier>')`.
 */
const DYNAMIC_IMPORT = /\bimport\(\s*'([^']+)'\s*\)/gu;

/**
 * Matches a stylesheet's `@import` of another stylesheet.
 */
const CSS_IMPORT = /@import\s+(?:url\()?\s*['"]([^'"]+)['"]/gu;

/**
 * Matches a call that creates a React context.
 */
const CONTEXT_CALL = /\bcreateContext\s*[<(]/u;

/**
 * Matches a `let` at the start of a line, which is module level in the kit's source.
 */
const MODULE_LET = /^(?:export\s+)?let\s+/mu;

/**
 * Matches a module-level `const` built with `new Map`, `Set`, `WeakMap` or `WeakSet`.
 */
const MODULE_COLLECTION =
  /^(?:export\s+)?const\s+\w+[^=\n]*=\s*new\s+(?:Map|Set|WeakMap|WeakSet)\b/mu;

/**
 * Matches the import of a layout's contract in `catalog.ts`, capturing its name.
 */
const LAYOUT_CONTRACT_IMPORT =
  /^import\s[^'";]*\sfrom\s'#layouts\/([a-z0-9-]+)-layout\.contract\.ts'/gmu;

/**
 * The names of the layouts in the kit's catalog, in catalog order: every
 * `<name>-layout.contract.ts` `catalog.ts` imports.
 *
 * @param srcDir - The kit's `src` folder.
 */
export function catalogLayoutNames(srcDir: string = KIT_SRC_DIR): string[] {
  const catalog = readFileSync(join(srcDir, 'catalog.ts'), 'utf8');
  return [...catalog.matchAll(LAYOUT_CONTRACT_IMPORT)].map((match) => match[1] ?? '');
}

/**
 * Follows the imports of every layout in the catalog and sorts what it finds into public imports,
 * modules to copy and stylesheets.
 *
 * @param srcDir - The kit's `src` folder.
 * @returns The closure of each layout, by layout name.
 */
export function ejectClosures(srcDir: string = KIT_SRC_DIR): Record<string, LayoutClosure> {
  const boundary = publicBoundary(srcDir);
  const closures: Record<string, LayoutClosure> = {};
  for (const name of catalogLayoutNames(srcDir)) {
    closures[name] = layoutClosure(srcDir, name, boundary);
  }

  return closures;
}

/**
 * Lists the copied modules of each closure that would break when copied: those in
 * {@link SHARED_STATE_MODULES}; any that creates a React context; and any that keeps module-level
 * `let` or `new Map`/`Set`/`WeakMap`/`WeakSet` state while kit code outside `layouts/` imports it
 * (a copy and the kit then hold separate state). Modules in {@link SAFE_STATE_MODULES} pass the
 * last two checks.
 *
 * @param srcDir - The kit's `src` folder.
 * @param closures - The result of {@link ejectClosures} for the same folder.
 * @returns The unsafe copies of each layout that has any, by layout name.
 */
export function findUnsafeCopies(
  srcDir: string,
  closures: Record<string, LayoutClosure>,
): Record<string, UnsafeCopy[]> {
  const importers = importersOutsideLayouts(srcDir);
  const verdicts = new Map<string, string | undefined>();
  const unsafe: Record<string, UnsafeCopy[]> = {};
  for (const [name, closure] of Object.entries(closures)) {
    for (const module of closure.copied) {
      if (!verdicts.has(module)) {
        verdicts.set(module, copyProblem(srcDir, module, importers));
      }

      const reason = verdicts.get(module);
      if (reason !== undefined) {
        (unsafe[name] ??= []).push({ module, reason });
      }
    }
  }

  return unsafe;
}

/**
 * Finds the module-level state a module's source text holds that a copy would not share: a React
 * context, a module-level `let`, or a module-level `Map`, `Set`, `WeakMap` or `WeakSet`.
 *
 * @param source - The module's source text.
 * @returns A short description of each kind of state found, empty when there is none.
 */
export function moduleStateHits(source: string): string[] {
  const code = stripComments(source);
  const hits: string[] = [];
  if (CONTEXT_CALL.test(code)) {
    hits.push('creates a React context');
  }

  if (MODULE_LET.test(code)) {
    hits.push('has a module-level `let`');
  }

  if (MODULE_COLLECTION.test(code)) {
    hits.push('has a module-level Map or Set');
  }

  return hits;
}

/**
 * Everything a module reaches by import, type-only imports and dynamic imports included, without
 * stopping at public boundaries. It tells whether a module loads in plain Node: a `.tsx` file, a
 * stylesheet or a `react` import in the result means it does not.
 *
 * @param srcDir - The kit's `src` folder.
 * @param entry - The module to start from, as a path under `srcDir`.
 * @returns The modules under `srcDir` (the entry included) and the bare package specifiers they
 *   import, both sorted.
 */
export function transitiveImports(
  srcDir: string,
  entry: string,
): { modules: string[]; packages: string[] } {
  const modules = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() ?? '';
    if (modules.has(file)) {
      continue;
    }

    modules.add(file);
    for (const edge of readEdges(srcDir, file)) {
      const module = resolveSpecifier(srcDir, join(srcDir, file), edge.specifier);
      if (module !== undefined) {
        pending.push(module);
      } else if (!edge.specifier.startsWith('#') && !edge.specifier.startsWith('.')) {
        packages.add(edge.specifier);
      }
    }
  }

  return { modules: [...modules].sort(), packages: [...packages].sort() };
}

/**
 * Maps each module the public entries re-export to the names they export from it.
 *
 * @param srcDir - The kit's `src` folder.
 * @returns For each module under `src`, each public name (as the module exports it) and the package
 *   specifier it is public under. The first entry in {@link PUBLIC_ENTRIES} wins.
 */
export function publicBoundary(srcDir: string = KIT_SRC_DIR): Map<string, Map<string, string>> {
  const boundary = new Map<string, Map<string, string>>();
  for (const entry of PUBLIC_ENTRIES) {
    const entryFile = join(srcDir, entry.file);
    if (!isFile(entryFile)) {
      continue;
    }

    const code = stripComments(readFileSync(entryFile, 'utf8'));
    for (const match of code.matchAll(REEXPORT_STATEMENT)) {
      const module = resolveSpecifier(srcDir, entryFile, match[2] ?? '');
      if (module === undefined) {
        continue;
      }

      const names = boundary.get(module) ?? new Map<string, string>();
      for (const symbol of exportedSymbols(match[1] ?? '')) {
        if (!names.has(symbol)) {
          names.set(symbol, entry.target);
        }
      }

      boundary.set(module, names);
    }
  }

  return boundary;
}

/**
 * Follows the imports of one layout's files and sorts what it finds.
 */
function layoutClosure(
  srcDir: string,
  name: string,
  boundary: Map<string, Map<string, string>>,
): LayoutClosure {
  const own = ['tsx', 'contract.ts', 'css']
    .map((extension) => `layouts/${name}-layout.${extension}`)
    .filter((file) => isFile(join(srcDir, file)));
  const closure: LayoutClosure = { own, publicImports: [], copied: [], css: [] };
  const visited = new Set<string>();
  const pending = [...own];
  while (pending.length > 0) {
    const file = pending.pop() ?? '';
    if (visited.has(file)) {
      continue;
    }

    visited.add(file);
    if (file.endsWith('.css')) {
      closure.css.push(file);
    } else if (!own.includes(file)) {
      closure.copied.push(file);
    }

    for (const edge of readEdges(srcDir, file)) {
      pending.push(...followEdge(srcDir, file, edge, boundary, closure));
    }
  }

  closure.copied.sort();
  closure.css.sort();
  closure.publicImports.sort(
    (a, b) => compareText(a.file, b.file) || compareText(a.module, b.module),
  );
  return closure;
}

/**
 * Records the public part of an import in the closure and returns the modules still to walk.
 */
function followEdge(
  srcDir: string,
  file: string,
  edge: ImportEdge,
  boundary: Map<string, Map<string, string>>,
  closure: LayoutClosure,
): string[] {
  const module = resolveSpecifier(srcDir, join(srcDir, file), edge.specifier);
  if (module === undefined) {
    return [];
  }

  const entry = PUBLIC_ENTRIES.find((candidate) => candidate.file === module);
  if (entry !== undefined) {
    closure.publicImports.push({ file, module, symbols: edge.symbols, target: entry.target });
    return [];
  }

  const names = boundary.get(module);
  const publicSymbols = edge.symbols.filter((symbol) => names?.has(symbol) === true);
  for (const target of new Set(publicSymbols.map((symbol) => names?.get(symbol) ?? ''))) {
    const symbols = publicSymbols.filter((symbol) => names?.get(symbol) === target);
    closure.publicImports.push({ file, module, symbols, target });
  }

  const wholeImportIsPublic =
    edge.symbols.length > 0 && publicSymbols.length === edge.symbols.length;
  return wholeImportIsPublic ? [] : [module];
}

/**
 * Says why a copied module would break, or nothing when it is safe to copy.
 */
function copyProblem(
  srcDir: string,
  module: string,
  importers: Map<string, string[]>,
): string | undefined {
  const known = SHARED_STATE_MODULES.get(module);
  if (known !== undefined) {
    return `keeps shared state (${known}) and is not public`;
  }

  if (!CODE_FILE.test(module) || SAFE_STATE_MODULES.get(module) !== undefined) {
    return undefined;
  }

  const hits = moduleStateHits(readFileSync(join(srcDir, module), 'utf8'));
  const sharedWithKit = (importers.get(module) ?? []).length > 0;
  if (hits.includes('creates a React context')) {
    return 'creates a React context, which a copy would not share with the kit';
  }

  if (hits.length > 0 && sharedWithKit) {
    return `${hits.join(' and ')}, and kit code outside layouts/ imports it (${importers.get(module)?.join(', ')})`;
  }

  return undefined;
}

/**
 * For each module under `src`, the non-test modules outside `layouts/` that import it.
 */
function importersOutsideLayouts(srcDir: string): Map<string, string[]> {
  const importers = new Map<string, string[]>();
  for (const file of listCodeFiles(srcDir)) {
    if (file.startsWith('layouts/')) {
      continue;
    }

    for (const edge of readEdges(srcDir, file)) {
      const module = resolveSpecifier(srcDir, join(srcDir, file), edge.specifier);
      if (module !== undefined) {
        importers.set(module, [...(importers.get(module) ?? []), file]);
      }
    }
  }

  return importers;
}

/**
 * Lists the kit's non-test source files under `src`.
 */
function listCodeFiles(srcDir: string): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => CODE_FILE.test(file) && !TEST_OR_FIXTURE_FILE.test(file))
    .sort();
}

/**
 * Reads the imports, re-exports and dynamic imports of a source file or a stylesheet.
 */
function readEdges(srcDir: string, file: string): ImportEdge[] {
  const source = readFileSync(join(srcDir, file), 'utf8');
  if (file.endsWith('.css')) {
    const specifiers = [...source.matchAll(CSS_IMPORT)].map((match) => match[1] ?? '');
    return specifiers.map((specifier) => ({ specifier, symbols: [] }));
  }

  const code = stripComments(source);
  const edges: ImportEdge[] = [];
  for (const match of code.matchAll(IMPORT_STATEMENT)) {
    edges.push({
      specifier: match[2] ?? '',
      symbols: importedSymbols(match[1] ?? ''),
    });
  }

  for (const match of code.matchAll(SIDE_EFFECT_IMPORT)) {
    edges.push({ specifier: match[1] ?? '', symbols: [] });
  }

  for (const match of code.matchAll(REEXPORT_STATEMENT)) {
    edges.push({
      specifier: match[2] ?? '',
      symbols: exportedSymbols(match[1] ?? ''),
    });
  }

  for (const match of code.matchAll(DYNAMIC_IMPORT)) {
    edges.push({ specifier: match[1] ?? '', symbols: ['*'] });
  }

  return edges;
}

/**
 * Resolves a `#` or relative specifier to a path under `src`, or nothing for a package, a file that
 * does not exist or a file that is neither code nor a stylesheet.
 */
function resolveSpecifier(srcDir: string, from: string, specifier: string): string | undefined {
  const bare = specifier.split('?')[0] ?? '';
  const base = bare.startsWith('#') ? join(srcDir, bare.slice(1)) : resolve(dirname(from), bare);
  if (!bare.startsWith('#') && !bare.startsWith('.')) {
    return undefined;
  }

  const path = relative(srcDir, base);
  const isModule = /\.(?:ts|tsx|css)$/u.test(path);
  return isModule && isFile(base) ? path : undefined;
}

/**
 * Orders two texts by code unit, which gives the same order on every machine and locale.
 */
function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

/**
 * Tells whether a path is an existing file.
 */
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Removes block comments and comment-only lines so their text is not read as code.
 */
function stripComments(source: string): string {
  return source.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '');
}

/**
 * The names an import clause takes from its module, as the module exports them: `default` for a
 * default import, `*` for a namespace import.
 */
function importedSymbols(clause: string): string[] {
  const braces = /\{([^}]*)\}/u.exec(clause);
  const outside = braces === null ? clause : clause.replace(braces[0], '');
  const symbols: string[] = [];
  if (/\*\s+as\s/u.test(outside)) {
    symbols.push('*');
  } else if (
    outside
      .replace(/^\s*type\s+/u, '')
      .replace(/,/gu, '')
      .trim() !== ''
  ) {
    symbols.push('default');
  }

  return [...symbols, ...(braces === null ? [] : braceNames(braces[1] ?? ''))];
}

/**
 * The names a re-export statement exports from its module, as that module exports them.
 */
function exportedSymbols(clause: string): string[] {
  return clause === '*' ? ['*'] : braceNames(clause.replace(/^\{|\}$/gu, ''));
}

/**
 * Splits the inside of `{ a, type b as c }` into the names as the source module exports them.
 */
function braceNames(body: string): string[] {
  return body
    .split(',')
    .map((part) => part.trim().replace(/^type\s+/u, ''))
    .filter((part) => part !== '')
    .map((part) => part.split(/\s+as\s+/u)[0]?.trim() ?? part);
}
