import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { appFiles } from '#scaffold/app-templates.ts';
import { withAppDependencies, withAppsIncluded } from '#scaffold/new-app.ts';
import { deckFiles } from '#scaffold/templates.ts';
import { WORKSPACE_ROOT } from '#workspace.ts';

/**
 * Formatting each file in a fresh process takes a moment.
 */
const FORMAT_TIMEOUT_MS = 60_000;

describe('withAppDependencies', () => {
  it('adds the bridge and react-dom, sorted', () => {
    const source = JSON.stringify({
      name: 'x',
      dependencies: { '@deckster/engine': 'workspace:*', react: 'catalog:' },
      devDependencies: { typescript: 'catalog:' },
    });
    const updated = JSON.parse(withAppDependencies(source) ?? '{}');
    expect(Object.keys(updated.dependencies)).toEqual([
      '@deckster/app-bridge',
      '@deckster/engine',
      'react',
      'react-dom',
    ]);
    expect(updated.dependencies['react-dom']).toBe('catalog:');
    expect(updated.devDependencies['@types/react-dom']).toBe('catalog:');
  });

  it('changes nothing when the deck has them', () => {
    const source = JSON.stringify({
      dependencies: { '@deckster/app-bridge': 'workspace:*', 'react-dom': 'catalog:' },
      devDependencies: { '@types/react-dom': 'catalog:' },
    });
    expect(withAppDependencies(source)).toBeUndefined();
    expect(withAppDependencies('not json')).toBeUndefined();
  });
});

describe('withAppsIncluded', () => {
  it('appends apps to a one-line include and keeps the rest of the file', () => {
    const source = '{\n  "include": ["deck.config.ts", "slides"]\n}\n';
    expect(withAppsIncluded(source)).toBe(
      '{\n  "include": ["deck.config.ts", "slides", "apps"]\n}\n',
    );
  });

  it('appends apps to a list on several lines, one entry per line when it does not fit', () => {
    const long = '../../packages/brand/src/runtime/virtual-modules.d.ts';
    const source = `{\n  "include": [\n    "deck.config.ts",\n    "slides",\n    "${long}"\n  ]\n}\n`;
    expect(withAppsIncluded(source)).toBe(
      `{\n  "include": [\n    "deck.config.ts",\n    "slides",\n    "${long}",\n    "apps"\n  ]\n}\n`,
    );
  });

  it('leaves a file that already includes apps or has no include', () => {
    expect(withAppsIncluded('{ "include": ["apps"] }')).toBeUndefined();
    expect(withAppsIncluded('{}')).toBeUndefined();
  });
});

describe('a scaffolded app', () => {
  /**
   * What the workspace formatter makes of a file, read from standard input.
   *
   * @param file - The path the file would have, which picks the parser.
   * @param text - The file's text.
   */
  function formatted(file: string, text: string): string {
    const result = spawnSync(
      path.join(WORKSPACE_ROOT, 'node_modules', '.bin', 'vp'),
      ['fmt', `--stdin-filepath=${file}`],
      { cwd: WORKSPACE_ROOT, input: text, encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(`vp fmt failed on ${file}: ${result.stderr}`);
    }

    return result.stdout;
  }

  it(
    'comes out exactly as the formatter prints it, its deck edits included',
    () => {
      const deck = deckFiles({
        id: 'zz-format',
        title: 'Format',
        brand: 'default',
        cover: { frontmatter: {}, body: '' },
      });
      const files: Record<string, string> = {
        ...Object.fromEntries(
          Object.entries(appFiles('demo-app')).map(([name, text]) => [
            `apps/demo-app/${name}`,
            text,
          ]),
        ),
        'tsconfig.json': withAppsIncluded(deck['tsconfig.json'] ?? '') ?? '',
        'package.json': withAppDependencies(deck['package.json'] ?? '') ?? '',
      };
      for (const [name, text] of Object.entries(files)) {
        expect(text, name).not.toBe('');
        expect(formatted(`decks/zz-format/${name}`, text), name).toBe(text);
      }
    },
    FORMAT_TIMEOUT_MS,
  );
});
