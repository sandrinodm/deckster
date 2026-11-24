import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { strFromU8, unzipSync } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';

import type { LayoutInfo } from '#layouts/list-layouts.ts';
import type { LayoutSummary } from '#layouts/summarize-layouts.ts';

import { runCaptured } from '#cli.fixture.ts';
import { cliLayer } from '#cli.ts';
import { defaultExportOptions } from '#export/export-options.ts';
import { runExport } from '#export/run-export.ts';
import {
  CODE_BRAND,
  CODE_LAYOUTS_DECK,
  codeLayoutsWorkspace,
  contractRan,
  writeThrowingLayout,
  writeTitleReplacement,
} from '#layouts/code-layouts.fixture.ts';
import { lintDeck } from '#lint/run-lint.ts';
import { Workspace } from '#workspace.ts';

/**
 * Room for a dev server and Chromium to open the fixture deck.
 */
const BROWSER_TEST_TIMEOUT_MS = 240_000;

/**
 * Room for a command that loads the brand's and the deck's contracts, on a busy machine.
 */
const COMMAND_TEST_TIMEOUT_MS = 60_000;

/**
 * The global the throwing contracts of these tests set when they run.
 */
const MARKER = '__deckCodeLayoutsCommandRan';

/**
 * The slides of the fixture deck that render without an error.
 */
const WORKING_SLIDES = ['brand-layout', 'deck-layout', 'over-budget', 'kit-layout'];

/**
 * The `--json` output of `deckster layouts`.
 */
type LayoutsJson = { warnings: string[]; layouts: LayoutInfo[] };

/**
 * Runs a command in the workspace and parses what it prints as JSON.
 *
 * @param root - The workspace.
 * @param argv - The arguments after `deckster`, `--json` included.
 */
const runJson = Effect.fn('runJson')(function* <T>(root: string, argv: readonly string[]) {
  const run = yield* runCaptured(argv, { root });
  return JSON.parse(run.output) as T;
});

/**
 * The text of every part of a PPTX that is XML, by path.
 *
 * @param file - The PPTX.
 */
function pptxParts(file: string): Record<string, string> {
  const entries = Object.entries(unzipSync(fs.readFileSync(file)));
  return Object.fromEntries(
    entries
      .filter(([name]) => name.endsWith('.xml') || name.endsWith('.rels'))
      .map(([name, data]) => [name, strFromU8(data)]),
  );
}

