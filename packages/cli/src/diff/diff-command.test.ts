import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { DiffReport } from '#diff/diff-report.ts';

import { runCaptured } from '#cli.fixture.ts';
import { fakeComparerLayer, renderingDeckLayer } from '#diff/diff.fixture.ts';

/**
 * Whether `git` runs here; the tests of the git path are skipped without it.
 */
const GIT_AVAILABLE = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Fake deck services whose pictures follow the slide files.
 */
const FAKES = Layer.merge(renderingDeckLayer, fakeComparerLayer);

/**
 * Creates a workspace outside this repository with a deck of three slides.
 */
function makeWorkspace(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'deck-diff-test-'));
  const deck = path.join(root, 'decks', 'demo');
  mkdirSync(path.join(deck, 'slides'), { recursive: true });
  writeFileSync(
    path.join(deck, 'deck.config.ts'),
    "export default { title: 'Demo', slides: ['intro', 'middle', 'end'] };\n",
  );
  for (const id of ['intro', 'middle', 'end']) {
    writeSlide(root, id, `# ${id}\n`);
  }

  return root;
}

/**
 * Writes a slide file of the demo deck.
 *
 * @param root - The workspace.
 * @param id - The slide id.
 * @param text - The MDX.
 */
function writeSlide(root: string, id: string, text: string): void {
  writeFileSync(path.join(root, 'decks', 'demo', 'slides', `${id}.mdx`), text);
}

/**
 * Runs `git` in a repository with a fixed identity.
 *
 * @param cwd - The repository.
 * @param args - The arguments.
 */
function git(cwd: string, ...args: string[]): void {
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, stdio: 'ignore' },
  );
}

/**
 * Runs `deck diff ... --json` in a workspace with the fakes.
 *
 * @param root - The workspace.
 * @param args - The arguments after `diff demo`.
 */
const diffJson = Effect.fn('diffJson')(function* (root: string, ...args: string[]) {
  const run = yield* runCaptured(['diff', 'demo', '--json', ...args], { root, deck: FAKES });
  return { code: run.code, report: JSON.parse(run.output) as DiffReport };
});

/**
 * The statuses by slide id.
 *
 * @param report - The report.
 */
function statuses(report: DiffReport): Record<string, string> {
  return Object.fromEntries(report.slides.map((slide) => [slide.id, slide.status]));
}

