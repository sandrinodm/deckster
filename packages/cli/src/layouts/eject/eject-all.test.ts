import { FRAMEWORK_ROOT, loadBrand } from '@deckster/brand/node';
import { LIMIT_CASES } from '@deckster/kit/limit-cases';
import { BRAND_CODE_SOURCE_PREFIX, deckCatalog } from '@deckster/vite-plugin';
import { NodeServices } from '@effect/platform-node';
import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { DeckBrowser } from '#browser/deck-browser.ts';
import { runCaptured } from '#cli.fixture.ts';
import { cliLayer } from '#cli.ts';
import { EJECT_BRAND, ejectWorkspace } from '#layouts/eject/eject-workspace.fixture.ts';
import { loadLayoutLimits } from '#layouts/layout-limits.ts';
import { DeckServer } from '#server/deck-server.ts';
import { Workspace } from '#workspace.ts';

/**
 * Room for a dev server and Chromium to render a deck of 124 slides twice, on a machine that runs
 * other browser suites at the same time.
 */
const BROWSER_TEST_TIMEOUT_MS = 900_000;

/**
 * The deck that uses the first layouts in every variant, which the eject guarantee is stated for.
 */
const EXEMPLARS = 'exemplars';

/**
 * The deck with at least one slide on every layout of the kit.
 */
const EVERY_LAYOUT = 'layouts';

/**
 * The decks of the repository the tests render before and after an eject.
 */
const DECKS = [EXEMPLARS, EVERY_LAYOUT] as const;

/**
 * The layouts ejected together for the mixed case, where the other kit layouts stay loaded: one for
 * each helper that brings a stylesheet (portrait, contact list, badges, marks, mono mark,
 * frontmatter picture, pattern slide), the layouts that share a stylesheet with a kit layout
 * (title, stats, section, image) and the plain cases the plan names (table, code).
 */
const MIXED_LAYOUTS = [
  'title',
  'stats',
  'section',
  'image',
  'quote',
  'bio',
  'actions',
  'do-dont',
  'proof',
  'before-after',
  'future-back',
  'table',
  'code',
];

/**
 * The layouts of the kit's catalog, which `--all` ejects into the empty brand.
 */
const KIT_LAYOUT_COUNT = 64;

/**
 * The slide of the exemplars deck the stylesheet test reads: the cover, on the `title` layout.
 */
const COVER_SLIDE = 'cover';

/**
 * The rule of the ejected `title` stylesheet the test removes.
 */
const COVER_MAIN_RULE = /\n {2}\.kit-cover-main \{[^}]*\}\n/u;

/**
 * The slide the tests add to the exemplars deck: a kit `<Image>` with a caption on a `content`
 * slide. The component shares class names with the `image` layout, so it shows whether its look
 * depends on that layout's stylesheet being loaded.
 */
const IMAGE_PROBE = 'zz-image-caption';

/**
 * The probe slide's source.
 */
const IMAGE_PROBE_SOURCE = [
  '---',
  'layout: content',
  'title: A photo with its caption',
  '---',
  '',
  'The street in July.',
  '',
  '<Image src="../assets/westgate-street.jpg" alt="A street under trees" caption="Westgate, July 2026. Photo: Onthehilltop, CC0." />',
  '',
].join('\n');

/**
 * What a deck gave before anything was ejected.
 */
type Baseline = {
  /**
   * Its lint findings, one line each.
   */
  readonly findings: readonly string[];

  /**
   * Its screenshots by file name.
   */
  readonly shots: ReadonlyMap<string, Buffer>;
};

/**
 * The workspace of every test in this file: a real copy of the default brand named
 * {@link EJECT_BRAND}, and the decks set to it.
 */
let root = '';

/**
 * The probe slide alone, before anything was ejected.
 */
let probeBefore: Buffer | undefined;

/**
 * What each deck gave with the brand's `layouts/` empty, by deck.
 */
const baseline = new Map<string, Baseline>();

/**
 * The brand's `layouts/` folder.
 */
function layoutsDir(): string {
  return path.join(root, 'brands', EJECT_BRAND, 'layouts');
}

/**
 * The layout folders in the brand's `layouts/`, without the shared helpers' folder.
 */