describe('code layouts in the CLI', () => {
  it.effect(
    'deckster layouts lists the brand and deck code layouts with their sources',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const catalog = yield* runJson<LayoutsJson>(root, [
            'layouts',
            CODE_LAYOUTS_DECK,
            '--json',
          ]);
          expect(catalog.warnings).toEqual([]);
          const byName = new Map(catalog.layouts.map((layout) => [layout.name, layout]));
          expect(byName.get('kpi-wall')).toMatchObject({
            source: `brand-code:${CODE_BRAND}`,
            fallback: null,
            budget: { body: { maxBullets: 6 } },
            pptx: { type: 'content' },
          });
          expect(byName.get('funnel')?.source).toBe(`deck:${CODE_LAYOUTS_DECK}`);
          expect(byName.get('broken')?.source).toBe(`deck:${CODE_LAYOUTS_DECK}`);
          expect(byName.get('title')?.source).toBe('@deckster/kit');

          const summary = yield* runJson<{ layouts: LayoutSummary[] }>(root, [
            'layouts',
            CODE_LAYOUTS_DECK,
            '--summary',
            '--json',
          ]);
          expect(summary.layouts.slice(0, 3).map((layout) => layout.name)).toEqual([
            'broken',
            'funnel',
            'kpi-wall',
          ]);
          const text = yield* runCaptured(['layouts', CODE_LAYOUTS_DECK, '--summary'], { root });
          expect(text.output).toMatch(/^Layouts from the code-layouts deck \(prefer these\):\n/u);
          expect(text.output).toContain(`Layouts from the ${CODE_BRAND} brand (prefer these):`);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );

  it.effect(
    'a code layout whose contract throws is left out with a warning',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          writeThrowingLayout(
            path.join(root, 'decks', CODE_LAYOUTS_DECK, 'layouts'),
            'bad',
            MARKER,
          );
          const catalog = yield* runJson<LayoutsJson>(root, [
            'layouts',
            CODE_LAYOUTS_DECK,
            '--json',
          ]);
          expect(contractRan(MARKER)).toBe(true);
          expect(catalog.warnings).toEqual([
            expect.stringMatching(/^The code layout "bad" is left out \(layout-load-failed\): /u),
          ]);
          const names = catalog.layouts.map((layout) => layout.name);
          expect(names).toEqual(expect.arrayContaining(['kpi-wall', 'funnel', 'title']));
          expect(names).not.toContain('bad');

          const refused = yield* Effect.flip(
            runCaptured(['new', 'slide', CODE_LAYOUTS_DECK, 'extra', '--layout', 'bad'], { root }),
          );
          expect(refused.message).toContain('The layout "bad" cannot be used:');
          expect(refused.message).toContain('the bad contract does not load');
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );

  it.effect(
    "deckster new slide writes a brand or deck code layout's example",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const slides = path.join(root, 'decks', CODE_LAYOUTS_DECK, 'slides');
          for (const [id, layout] of [
            ['wall', 'kpi-wall'],
            ['stages', 'funnel'],
          ] as const) {
            const added = yield* runCaptured(
              ['new', 'slide', CODE_LAYOUTS_DECK, id, '--layout', layout],
              { root },
            );
            expect(added.code).toBe(0);
            expect(fs.readFileSync(path.join(slides, `${id}.mdx`), 'utf8')).toMatch(
              new RegExp(`^---\\nlayout: ${layout}\\n`, 'u'),
            );
          }

          const config = fs.readFileSync(
            path.join(root, 'decks', CODE_LAYOUTS_DECK, 'deck.config.ts'),
            'utf8',
          );
          expect(config).toContain("'wall', 'stages'");
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );

  it.effect(
    'deckster brand names the code layouts and brand check reports their problems',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const summary = yield* runCaptured(['brand', CODE_BRAND], { root });
          expect(summary.output).toContain('Code layouts: 1 (kpi-wall)');
          const none = yield* runCaptured(['brand', 'default'], { root });
          expect(none.output).toContain('Code layouts: none');
          const sound = yield* runCaptured(['brand', 'check', CODE_BRAND], { root });
          expect(sound.code, sound.output).toBe(0);

          writeThrowingLayout(path.join(root, 'brands', CODE_BRAND, 'layouts'), 'bad', MARKER);
          const text = yield* runCaptured(['brand', 'check', CODE_BRAND], { root });
          expect(contractRan(MARKER)).toBe(true);
          expect(text.code).toBe(1);
          expect(text.output).toContain(`brands/${CODE_BRAND}/layouts/bad/contract.ts\n  error`);
          expect(text.output).toContain('layout-load-failed: ');
          expect(text.output).toContain('cannot be used (1 error, 0 warnings).');
          const json = yield* runJson<{ ok: boolean; errors: object[] }>(root, [
            'brand',
            'check',
            CODE_BRAND,
            '--json',
          ]);
          contractRan(MARKER);
          expect(json.ok).toBe(false);
          expect(json.errors).toEqual([
            expect.objectContaining({
              file: `brands/${CODE_BRAND}/layouts/bad/contract.ts`,
              code: 'layout-load-failed',
              layout: 'bad',
            }),
          ]);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );

  it.effect(
    'a brand code layout that replaces a kit layout is marked in layouts and brand, and checked',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          writeTitleReplacement(path.join(root, 'brands', CODE_BRAND, 'layouts'));
          const catalog = yield* runJson<LayoutsJson>(root, [
            'layouts',
            CODE_LAYOUTS_DECK,
            '--json',
          ]);
          expect(catalog.warnings).toEqual([]);
          const byName = new Map(catalog.layouts.map((layout) => [layout.name, layout]));
          expect(byName.get('title')).toMatchObject({
            source: `brand-code:${CODE_BRAND}`,
            replaces: '@deckster/kit',
          });
          expect(Object.keys(byName.get('kpi-wall') ?? {})).not.toContain('replaces');
          expect(Object.keys(byName.get('split') ?? {})).not.toContain('replaces');

          const summary = yield* runJson<{ layouts: LayoutSummary[] }>(root, [
            'layouts',
            CODE_LAYOUTS_DECK,
            '--summary',
            '--json',
          ]);
          expect(summary.layouts.find((layout) => layout.name === 'title')).toMatchObject({
            replaces: '@deckster/kit',
          });
          const text = yield* runCaptured(['layouts', CODE_LAYOUTS_DECK, '--summary'], { root });
          expect(text.output).toContain("replaces the kit's title");

          const brand = yield* runCaptured(['brand', CODE_BRAND], { root });
          expect(brand.output).toContain(
            "Code layouts: 2 (kpi-wall, title (replaces the kit's title))",
          );

          const check = yield* runCaptured(['brand', 'check', CODE_BRAND], { root });
          expect(check.code, check.output).toBe(0);
          expect(check.output).toMatch(/\n {2}warning layout-replace-pptx: .*\n {10}Fix: /u);
          expect(check.output).toMatch(/\n {2}note {4}layout-replace-budget: /u);
          expect(check.output).toMatch(/is valid \(0 errors, 1 warning, \d+ notes?\)\.$/u);
          const json = yield* runJson<{ ok: boolean; warnings: object[] }>(root, [
            'brand',
            'check',
            CODE_BRAND,
            '--json',
          ]);
          expect(json.ok).toBe(true);
          expect(json.warnings).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code: 'layout-replace-pptx',
                layout: 'title',
                level: 'warning',
                file: `brands/${CODE_BRAND}/layouts/title/contract.ts`,
              }),
              expect.objectContaining({
                code: 'layout-replace-budget',
                layout: 'title',
                level: 'note',
              }),
            ]),
          );
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );

  it.effect(
    'deckster brand check fails a replacement that a slide of a deck on the brand does not fit',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          writeTitleReplacement(path.join(root, 'brands', CODE_BRAND, 'layouts'), {
            narrowTreatment: true,
          });
          const deck = path.join(root, 'decks', CODE_LAYOUTS_DECK);
          fs.writeFileSync(
            path.join(deck, 'slides', 'duotone-cover.mdx'),
            '---\nlayout: title\ntitle: A duotone cover\ntreatment: duotone\n---\n',
          );
          const config = path.join(deck, 'deck.config.ts');
          fs.writeFileSync(
            config,
            fs
              .readFileSync(config, 'utf8')
              .replace("'kit-layout']", "'kit-layout', 'duotone-cover']"),
          );
          const check = yield* runCaptured(['brand', 'check', CODE_BRAND], { root });
          expect(check.code).toBe(1);
          expect(check.output).toContain(`brands/${CODE_BRAND}/layouts/title/contract.ts\n  error`);
          expect(check.output).toContain('layout-replace-breaks: ');
          expect(check.output).toContain('decks/code-layouts/slides/duotone-cover.mdx');
          expect(check.output).not.toContain('decks/code-layouts/slides/kit-layout.mdx');
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );

  it.effect(
    'deckster brand check accepts a data layout that falls back to a brand code layout',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const layouts = [
            {
              name: 'wall-note',
              label: 'Wall note',
              description: 'A wall of figures with the heading beside it.',
              fallback: 'kpi-wall',
              title: { box: [120, 80, 1680, 160] },
              regions: [{ bind: { slot: 'body' }, box: [120, 300, 1680, 600] }],
            },
          ];
          const file = path.join(root, 'brands', CODE_BRAND, 'layouts.ts');
          fs.writeFileSync(file, `export default ${JSON.stringify(layouts)};\n`);
          const sound = yield* runCaptured(['brand', 'check', CODE_BRAND], { root });
          expect(sound.code, sound.output).toBe(0);

          fs.writeFileSync(
            file,
            `export default ${JSON.stringify([{ ...layouts[0], fallback: 'no-such-layout' }])};\n`,
          );
          const broken = yield* runCaptured(['brand', 'check', CODE_BRAND], { root });
          expect(broken.code).toBe(1);
          expect(broken.output).toContain('layouts[0].fallback: The fallback "no-such-layout"');
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );

  it.effect(
    'deckster lint checks code layout slides against their own contracts',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const report = yield* lintDeck({ deck: CODE_LAYOUTS_DECK, brand: undefined }).pipe(
            Effect.provide(cliLayer(Workspace.at(root))),
          );
          const errors = report.findings
            .filter((finding) => finding.severity === 'error')
            .map((finding) => `${finding.slide ?? 'deck'} ${finding.rule}`);
          // The deck layout's budget (three bullets) holds, and the broken layout fails only its
          // own slide, by name, and not as a render error.
          expect(errors.toSorted()).toEqual([
            'broken-layout layout-load-failed',
            'over-budget content-budget',
          ]);
          const failed = report.findings.find((finding) => finding.rule === 'layout-load-failed');
          expect(failed?.message).toContain('The layout "broken" failed');
          expect(report.summary.slides).toBe(WORKING_SLIDES.length + 1);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'deckster brand check reports invalid data layouts next to a replacement and its slides',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const brandDir = path.join(root, 'brands', CODE_BRAND);
          writeTitleReplacement(path.join(brandDir, 'layouts'));
          const layouts = [
            {
              name: 'wall-note',
              label: 'Wall note',
              description: 'A wall of figures.',
              fallback: 'no-such-layout',
              title: { box: [120, 80, 1680, 160] },
              regions: [{ bind: { slot: 'body' }, box: [120, 300, 1680, 600] }],
            },
          ];
          fs.writeFileSync(
            path.join(brandDir, 'layouts.ts'),
            `export default ${JSON.stringify(layouts)};\n`,
          );
          const json = yield* runJson<{ ok: boolean; errors: { path: string; code?: string }[] }>(
            root,
            ['brand', 'check', CODE_BRAND, '--json'],
          );
          expect(json.ok).toBe(false);
          expect(json.errors.map((error) => error.path)).toEqual(['layouts[0].fallback']);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    COMMAND_TEST_TIMEOUT_MS,
  );

  it.effect(
    'deckster lint reports a slide on an unusable code layout under the layout problem id',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const brandDir = path.join(root, 'brands', CODE_BRAND);
          writeThrowingLayout(path.join(brandDir, 'layouts'), 'bad', MARKER);
          fs.writeFileSync(
            path.join(brandDir, '.deckster-source.json'),
            JSON.stringify({ source: 'github.com/acme/brand', codeLayoutsSkipped: ['gone'] }),
          );
          const deck = path.join(root, 'decks', CODE_LAYOUTS_DECK);
          for (const layout of ['bad', 'gone']) {
            fs.writeFileSync(
              path.join(deck, 'slides', `uses-${layout}.mdx`),
              `---\nlayout: ${layout}\ntitle: A slide on ${layout}\n---\n`,
            );
          }

          const config = path.join(deck, 'deck.config.ts');
          fs.writeFileSync(
            config,
            fs
              .readFileSync(config, 'utf8')
              .replace("'kit-layout']", "'kit-layout', 'uses-bad', 'uses-gone']"),
          );
          const report = yield* lintDeck({ deck: CODE_LAYOUTS_DECK, brand: undefined }).pipe(
            Effect.provide(cliLayer(Workspace.at(root))),
          );
          contractRan(MARKER);
          expect(report.ok).toBe(false);
          expect(
            report.findings.map((finding) => [finding.slide, finding.rule, finding.severity]),
          ).toEqual([
            ['uses-bad', 'layout-load-failed', 'error'],
            ['uses-gone', 'layout-code-skipped', 'error'],
          ]);
          expect(report.findings[1]?.fix).toContain('github.com/acme/brand');
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'deckster shot renders the code layouts and fails only on the broken one',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const shot = yield* runJson<{
            ok: boolean;
            files: { slide: string; error: string | null }[];
          }>(root, ['shot', CODE_LAYOUTS_DECK, '--json']);
          expect(shot.ok).toBe(false);
          const broken = shot.files.filter((file) => file.error !== null);
          expect(broken.map((file) => file.slide)).toEqual(['broken-layout']);
          expect(broken[0]?.error).toContain('Layout `broken` failed to load');
          expect(shot.files.map((file) => file.slide)).toEqual(
            expect.arrayContaining(WORKING_SLIDES),
          );
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'deckster build bundles the brand and deck code layouts',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const built = yield* runCaptured(['build', CODE_LAYOUTS_DECK], { root });
          expect(built.code).toBe(0);
          const assets = path.join(root, 'decks', CODE_LAYOUTS_DECK, 'dist', 'assets');
          const scripts = fs
            .readdirSync(assets)
            .filter((name) => name.endsWith('.js'))
            .map((name) => fs.readFileSync(path.join(assets, name), 'utf8'))
            .join('\n');
          expect(scripts).toContain('kpi-wall-heading');
          expect(scripts).toContain('the broken fixture layout does not load');
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    "deckster export maps a code layout to PowerPoint with its contract's placeholders",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const out = path.join(root, 'exports');
          const exportDeck = (slides: string | undefined) =>
            runExport({
              ...defaultExportOptions(CODE_LAYOUTS_DECK),
              out,
              slides,
              formats: new Set(['pdf', 'pptx']),
            }).pipe(Effect.provide(cliLayer(Workspace.at(root))));
          const refused = yield* exportDeck(undefined).pipe(Effect.flip);
          expect(refused.message).toContain('"broken-layout"');
          expect(fs.existsSync(path.join(out, `${CODE_LAYOUTS_DECK}.pdf`))).toBe(false);
          expect(fs.existsSync(path.join(out, `${CODE_LAYOUTS_DECK}.pptx`))).toBe(false);
          const result = yield* exportDeck(WORKING_SLIDES.join(','));
          expect(result.pdf?.pages).toBe(WORKING_SLIDES.length);
          expect(result.pptx?.slides).toHaveLength(WORKING_SLIDES.length);
          expect(result.pptx?.slides[0]).toMatchObject({
            layout: 'kpi-wall',
            placeholders: ['title', 'body'],
          });
          const parts = pptxParts(path.join(out, `${CODE_LAYOUTS_DECK}.pptx`));
          const target = /Target="\.\.\/slideLayouts\/([^"]+)"/u.exec(
            parts['ppt/slides/_rels/slide1.xml.rels'] ?? '',
          )?.[1];
          const layout = parts[`ppt/slideLayouts/${target ?? ''}`] ?? '';
          expect(layout).toContain('<p:cSld name="kpi-wall"');
          expect(layout).toContain('type="obj"');
          const slide = parts['ppt/slides/slide1.xml'] ?? '';
          expect(slide).toContain('<p:ph type="title"/>');
          expect(slide).toContain('<p:ph type="body" idx="1"/>');
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );
});
