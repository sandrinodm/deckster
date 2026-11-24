import { brandLocation, holdCode, resetCodeGate } from '@deckster/brand/node';
import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach } from 'vite-plus/test';

import { deckLocation } from '#decks/deck-paths.ts';
import {
  componentSource,
  contractRuns,
  contractSource,
  resetContractRuns,
  scratchRoot,
  writeFiles,
} from '#layouts/layout-workspace.fixture.ts';
import { localLayouts, type LocalLayouts } from '#layouts/local-layouts.ts';

/**
 * A deck config that declares a deckster version range.
 *
 * @param range - The range.
 */
function deckConfigSource(range: string): string {
  return [
    "import { defineDeck } from '@deckster/engine/config';",
    '',
    `export default defineDeck({ title: 'Talk', slides: ['one'], deckster: ${JSON.stringify(range)} });`,
    '',
  ].join('\n');
}

/**
 * The code and layout of each problem, for comparing.
 *
 * @param found - What `localLayouts` returned.
 */
function problemCodes(found: LocalLayouts): string[] {
  return found.problems.map((problem) => `${problem.code}:${problem.layout ?? '*'}`);
}

beforeEach(() => {
  resetCodeGate();
  resetContractRuns();
});

afterEach(() => {
  resetCodeGate();
});

