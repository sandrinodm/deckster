import { describe, expect, it } from '@effect/vitest';
import path from 'node:path';

import { isWorkspaceFolder } from '#layouts/eject/eject-owner.ts';

/**
 * A workspace root for the path checks; nothing is read from it.
 */
const ROOT = path.join(path.sep, 'work', 'talks');

/**
 * The brand the checks name.
 */
const BRAND = { kind: 'brand', name: 'default' } as const;

describe('isWorkspaceFolder', () => {
  it("accepts the workspace's own brand and deck folders", () => {
    const brandDir = path.join(ROOT, 'brands', 'default');
    const deckDir = path.join(ROOT, 'decks', 'q3');
    const deck = { kind: 'deck', name: 'q3' } as const;
    expect(
      isWorkspaceFolder({
        root: ROOT,
        realRoot: ROOT,
        owner: BRAND,
        dir: brandDir,
        realDir: brandDir,
      }),
    ).toBe(true);
    expect(
      isWorkspaceFolder({
        root: ROOT,
        realRoot: ROOT,
        owner: deck,
        dir: deckDir,
        realDir: deckDir,
      }),
    ).toBe(true);
  });

  it('refuses the built-in brand of a CLI installed in the workspace', () => {
    const builtIn = path.join(
      ROOT,
      'node_modules',
      '@deckster',
      'cli',
      'dist',
      'framework',
      'brands',
      'default',
    );
    expect(
      isWorkspaceFolder({
        root: ROOT,
        realRoot: ROOT,
        owner: BRAND,
        dir: builtIn,
        realDir: builtIn,
      }),
    ).toBe(false);
  });

  it('refuses a brand linked into node_modules or out of the workspace', () => {
    const dir = path.join(ROOT, 'brands', 'default');
    const installed = path.join(ROOT, 'node_modules', 'acme-brand');
    const outside = path.join(path.sep, 'elsewhere', 'brands', 'default');
    expect(
      isWorkspaceFolder({ root: ROOT, realRoot: ROOT, owner: BRAND, dir, realDir: installed }),
    ).toBe(false);
    expect(
      isWorkspaceFolder({ root: ROOT, realRoot: ROOT, owner: BRAND, dir, realDir: outside }),
    ).toBe(false);
  });
});
