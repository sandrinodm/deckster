import type { Plugin } from 'vite';

import {
  FRAMEWORK_ANCHOR,
  FRAMEWORK_INSTALLED,
  FRAMEWORK_PACKAGES,
  FRAMEWORK_ROOT,
  frameworkEntryPoints,
} from '@deckster/brand/node';
import path from 'node:path';

/**
 * The framework entry points that load the page's runtime, which a published copy adds to the
 * dependency scan. Vite does not discover imports of files that live inside `node_modules`, so
 * without these a dependency found late reloads the page mid-session and leaves two copies of
 * React. The kit's runtime plugin is always scanned: the deck loads the kit through a virtual
 * module, which the scan does not follow.
 */
const FRAMEWORK_SCAN_SPECIFIERS = [
  '@deckster/engine',
  '@deckster/kit/runtime',
  '@deckster/presenter/runtime',
  '@deckster/comments/runtime',
  '@deckster/brand/runtime',
  '@deckster/app-bridge/client',
];

/**
 * React and all of its entry points must share the renderer's hook dispatcher.
 */
const REACT_SPECIFIER = /^(?:react|react-dom)(?:\/|$)/;

/**
 * The framework's `@deckster/*` entry points.
 */
function frameworkEntries(): { specifier: string; file: string }[] {
  return frameworkEntryPoints(FRAMEWORK_PACKAGES);
}

/**
 * Aliases that send every `@deckster/*` import to the framework's file, wherever the importing file
 * is. A user's deck has no `node_modules/@deckster/*` of its own, and a published copy keeps the
 * framework in a folder no package manager links by name.
 */
export function frameworkAliases(): { find: RegExp; replacement: string }[] {
  return frameworkEntries().map(({ specifier, file }) => ({
    find: new RegExp(`^${escapeRegExp(specifier)}$`),
    replacement: file,
  }));
}

/**
 * Every `@deckster/*` specifier, kept out of dependency pre-bundling: these are source files that
 * Vite must transform and share, never a bundled copy.
 */
export function frameworkSpecifiers(): string[] {
  return frameworkEntries().map(({ specifier }) => specifier);
}

/**
 * The files of `FRAMEWORK_SCAN_SPECIFIERS`, or nothing in the repository checkout, where the scan
 * already follows imports into the framework's source.
 */
export function frameworkScanEntries(): string[] {
  if (!FRAMEWORK_INSTALLED) {
    return [];
  }

  const entries = frameworkEntries();
  return FRAMEWORK_SCAN_SPECIFIERS.flatMap((specifier) => {
    const entry = entries.find((candidate) => candidate.specifier === specifier);
    return entry === undefined ? [] : [entry.file];
  });
}

/**
 * Resolves React and its renderer from the framework for every importer, so hooks use the same
 * dispatcher even when a workspace installs its own React. Other bare imports prefer the user's
 * dependencies and fall back to the framework when the user's folder has none.
 */
export function frameworkDependenciesPlugin(): Plugin {
  return {
    name: 'deck:framework-dependencies',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (REACT_SPECIFIER.test(source)) {
        return this.resolve(source, FRAMEWORK_ANCHOR, { ...options, skipSelf: true });
      }

      if (!isBareSpecifier(source) || importer === undefined || isFrameworkFile(importer)) {
        return null;
      }

      const own = await this.resolve(source, importer, { ...options, skipSelf: true });
      return own ?? this.resolve(source, FRAMEWORK_ANCHOR, { ...options, skipSelf: true });
    },
  };
}

/**
 * Whether an import specifier names a package rather than a path or a virtual module.
 *
 * @param source - The import specifier.
 */
function isBareSpecifier(source: string): boolean {
  return !/^([./\\\0]|[a-z]:|virtual:|\/@)/i.test(source) && !source.startsWith('node:');
}

/**
 * Whether a module lies inside the framework folder.
 *
 * @param file - The importer's id.
 */
function isFrameworkFile(file: string): boolean {
  return (file.split('?')[0] ?? file).startsWith(`${FRAMEWORK_ROOT}${path.sep}`);
}

/**
 * Escapes the characters of a string that a regular expression treats specially.
 *
 * @param text - The literal text.
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The packages Vite must resolve to one copy. In the repository they resolve from the engine's app
 * root. In a published copy they are left to `frameworkDependenciesPlugin`, which resolves them
 * from the framework for every importer: `dedupe` would resolve them from the build's own root,
 * which may have no React or a different copy of it.
 */
export function frameworkDedupe(): string[] {
  return FRAMEWORK_INSTALLED ? [] : ['react', 'react-dom'];
}

/**
 * The plugins a build of the user's files needs to find the framework's dependencies: none in the
 * repository, where Node resolution reaches them, and the retry plugin in a published copy.
 */
export function frameworkPlugins(): Plugin[] {
  return FRAMEWORK_INSTALLED ? [frameworkDependenciesPlugin()] : [];
}
