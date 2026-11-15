import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * The file in an installed framework folder that marks it as a published copy and lists the
 * packages the CLI depends on. Only the release staging writes it.
 */
export const FRAMEWORK_MANIFEST = 'framework.json';

/**
 * What the release staging records about an installed framework folder.
 */
export type FrameworkManifest = {
  /**
   * The published version of `@deckster/cli`.
   */
  version: string;

  /**
   * The names of the npm packages the framework needs at run time, which the package manager
   * installs beside the framework folder.
   */
  dependencies: readonly string[];
};

/**
 * One `@deckster/*` package of the framework.
 */
export type FrameworkPackage = {
  /**
   * The package name, such as `@deckster/engine`.
   */
  name: string;

  /**
   * The absolute package folder.
   */
  dir: string;

  /**
   * The package's `exports` map, from subpath (`.`, `./config`) to a file relative to `dir`.
   */
  exports: Readonly<Record<string, string>>;
};

/**
 * The framework's packages by name.
 */
export type FrameworkPackages = ReadonlyMap<string, FrameworkPackage>;

/**
 * Matches `@deckster/<package>` with an optional subpath, such as `@deckster/engine/config`.
 */
const FRAMEWORK_SPECIFIER = /^(@deckster\/[^/]+)(\/.+)?$/;

/**
 * Reads the manifest of an installed framework folder.
 *
 * This file may only import `node:` modules: the bootstrap hooks bundle it before any dependency is
 * resolvable, and the hooks run before the framework's own resolution exists.
 *
 * @param root - The absolute framework folder.
 * @returns The manifest, or `undefined` when the folder is the repository checkout, which has none.
 */
export function readFrameworkManifest(root: string): FrameworkManifest | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(path.join(root, FRAMEWORK_MANIFEST), 'utf8'));
    return isManifest(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a framework folder is a published copy. The check is the manifest, because a package
 * manager may keep the copy anywhere, such as pnpm's global virtual store, so no path segment is a
 * reliable signal.
 *
 * @param root - The absolute framework folder.
 */
export function isInstalledFramework(root: string): boolean {
  return readFrameworkManifest(root) !== undefined;
}

/**
 * Reads every package under `<root>/packages`.
 *
 * @param root - The absolute framework folder.
 * @returns The packages by name; a folder without a readable `package.json` is skipped.
 */
export function readFrameworkPackages(root: string): FrameworkPackages {
  const packages = new Map<string, FrameworkPackage>();
  const folder = path.join(root, 'packages');
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const found = readPackage(path.join(folder, entry.name));
    if (found !== undefined) {
      packages.set(found.name, found);
    }
  }

  return packages;
}

/**
 * Maps a `@deckster/*` import to the file of the framework package that exports it.
 *
 * @param packages - The framework's packages.
 * @param specifier - The import specifier.
 * @returns The absolute file, or `undefined` when the specifier is not a framework export.
 */
export function resolveFrameworkSpecifier(
  packages: FrameworkPackages,
  specifier: string,
): string | undefined {
  const match = FRAMEWORK_SPECIFIER.exec(specifier);
  const name = match?.[1];
  const found = name === undefined ? undefined : packages.get(name);
  if (found === undefined) {
    return undefined;
  }

  const target = found.exports[match?.[2] === undefined ? '.' : `.${match[2]}`];
  return target === undefined ? undefined : path.resolve(found.dir, target);
}

/**
 * Every import specifier the framework's packages export, with the file that provides it.
 *
 * @param packages - The framework's packages.
 * @returns One entry per exported subpath, such as `@deckster/engine/config`.
 */
export function frameworkEntryPoints(
  packages: FrameworkPackages,
): { specifier: string; file: string }[] {
  return [...packages.values()].flatMap((framework) =>
    Object.entries(framework.exports).map(([subpath, target]) => ({
      specifier: subpath === '.' ? framework.name : `${framework.name}${subpath.slice(1)}`,
      file: path.resolve(framework.dir, target),
    })),
  );
}

/**
 * The folders of the framework's npm dependencies, as the file system sees them. A Vite dev server
 * must be told to serve these (fonts, icon sets, scripts) when the framework is installed, and a
 * package manager decides where they live: beside the framework under npm, in a store of shared
 * packages under pnpm. Each is found the way Node finds a package, by walking up from the framework
 * folder, then followed through symlinks.
 *
 * @param root - The absolute framework folder.
 * @returns Nothing for a repository checkout; for an installed copy, the real folder of each
 *   dependency, without the ones inside another.
 */
export function frameworkDependencyRoots(root: string): string[] {
  const manifest = readFrameworkManifest(root);
  if (manifest === undefined) {
    return [];
  }

  const folders = manifest.dependencies.flatMap((name) => {
    const folder = findPackageFolder(root, name);
    return folder === undefined ? [] : [folder];
  });
  return outermostFolders(folders);
}

/**
 * The `node_modules` folder that holds the framework's dependencies, as the package manager laid it
 * out (symlinks not followed): beside the framework under npm, a folder of links next to the
 * framework's own package under pnpm. A tool that must resolve the framework's dependencies for a
 * file outside the framework, such as an editor's TypeScript, points at this folder.
 *
 * @param root - The absolute framework folder.
 * @returns The folder, or `undefined` for a repository checkout or when no dependency is found.
 */
export function frameworkModulesDir(root: string): string | undefined {
  for (const name of readFrameworkManifest(root)?.dependencies ?? []) {
    const candidate = findPackageDirectory(root, name);
    if (candidate !== undefined) {
      return name.startsWith('@') ? path.dirname(path.dirname(candidate)) : path.dirname(candidate);
    }
  }

  return undefined;
}

/**
 * Reads one package's name and exports map.
 *
 * @param dir - The absolute package folder.
 */
function readPackage(dir: string): FrameworkPackage | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (typeof raw !== 'object' || raw === null || !('name' in raw) || !('exports' in raw)) {
      return undefined;
    }

    const { name, exports } = raw;
    if (typeof name !== 'string' || !isStringMap(exports)) {
      return undefined;
    }

    return { name, dir, exports };
  } catch {
    return undefined;
  }
}

/**
 * Finds a package folder by walking up from a folder through `node_modules`, like Node does.
 *
 * @param from - The folder to start in.
 * @param name - The package name.
 * @returns The real folder, or `undefined` when no `node_modules` on the way holds the package.
 */
function findPackageFolder(from: string, name: string): string | undefined {
  const found = findPackageDirectory(from, name);
  return found === undefined ? undefined : realpathSync(found);
}

/**
 * Finds a package folder like {@link findPackageFolder}, without following symlinks.
 *
 * @param from - The folder to start in.
 * @param name - The package name.
 */
function findPackageDirectory(from: string, name: string): string | undefined {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }

    if (path.dirname(dir) === dir) {
      return undefined;
    }
  }
}

/**
 * Drops every folder that lies inside another one of the list.
 *
 * @param folders - Absolute folders.
 */
function outermostFolders(folders: readonly string[]): string[] {
  const sorted = [...new Set(folders)].sort();
  return sorted.filter(
    (folder) =>
      !sorted.some((other) => other !== folder && folder.startsWith(`${other}${path.sep}`)),
  );
}

/**
 * Whether a parsed value is a framework manifest.
 *
 * @param value - The parsed JSON.
 */
function isManifest(value: unknown): value is FrameworkManifest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string' &&
    'dependencies' in value &&
    Array.isArray(value.dependencies) &&
    value.dependencies.every((name) => typeof name === 'string')
  );
}

/**
 * Whether a value is an object whose values are all strings.
 *
 * @param value - The parsed JSON.
 */
function isStringMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}
