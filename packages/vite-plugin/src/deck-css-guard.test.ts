import tailwindcss from '@tailwindcss/vite';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite-plus';
import { describe, expect, it } from 'vite-plus/test';

import { deckCssGuardPlugin } from '#deck-css-guard.ts';

/**
 * How long one build may take, in milliseconds.
 */
const BUILD_TIMEOUT_MS = 30_000;

/**
 * A scratch deck whose `slides/` folder holds the given files, with a plugin module that writes a
 * marker file when it runs.
 *
 * @param files - Paths relative to the deck and their contents.
 * @returns The deck folder and the marker path.
 */
function scratchDeck(files: Readonly<Record<string, string>>): {
  readonly dir: string;
  readonly marker: string;
} {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'css-guard-'));
  const marker = path.join(dir, 'MARKER');
  mkdirSync(path.join(dir, 'slides'), { recursive: true });
  const evil = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\nmodule.exports = function () {};\n`;
  writeFileSync(path.join(dir, 'slides/evil.cjs'), evil);
  writeFileSync(
    path.join(dir, 'slides/evil.config.cjs'),
    `${evil.replace('function () {}', '{}')}`,
  );
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, file), content);
  }

  return { dir, marker };
}

/**
 * Builds an entry of a scratch deck with Tailwind and the guard, as the deck's Vite config does,
 * and returns the error message, or undefined when the build passed.
 *
 * @param dir - The deck folder.
 * @param entry - The entry, relative to the deck.
 */
async function buildDeck(dir: string, entry: string): Promise<string | undefined> {
  try {
    await build({
      configFile: false,
      root: dir,
      logLevel: 'silent',
      plugins: [deckCssGuardPlugin(), tailwindcss()],
      build: {
        write: false,
        outDir: path.join(dir, 'dist'),
        rolldownOptions: { input: path.join(dir, entry) },
      },
    });
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('stylesheet code is refused at the build tool', () => {
  it(
    'bypass 6 (nested stylesheet): @plugin in a stylesheet reached through @import never runs',
    async () => {
      const { dir, marker } = scratchDeck({
        'slides/entry.js': "import './styles.css';\n",
        'slides/styles.css': '@import "./sub.css";\n',
        'slides/sub.css': '@plugin "./evil.cjs";\n',
      });
      const error = await buildDeck(dir, 'slides/entry.js');
      expect(error).toContain('may not load code');
      expect(error).toContain('evil.cjs');
      expect(existsSync(marker)).toBe(false);
    },
    BUILD_TIMEOUT_MS,
  );

  it.each([
    ['a direct @plugin', '@plugin "./evil.cjs";\n'],
    ['@config', '@config "./evil.config.cjs";\n'],
  ])(
    'refuses %s with a clear error and runs nothing',
    async (_name, css) => {
      const { dir, marker } = scratchDeck({
        'slides/entry.js': "import './styles.css';\n",
        'slides/styles.css': css,
      });
      expect(await buildDeck(dir, 'slides/entry.js')).toContain('may not load code');
      expect(existsSync(marker)).toBe(false);
    },
    BUILD_TIMEOUT_MS,
  );

  it.each([
    ['an escaped at-rule', '@\\70 lugin "./evil.cjs";\n'],
    ['an upper case at-rule', '@PLUGIN "./evil.cjs";\n'],
    ['a package name', '@plugin "./evil";\n'],
  ])(
    'runs nothing for %s',
    async (_name, css) => {
      const { dir, marker } = scratchDeck({
        'slides/entry.js': "import './styles.css';\n",
        'slides/styles.css': css,
      });
      await buildDeck(dir, 'slides/entry.js');
      expect(existsSync(marker)).toBe(false);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'refuses @plugin in a stylesheet a TSX slide imports',
    async () => {
      const { dir, marker } = scratchDeck({
        'slides/slide.tsx':
          "import './styles.css';\nexport default function Slide() { return null; }\n",
        'slides/styles.css': '@import "./sub.css";\n',
        'slides/sub.css': '@plugin "./evil.cjs";\n',
      });
      expect(await buildDeck(dir, 'slides/slide.tsx')).toContain('may not load code');
      expect(existsSync(marker)).toBe(false);
    },
    BUILD_TIMEOUT_MS,
  );
});
