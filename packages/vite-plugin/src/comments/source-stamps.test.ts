import type { ComponentType, ReactNode } from 'react';
import type { ViteDevServer } from 'vite-plus';

import path from 'node:path';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, mergeConfig } from 'vite-plus';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { DEFAULT_LAYOUT_CATALOGS } from '#layouts/load-layout-catalog.ts';
import { DEFAULT_RUNTIME_PLUGINS } from '#plugin.ts';
import { deckViteConfig } from '#vite-config.ts';

const SERVER_TIMEOUT_MS = 60_000;
const FIXTURES = path.resolve(import.meta.dirname, '../../e2e/fixtures');
const SLIDES = path.join(FIXTURES, 'decks/comments/slides');
const STAMP_PATTERN = /data-deck-source="([^"]+)"/g;

/**
 * A slide module as the dev server's SSR loads it.
 */
type SlideModule = Record<string, unknown>;

/**
 * Stands in for the engine's slot components: renders the children, marking named slots.
 */
const stubComponents: Record<string, ComponentType<{ name?: string; children?: ReactNode }>> = {
  DeckSlots: ({ children }) => createElement(Fragment, null, children),
  DeckSlot: ({ name, children }) => createElement('div', { 'data-slot': name }, children),
  Step: ({ children }) => createElement(Fragment, null, children),
  Notes: () => null,
  Button: ({ children }) => createElement('a', null, children),
};

let server: ViteDevServer;

beforeAll(async () => {
  const layouts = path.join(FIXTURES, 'layouts');
  const config = deckViteConfig({
    workspaceRoot: FIXTURES,
    deck: 'comments',
    runtimePlugins: [...DEFAULT_RUNTIME_PLUGINS, path.join(layouts, 'runtime.ts')],
    layoutCatalogs: [...DEFAULT_LAYOUT_CATALOGS, path.join(layouts, 'catalog.ts')],
  });
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
});

/**
 * Loads a slide through the dev pipeline and renders one of its exports to HTML.
 *
 * @param file - The slide file, relative to `slides/`.
 * @param name - The export to render.
 */
async function renderSlide(file: string, name = 'default'): Promise<string> {
  const module = (await server.ssrLoadModule(path.join(SLIDES, file))) as SlideModule;
  const Component = module[name] as ComponentType<{ components: typeof stubComponents }>;
  return renderToStaticMarkup(createElement(Component, { components: stubComponents }));
}

/**
 * Every stamp in rendered HTML, in document order.
 *
 * @param html - Rendered markup.
 */
function stamps(html: string): string[] {
  return [...html.matchAll(STAMP_PATTERN)].map((match) => match[1] ?? '');
}

describe('source stamps in dev', () => {
  it(
    'stamps MDX elements with the line and column of their markdown, slots included',
    async () => {
      const html = await renderSlide('notes-mdx.mdx');
      expect(stamps(html)).toEqual(
        expect.arrayContaining([
          'slides/notes-mdx.mdx:7:1',
          'slides/notes-mdx.mdx:10:1',
          'slides/parts/callout.tsx:8:5',
          'slides/parts/callout.tsx:9:7',
        ]),
      );
      expect(html).toContain(
        '<h2 data-deck-source="slides/notes-mdx.mdx:7:1">Feedback in MDX</h2>',
      );
      expect(html).toMatch(
        /<div data-slot="left"[^>]*><ul data-deck-source="slides\/notes-mdx\.mdx:10:1">/,
      );
    },
    SERVER_TIMEOUT_MS,
  );

  it(
    'stamps TSX slides, their slot exports and the deck components they import',
    async () => {
      expect(stamps(await renderSlide('cards-tsx.tsx'))).toEqual(['slides/cards-tsx.tsx:39:10']);
      expect(stamps(await renderSlide('cards-tsx.tsx', 'Left'))).toEqual([
        'slides/cards-tsx.tsx:25:10',
      ]);
      expect(stamps(await renderSlide('cards-tsx.tsx', 'Right'))).toEqual([
        'slides/parts/card.tsx:23:5',
        'slides/parts/card.tsx:24:7',
        'slides/parts/card.tsx:25:7',
      ]);
    },
    SERVER_TIMEOUT_MS,
  );

  it(
    'gives a kit component the stamp of the place the slide uses it, as a prop',
    async () => {
      const module = (await server.ssrLoadModule(
        path.join(SLIDES, 'notes-mdx.mdx'),
      )) as SlideModule;
      const seen: unknown[] = [];
      const Button = (props: Record<string, unknown>) => {
        seen.push(props['data-deck-source']);
        return null;
      };
      const Content = module['default'] as ComponentType<{ components: Record<string, unknown> }>;
      renderToStaticMarkup(createElement(Content, { components: { ...stubComponents, Button } }));
      expect(seen).toEqual(['slides/notes-mdx.mdx:16:1']);
    },
    SERVER_TIMEOUT_MS,
  );

  it(
    'leaves files outside the deck folder alone',
    async () => {
      const file = path.join(FIXTURES, 'layouts/columns-layout.tsx');
      const layout = await server.transformRequest(`/@fs${file}`);
      expect(layout?.code).toContain(`_jsxFileName = ${JSON.stringify(file)}`);
      expect(layout?.code).not.toContain('stamp/jsx-dev-runtime.ts');
    },
    SERVER_TIMEOUT_MS,
  );
});