function layoutFolders(): string[] {
  return fs
    .readdirSync(layoutsDir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => entry.name);
}

/**
 * Runs a deckster command in the workspace.
 *
 * @param argv - The arguments after `deckster`.
 */
function deckster(argv: readonly string[]): Promise<{ code: number; output: string }> {
  return Effect.runPromise(runCaptured(argv, { root }));
}

/**
 * Lints a deck and returns every finding as one comparable line.
 *
 * @param deck - The deck.
 */
async function lintFindings(deck: string): Promise<string[]> {
  const run = await deckster(['lint', deck, '--json']);
  const report = JSON.parse(run.output) as {
    findings: { slide?: string; step?: number; rule: string; severity: string; message: string }[];
  };
  return report.findings
    .map((finding) =>
      [finding.slide, finding.step, finding.severity, finding.rule, finding.message].join(' | '),
    )
    .toSorted();
}

/**
 * Takes a screenshot of every slide of a deck.
 *
 * @param deck - The deck.
 * @param label - A folder name for this run.
 * @returns The PNG of each slide by file name.
 */
async function shoot(deck: string, label: string): Promise<Map<string, Buffer>> {
  const out = path.join(root, '.shots', label, deck);
  const run = await deckster(['shot', deck, '--out', out, '--json']);
  expect(run.code, `shot ${deck}`).toBe(0);
  return new Map(
    fs
      .readdirSync(out)
      .filter((file) => file.endsWith('.png'))
      .map((file) => [file, fs.readFileSync(path.join(out, file))]),
  );
}

/**
 * Takes a screenshot of the probe slide alone, so no other slide's layout has rendered in the page
 * before it.
 *
 * @param label - A folder name for this run.
 */
async function shootProbe(label: string): Promise<Buffer | undefined> {
  const out = path.join(root, '.shots', label, 'probe');
  const run = await deckster(['shot', EXEMPLARS, IMAGE_PROBE, '--out', out]);
  expect(run.code, 'shot of the probe slide').toBe(0);
  const [file] = fs.readdirSync(out).filter((name) => name.endsWith('.png'));
  return file === undefined ? undefined : fs.readFileSync(path.join(out, file));
}

/**
 * The slides whose screenshot is not byte for byte the one taken before the eject.
 *
 * @param deck - The deck.
 * @param shots - Its screenshots now.
 */
function changedShots(deck: string, shots: ReadonlyMap<string, Buffer>): string[] {
  const before = baseline.get(deck)?.shots ?? new Map<string, Buffer>();
  expect([...shots.keys()].toSorted()).toEqual([...before.keys()].toSorted());
  return [...shots]
    .filter(([file, png]) => before.get(file)?.equals(png) !== true)
    .map(([file]) => file);
}

/**
 * Reads computed styles of the cover's main block as the deck renders it now.
 */
const coverMainStyle = Effect.gen(function* () {
  const server = yield* DeckServer;
  const browser = yield* DeckBrowser;
  const running = yield* server.start({ deck: EXEMPLARS, brand: undefined, workspaceRoot: root });
  const page = yield* browser.open(running.url, { scale: 1, workspaceRoot: root });
  const index = page.slides.findIndex((slide) => slide.id === COVER_SLIDE);
  yield* page.show(index, 0);
  const { playwright } = page;
  if (playwright === undefined) {
    return yield* Effect.die(new Error('The deck page has no browser page to read styles from.'));
  }

  return yield* Effect.promise(() =>
    playwright.evaluate(() => {
      const main = document.querySelector('[data-layout="title"] .kit-cover-main');
      if (main === null) {
        return null;
      }

      const { display, paddingBottom, marginTop } = getComputedStyle(main);
      return { display, paddingBottom, marginTop };
    }),
  );
}).pipe(Effect.scoped);

