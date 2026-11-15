import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import {
  FRAMEWORK_MANIFEST,
  frameworkDependencyRoots,
  frameworkModulesDir,
  isInstalledFramework,
  readFrameworkManifest,
  readFrameworkPackages,
  resolveFrameworkSpecifier,
} from '#node/framework-packages.ts';

/**
 * The scratch folder each test builds in, as the file system spells it.
 */
let root = '';

/**
 * Writes a file, creating its folders.
 *
 * @param file - The path relative to the scratch folder.
 * @param content - The file content.
 */
function write(file: string, content: string): void {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/**
 * Writes a framework package with an exports map.
 *
 * @param name - The folder name under `packages/`.
 * @param exports - The exports map.
 */
function writePackage(name: string, exports: Record<string, string>): void {
  write(`packages/${name}/package.json`, JSON.stringify({ name: `@deckster/${name}`, exports }));
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'framework-packages-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('framework packages', () => {
  it('maps a package and its subpaths to the files its exports name', () => {
    writePackage('engine', { '.': './src/index.ts', './config': './src/deck-config.ts' });
    writePackage('kit', { '.': './src/index.ts' });
    const packages = readFrameworkPackages(root);

    expect(resolveFrameworkSpecifier(packages, '@deckster/engine')).toBe(
      path.join(root, 'packages/engine/src/index.ts'),
    );
    expect(resolveFrameworkSpecifier(packages, '@deckster/engine/config')).toBe(
      path.join(root, 'packages/engine/src/deck-config.ts'),
    );
  });

  it('leaves other specifiers and unexported subpaths alone', () => {
    writePackage('engine', { '.': './src/index.ts' });
    const packages = readFrameworkPackages(root);

    expect(resolveFrameworkSpecifier(packages, 'react')).toBeUndefined();
    expect(resolveFrameworkSpecifier(packages, '@deckster/other')).toBeUndefined();
    expect(resolveFrameworkSpecifier(packages, '@deckster/engine/missing')).toBeUndefined();
  });

  it('skips a folder without a readable package.json', () => {
    writePackage('engine', { '.': './src/index.ts' });
    mkdirSync(path.join(root, 'packages/empty'));
    write('packages/broken/package.json', '{');

    expect([...readFrameworkPackages(root).keys()]).toEqual(['@deckster/engine']);
  });
});

describe('the framework manifest', () => {
  it('marks a folder as an installed copy', () => {
    expect(isInstalledFramework(root)).toBe(false);

    write(FRAMEWORK_MANIFEST, JSON.stringify({ version: '0.1.0', dependencies: ['effect'] }));

    expect(readFrameworkManifest(root)).toEqual({ version: '0.1.0', dependencies: ['effect'] });
    expect(isInstalledFramework(root)).toBe(true);
  });

  it('ignores a manifest of the wrong shape', () => {
    write(FRAMEWORK_MANIFEST, JSON.stringify({ version: 1 }));

    expect(isInstalledFramework(root)).toBe(false);
  });
});

describe('framework dependency roots', () => {
  it('finds nothing for a repository checkout', () => {
    expect(frameworkDependencyRoots(root)).toEqual([]);
  });

  it('follows symlinks and drops folders inside another', () => {
    const dependencies = ['effect', 'shiki', '@scope/inner', 'gone'];
    write(`app/${FRAMEWORK_MANIFEST}`, JSON.stringify({ version: '0.1.0', dependencies }));
    write('store/effect/package.json', '{}');
    write('store/shiki/package.json', '{}');
    write('store/shiki/node_modules/@scope/inner/package.json', '{}');
    mkdirSync(path.join(root, 'app/node_modules'), { recursive: true });
    symlinkSync(path.join(root, 'store/effect'), path.join(root, 'app/node_modules/effect'));
    symlinkSync(path.join(root, 'store/shiki'), path.join(root, 'app/node_modules/shiki'));
    symlinkSync(
      path.join(root, 'store/shiki/node_modules/@scope'),
      path.join(root, 'app/node_modules/@scope'),
    );

    expect(frameworkDependencyRoots(path.join(root, 'app'))).toEqual([
      path.join(root, 'store/effect'),
      path.join(root, 'store/shiki'),
    ]);
  });
});

describe('the framework modules folder', () => {
  it('is the node_modules folder that holds the dependencies, links kept', () => {
    write(
      `app/${FRAMEWORK_MANIFEST}`,
      JSON.stringify({ version: '0.1.0', dependencies: ['@a/b'] }),
    );
    write('store/b/package.json', '{}');
    mkdirSync(path.join(root, 'app/node_modules/@a'), { recursive: true });
    symlinkSync(path.join(root, 'store/b'), path.join(root, 'app/node_modules/@a/b'));

    expect(frameworkModulesDir(path.join(root, 'app'))).toBe(path.join(root, 'app/node_modules'));
  });

  it('is undefined for a repository checkout', () => {
    expect(frameworkModulesDir(root)).toBeUndefined();
  });
});
