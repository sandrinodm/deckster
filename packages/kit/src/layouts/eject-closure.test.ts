import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vite-plus/test';

import {
  catalogLayoutNames,
  ejectClosures,
  findUnsafeCopies,
  KIT_SRC_DIR,
  moduleStateHits,
  SAFE_STATE_MODULES,
  SHARED_STATE_MODULES,
  transitiveImports,
  type LayoutClosure,
} from '#layouts/eject-closure.ts';

const scratchFolders: string[] = [];

/**
 * Writes a small stand-in for the kit's `src` folder and returns its path.
 *
 * @param files - Paths under `src` and their contents.
 */
function scratchSrc(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'eject-closure-'));
  scratchFolders.push(dir);
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), source);
  }

  return dir;
}

afterAll(() => {
  for (const dir of scratchFolders) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('the eject closure of the kit layouts', () => {
  const srcDir = KIT_SRC_DIR;
  const closures = ejectClosures(srcDir);

  it('covers every layout in the catalog', () => {
    expect(Object.keys(closures)).toEqual(catalogLayoutNames(srcDir));
    expect(Object.keys(closures)).toHaveLength(64);
  });

  it('reaches no unexported shared state from any layout', () => {
    expect(findUnsafeCopies(srcDir, closures)).toEqual({});
  });

  it('copies none of the modules that hold shared state', () => {
    const copied = new Set(Object.values(closures).flatMap((closure) => closure.copied));
    for (const module of SHARED_STATE_MODULES.keys()) {
      expect(copied.has(module), `${module} must stay behind a public export`).toBe(false);
    }
  });

  it('copies no file of another layout', () => {
    for (const [name, closure] of Object.entries(closures)) {
      const others = closure.copied.filter((file) => /^layouts\/[a-z0-9-]+-layout\./u.test(file));
      expect(others, `${name} imports another layout`).toEqual([]);
    }
  });

  it('reaches every public entry through some layout', () => {
    const targets = new Set(
      Object.values(closures).flatMap((closure) => closure.publicImports.map((i) => i.target)),
    );
    expect([...targets].sort()).toEqual([
      '@deckster/kit',
      '@deckster/kit/diagrams',
      '@deckster/kit/layout-fields',
      '@deckster/kit/layout-parts',
    ]);
  });

  it('lists the layout and its stylesheet among its own files and css', () => {
    const title = closures['title'];
    expect(title?.own).toEqual([
      'layouts/title-layout.tsx',
      'layouts/title-layout.contract.ts',
      'layouts/title-layout.css',
    ]);
    expect(title?.css).toContain('layouts/title-layout.css');
    expect(title?.css).toContain('layouts/display-align.css');
  });

  it('keeps every safe-listed module in use', () => {
    const copied = new Set(Object.values(closures).flatMap((closure) => closure.copied));
    for (const module of SAFE_STATE_MODULES.keys()) {
      expect(copied.has(module), `${module} is listed as safe but no closure copies it`).toBe(true);
    }
  });
});

describe('the closure walk', () => {
  const srcDir = scratchSrc({
    'catalog.ts': "import { a } from '#layouts/a-layout.contract.ts';\n",
    'layout-parts.ts': "export { Frame, type FrameProps } from '#foundation/frame.tsx';\n",
    'layouts/a-layout.contract.ts': "import { Kind } from '#layouts/a-helper.ts';\n",
    'layouts/a-layout.tsx': [
      "import { Frame, Other } from '#foundation/frame.tsx';",
      "import { Kind } from '#layouts/a-helper.ts';",
      "import '#layouts/a-layout.css';",
      '',
    ].join('\n'),
    'layouts/a-layout.css': "@import './shared.css';\n",
    'layouts/shared.css': '.x { color: red; }\n',
    'layouts/a-helper.ts': "import { Ctx } from '#foundation/ctx.ts';\nexport const Kind = Ctx;\n",
    'foundation/frame.tsx': 'export function Frame() {}\nexport function Other() {}\n',
    'foundation/ctx.ts': "export const Ctx = createContext('x');\n",
  });
  const closure: LayoutClosure | undefined = ejectClosures(srcDir)['a'];

  it('copies what is not public, splits a partly public import, and lists stylesheets', () => {
    expect(closure?.copied).toEqual([
      'foundation/ctx.ts',
      'foundation/frame.tsx',
      'layouts/a-helper.ts',
    ]);
    expect(closure?.css).toEqual(['layouts/a-layout.css', 'layouts/shared.css']);
    expect(closure?.publicImports).toEqual([
      {
        file: 'layouts/a-layout.tsx',
        module: 'foundation/frame.tsx',
        symbols: ['Frame'],
        target: '@deckster/kit/layout-parts',
      },
    ]);
  });

  it('flags a copied module that creates a context', () => {
    const unsafe = findUnsafeCopies(srcDir, ejectClosures(srcDir));
    expect(unsafe['a']?.map((copy) => copy.module)).toEqual(['foundation/ctx.ts']);
  });

  it('flags module-level state that kit code outside layouts imports, and only that', () => {
    const dir = scratchSrc({
      'catalog.ts': "import { b } from '#layouts/b-layout.contract.ts';\n",
      'layouts/b-layout.contract.ts': [
        "import { cache } from '#foundation/cache.ts';",
        "import { table } from '#foundation/table.ts';",
        '',
      ].join('\n'),
      'layouts/b-layout.tsx': '',
      'foundation/cache.ts': 'export let cache = 1;\n',
      'foundation/table.ts': "export const table = new Set(['a']);\n",
      'foundation/user.ts': "import { cache } from '#foundation/cache.ts';\n",
    });
    const unsafe = findUnsafeCopies(dir, ejectClosures(dir));
    expect(unsafe['b']?.map((copy) => copy.module)).toEqual(['foundation/cache.ts']);
  });

  it('finds context, let and collection state in module source', () => {
    expect(moduleStateHits('const C = createContext<number>(0);\n')).toEqual([
      'creates a React context',
    ]);
    expect(moduleStateHits('let count = 0;\n')).toEqual(['has a module-level `let`']);
    expect(moduleStateHits('const seen = new WeakMap<object, number>();\n')).toEqual([
      'has a module-level Map or Set',
    ]);
    expect(moduleStateHits('function f() {\n  let n = 0;\n  return new Map();\n}\n')).toEqual([]);
    expect(moduleStateHits('// let x = 1;\n/* createContext() */\n')).toEqual([]);
  });
});

describe('the Node-safe modules', () => {
  it('keeps the catalog free of React, stylesheets and the layout parts', () => {
    const { modules, packages } = transitiveImports(KIT_SRC_DIR, 'catalog.ts');
    expect(modules.filter((module) => !module.endsWith('.ts'))).toEqual([]);
    expect(modules).not.toContain('layout-parts.ts');
    expect(packages.filter((name) => name.startsWith('react'))).toEqual([]);
  });

  it('keeps layout-fields free of React, stylesheets and .tsx files', () => {
    const { modules, packages } = transitiveImports(KIT_SRC_DIR, 'layout-fields.ts');
    expect(modules.filter((module) => !module.endsWith('.ts'))).toEqual([]);
    expect(packages.filter((name) => name.startsWith('react'))).toEqual([]);
    expect(packages).toEqual(['@deckster/engine/command', '@deckster/engine/layout', 'effect']);
  });
});
