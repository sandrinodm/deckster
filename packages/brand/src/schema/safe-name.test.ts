import { Schema } from 'effect';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { isSafeName, MAX_NAME_LENGTH, SafeName } from '#schema/safe-name.ts';

/**
 * The repository root.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The folders whose subfolders are brands or decks named by users.
 */
const NAMED_FOLDERS = [
  'brands',
  'decks',
  'packages/cli/fixtures/decks',
  'packages/vite-plugin/e2e/fixtures/decks',
];

/**
 * The subfolder names of a folder, or none when it does not exist.
 *
 * @param dir - A folder relative to the repository root.
 */
function subfolders(dir: string): string[] {
  try {
    return readdirSync(path.join(WORKSPACE_ROOT, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * The slide and app names of every deck in a folder: the file names under `slides/` without their
 * extension, and the folders under `apps/`.
 *
 * @param dir - A folder of decks relative to the repository root.
 */
function deckEntryNames(dir: string): string[] {
  return subfolders(dir).flatMap((deck) => {
    const slides = path.join(WORKSPACE_ROOT, dir, deck, 'slides');
    let files: string[] = [];
    try {
      files = readdirSync(slides).filter((file) => /\.(?:mdx|tsx)$/.test(file));
    } catch {
      files = [];
    }

    return [
      ...files.map((file) => file.replace(/\.(?:mdx|tsx)$/, '')),
      ...subfolders(path.join(dir, deck, 'apps')),
    ];
  });
}

describe('isSafeName', () => {
  it('accepts every brand, deck, slide and app name in the repository', () => {
    const names = [
      ...NAMED_FOLDERS.flatMap(subfolders),
      ...NAMED_FOLDERS.slice(1).flatMap(deckEntryNames),
    ];
    expect(names).toEqual(expect.arrayContaining(['default', 'nocturne', 'hello', 'apps-demo']));
    expect(names.filter((name) => !isSafeName(name))).toEqual([]);
  });

  it('refuses paths, dots, separators, NUL, uppercase and overlong names', () => {
    for (const name of [
      '',
      '..',
      '.',
      '.hidden',
      '../x',
      '../decks/x/evilbrand',
      'a/b',
      'a\\b',
      '/etc',
      'C:',
      'a\0b',
      'Default',
      'a--b',
      '-a',
      'a-',
      'a b',
      'a.b',
      'a'.repeat(MAX_NAME_LENGTH + 1),
    ]) {
      expect(isSafeName(name), JSON.stringify(name)).toBe(false);
    }

    expect(isSafeName('a'.repeat(MAX_NAME_LENGTH))).toBe(true);
    expect(isSafeName('zz-eval-sales-2')).toBe(true);
  });
});

describe('SafeName', () => {
  it('decodes a safe name and names the rule for anything else', () => {
    const decode = Schema.decodeUnknownResult(SafeName('brand name', 'default'));
    expect(decode('nocturne')._tag).toBe('Success');
    expect(String(decode('../x'))).toContain(
      'Expected a brand name in kebab-case: lowercase letters and digits',
    );
    expect(String(decode('a'.repeat(MAX_NAME_LENGTH + 1)))).toContain(
      `at most ${MAX_NAME_LENGTH} characters`,
    );
  });
});
