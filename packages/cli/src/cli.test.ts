import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fakeDeckLayer, pageSlide } from '#browser/fake-deck.fixture.ts';
import { runCaptured } from '#cli.fixture.ts';
import { FIXTURE_BRANDS, fixtureBrandSource } from '#lint/fixture-brands.fixture.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';
import { collectedPage } from '#lint/snapshot.fixture.ts';

/**
 * A fake hello deck whose second slide throws, for `deck shot` without Chromium.
 */
const BROKEN_HELLO = fakeDeckLayer({
  slides: [
    { page: pageSlide(0, 'title'), steps: [collectedPage()] },
    {
      page: pageSlide(1, 'steps'),
      steps: [collectedPage({ renderError: { file: 'slides/steps.mdx', message: 'boom' } })],
    },
  ],
});

/**
 * A scratch output folder for fake screenshots, outside the workspace.
 */
const SCRATCH_SHOTS = path.join(os.tmpdir(), 'deck-cli-test-shots');

/**
 * The JSON a command printed.
 */
function parseOutput(output: string): unknown {
  return JSON.parse(output);
}

describe('runCli', () => {
  it.effect('lists every command in the root help', () =>
    Effect.gen(function* () {
      const { code, output } = yield* runCaptured([]);
      expect(code).toBe(0);
      for (const name of ['dev', 'build', 'preview', 'shot', 'lint', 'layouts', 'brand', 'new']) {
        expect(output).toContain(name);
      }
    }),
  );

  it.effect('prints command help for --help', () =>
    Effect.gen(function* () {
      const { output } = yield* runCaptured(['shot', '--help']);
      expect(output).toContain('Usage: deck shot');
      expect(output).toContain('--brand <name>');
    }),
  );

  it.effect('says what to do about an unknown command', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(runCaptured(['shoot']));
      expect(error.message).toContain('Unknown command "shoot"');
      expect(error.message).toContain('Run `deck --help` for the usage.');
    }),
  );

  it.effect('points at --help for an unknown option', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(runCaptured(['lint', 'hello', '--bogus']));
      expect(error.message).toContain('deck lint --help');
    }),
  );

  it.effect('asks for the deck when shot has none', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(runCaptured(['shot']));
      expect(error.message).toContain('Which deck?');
    }),
  );

  it.effect('prints JSON for usage errors and unknown decks when --json is given', () =>
    Effect.gen(function* () {
      for (const argv of [
        ['lint', '--json'],
        ['shot', '--json', '--bogus'],
        ['lint', 'nope', '--json'],
        ['shot', 'nope', '--json'],
      ]) {
        const { code, output } = yield* runCaptured(argv);
        expect(code, argv.join(' ')).toBe(1);
        expect(parseOutput(output), argv.join(' ')).toMatchObject({
          ok: false,
          error: { type: expect.any(String), message: expect.any(String) },
        });
      }

      const unknown = yield* runCaptured(['lint', 'nope', '--json']);
      expect(parseOutput(unknown.output)).toMatchObject({
        error: { type: 'DeckBuildError', message: expect.stringContaining('decks/nope') },
      });
    }),
  );

  it.effect('makes deck shot exit with 1 and flag a slide that threw', () =>
    Effect.gen(function* () {
      const plain = yield* runCaptured(['shot', 'hello', '--out', SCRATCH_SHOTS], {
        deck: BROKEN_HELLO,
      });
      expect(plain.code).toBe(1);
      expect(plain.errors).toContain('slide 2 "steps" shows an error: boom');
      const json = yield* runCaptured(['shot', 'hello', '--json', '--out', SCRATCH_SHOTS], {
        deck: BROKEN_HELLO,
      });
      expect(json.code).toBe(1);
      expect(parseOutput(json.output)).toMatchObject({
        ok: false,
        brand: 'default',
        files: [
          { slide: 'title', error: null },
          { slide: 'steps', error: 'boom' },
        ],
      });
    }),
  );

  it.effect('writes shots in another brand to a folder of their own', () =>
    Effect.gen(function* () {
      const { output } = yield* runCaptured(
        ['shot', 'hello', 'title', '--brand', 'nocturne', '--json'],
        {
          deck: fakeDeckLayer({
            slides: [{ page: pageSlide(0, 'title'), steps: [collectedPage()] }],
          }),
        },
      );
      expect(parseOutput(output)).toMatchObject({
        ok: true,
        brand: 'nocturne',
        outDir: expect.stringMatching(/\.deck\/shots\/hello@nocturne$/),
      });
    }),
  );

  it.effect('prints and checks brands', () =>
    Effect.gen(function* () {
      const summary = yield* runCaptured(['brand', 'nocturne']);
      expect(summary.output).toContain('Nocturne (brands/nocturne/brand.ts)');
      expect(summary.output).toMatch(/\nDiagrams: edges [\d.]+px, (round|sharp) corners, /u);
      expect(summary.output).toContain('\nCards (colors on the default surface):\n  default: ');
      expect(summary.output).toMatch(/\n {2}raised: .*, title \w+ \d+/u);
      const tokens = yield* runCaptured(['brand', 'nocturne', '--json']);
      expect(parseOutput(tokens.output)).toMatchObject({
        name: 'nocturne',
        charts: {},
        diagram: { cards: { default: {}, raised: {} } },
        surfaces: { default: { diagramCards: { tint: {} } } },
      });
      const valid = yield* runCaptured(['brand', 'check', 'default', '--json']);
      expect(valid.code).toBe(0);
      expect(parseOutput(valid.output)).toMatchObject({ brand: 'default', ok: true, errors: [] });
      const missing = yield* runCaptured(['brand', 'check', 'nope']);
      expect(missing.code).toBe(1);
      expect(missing.output).toContain('There is no brands/nope/brand.ts.');
      expect(missing.output).toContain(
        'Fix: Use one of: default, fieldnote, kinetic, nocturne, tidewater',
      );
    }),
  );

  it.effect('prints customized diagram geometry, typography and outlines', () =>
    Effect.gen(function* () {
      const name = 'weak-accent';
      const root = scratchWorkspace('deck-cli-diagram-brand-', [name]);
      try {
        const brand = {
          ...FIXTURE_BRANDS[name],
          diagram: {
            align: 'right',
            edges: { stroke: 2.5, lineStyle: 'dotted' },
            groups: { stroke: 1.5, lineStyle: 'dashed' },
            nodes: { width: 180, height: 70, subtitle: 'label' },
            notes: { type: 'small', family: 'mono', weight: 650 },
            cards: {
              default: {
                borderStyle: 'dashed',
                icon: { border: 'accent', borderWidth: 2, borderStyle: 'dotted' },
                subtitle: { family: 'body', weight: 500 },
              },
            },
          },
        };
        fs.writeFileSync(path.join(root, 'brands', name, 'brand.ts'), fixtureBrandSource(brand));
        const summary = yield* runCaptured(['brand', name], { root });
        expect(summary.code).toBe(0);
        expect(summary.output).toContain('edges 2.5px dotted');
        expect(summary.output).toContain('groups 1.5px dashed');
        expect(summary.output).toContain('align right, node width 180px, node minimum height 70px');
        expect(summary.output).toContain('subtitle label, notes small mono 650');
        expect(summary.output).toMatch(/default: .*border #[\da-f]+ 2px dashed/u);
        expect(summary.output).toContain('icon border #4f6ffa 2px dotted');
        expect(summary.output).toContain('subtitle body 500');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect('refuses a brand name that is a path, without importing the brand.ts it names', () =>
    Effect.gen(function* () {
      const root = scratchWorkspace('deck-cli-brand-');
      const marker = path.join(root, 'imported.txt');
      const evil = path.join(root, 'decks', 'x', 'evilbrand');
      fs.mkdirSync(evil, { recursive: true });
      fs.writeFileSync(
        path.join(evil, 'brand.ts'),
        `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'imported');\nexport default {};\n`,
      );
      const check = yield* runCaptured(['brand', 'check', '../decks/x/evilbrand', '--json'], {
        root,
      });
      expect(check.code).toBe(1);
      expect(parseOutput(check.output)).toMatchObject({
        brand: '../decks/x/evilbrand',
        ok: false,
        file: 'brands/',
        errors: [{ message: expect.stringContaining('is not a brand folder name') }],
      });
      const print = yield* runCaptured(['brand', '../brands/nocturne', '--json'], { root });
      expect(print.code).toBe(1);
      expect(parseOutput(print.output)).toMatchObject({
        ok: false,
        error: { type: 'BrandError', message: expect.stringContaining('Invalid brand name') },
      });
      const shot = yield* runCaptured(['shot', 'hello', '--brand', '../x', '--json'], {
        deck: BROKEN_HELLO,
      });
      expect(shot.code).toBe(1);
      expect(shot.output).toContain('--brand must name a folder under brands/ in kebab-case');
      expect(fs.existsSync(marker)).toBe(false);
      fs.rmSync(root, { recursive: true, force: true });
    }),
  );
});