layer(NodeFileSystem.layer)('localLayouts', (it) => {
  it.effect('finds the brand’s code layouts, then the deck’s, and loads their contracts', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/title-photo.svg': '<svg/>',
        'brands/acme/layouts/_shared/helper.ts': 'export const A = 1;\n',
        'brands/acme/layouts/.eject/eject.json': '{}',
        'brands/acme/layouts/Not_Safe/contract.ts': 'throw new Error("never");\n',
        'brands/acme/layouts/kpi-wall/contract.ts': contractSource('kpi-wall'),
        'brands/acme/layouts/kpi-wall/layout.tsx': componentSource('kpi-wall'),
        'brands/acme/layouts/kpi-wall/layout.css': '',
        'brands/acme/layouts/agenda/contract.ts': contractSource('agenda'),
        'brands/acme/layouts/agenda/layout.tsx': componentSource('agenda'),
        'decks/talk/layouts/funnel/contract.ts': contractSource('funnel'),
        'decks/talk/layouts/funnel/layout.tsx': componentSource('funnel'),
      });
      const found = yield* localLayouts({
        root,
        brand: brandLocation(root, 'acme'),
        deck: deckLocation(root, 'talk'),
        code: 'load',
      });
      expect(found.problems).toEqual([]);
      expect(found.layouts.map((layout) => `${layout.source}/${layout.name}`)).toEqual([
        'brand-code:acme/agenda',
        'brand-code:acme/kpi-wall',
        'deck:talk/funnel',
      ]);
      expect(found.layouts[0]).toEqual({
        name: 'agenda',
        source: 'brand-code:acme',
        contractFile: path.join(root, 'brands/acme/layouts/agenda/contract.ts'),
        componentFile: path.join(root, 'brands/acme/layouts/agenda/layout.tsx'),
      });
      expect(found.catalogs.map((entry) => `${entry.source} ${entry.ref.displayPath}`)).toEqual([
        'brand-code:acme brands/acme/layouts/agenda/contract.ts',
        'brand-code:acme brands/acme/layouts/kpi-wall/contract.ts',
        'deck:talk decks/talk/layouts/funnel/contract.ts',
      ]);
      expect(Reflect.get(Object(found.catalogs[0]?.exported), 'name')).toBe('agenda');
      expect(found.replaced).toEqual([]);
      expect(found.files.map((file) => path.relative(root, file))).toEqual([
        'brands/acme/layouts/_shared/helper.ts',
        'brands/acme/layouts/agenda/contract.ts',
        'brands/acme/layouts/agenda/layout.tsx',
        'brands/acme/layouts/kpi-wall/contract.ts',
        'brands/acme/layouts/kpi-wall/layout.css',
        'brands/acme/layouts/kpi-wall/layout.tsx',
        'decks/talk/layouts/funnel/contract.ts',
        'decks/talk/layouts/funnel/layout.tsx',
      ]);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('finds nothing in a brand or deck without a layouts folder', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      const found = yield* localLayouts({
        root,
        brand: brandLocation(root, 'acme'),
        deck: deckLocation(root, 'talk'),
        code: 'load',
      });
      expect(found).toEqual({ layouts: [], catalogs: [], replaced: [], files: [], problems: [] });
      expect(yield* localLayouts({ root, code: 'load' })).toEqual(found);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('lists the layouts and never runs their code when told to skip it', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'brands/acme/layouts/kpi-wall/contract.ts': contractSource('kpi-wall'),
        'brands/acme/layouts/kpi-wall/layout.tsx': componentSource('kpi-wall'),
        'brands/acme/layouts/half/contract.ts': contractSource('half'),
      });
      const found = yield* localLayouts({
        root,
        brand: brandLocation(root, 'acme'),
        code: 'skip',
      });
      expect(found.layouts.map((layout) => layout.name)).toEqual(['kpi-wall']);
      expect(found.catalogs).toEqual([]);
      expect(problemCodes(found)).toEqual(['layout-folder-incomplete:half']);
      expect(contractRuns()).toBe(0);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('reports each broken layout and still loads the others', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'decks/talk/layouts/empty/notes.md': '',
        'decks/talk/layouts/no-component/contract.ts': contractSource('no-component'),
        'decks/talk/layouts/no-contract/layout.tsx': componentSource('no-contract'),
        'decks/talk/layouts/other-name/contract.ts': contractSource('another'),
        'decks/talk/layouts/other-name/layout.tsx': componentSource('other-name'),
        'decks/talk/layouts/other-component/contract.ts': contractSource('other-component'),
        'decks/talk/layouts/other-component/layout.tsx': componentSource('something-else'),
        'decks/talk/layouts/bad-import/contract.ts': contractSource('bad-import', {
          imports: ["import './layout.tsx';"],
        }),
        'decks/talk/layouts/bad-import/layout.tsx': componentSource('bad-import'),
        'decks/talk/layouts/throws/contract.ts': "throw new Error('boom');\n",
        'decks/talk/layouts/throws/layout.tsx': componentSource('throws'),
        'decks/talk/layouts/invalid/contract.ts': contractSource('invalid', { description: '' }),
        'decks/talk/layouts/invalid/layout.tsx': componentSource('invalid'),
        'decks/talk/layouts/fine/contract.ts': contractSource('fine'),
        'decks/talk/layouts/fine/layout.tsx': componentSource('fine'),
      });
      const found = yield* localLayouts({ root, deck: deckLocation(root, 'talk'), code: 'load' });
      expect(problemCodes(found).toSorted()).toEqual([
        'layout-contract-imports:bad-import',
        'layout-contract-invalid:invalid',
        'layout-folder-incomplete:empty',
        'layout-folder-incomplete:no-component',
        'layout-folder-incomplete:no-contract',
        'layout-load-failed:throws',
        'layout-name-mismatch:other-component',
        'layout-name-mismatch:other-name',
      ]);
      expect(found.catalogs.map((entry) => entry.ref.displayPath)).toEqual([
        'decks/talk/layouts/fine/contract.ts',
      ]);
      const messages = Object.fromEntries(
        found.problems.map((problem) => [problem.layout, `${problem.message} ${problem.fix}`]),
      );
      expect(messages.empty).toContain(
        'decks/talk/layouts/empty/ has no contract.ts and no layout.tsx.',
      );
      expect(messages['no-component']).toContain(
        'decks/talk/layouts/no-component/ has no layout.tsx. Add layout.tsx with',
      );
      expect(messages['other-name']).toContain(
        'The contract in decks/talk/layouts/other-name/contract.ts is named "another", but its ' +
          'folder is "other-name".',
      );
      expect(messages['other-component']).toContain(
        'decks/talk/layouts/other-component/layout.tsx does not register a layout named ' +
          '"other-component"',
      );
      expect(messages.throws).toContain(
        'decks/talk/layouts/throws/contract.ts: Loading it failed: boom',
      );
      expect(messages.invalid).toContain('Layout "invalid"');
      expect(found.problems.every((problem) => path.isAbsolute(problem.file))).toBe(true);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect(
    'refuses to import a brand’s contracts when its brand.json asks for another version',
    () =>
      Effect.gen(function* () {
        const root = scratchRoot();
        writeFiles(root, {
          'brands/acme/brand.json': '{ "deckster": ">=99" }',
          'brands/acme/layouts/kpi-wall/contract.ts': contractSource('kpi-wall'),
          'brands/acme/layouts/kpi-wall/layout.tsx': componentSource('kpi-wall'),
          'decks/talk/layouts/funnel/contract.ts': contractSource('funnel'),
          'decks/talk/layouts/funnel/layout.tsx': componentSource('funnel'),
        });
        const options = {
          root,
          brand: brandLocation(root, 'acme'),
          deck: deckLocation(root, 'talk'),
          code: 'load',
        } as const;
        const found = yield* localLayouts(options);
        expect(problemCodes(found)).toEqual(['layout-version:*']);
        expect(found.problems[0]?.file).toBe(path.join(root, 'brands/acme/brand.json'));
        expect(found.problems[0]?.message).toMatch(
          /^The code layouts of the acme brand are written for deckster >=99 \(brands\/acme\/brand\.json\), and this is deckster \d+\.\d+\.\d+/,
        );
        expect(found.layouts.map((layout) => layout.name)).toEqual(['kpi-wall', 'funnel']);
        expect(found.catalogs.map((entry) => entry.source)).toEqual(['deck:talk']);
        expect(found.files).toContain(path.join(root, 'brands/acme/brand.json'));
        expect(contractRuns()).toBe(1);

        writeFiles(root, { 'brands/acme/brand.json': '{ "deckster": ">=0.1" }' });
        expect((yield* localLayouts(options)).problems).toEqual([]);
        writeFiles(root, { 'brands/acme/brand.json': '{ "deckster": "^0.9" }' });
        expect((yield* localLayouts(options)).problems[0]?.message).toBe(
          'The deckster range "^0.9" in brands/acme/brand.json cannot be read.',
        );
        writeFiles(root, { 'brands/acme/brand.json': 'not json' });
        expect((yield* localLayouts(options)).problems[0]?.message).toBe(
          'brands/acme/brand.json cannot be read as `{ "deckster": "<range>" }`.',
        );
        rmSync(root, { recursive: true, force: true });
      }),
  );

  it.effect('reads a deck’s version range from its config without running it', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'decks/talk/deck.config.ts': deckConfigSource('<0.1'),
        'decks/talk/layouts/funnel/contract.ts': contractSource('funnel'),
        'decks/talk/layouts/funnel/layout.tsx': componentSource('funnel'),
      });
      const found = yield* localLayouts({ root, deck: deckLocation(root, 'talk'), code: 'load' });
      expect(problemCodes(found)).toEqual(['layout-version:*']);
      expect(found.problems[0]?.file).toBe(path.join(root, 'decks/talk/deck.config.ts'));
      expect(found.catalogs).toEqual([]);
      expect(contractRuns()).toBe(0);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('reports a contract an agent turn holds that never loaded, and runs nothing', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        'decks/talk/layouts/funnel/contract.ts': contractSource('funnel'),
        'decks/talk/layouts/funnel/layout.tsx': componentSource('funnel'),
      });
      const hold = holdCode([path.join(root, 'decks', 'talk')]);
      const found = yield* localLayouts({ root, deck: deckLocation(root, 'talk'), code: 'load' });
      expect(problemCodes(found)).toEqual(['layout-held:funnel']);
      expect(found.catalogs).toEqual([]);
      expect(contractRuns()).toBe(0);
      hold.release();
      rmSync(root, { recursive: true, force: true });
    }),
  );
});
