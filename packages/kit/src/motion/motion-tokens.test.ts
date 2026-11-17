import { MOTION_DURATION_NAMES, MOTION_EASING_NAMES } from '@deckster/brand';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

/**
 * The source folders whose stylesheets and components read the brand's motion tokens.
 */
const SOURCE_FOLDERS = ['kit', 'engine', 'presenter', 'comments'].map((name) =>
  fileURLToPath(new URL(`../../../${name}/src`, import.meta.url)),
);

/**
 * Files that can read a custom property: stylesheets and the components that read one with
 * `getPropertyValue`.
 */
const SOURCE_FILE_PATTERN = /\.(?:css|tsx?)$/u;

/**
 * A motion token as a stylesheet or component writes it, such as `--brand-ease-emphasized`.
 */
const MOTION_TOKEN_PATTERN = /--brand-(ease|duration)-([a-z][a-z0-9-]*)/gu;

/**
 * Every file under a folder, recursively, that can read a custom property.
 *
 * @param folder - The folder.
 */
function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((path) => SOURCE_FILE_PATTERN.test(path))
    .map((path) => join(folder, path));
}

describe('the motion tokens the packages read', () => {
  it('are all ones every resolved brand declares, so no animation is dropped for a brand', () => {
    const guaranteed: Record<string, readonly string[]> = {
      ease: MOTION_EASING_NAMES,
      duration: MOTION_DURATION_NAMES,
    };
    const read = SOURCE_FOLDERS.flatMap(sourceFiles).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(MOTION_TOKEN_PATTERN)].map((match) => ({
        file,
        match,
      })),
    );
    const unknown = read
      .filter(({ match: [, kind = '', name = ''] }) => !(guaranteed[kind] ?? []).includes(name))
      .map(({ file, match: [token] }) => `${token} in ${file}`);
    expect(read.length).toBeGreaterThan(0);
    expect(unknown).toEqual([]);
  });
});
