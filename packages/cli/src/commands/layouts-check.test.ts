import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';

import type { LayoutsCheckReport } from '#layouts/check-layouts.ts';

import { runCaptured } from '#cli.fixture.ts';
import { cliLayer } from '#cli.ts';
import {
  CODE_BRAND,
  CODE_LAYOUTS_DECK,
  codeLayoutsWorkspace,
  contractRan,
  writeThrowingLayout,
} from '#layouts/code-layouts.fixture.ts';
import { lintDeck } from '#lint/run-lint.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';
import { Workspace } from '#workspace.ts';

/**
 * Room for the contracts to load, a dev server and Chromium to open the generated deck, on a busy
 * machine.
 */
const BROWSER_TEST_TIMEOUT_MS = 240_000;

/**
 * The global the throwing contracts of these tests set when they run.
 */
const MARKER = '__deckLayoutsCheckRan';

/**
 * The fixture brand with body text at 30 px, where a budget that is too loose overflows first.
 */
const WIDE_BRAND = 'wide-sans';

/**
 * The layout the tests add with `deckster layouts new`.
 */
const NEW_LAYOUT = 'brief';

/**
 * Runs `deckster layouts check` with `--json` and parses the report.
 *
 * @param root - The workspace.
 * @param argv - The arguments after `layouts check`.
 */
const checkJson = Effect.fn('checkJson')(function* (root: string, argv: readonly string[]) {
  const run = yield* runCaptured(['layouts', 'check', ...argv, '--json'], { root });
  return { code: run.code, report: JSON.parse(run.output) as LayoutsCheckReport };
});

/**
 * Every error of a report as `layout code`, layout by layout.
 *
 * @param report - The report.
 */
function errorCodes(report: LayoutsCheckReport): string[] {
  return report.layouts.flatMap((layout) =>
    layout.problems
      .filter((problem) => problem.severity === 'error')
      .map((problem) => `${layout.name} ${problem.code}`),
  );
}

/**
 * Writes a deck with one slide on a layout.
 *
 * @param root - The workspace.
 * @param deck - The deck folder name.
 * @param brand - The brand the deck names.
 * @param layout - The layout of its one slide.
 */
function writeDeck(root: string, deck: string, brand: string, layout: string): void {
  const dir = path.join(root, 'decks', deck);
  fs.mkdirSync(path.join(dir, 'slides'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'deck.config.ts'),
    [
      "import { defineDeck } from '@deckster/engine/config';",
      '',
      `export default defineDeck({ title: 'Plain', brand: '${brand}', slides: ['one'] });`,
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(dir, 'slides', 'one.mdx'),
    [
      '---',
      `layout: ${layout}`,
      'title: Every slide makes one point',
      '---',
      '',
      'The title says the point; the body backs it up.',
      '',
      '<Notes>Say the point.</Notes>',
      '',
    ].join('\n'),
  );
}

/**
 * A scratch workspace with the `wide-sans` fixture brand, removed when the scope closes.
 */
const wideWorkspace = Effect.fn('wideWorkspace')(function* () {
  const root = scratchWorkspace('deck-layouts-check-', [WIDE_BRAND]);
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
  );
  return root;
});