beforeAll(async () => {
  root = ejectWorkspace('deck-eject-all-', DECKS);
  for (const deck of DECKS) {
    const config = path.join(root, 'decks', deck, 'deck.config.ts');
    const text = fs.readFileSync(config, 'utf8');
    if (!text.includes("brand: 'default'")) {
      throw new Error(`The ${deck} deck no longer names the default brand.`);
    }

    const probe = deck === EXEMPLARS ? `    '${IMAGE_PROBE}',\n` : '';
    fs.writeFileSync(
      config,
      text
        .replace("brand: 'default'", `brand: '${EJECT_BRAND}'`)
        .replace(/\n {2}\],\n\}\);\n$/u, `\n${probe}  ],\n});\n`),
    );
    if (deck === EXEMPLARS) {
      fs.writeFileSync(
        path.join(root, 'decks', deck, 'slides', `${IMAGE_PROBE}.mdx`),
        IMAGE_PROBE_SOURCE,
      );
    }

    baseline.set(deck, { findings: await lintFindings(deck), shots: await shoot(deck, 'kit') });
  }

  probeBefore = await shootProbe('kit');
}, BROWSER_TEST_TIMEOUT_MS);

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('ejecting every kit layout into one brand', () => {
  /**
   * What `deckster layouts eject --all` printed, run once before every test of this block so each
   * test can also run alone.
   */
  let ejectAll: { code: number; report: { layouts: { name: string }[]; warnings: string[] } };

  beforeAll(async () => {
    const run = await deckster(['layouts', 'eject', '--all', '--brand', EJECT_BRAND, '--json']);
    ejectAll = { code: run.code, report: JSON.parse(run.output) as typeof ejectAll.report };
  }, BROWSER_TEST_TIMEOUT_MS);

  it(
    'gives 64 code layouts that load, replace their kit layouts and keep their limit cases',
    async () => {
      const { code, report } = ejectAll;
      expect(code).toBe(0);
      expect(report.layouts).toHaveLength(KIT_LAYOUT_COUNT);
      expect(report.warnings).toHaveLength(1);
      expect(layoutFolders()).toHaveLength(KIT_LAYOUT_COUNT);

      const check = Effect.gen(function* () {
        const brand = yield* loadBrand(root, EJECT_BRAND);
        const catalog = yield* deckCatalog({ root, brand, code: 'load' });
        const names = report.layouts.map((layout) => layout.name);
        const subjects = names.flatMap((name) => {
          const entry = catalog.index.get(name);
          return entry === undefined
            ? []
            : [{ name, contract: entry.contract, dir: path.join(layoutsDir(), name) }];
        });
        const limits = yield* loadLayoutLimits(subjects, root);
        const sources = names.map((name) => catalog.index.get(name)?.source);
        return { local: catalog.local, limits, sources };
      });
      const { local, limits, sources } = await Effect.runPromise(
        check.pipe(Effect.provide(NodeServices.layer)),
      );
      expect(local.problems).toEqual([]);
      expect(local.warnings).toEqual([]);
      expect([...local.replaced].toSorted()).toEqual(
        report.layouts.map((layout) => layout.name).toSorted(),
      );
      expect(new Set(sources)).toEqual(new Set([`${BRAND_CODE_SOURCE_PREFIX}${EJECT_BRAND}`]));
      expect(limits).toHaveLength(KIT_LAYOUT_COUNT);
      expect(limits.filter((load) => load.kind === 'problem')).toEqual([]);
      for (const load of limits) {
        const cases = load.kind === 'cases' ? load.cases : [];
        expect(cases, load.name).toEqual(LIMIT_CASES[load.name] ?? []);
      }

      const brandCheck = await deckster(['brand', 'check', EJECT_BRAND]);
      expect(brandCheck.code).toBe(0);
      expect(brandCheck.output).toContain('0 errors, 0 warnings');
    },
    BROWSER_TEST_TIMEOUT_MS,
  );

  it(
    'typechecks as written',
    () => {
      const tsconfig = path.join(root, 'tsconfig.eject.json');
      fs.writeFileSync(
        tsconfig,
        JSON.stringify({
          extends: './tsconfig.base.json',
          compilerOptions: {
            lib: ['es2023', 'DOM', 'DOM.Iterable'],
            jsx: 'react-jsx',
            types: ['vite-plus/client'],
            noEmit: true,
          },
          include: [
            `brands/${EJECT_BRAND}/layouts`,
            path.join(FRAMEWORK_ROOT, 'packages/brand/src/runtime/virtual-modules.d.ts'),
            path.join(FRAMEWORK_ROOT, 'packages/kit/src/diagrams/icon-modules.d.ts'),
          ],
        }),
      );
      const tsc = path.join(FRAMEWORK_ROOT, 'packages/cli/node_modules/.bin/tsc');
      expect(layoutFolders()).toHaveLength(KIT_LAYOUT_COUNT);
      const run = spawnSync(tsc, ['-p', tsconfig], { cwd: root, encoding: 'utf8' });
      expect(run.error).toBeUndefined();
      expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
      expect(run.stdout).toBe('');
    },
    BROWSER_TEST_TIMEOUT_MS,
  );

  it(
    'builds the exemplars deck',
    async () => {
      expect(layoutFolders()).toHaveLength(KIT_LAYOUT_COUNT);
      const run = await deckster(['build', EXEMPLARS]);
      expect(run.code).toBe(0);
      const dist = path.join(root, 'decks', EXEMPLARS, 'dist');
      expect(fs.existsSync(path.join(dist, 'index.html'))).toBe(true);
    },
    BROWSER_TEST_TIMEOUT_MS,
  );

  it(
    'lints both decks with no finding the kit layouts did not have',
    async () => {
      expect(layoutFolders()).toHaveLength(KIT_LAYOUT_COUNT);
      for (const deck of DECKS) {
        const before = baseline.get(deck)?.findings ?? [];
        const added = (await lintFindings(deck)).filter((finding) => !before.includes(finding));
        expect(added, deck).toEqual([]);
      }
    },
    BROWSER_TEST_TIMEOUT_MS,
  );

  it(
    'renders every slide of both decks pixel for pixel as the kit layouts do',
    async () => {
      expect(layoutFolders()).toHaveLength(KIT_LAYOUT_COUNT);
      for (const deck of DECKS) {
        expect(changedShots(deck, await shoot(deck, 'all')), deck).toEqual([]);
      }

      expect(probeBefore).toBeDefined();
      expect((await shootProbe('all'))?.equals(probeBefore ?? Buffer.alloc(0))).toBe(true);
    },
    BROWSER_TEST_TIMEOUT_MS,
  );
});

