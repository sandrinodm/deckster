import type { ViteDevServer } from 'vite-plus';

import { holdCode, resetCodeGate } from '@deckster/brand/node';
import kitCatalog from '@deckster/kit/catalog';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, mergeConfig, normalizePath } from 'vite-plus';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import {
  componentSource,
  contractRuns,
  contractSource,
  defaultReplacementSource,
  resetContractRuns,
  scratchRoot,
  writeFiles,
} from '#layouts/layout-workspace.fixture.ts';
import { DEFAULT_RUNTIME_PLUGINS, withLocalLayouts } from '#plugin.ts';
import {
  kitRuntimeModuleCode,
  localLayoutsModuleCode,
  VIRTUAL_KIT_RUNTIME_ID,
  VIRTUAL_LOCAL_LAYOUTS_ID,
  VIRTUAL_PLUGINS_ID,
} from '#virtual-modules.ts';
import { deckViteConfig } from '#vite-config.ts';

/**
 * How long starting the server may take, in milliseconds.
 */
const SERVER_TIMEOUT_MS = 60_000;

/**
 * How long the watcher may take to report a file change, in milliseconds.
 */
const WATCH_TIMEOUT_MS = 20_000;

/**
 * How often a watched condition is checked, in milliseconds.
 */
const POLL_INTERVAL_MS = 100;

/**
 * The kit's `src/` folder, where the generated kit runtime imports from.
 */
const KIT_SRC = path.dirname(fileURLToPath(import.meta.resolve('@deckster/kit/runtime')));

/**
 * An MDX slide on a layout.
 *
 * @param layout - The layout name.
 */
function slideSource(layout: string): string {
  return `---\nlayout: ${layout}\n---\n\nHello\n`;
}

describe('withLocalLayouts', () => {
  it('swaps in the generated kit runtime, with the code layouts right after it', () => {
    expect(withLocalLayouts(DEFAULT_RUNTIME_PLUGINS)).toEqual([
      '@deckster/brand/runtime',
      VIRTUAL_KIT_RUNTIME_ID,
      VIRTUAL_LOCAL_LAYOUTS_ID,
      '@deckster/presenter/runtime',
    ]);
  });

  it('puts them last when the kit runtime is not a plugin', () => {
    expect(withLocalLayouts(['/abs/runtime.ts'])).toEqual([
      '/abs/runtime.ts',
      VIRTUAL_LOCAL_LAYOUTS_ID,
    ]);
  });
});

describe('kitRuntimeModuleCode', () => {
  it('imports the plugin, each kit layout in file order, then the kit styles', () => {
    const code = kitRuntimeModuleCode('/kit/src', ['default', 'title', 'do-dont'], []);
    expect(code).toBe(
      [
        'import { kitPlugin } from "/kit/src/kit-plugin.ts";',
        'import { defaultLayout } from "/kit/src/layouts/default-layout.tsx";',
        'import { doDontLayout } from "/kit/src/layouts/do-dont-layout.tsx";',
        'import { titleLayout } from "/kit/src/layouts/title-layout.tsx";',
        'import "/kit/src/kit-styles.ts";',
        '',
        'export default kitPlugin([defaultLayout, titleLayout, doDontLayout]);',
        '',
      ].join('\n'),
    );
  });

  it('leaves out the replaced layouts, and ignores names the kit does not have', () => {
    const code = kitRuntimeModuleCode('/kit/src', ['default', 'title'], ['title', 'kpi-wall']);
    expect(code).not.toContain('title');
    expect(code).not.toContain('kpi-wall');
    expect(code).toContain('export default kitPlugin([defaultLayout]);');
  });
});

describe('localLayoutsModuleCode', () => {
  it('registers each layout with lazyLayout and a dynamic import of its component', () => {
    const code = localLayoutsModuleCode([
      { name: 'kpi-wall', componentFile: '/abs/path/layouts/kpi-wall/layout.tsx' },
      { name: 'funnel', componentFile: '/abs/deck/layouts/funnel/layout.tsx' },
    ]);
    expect(code).toBe(
      [
        "import { definePlugin, lazyLayout } from '@deckster/engine';",
        '',
        "export default definePlugin({ name: 'local-layouts', layouts: [",
        '  lazyLayout("kpi-wall", () => import("/abs/path/layouts/kpi-wall/layout.tsx")),',
        '  lazyLayout("funnel", () => import("/abs/deck/layouts/funnel/layout.tsx")),',
        '] });',
        '',
      ].join('\n'),
    );
  });

  it('is a plugin without layouts, and without lazyLayout, for a deck that has none', () => {
    const code = localLayoutsModuleCode([]);
    expect(code).not.toContain('lazyLayout');
    expect(code).toContain("definePlugin({ name: 'local-layouts', layouts: [\n] })");
  });
});