describe('deck diff against a baseline folder', () => {
  it.effect('saves a baseline, then reports changed, added and unchanged slides', () =>
    Effect.gen(function* () {
      const root = makeWorkspace();
      const baseline = path.join(root, 'base');
      const saved = yield* runCaptured(['diff', 'demo', '--save-baseline', baseline, '--json'], {
        root,
        deck: FAKES,
      });
      expect(JSON.parse(saved.output)).toMatchObject({ ok: true, deck: 'demo', files: 3 });

      writeSlide(root, 'middle', '# middle, edited\n');
      const { code, report } = yield* diffJson(root, '--base', baseline);
      expect(code).toBe(0);
      expect(statuses(report)).toEqual({
        intro: 'unchanged',
        middle: 'changed',
        end: 'unchanged',
      });
      expect(report).toMatchObject({
        ok: true,
        baseKind: 'dir',
        counts: { changed: 1, unchanged: 2 },
      });
      const middle = report.slides.find((slide) => slide.id === 'middle');
      expect(middle?.compare).toBe(
        path.join(root, '.deck', 'diff', 'demo', 'compare', '02-middle.png'),
      );
      const written = JSON.parse(
        readFileSync(path.join(root, '.deck', 'diff', 'demo', 'report.json'), 'utf8'),
      ) as DiffReport;
      expect(written.slides.find((slide) => slide.id === 'middle')?.compare).toBe(
        'compare/02-middle.png',
      );
      expect(
        readFileSync(path.join(root, '.deck', 'diff', 'demo', 'summary.md'), 'utf8'),
      ).toContain('| `middle` | changed |');
      expect(
        readFileSync(path.join(root, '.deck', 'diff', 'demo', 'index.html'), 'utf8'),
      ).toContain('<img src="compare/02-middle.png"');
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('refuses to save a baseline or compare when the deck throws', () =>
    Effect.gen(function* () {
      const root = makeWorkspace();
      const baseline = path.join(root, 'base');
      yield* runCaptured(['diff', 'demo', '--save-baseline', baseline], { root, deck: FAKES });
      writeSlide(root, 'middle', '# RENDER-ERROR\n');
      const slide = yield* Effect.flip(
        runCaptured(['diff', 'demo', '--base', baseline], { root, deck: FAKES }),
      );
      expect(slide.message).toContain('slide 2 "middle" shows an error: it threw');
      const saving = yield* Effect.flip(
        runCaptured(['diff', 'demo', '--save-baseline', path.join(root, 'other')], {
          root,
          deck: FAKES,
        }),
      );
      expect(saving.message).toContain('slide 2 "middle" shows an error');

      writeSlide(root, 'middle', '# fine\n');
      writeFileSync(
        path.join(root, 'decks', 'demo', 'deck.config.ts'),
        "export default { title: 'Demo', slides: ['intro', 'middle', 'end'] }; // PAGE-ERROR\n",
      );
      const page = yield* Effect.flip(
        runCaptured(['diff', 'demo', '--base', baseline], { root, deck: FAKES }),
      );
      expect(page.message).toContain('the page threw while the deck loaded: early failure');
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('exits 1 with --fail-on-change only when something changed', () =>
    Effect.gen(function* () {
      const root = makeWorkspace();
      const baseline = path.join(root, 'base');
      yield* runCaptured(['diff', 'demo', '--save-baseline', baseline], { root, deck: FAKES });
      expect((yield* diffJson(root, '--base', baseline, '--fail-on-change')).code).toBe(0);
      writeSlide(root, 'end', '# the end\n');
      expect((yield* diffJson(root, '--base', baseline, '--fail-on-change')).code).toBe(1);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('uses the saved baseline outside git and says how to make one when there is none', () =>
    Effect.gen(function* () {
      const root = makeWorkspace();
      const error = yield* Effect.flip(runCaptured(['diff', 'demo'], { root, deck: FAKES }));
      expect(error.message).toContain('not a git repository');
      expect(error.message).toContain('deck diff demo --save-baseline');
      yield* runCaptured(['diff', 'demo', '--save-baseline'], { root, deck: FAKES });
      const { report } = yield* diffJson(root);
      expect(report.counts.unchanged).toBe(3);
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('prints a failure as JSON for a base that is neither a folder nor a ref', () =>
    Effect.gen(function* () {
      const root = makeWorkspace();
      const run = yield* runCaptured(['diff', 'demo', '--json', '--base', 'nope'], {
        root,
        deck: FAKES,
      });
      expect(run.code).toBe(1);
      expect(JSON.parse(run.output)).toMatchObject({ ok: false, error: { type: 'CliError' } });
      rmSync(root, { recursive: true, force: true });
    }),
  );
});

describe.skipIf(!GIT_AVAILABLE)('deck diff against a git ref', () => {
  it.effect(
    'renders the ref from git archive, reports reorders as moved and leaves the repo alone',
    () =>
      Effect.gen(function* () {
        const root = makeWorkspace();
        const store = path.join(root, 'node_modules', '.pnpm', 'dep');
        mkdirSync(store, { recursive: true });
        symlinkSync(store, path.join(root, 'node_modules', 'dep'));
        writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.deck/\n');
        git(root, 'init', '-q', '-b', 'main');
        git(root, 'add', '.');
        git(root, 'commit', '-q', '-m', 'base');

        writeSlide(root, 'intro', '# intro, edited\n');
        writeSlide(root, 'extra', '# extra\n');
        writeFileSync(
          path.join(root, 'decks', 'demo', 'deck.config.ts'),
          "export default { title: 'Demo', slides: ['end', 'intro', 'middle', 'extra'] };\n",
        );
        const { report } = yield* diffJson(root);
        expect(report).toMatchObject({ baseKind: 'ref', base: 'HEAD' });
        expect(statuses(report)).toEqual({
          end: 'moved',
          intro: 'changed',
          middle: 'unchanged',
          extra: 'added',
        });

        const named = yield* diffJson(root, '--base', 'main');
        expect(named.report.base).toBe('main');
        const unknown = yield* Effect.flip(
          runCaptured(['diff', 'demo', '--base', 'no-such-ref'], { root, deck: FAKES }),
        );
        expect(unknown.message).toContain('Git does not know "no-such-ref"');
        rmSync(root, { recursive: true, force: true });
      }),
  );

  it.effect('reports every slide as added when the ref has no such deck', () =>
    Effect.gen(function* () {
      const root = makeWorkspace();
      writeFileSync(path.join(root, 'README.md'), 'x\n');
      git(root, 'init', '-q', '-b', 'main');
      git(root, 'add', 'README.md');
      git(root, 'commit', '-q', '-m', 'no decks yet');
      const { report } = yield* diffJson(root);
      expect(report.counts).toMatchObject({ added: 3, unchanged: 0 });
      rmSync(root, { recursive: true, force: true });
    }),
  );
});
