import {
  readFrameworkPackages,
  resolveFrameworkSpecifier,
} from '@deckster/brand/node/framework-packages';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The published copy of the framework, next to this file in `dist/`.
 */
const FRAMEWORK_ROOT = path.join(import.meta.dirname, 'framework');

/**
 * The URL prefix of every file inside the framework.
 */
const FRAMEWORK_URL = `${pathToFileURL(FRAMEWORK_ROOT).href}/`;

/**
 * A file inside the framework that stands in as the importer when a user's file imports a package
 * the user's folder does not have.
 */
const FRAMEWORK_ANCHOR_URL = `${FRAMEWORK_URL}packages/cli/src/bin.ts`;

/**
 * The TypeScript files Node refuses to load from `node_modules`.
 */
const TYPESCRIPT_FILE = /\.m?ts$/;

/**
 * The query or fragment of a module URL, which the brand loader adds to reload a changed file.
 */
const QUERY = /[?#].*$/;

/**
 * The error code Node gives a bare import that no `node_modules` on the way holds.
 */
const NOT_FOUND = 'ERR_MODULE_NOT_FOUND';

/**
 * The warning Node prints once for the first TypeScript file stripped by hand.
 */
const STRIP_WARNING = /stripTypeScriptTypes/;

/**
 * Registers the hooks that let the published CLI run the framework from source. Importing this file
 * is enough: it is the first import of `deckster`, of the Electron shell and, through `node
 * --import`, of every child process that runs framework code.
 *
 * It may only import `node:` modules and the dependency-free framework helpers, because it runs
 * before anything of the framework can be resolved. Four things happen:
 *
 * - `@deckster/*` imports, from the framework or from a user's deck and brand, resolve to the
 *   framework's files, so the CLI and the user's files share one copy of every module;
 * - A bare import from a user's file that the user's folder cannot resolve (`react`, `effect`)
 *   retries from the framework, whose dependencies the package manager installed;
 * - TypeScript inside the framework, which Node will not load from `node_modules`, is stripped of its
 *   types by hand. The framework uses only erasable syntax, so stripping is enough;
 * - A user's own TypeScript is loaded as an ES module whatever the nearest `package.json` says.
 */
function registerFrameworkHooks(): void {
  const packages = readFrameworkPackages(FRAMEWORK_ROOT);
  hideStripWarning();
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const mapped = resolveFrameworkSpecifier(packages, specifier);
      if (mapped !== undefined) {
        return { url: pathToFileURL(mapped).href, shortCircuit: true };
      }

      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (!isUnresolvedPackage(specifier, error)) {
          throw error;
        }

        return nextResolve(specifier, { ...context, parentURL: FRAMEWORK_ANCHOR_URL });
      }
    },
    load(url, context, nextLoad) {
      const isTypeScript = TYPESCRIPT_FILE.test(url.replace(QUERY, ''));
      if (!url.startsWith(FRAMEWORK_URL)) {
        // A deck and a brand are always ES modules, even in a folder whose package.json (from `npm
        // init`) says nothing about `type`, where Node would read them as CommonJS.
        return nextLoad(url, isTypeScript ? { ...context, format: 'module-typescript' } : context);
      }

      if (!isTypeScript) {
        return nextLoad(url, context);
      }

      return {
        format: 'module',
        shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8')),
      };
    },
  });
}

/**
 * Whether an error says a package import could not be found.
 *
 * @param specifier - The import specifier that failed.
 * @param error - What the resolver threw.
 */
function isUnresolvedPackage(specifier: string, error: unknown): boolean {
  const isPackage = !/^([./#]|node:|data:|file:)/.test(specifier);
  return isPackage && error instanceof Error && 'code' in error && error.code === NOT_FOUND;
}

/**
 * Drops Node's one-time "experimental" warning for stripping types by hand, which would print on
 * every command. Other warnings pass through.
 */
function hideStripWarning(): void {
  const emit = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === 'string' ? warning : warning.message;
    if (STRIP_WARNING.test(text)) {
      return;
    }

    (emit as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
}

registerFrameworkHooks();