describe('a deck with code layouts, served', () => {
  let server: ViteDevServer;
  let root: string;

  /**
   * The absolute path of a file of the scratch deck.
   *
   * @param file - The path relative to the deck.
   */
  const deckFile = (file: string): string => path.join(root, 'decks', 'talk', ...file.split('/'));

  /**
   * Transforms a slide as the dev server does and gives the code, or the error's message.
   *
   * @param id - The slide id.
   */
  const transformSlide = async (id: string): Promise<string> => {
    const url = `/@fs${normalizePath(deckFile(`slides/${id}.mdx`))}`;
    try {
      const result = await server.environments.client.transformRequest(url);
      return result?.code ?? '';
    } catch (error) {
      return `ERROR ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  /**
   * The code of one of the deck plugin's virtual modules.
   *
   * @param id - The virtual module id.
   */
  const virtualModule = async (id: string): Promise<string> =>
    (await server.environments.client.transformRequest(id))?.code ?? '';

  /**
   * Waits until a slide's transform output satisfies a check, or gives the last output.
   *
   * @param id - The slide id.
   * @param check - What the output must satisfy.
   */
  const slideEventually = async (id: string, check: (code: string) => boolean): Promise<string> => {
    const deadline = Date.now() + WATCH_TIMEOUT_MS;
    let code = await transformSlide(id);
    while (!check(code) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      code = await transformSlide(id);
    }

    return code;
  };

  beforeAll(async () => {
    resetCodeGate();
    resetContractRuns();
    root = scratchRoot();
    writeFiles(root, {
      'decks/talk/deck.config.ts': [
        "import { defineDeck } from '@deckster/engine/config';",
        '',
        "export default defineDeck({ title: 'Talk', slides: ['plain', 'on-funnel', 'on-broken', 'on-skipped', 'on-other', 'on-late'] });",
        '',
      ].join('\n'),
      'decks/talk/slides/plain.mdx': slideSource('default'),
      'decks/talk/slides/on-funnel.mdx': slideSource('funnel'),
      'decks/talk/slides/on-broken.mdx': slideSource('broken'),
      'decks/talk/slides/on-skipped.mdx': slideSource('skipped-wall'),
      'decks/talk/slides/on-other.mdx': slideSource('other-wall'),
      'decks/talk/slides/on-late.mdx': slideSource('late-wall'),
      'decks/talk/layouts/funnel/contract.ts': contractSource('funnel'),
      'decks/talk/layouts/funnel/layout.tsx': componentSource('funnel'),
      'decks/talk/layouts/broken/contract.ts': "throw new Error('boom');\n",
      'decks/talk/layouts/broken/layout.tsx': componentSource('broken'),
      'brands/other/layouts/other-wall/contract.ts': "throw new Error('never imported');\n",
      'brands/other/layouts/other-wall/layout.tsx': componentSource('other-wall'),
    });
    const config = deckViteConfig({ workspaceRoot: root, deck: 'talk' });
    server = await createServer(
      mergeConfig(config, {
        logLevel: 'silent',
        appType: 'custom',
        server: { middlewareMode: true, hmr: false, ws: false },
      }),
    );
  }, SERVER_TIMEOUT_MS);

  afterAll(async () => {
    await server.close();
    resetCodeGate();
    rmSync(root, { recursive: true, force: true });
  });

  it('loads the contracts when the server starts, before any request', () => {
    expect(contractRuns()).toBe(1);
  });

  it('adds the layout components of the deck and its brand to the dependency scan', () => {
    expect(server.config.optimizeDeps.entries).toEqual(
      expect.arrayContaining([
        normalizePath(deckFile('layouts/*/layout.tsx')),
        normalizePath(path.join(root, 'brands/default/layouts/*/layout.tsx')),
      ]),
    );
  });

  it('loads the generated kit runtime, then the code layouts plugin, then the rest', async () => {
    const code = await virtualModule(VIRTUAL_PLUGINS_ID);
    const order = [VIRTUAL_KIT_RUNTIME_ID, VIRTUAL_LOCAL_LAYOUTS_ID, 'presenter/src/runtime']
      .map((part) => code.indexOf(part))
      .filter((at) => at !== -1);
    expect(order).toHaveLength(3);
    expect(order).toEqual(order.toSorted((left, right) => left - right));
    expect(code).not.toContain('kit/src/runtime.ts');
  });

  it('registers every kit layout when none is replaced', async () => {
    const code = await virtualModule(VIRTUAL_KIT_RUNTIME_ID);
    for (const contract of kitCatalog.layouts) {
      expect(code).toContain(`/layouts/${contract.name}-layout.tsx`);
    }
  });

  it('registers only the layouts whose contract loaded', async () => {
    const code = await virtualModule(VIRTUAL_LOCAL_LAYOUTS_ID);
    expect(code).toContain('lazyLayout("funnel"');
    expect(code).toContain(normalizePath(deckFile('layouts/funnel/layout.tsx')));
    expect(code).not.toContain('broken');
  });

  it('fails only the slide on a broken layout, with the layout’s problem', async () => {
    expect(await transformSlide('plain')).not.toContain('ERROR');
    expect(await transformSlide('on-funnel')).toContain('"layout": "funnel"');
    const broken = await transformSlide('on-broken');
    expect(broken).toContain(
      "ERROR The slide's layout cannot be used in decks/talk/slides/on-broken.mdx:",
    );
    expect(broken).toContain(
      'layout: decks/talk/layouts/broken/contract.ts: Loading it failed: boom',
    );
  });

  it('names the brand that has a code layout the deck’s brand lacks, without importing it', async () => {
    const other = await transformSlide('on-other');
    expect(other).toContain('There is no "other-wall" layout in the default brand.');
    expect(other).toContain('It is a code layout of the other brand');
    expect(other).toContain('copy brands/other/layouts/other-wall/ into brands/default/layouts/');
  });

  it('reports an unknown layout as before', async () => {
    expect(await transformSlide('on-skipped')).toContain(
      'layout: There is no "skipped-wall" layout.',
    );
  });

  it(
    'picks up an edited contract, but never while an agent turn holds the deck',
    async () => {
      const contract = 'decks/talk/layouts/funnel/contract.ts';
      /**
       * A contract for `funnel` that requires a `stage` field, with a description.
       *
       * @param description - The description.
       */
      const strict = (description: string): string =>
        contractSource('funnel', { description })
          .replace(
            "gap: Schema.optionalKey(Schema.Literals(['tight', 'loose']))",
            'stage: Schema.String',
          )
          .replace('frontmatter: {}', "frontmatter: { stage: 'a' }");
      const runsBefore = contractRuns();
      const hold = holdCode([path.join(root, 'decks', 'talk')]);
      writeFiles(root, {
        [contract]: strict('During the turn.'),
        'decks/talk/layouts/late-wall/contract.ts': contractSource('late-wall'),
        'decks/talk/layouts/late-wall/layout.tsx': componentSource('late-wall'),
      });
      // The edits reload the catalog during the turn: the new layout shows as held, which proves
      // the reload happened, and the edited contract answers with its value from before the turn.
      const late = await slideEventually('on-late', (code) => code.includes('agent turn'));
      expect(late).toContain(
        'An agent turn is in flight and decks/talk/layouts/late-wall/contract.ts was not loaded',
      );
      expect(await transformSlide('on-funnel')).toContain('"layout": "funnel"');
      expect(contractRuns()).toBe(runsBefore);
      hold.release();
      const after = await slideEventually('on-funnel', (code) => code.includes('ERROR'));
      expect(after).toContain('stage is required');
      expect(await transformSlide('on-late')).toContain('"layout": "late-wall"');
      expect(contractRuns()).toBeGreaterThan(runsBefore);
    },
    WATCH_TIMEOUT_MS * 2,
  );
});

describe('a deck whose code layout replaces a kit layout, served', () => {
  let server: ViteDevServer;
  let root: string;

  /**
   * The code of one of the deck plugin's virtual modules.
   *
   * @param id - The virtual module id.
   */
  const virtualModule = async (id: string): Promise<string> =>
    (await server.environments.client.transformRequest(id))?.code ?? '';

  beforeAll(async () => {
    resetCodeGate();
    root = scratchRoot();
    writeFiles(root, {
      'decks/talk/deck.config.ts': [
        "import { defineDeck } from '@deckster/engine/config';",
        '',
        "export default defineDeck({ title: 'Talk', slides: ['plain'] });",
        '',
      ].join('\n'),
      'decks/talk/slides/plain.mdx': slideSource('default'),
      'decks/talk/layouts/default/contract.ts': defaultReplacementSource(),
      'decks/talk/layouts/default/layout.tsx': componentSource('default'),
    });
    server = await createServer(
      mergeConfig(deckViteConfig({ workspaceRoot: root, deck: 'talk' }), {
        logLevel: 'silent',
        appType: 'custom',
        server: { middlewareMode: true, hmr: false, ws: false },
      }),
    );
  }, SERVER_TIMEOUT_MS);

  afterAll(async () => {
    await server.close();
    resetCodeGate();
    rmSync(root, { recursive: true, force: true });
  });

  it('leaves the replaced layout out of the generated kit runtime', async () => {
    const code = await virtualModule(VIRTUAL_KIT_RUNTIME_ID);
    expect(code).not.toContain('/layouts/default-layout.tsx');
    expect(code).not.toContain('defaultLayout');
    expect(code).toContain('/layouts/title-layout.tsx');
    expect(code).toContain('kit-plugin.ts');
    expect(code).toContain('kit-styles.ts');
  });

  it('registers the replacement among the code layouts', async () => {
    expect(await virtualModule(VIRTUAL_LOCAL_LAYOUTS_ID)).toContain('lazyLayout("default"');
  });

  it('keeps the kit’s sources in the brand stylesheet’s Tailwind scan', async () => {
    const { pluginContainer } = server.environments.client;
    const resolved = await pluginContainer.resolveId('virtual:deck/brand.css');
    const loaded = await pluginContainer.load(resolved?.id ?? '');
    const source = typeof loaded === 'string' ? loaded : (loaded?.code ?? '');
    expect(source).toContain(`@source "${normalizePath(KIT_SRC)}"`);
  });
});
