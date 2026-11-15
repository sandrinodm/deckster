import { FRAMEWORK_ANCHOR } from '@deckster/brand/node';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { build, createServer } from 'vite-plus';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { frameworkDependenciesPlugin } from '#framework-resolve.ts';

/**
 * Enough time for a production bundle on a busy worker.
 */
const BUILD_TIMEOUT_MS = 30_000;

/**
 * Package resolution from the same anchor the installed framework uses.
 */
const frameworkRequire = createRequire(FRAMEWORK_ANCHOR);

/**
 * Scratch workspaces removed after each test.
 */
const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe('frameworkDependenciesPlugin', () => {
  it('shares React entry points between workspace and framework importers', async () => {
    const workspace = workspaceWithReact();
    const server = await createServer({
      configFile: false,
      root: workspace,
      logLevel: 'silent',
      plugins: [frameworkDependenciesPlugin()],
      optimizeDeps: { exclude: ['react', 'react-dom'] },
      server: { watch: null },
    });
    try {
      const specifiers = [
        'react',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom',
        'react-dom/client',
        'react-dom/server.browser',
      ];
      for (const specifier of specifiers) {
        const expected = await server.pluginContainer.resolveId(specifier, FRAMEWORK_ANCHOR);
        const actual = await server.pluginContainer.resolveId(
          specifier,
          path.join(workspace, 'slide.tsx'),
        );
        expect(actual?.id, specifier).toBe(expected?.id);
        expect(actual?.id, specifier).not.toContain(workspace);
      }
    } finally {
      await server.close();
    }
  });

  it.each(['deck', 'app'])(
    'renders hooks in a production %s bundle with separate workspace React and user dependencies',
    async (kind) => {
      const workspace = workspaceWithReact();
      const appRoot = path.join(workspace, 'decks/example/apps/demo');
      mkdirSync(appRoot, { recursive: true });

      const entry = path.join(appRoot, 'slide.js');
      const renderer = frameworkRequire.resolve('react-dom/server.browser');
      writeFileSync(
        entry,
        [
          `import { renderToStaticMarkup } from ${JSON.stringify(renderer)};`,
          "import { jsx } from 'react/jsx-runtime';",
          "import { useState } from 'react';",
          "import { marker } from 'effect';",
          'function Slide() {',
          '  const [value] = useState(marker);',
          "  return jsx('p', { children: value });",
          '}',
          'console.log(renderToStaticMarkup(jsx(Slide, {})));',
          // React's browser renderer keeps a MessageChannel open in Node.
          'process.exit(0);',
        ].join('\n'),
      );

      const outDir = path.join(workspace, 'dist');
      await build({
        configFile: false,
        root: kind === 'app' ? appRoot : path.dirname(FRAMEWORK_ANCHOR),
        logLevel: 'silent',
        plugins: [frameworkDependenciesPlugin()],
        build: {
          outDir,
          emptyOutDir: true,
          rolldownOptions: { input: entry, output: { entryFileNames: 'render.mjs' } },
        },
      });

      const rendered = spawnSync(process.execPath, [path.join(outDir, 'render.mjs')], {
        encoding: 'utf8',
        timeout: BUILD_TIMEOUT_MS,
      });
      expect(rendered.status, rendered.stderr).toBe(0);
      expect(rendered.stdout.trim()).toBe('<p>workspace dependency</p>');
    },
    BUILD_TIMEOUT_MS,
  );
});

/**
 * Copies React instead of symlinking it, so the workspace owns a genuinely separate instance. Its
 * Effect fixture verifies that packages other than React still resolve from the workspace.
 */
function workspaceWithReact(): string {
  const workspace = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'framework-react-')));
  workspaces.push(workspace);
  for (const name of ['react', 'react-dom']) {
    const source = path.dirname(frameworkRequire.resolve(`${name}/package.json`));
    cpSync(source, path.join(workspace, 'node_modules', name), { recursive: true });
  }

  const effect = path.join(workspace, 'node_modules/effect');
  mkdirSync(effect, { recursive: true });
  writeFileSync(
    path.join(effect, 'package.json'),
    JSON.stringify({ name: 'effect', type: 'module', exports: './index.js' }),
  );
  writeFileSync(path.join(effect, 'index.js'), "export const marker = 'workspace dependency';\n");
  return workspace;
}
