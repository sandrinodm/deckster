import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { parse } from 'yaml';

import { isShipped } from '#release/stage-framework.ts';

/**
 * The repository root.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The folders of a package that ship, as `stageFramework` copies them.
 */
const SHIPPED_FOLDERS = ['src', 'assets', 'docker'];

/**
 * The source files whose imports the published package must be able to resolve.
 */
const SOURCE_FILE = /\.(?:[cm]?ts|tsx)$/;

/**
 * Matches the specifier of `import ... from 'x'`, `import 'x'`, `import('x')` and `export ... from
 * 'x'`, without the type-only forms, which are erased before Node runs the file.
 */
const IMPORT_SPECIFIER =
  /(?:^|[\s;])(?:(?:import|export)\s+(?!type\b)[^'"`;]*?\bfrom\s*|import\s*\(\s*|import\s+)(['"])([^'"\n]+)\1/gm;

/**
 * A package manifest, as far as these tests read it.
 */
type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

/**
 * Reads and parses a JSON file.
 *
 * @param file - The path relative to the repository.
 */
function readManifest(file: string): Manifest {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, file), 'utf8'));
}

/**
 * The workspace's dependency catalog.
 */
function readCatalog(): Record<string, string> {
  const workspace = parse(readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8'));
  return workspace.catalog;
}

/**
 * The manifests of every package the CLI ships, and of the default brand.
 */
function shippedManifests(): Manifest[] {
  const packages = readdirSync(path.join(REPO_ROOT, 'packages')).map((name) =>
    readManifest(`packages/${name}/package.json`),
  );
  return [...packages, readManifest('brands/default/package.json')];
}

/**
 * Every package name a manifest lists under `dependencies` and `optionalDependencies`.
 *
 * @param manifest - A package manifest.
 */
function runtimeDependencies(manifest: Manifest): string[] {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ];
}

/**
 * The package a bare import specifier names, or `undefined` for one that is not a package.
 *
 * @param specifier - An import specifier.
 */
function packageOf(specifier: string): string | undefined {
  const isOther = /^([./#]|node:|virtual:|~icons\/|data:)|\$\{/.test(specifier);
  if (isOther || builtinModules.includes(specifier.split('/')[0] ?? '')) {
    return undefined;
  }

  const [first, second] = specifier.split('/');
  return first?.startsWith('@') ? `${first}/${second}` : first;
}

/**
 * Lists the shipped source files of a folder, recursively.
 *
 * @param dir - The absolute folder.
 * @param relative - The path inside the shipped folder.
 */
function shippedSources(dir: string, relative = ''): string[] {
  return readdirSync(path.join(dir, relative), { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      return shippedSources(dir, next);
    }

    return isShipped(next) && SOURCE_FILE.test(entry.name) ? [path.join(dir, next)] : [];
  });
}

describe('the published manifest', () => {
  const cli = readManifest('packages/cli/package.json');
  const published = new Set(runtimeDependencies(cli));

  it('depends on everything the shipped packages depend on, and only that plus type packages', () => {
    const needed = new Set(
      shippedManifests()
        .flatMap(runtimeDependencies)
        .filter((name) => !name.startsWith('@deckster/')),
    );

    expect([...needed].filter((name) => !published.has(name))).toEqual([]);
    expect(
      [...published].filter((name) => !needed.has(name) && !name.startsWith('@types/')),
    ).toEqual([]);
  });

  it('takes every version from the catalog', () => {
    const catalog = readCatalog();
    const versions = { ...cli.dependencies, ...cli.optionalDependencies };

    expect(Object.entries(versions).filter(([, version]) => version !== 'catalog:')).toEqual([]);
    expect([...published].filter((name) => !(name in catalog))).toEqual([]);
  });

  it('lists no framework package and not the Vite+ toolchain as a dependency', () => {
    expect([...published].filter((name) => name.startsWith('@deckster/'))).toEqual([]);
    expect(published.has('vite-plus')).toBe(false);
  });

  it('declares every package the shipped source imports', () => {
    const missing = new Set<string>();
    for (const file of shippedSourceFiles()) {
      for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER)) {
        const name = packageOf(match[2] ?? '');
        if (name !== undefined && !name.startsWith('@deckster/') && !published.has(name)) {
          missing.add(`${name} (${path.relative(REPO_ROOT, file)})`);
        }
      }
    }

    expect([...missing]).toEqual([]);
  });
});

/**
 * Every source file the published package carries: the shipped folders of each package and the
 * default brand.
 */
function shippedSourceFiles(): string[] {
  const packages = readdirSync(path.join(REPO_ROOT, 'packages')).flatMap((name) =>
    SHIPPED_FOLDERS.map((folder) => path.join(REPO_ROOT, 'packages', name, folder)),
  );
  return [...packages, path.join(REPO_ROOT, 'brands/default')]
    .filter((dir) => existsSync(dir))
    .flatMap((dir) => shippedSources(dir));
}