describe('deckster layouts check', () => {
  it.effect(
    'passes a new brand layout and reports the problems of the others',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const layoutsDir = path.join(root, 'brands', CODE_BRAND, 'layouts');
          const added = yield* runCaptured(['layouts', 'new', NEW_LAYOUT, '--brand', CODE_BRAND], {
            root,
          });
          expect(added.code).toBe(0);
          const brandCheck = yield* runCaptured(['brand', 'check', CODE_BRAND], { root });
          expect(brandCheck.code, brandCheck.output).toBe(0);
          writeThrowingLayout(layoutsDir, 'bad', MARKER);
          fs.mkdirSync(path.join(layoutsDir, 'half'));
          fs.writeFileSync(path.join(layoutsDir, 'half', 'layout.tsx'), 'export default 1;\n');

          const { code, report } = yield* checkJson(root, ['--brand', CODE_BRAND]);
          // It throws in the check process, so it never runs in this one.
          expect(contractRan(MARKER)).toBe(false);
          expect(code).toBe(1);
          expect(report).toMatchObject({ ok: false, brand: CODE_BRAND, deck: null, problems: [] });
          expect(report.dir).toBe(`brands/${CODE_BRAND}/layouts`);
          expect(errorCodes(report)).toEqual([
            'bad layout-load-failed',
            'half layout-folder-incomplete',
          ]);
          const byName = new Map(report.layouts.map((layout) => [layout.name, layout]));
          expect(byName.get(NEW_LAYOUT)).toMatchObject({
            ok: true,
            dir: `brands/${CODE_BRAND}/layouts/${NEW_LAYOUT}`,
            cases: ['example', 'full-body'],
          });
          expect(byName.get('kpi-wall')).toMatchObject({ ok: true, cases: ['example'] });
          expect(byName.get('bad')).toMatchObject({ ok: false, cases: [] });
          expect(byName.get('bad')?.problems[0]).toMatchObject({
            severity: 'error',
            file: `brands/${CODE_BRAND}/layouts/bad/contract.ts`,
          });

          const one = yield* checkJson(root, [NEW_LAYOUT, '--brand', CODE_BRAND]);
          expect(one.code).toBe(0);
          expect(one.report.layouts.map((layout) => layout.name)).toEqual([NEW_LAYOUT]);
          const text = yield* runCaptured(['layouts', 'check', 'kpi-wall', '--brand', CODE_BRAND], {
            root,
          });
          expect(text.output).toBe(
            [
              `brands/${CODE_BRAND}/layouts/ (rendered in the ${CODE_BRAND} brand)`,
              '  kpi-wall: ok (example)',
              `The brand ${CODE_BRAND}: 1 of 1 layout pass (0 errors, 0 warnings).`,
            ].join('\n'),
          );
          const unknown = yield* Effect.flip(
            runCaptured(['layouts', 'check', 'nope', '--brand', CODE_BRAND], { root }),
          );
          expect(unknown.message).toContain(
            `The brand ${CODE_BRAND} has no code layout named "nope"; it has bad, ${NEW_LAYOUT}, half, kpi-wall.`,
          );
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    "checks a deck's layouts in the deck's brand and reports a slide that does not fit",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const deckLayouts = path.join(root, 'decks', CODE_LAYOUTS_DECK, 'layouts');
          writeThrowingLayout(deckLayouts, 'bad', MARKER);
          const sound = yield* checkJson(root, ['funnel', '--deck', CODE_LAYOUTS_DECK]);
          expect(sound.code).toBe(0);
          expect(sound.report).toMatchObject({
            ok: true,
            brand: CODE_BRAND,
            deck: CODE_LAYOUTS_DECK,
            dir: `decks/${CODE_LAYOUTS_DECK}/layouts`,
          });
          // It throws in the check process, so it never runs in this one.
          expect(contractRan(MARKER)).toBe(false);

          // A body budget far past what the region holds: the limit case overflows.
          const added = yield* runCaptured(
            ['layouts', 'new', NEW_LAYOUT, '--deck', CODE_LAYOUTS_DECK],
            { root },
          );
          expect(added.code).toBe(0);
          const contract = path.join(deckLayouts, NEW_LAYOUT, 'contract.ts');
          fs.writeFileSync(
            contract,
            fs
              .readFileSync(contract, 'utf8')
              .replace('maxWords: 60, maxBullets: 5', 'maxWords: 400, maxBullets: 30'),
          );
          const { code, report } = yield* checkJson(root, [
            NEW_LAYOUT,
            '--deck',
            CODE_LAYOUTS_DECK,
          ]);
          contractRan(MARKER);
          expect(code).toBe(1);
          const [layout] = report.layouts;
          const overflow = layout?.problems.find((problem) => problem.severity === 'error');
          expect(overflow).toMatchObject({
            file: `decks/${CODE_LAYOUTS_DECK}/layouts/${NEW_LAYOUT}/limits.ts`,
            case: 'full-body',
          });
          expect(overflow?.code).toMatch(/overflow/u);
          expect(overflow?.slide).toMatch(/^brief-full-body-(text|list)$/u);
          expect(fs.readdirSync(path.join(root, 'decks', CODE_LAYOUTS_DECK, 'slides'))).toEqual([
            'brand-layout.mdx',
            'broken-layout.mdx',
            'deck-layout.mdx',
            'kit-layout.mdx',
            'over-budget.mdx',
          ]);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'reports a limits.ts that is not a list of cases, a misnamed contract and a breaking replacement',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const layoutsDir = path.join(root, 'brands', CODE_BRAND, 'layouts');
          yield* runCaptured(['layouts', 'new', NEW_LAYOUT, '--brand', CODE_BRAND], { root });
          yield* runCaptured(['layouts', 'new', 'renamed', '--brand', CODE_BRAND], { root });
          fs.writeFileSync(
            path.join(layoutsDir, NEW_LAYOUT, 'limits.ts'),
            "export default [{ name: 'Full', frontmatter: {}, filled: ['aside'] }];\n",
          );
          const renamed = path.join(layoutsDir, 'renamed', 'contract.ts');
          fs.writeFileSync(
            renamed,
            fs.readFileSync(renamed, 'utf8').replace("name: 'renamed'", "name: 'other-name'"),
          );
          // A replacement of the kit's content layout without its aside, footnote and width.
          fs.cpSync(path.join(layoutsDir, 'renamed'), path.join(layoutsDir, 'content'), {
            recursive: true,
          });
          for (const file of ['contract.ts', 'layout.tsx', 'layout.css']) {
            const at = path.join(layoutsDir, 'content', file);
            fs.writeFileSync(
              at,
              fs
                .readFileSync(at, 'utf8')
                .replaceAll(/other-name|renamed/gu, 'content')
                .replace("  name: 'content',", "  name: 'content',\n  replaces: true,"),
            );
          }

          const { code, report } = yield* checkJson(root, ['--brand', CODE_BRAND]);
          expect(code).toBe(1);
          expect([...new Set(errorCodes(report))]).toEqual([
            `${NEW_LAYOUT} layout-limits-invalid`,
            'content layout-replace-breaks',
            'renamed layout-name-mismatch',
          ]);
          const content = report.layouts.find((layout) => layout.name === 'content');
          expect(content?.cases).toEqual([]);
          expect(content?.problems[0]?.file).toBe(
            `brands/${CODE_BRAND}/layouts/content/contract.ts`,
          );
          const brief = report.layouts.find((layout) => layout.name === NEW_LAYOUT);
          expect(brief?.cases).toEqual([]);
          expect(brief?.problems[0]?.message).toContain('Expected a kebab-case case name');
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'still renders the other layouts when one limit case does not compile',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* codeLayoutsWorkspace();
          const layoutsDir = path.join(root, 'brands', 'code-brand', 'layouts');
          for (const name of [NEW_LAYOUT, 'other', 'third']) {
            yield* runCaptured(['layouts', 'new', name, '--brand', CODE_BRAND], { root });
          }

          // `brief` overflows, which only shows when it is rendered; `other` has a case whose
          // frontmatter has a field no layout has, so the generated deck does not compile.
          const contract = path.join(layoutsDir, NEW_LAYOUT, 'contract.ts');
          fs.writeFileSync(
            contract,
            fs
              .readFileSync(contract, 'utf8')
              .replace('maxWords: 60, maxBullets: 5', 'maxWords: 400, maxBullets: 30'),
          );
          fs.writeFileSync(
            path.join(layoutsDir, 'other', 'limits.ts'),
            "export default [{ name: 'bogus', frontmatter: { bogusField: 'x' }, filled: [] }];\n",
          );

          const { code, report } = yield* checkJson(root, ['--brand', CODE_BRAND]);
          expect(code).toBe(1);
          const byName = new Map(report.layouts.map((layout) => [layout.name, layout]));
          const brief = byName.get(NEW_LAYOUT);
          expect(brief?.ok).toBe(false);
          expect(brief?.problems.some((problem) => /overflow/u.test(problem.code))).toBe(true);
          expect(byName.get('other')).toMatchObject({ ok: false });
          expect(byName.get('other')?.cases).toEqual(['example']);
          expect(byName.get('third')).toMatchObject({ ok: true, cases: ['example', 'full-body'] });
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );

  it.effect(
    'passes a new deck layout in the default and a wide brand, and lint and build accept it',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* wideWorkspace();
          for (const [deck, brand] of [
            ['calm', 'default'],
            ['wide', WIDE_BRAND],
          ] as const) {
            writeDeck(root, deck, brand, NEW_LAYOUT);
            const added = yield* runCaptured(['layouts', 'new', NEW_LAYOUT, '--deck', deck], {
              root,
            });
            expect(added.code).toBe(0);
          }

          const calm = yield* checkJson(root, ['--deck', 'calm']);
          expect(calm.code).toBe(0);
          expect(calm.report.layouts).toEqual([
            {
              name: NEW_LAYOUT,
              dir: `decks/calm/layouts/${NEW_LAYOUT}`,
              cases: ['example', 'full-body'],
              ok: true,
              problems: [],
            },
          ]);
          // The kit's eyebrow row has a gap that is not on the wide brand's spacing scale, a
          // warning every kit layout gets there too.
          const wide = yield* checkJson(root, ['--deck', 'wide']);
          expect(wide.code).toBe(0);
          expect(errorCodes(wide.report)).toEqual([]);

          const lint = yield* lintDeck({ deck: 'wide', brand: undefined }).pipe(
            Effect.provide(cliLayer(Workspace.at(root))),
          );
          expect(lint.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
          const built = yield* runCaptured(['build', 'calm'], { root });
          expect(built.code).toBe(0);
          expect(fs.readdirSync(path.join(root, 'decks', 'calm', 'slides'))).toEqual(['one.mdx']);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    BROWSER_TEST_TIMEOUT_MS,
  );
});