describe('ejecting some layouts while the kit keeps the others', () => {
  /**
   * The exit code of the eject, run once before every test of this block so each test can also run
   * alone.
   */
  let ejectCode = -1;

  beforeAll(async () => {
    fs.rmSync(layoutsDir(), { recursive: true, force: true });
    const run = await deckster(['layouts', 'eject', ...MIXED_LAYOUTS, '--brand', EJECT_BRAND]);
    ejectCode = run.code;
  }, BROWSER_TEST_TIMEOUT_MS);

  it(
    'renders every slide pixel for pixel as before, with the kit and the copies side by side',
    async () => {
      expect(ejectCode).toBe(0);
      expect(layoutFolders().toSorted()).toEqual(MIXED_LAYOUTS.toSorted());
      expect(changedShots(EVERY_LAYOUT, await shoot(EVERY_LAYOUT, 'mixed'))).toEqual([]);
      expect(changedShots(EXEMPLARS, await shoot(EXEMPLARS, 'mixed'))).toEqual([]);
      expect((await shootProbe('mixed'))?.equals(probeBefore ?? Buffer.alloc(0))).toBe(true);
    },
    BROWSER_TEST_TIMEOUT_MS,
  );

  it(
    'styles an ejected title only from its own stylesheet: a rule removed from it is gone',
    async () => {
      const read = (): Promise<{ display: string; paddingBottom: string } | null> =>
        Effect.runPromise(coverMainStyle.pipe(Effect.provide(cliLayer(Workspace.at(root)))));
      expect(ejectCode).toBe(0);
      expect(layoutFolders()).toContain('title');
      const before = await read();
      expect(before?.display).toBe('flex');
      expect(before?.paddingBottom).not.toBe('0px');

      const stylesheet = path.join(layoutsDir(), 'title/layout.css');
      const css = fs.readFileSync(stylesheet, 'utf8');
      expect(css).toMatch(COVER_MAIN_RULE);
      fs.writeFileSync(stylesheet, css.replace(COVER_MAIN_RULE, '\n'));
      const after = await read();
      expect(after).toMatchObject({ display: 'block', paddingBottom: '0px' });
    },
    BROWSER_TEST_TIMEOUT_MS,
  );
});
