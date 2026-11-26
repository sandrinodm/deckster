import { deckCommand } from '@deckster/engine/command';
import { KIT_SRC_DIR } from '@deckster/kit/eject-closure';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, PlatformError } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCaptured } from '#cli.fixture.ts';
import { contractRan, writeDataLayouts, writeMarkedLayout } from '#layouts/code-layouts.fixture.ts';
import { diffLayout } from '#layouts/eject/diff-layout.ts';
import { ejectLayouts } from '#layouts/eject/eject-layouts.ts';
import { EJECT_BRAND, ejectWorkspace } from '#layouts/eject/eject-workspace.fixture.ts';
import { Provenance, sha256 } from '#layouts/eject/provenance.ts';

/**
 * Room for the brand and the deck configs to load on a busy machine; no test here opens a browser.
 */
const TEST_TIMEOUT_MS = 120_000;

/**
 * A small deck of the repository, copied into the workspace for the deck cases and the listing.
 */
const DECK = 'hello';

/**
 * The brand every test ejects into.
 */
const OWNER = { kind: 'brand', name: EJECT_BRAND } as const;

/**
 * Runs a test body in a scratch workspace that is removed afterwards.
 *
 * @param body - The test, given the workspace root.
 */
function inWorkspace<A, E>(
  body: (root: string) => Effect.Effect<A, E, NodeServices.NodeServices>,
): Effect.Effect<A, E> {
  return Effect.suspend(() => {
    const root = ejectWorkspace('deck-eject-', [DECK]);
    return body(root).pipe(
      Effect.provide(NodeServices.layer),
      Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
    );
  });
}

/**
 * The brand's `layouts/` folder in a workspace.
 *
 * @param root - The workspace root.
 */
function layoutsDir(root: string): string {
  return path.join(root, 'brands', EJECT_BRAND, 'layouts');
}

/**
 * Every file under a folder, relative to it, sorted.
 *
 * @param dir - The folder.
 */
function filesUnder(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .toSorted();
}

/**
 * The message of the error an effect fails with.
 *
 * @param effect - An effect expected to fail.
 */
function failureMessage<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<string, never, R> {
  return effect.pipe(
    Effect.flip,
    Effect.map((error) => (error instanceof Error ? error.message : String(error))),
    Effect.orElseSucceed(() => 'the effect did not fail'),
  );
}

/**
 * Copies the kit's source to a temp folder and changes one file of the copy.
 *
 * @param file - A path under the kit's `src`.
 * @param change - Maps the file's text to its new text.
 * @returns The copy's `src` folder; the caller removes it.
 */
function changedKit(file: string, change: (text: string) => string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-eject-kit-'));
  fs.cpSync(KIT_SRC_DIR, dir, { recursive: true });
  const target = path.join(dir, file);
  fs.writeFileSync(target, change(fs.readFileSync(target, 'utf8')));
  return dir;
}

describe('ejectLayouts', () => {
  it.effect(
    'writes the layout, its helpers and what it started from',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const result = yield* ejectLayouts(root, OWNER, { names: ['quote'], keepShared: false });
          const dir = layoutsDir(root);
          expect(filesUnder(dir)).toEqual([
            '_shared/initials.ts',
            '_shared/portrait.css',
            '_shared/portrait.tsx',
            '_shared/quote-marks.ts',
            '_shared/slide-file.ts',
            'quote/.eject/_shared/initials.ts',
            'quote/.eject/_shared/portrait.css',
            'quote/.eject/_shared/portrait.tsx',
            'quote/.eject/_shared/quote-marks.ts',
            'quote/.eject/_shared/slide-file.ts',
            'quote/.eject/contract.ts',
            'quote/.eject/eject.json',
            'quote/.eject/layout.css',
            'quote/.eject/layout.tsx',
            'quote/.eject/limits.ts',
            'quote/contract.ts',
            'quote/layout.css',
            'quote/layout.tsx',
            'quote/limits.ts',
          ]);
          expect(result.layouts.map((layout) => layout.name)).toEqual(['quote']);
          expect(result.sharedWritten).toHaveLength(5);
          const record = Provenance.make(
            JSON.parse(fs.readFileSync(path.join(dir, 'quote/.eject/eject.json'), 'utf8')),
          );
          expect(record.layout).toBe('quote');
          expect(record.deckster).toMatch(/^\d+\.\d+\.\d+/u);
          expect(Object.keys(record.files).toSorted()).toEqual([
            '_shared/initials.ts',
            '_shared/portrait.css',
            '_shared/portrait.tsx',
            '_shared/quote-marks.ts',
            '_shared/slide-file.ts',
            'contract.ts',
            'layout.css',
            'layout.tsx',
            'limits.ts',
          ]);
          for (const [file, hash] of Object.entries(record.files)) {
            const written = file.startsWith('_shared/') ? file : `quote/${file}`;
            const text = fs.readFileSync(path.join(dir, written), 'utf8');
            expect(sha256(text), file).toBe(hash);
            expect(fs.readFileSync(path.join(dir, 'quote/.eject', file), 'utf8'), file).toBe(text);
          }
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'reuses a helper that is unchanged and refuses one that was edited, unless told to keep it',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          yield* ejectLayouts(root, OWNER, { names: ['quote'], keepShared: false });
          const second = yield* ejectLayouts(root, OWNER, { names: ['bio'], keepShared: false });
          const names = (files: readonly string[]): string[] =>
            files.map((file) => path.basename(file)).toSorted();
          expect(names(second.sharedReused)).toEqual([
            'initials.ts',
            'portrait.css',
            'portrait.tsx',
            'slide-file.ts',
          ]);
          expect(names(second.sharedWritten)).toEqual([
            'contact-list.css',
            'contact-list.tsx',
            'link-target.ts',
            'link.tsx',
          ]);

          const portrait = path.join(layoutsDir(root), '_shared/portrait.css');
          const edited = `${fs.readFileSync(portrait, 'utf8')}\n/* ours */\n`;
          fs.writeFileSync(portrait, edited);
          const refusal = yield* failureMessage(
            ejectLayouts(root, OWNER, { names: ['persona'], keepShared: false }),
          );
          expect(refusal).toContain(`brands/${EJECT_BRAND}/layouts/_shared/portrait.css differs`);
          expect(refusal).toContain('--keep-shared');
          expect(fs.existsSync(path.join(layoutsDir(root), 'persona'))).toBe(false);

          const kept = yield* ejectLayouts(root, OWNER, { names: ['persona'], keepShared: true });
          expect(names(kept.sharedKept)).toEqual(['portrait.css']);
          expect(fs.readFileSync(portrait, 'utf8')).toBe(edited);
          const pristine = path.join(layoutsDir(root), 'persona/.eject/_shared/portrait.css');
          expect(`${fs.readFileSync(pristine, 'utf8')}\n/* ours */\n`).toBe(edited);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'refuses names it cannot eject and writes nothing',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const eject = (names: readonly string[]) =>
            failureMessage(ejectLayouts(root, OWNER, { names, keepShared: false }));
          expect(yield* eject(['titel'])).toContain('Did you mean "title"?');
          expect(yield* eject(['brand'])).toContain("renderer of a brand's data layouts");
          expect(yield* eject(['../title'])).toContain('is not a layout name');
          expect(yield* eject(['title', 'no-such-layout'])).toContain('"no-such-layout"');
          expect(fs.existsSync(layoutsDir(root))).toBe(false);

          yield* ejectLayouts(root, OWNER, { names: ['title'], keepShared: false });
          const again = yield* eject(['stats', 'title']);
          expect(again).toContain(`brands/${EJECT_BRAND}/layouts/title/ already exists`);
          expect(again).toContain('layouts diff title --brand');
          expect(fs.existsSync(path.join(layoutsDir(root), 'stats'))).toBe(false);

          const framework = yield* failureMessage(
            ejectLayouts(
              root,
              { kind: 'brand', name: 'default' },
              {
                names: ['title'],
                keepShared: false,
              },
            ),
          );
          expect(framework).toContain('is not a folder of this workspace');
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'refuses a kit name a data layout of the brand has, even when the catalog leaves it out',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const marker = '__ejectFallbackContractRan';
          const brandDir = path.join(root, 'brands', EJECT_BRAND);
          writeMarkedLayout(layoutsDir(root), 'kpi-wall', marker);
          writeDataLayouts(brandDir, ['quote'], 'kpi-wall');
          const refusal = yield* failureMessage(
            ejectLayouts(root, OWNER, { names: ['quote'], keepShared: false }),
          );
          expect(refusal).toContain(`"quote" is a data layout of the ${EJECT_BRAND} brand`);
          expect(fs.existsSync(path.join(layoutsDir(root), 'quote'))).toBe(false);

          const result = yield* ejectLayouts(root, OWNER, { names: ['bio'], keepShared: false });
          expect(result.layouts.map((layout) => layout.name)).toEqual(['bio']);
          expect(contractRan(marker)).toBe(false);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    "ejects into a deck, and not what the deck's brand already replaces",
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const config = path.join(root, 'decks', DECK, 'deck.config.ts');
          fs.writeFileSync(
            config,
            fs.readFileSync(config, 'utf8').replace("brand: 'default'", `brand: '${EJECT_BRAND}'`),
          );
          const deck = { kind: 'deck', name: DECK } as const;
          const result = yield* ejectLayouts(root, deck, { names: ['stats'], keepShared: false });
          expect(result.layouts[0]?.dir).toBe(path.join(root, 'decks', DECK, 'layouts', 'stats'));
          expect(
            fs.existsSync(path.join(root, 'decks', DECK, 'layouts/stats/stat-cards.css')),
          ).toBe(true);

          yield* ejectLayouts(root, OWNER, { names: ['title'], keepShared: false });
          const clash = yield* failureMessage(
            ejectLayouts(root, deck, { names: ['title'], keepShared: false }),
          );
          expect(clash).toContain(`The ${EJECT_BRAND} brand already replaces "title"`);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'ejects every layout the brand does not have yet with all',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          yield* ejectLayouts(root, OWNER, { names: ['title'], keepShared: false });
          const result = yield* ejectLayouts(root, OWNER, { names: 'all', keepShared: false });
          expect(result.skipped).toEqual(['title']);
          expect(result.layouts).toHaveLength(63);
          const folders = fs
            .readdirSync(layoutsDir(root))
            .filter((name) => name !== '_shared')
            .toSorted();
          expect(folders).toHaveLength(64);
          const none = yield* ejectLayouts(root, OWNER, { names: 'all', keepShared: false });
          expect(none.layouts).toEqual([]);
          expect(none.skipped).toHaveLength(64);
        }),
      ),
    TEST_TIMEOUT_MS,
  );
});

describe('ejectLayouts on a workspace that is not as eject left it', () => {
  it.effect(
    'refuses a folder of the same name in another letter case and leaves it alone',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const mine = path.join(layoutsDir(root), 'Title');
          fs.mkdirSync(mine, { recursive: true });
          fs.writeFileSync(path.join(mine, 'layout.tsx'), '// mine\n');
          const refusal = yield* failureMessage(
            ejectLayouts(root, OWNER, { names: ['title'], keepShared: false }),
          );
          expect(refusal).toContain(`brands/${EJECT_BRAND}/layouts/Title/ already exists`);
          expect(fs.readFileSync(path.join(mine, 'layout.tsx'), 'utf8')).toBe('// mine\n');
          const all = yield* ejectLayouts(root, OWNER, { names: 'all', keepShared: false });
          expect(all.skipped).toEqual(['title']);
          expect(fs.readFileSync(path.join(mine, 'layout.tsx'), 'utf8')).toBe('// mine\n');
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'does not overwrite a shared helper it cannot read',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          if (process.getuid?.() === 0) {
            return;
          }

          yield* ejectLayouts(root, OWNER, { names: ['quote'], keepShared: false });
          const portrait = path.join(layoutsDir(root), '_shared/portrait.css');
          fs.writeFileSync(portrait, '/* mine */\n');
          fs.chmodSync(portrait, 0o200);
          const refusal = yield* failureMessage(
            ejectLayouts(root, OWNER, { names: ['persona'], keepShared: false }),
          );
          fs.chmodSync(portrait, 0o644);
          expect(refusal).toContain(`Could not read ${portrait}`);
          expect(fs.readFileSync(portrait, 'utf8')).toBe('/* mine */\n');
          expect(fs.existsSync(path.join(layoutsDir(root), 'persona'))).toBe(false);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'writes nothing through a linked layouts folder or a dangling linked helper',
    () =>
      inWorkspace((root) => {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-eject-outside-'));
        return Effect.gen(function* () {
          fs.symlinkSync(outside, layoutsDir(root));
          const linked = yield* failureMessage(
            ejectLayouts(root, OWNER, { names: ['quote'], keepShared: false }),
          );
          expect(linked).toContain(`brands/${EJECT_BRAND}/layouts is a link`);
          expect(fs.readdirSync(outside)).toEqual([]);

          fs.unlinkSync(layoutsDir(root));
          fs.mkdirSync(path.join(layoutsDir(root), '_shared'), { recursive: true });
          const target = path.join(outside, 'portrait.tsx');
          fs.symlinkSync(target, path.join(layoutsDir(root), '_shared/portrait.tsx'));
          const dangling = yield* failureMessage(
            ejectLayouts(root, OWNER, { names: ['quote'], keepShared: false }),
          );
          expect(dangling).toContain('_shared/portrait.tsx is a link');
          expect(fs.existsSync(target)).toBe(false);
          expect(fs.existsSync(path.join(layoutsDir(root), 'quote'))).toBe(false);
        }).pipe(
          Effect.ensuring(Effect.sync(() => fs.rmSync(outside, { recursive: true, force: true }))),
        );
      }),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'writes nothing when layouts/_shared is a file, and ejects once it is gone',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const shared = path.join(layoutsDir(root), '_shared');
          fs.mkdirSync(layoutsDir(root), { recursive: true });
          fs.writeFileSync(shared, 'not a folder\n');
          const refusal = yield* failureMessage(
            ejectLayouts(root, OWNER, { names: ['quote'], keepShared: false }),
          );
          expect(refusal).toContain('is a file where a folder belongs');
          expect(fs.readdirSync(layoutsDir(root))).toEqual(['_shared']);

          fs.rmSync(shared);
          const result = yield* ejectLayouts(root, OWNER, { names: ['quote'], keepShared: false });
          expect(result.layouts.map((layout) => layout.name)).toEqual(['quote']);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'removes what it wrote when a write fails midway, so the eject can be run again',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const contract = path.join(layoutsDir(root), 'quote', 'contract.ts');
          const failing = FileSystem.FileSystem.of({
            ...fileSystem,
            writeFileString: (file, data, options) =>
              file === contract
                ? Effect.fail(
                    PlatformError.systemError({
                      _tag: 'PermissionDenied',
                      module: 'FileSystem',
                      method: 'writeFileString',
                      pathOrDescriptor: file,
                    }),
                  )
                : fileSystem.writeFileString(file, data, options),
          });
          const refusal = yield* failureMessage(
            ejectLayouts(root, OWNER, { names: ['quote'], keepShared: false }).pipe(
              Effect.provideService(FileSystem.FileSystem, failing),
            ),
          );
          expect(refusal).toContain(`Could not create ${contract}`);
          expect(fs.existsSync(layoutsDir(root))).toBe(false);

          const result = yield* ejectLayouts(root, OWNER, { names: ['quote'], keepShared: false });
          expect(result.sharedWritten).toHaveLength(5);
          expect(fs.existsSync(contract)).toBe(true);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'ejects a layout once when its name is given twice',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const result = yield* ejectLayouts(root, OWNER, {
            names: ['quote', 'quote'],
            keepShared: false,
          });
          expect(result.layouts.map((layout) => layout.name)).toEqual(['quote']);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'leaves out the names a deck of the brand has a folder of with all, and names the deck',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          fs.mkdirSync(path.join(root, 'decks', DECK, 'layouts', 'title'), { recursive: true });
          const config = path.join(root, 'decks', DECK, 'deck.config.ts');
          fs.writeFileSync(
            config,
            fs.readFileSync(config, 'utf8').replace("brand: 'default'", `brand: '${EJECT_BRAND}'`),
          );
          const result = yield* ejectLayouts(root, OWNER, { names: 'all', keepShared: false });
          expect(result.skippedForDecks).toEqual([{ name: 'title', deck: DECK }]);
          expect(result.skipped).toEqual([]);
          expect(result.layouts).toHaveLength(63);
          expect(fs.existsSync(path.join(layoutsDir(root), 'title'))).toBe(false);
          const refusal = yield* failureMessage(
            ejectLayouts(root, OWNER, { names: ['title'], keepShared: false }),
          );
          expect(refusal).toContain(`decks/${DECK}/layouts/title/ is a layout of the ${DECK} deck`);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    "refuses a brand eject that would clash with a layout of one of the brand's decks",
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const deckLayout = path.join(root, 'decks', DECK, 'layouts', 'title');
          fs.mkdirSync(deckLayout, { recursive: true });
          const otherBrand = yield* ejectLayouts(root, OWNER, {
            names: ['title'],
            keepShared: false,
          });
          expect(otherBrand.layouts.map((layout) => layout.name)).toEqual(['title']);

          fs.rmSync(path.join(layoutsDir(root), 'title'), { recursive: true });
          const config = path.join(root, 'decks', DECK, 'deck.config.ts');
          fs.writeFileSync(
            config,
            fs.readFileSync(config, 'utf8').replace("brand: 'default'", `brand: '${EJECT_BRAND}'`),
          );
          const refusal = yield* failureMessage(
            ejectLayouts(root, OWNER, { names: ['title'], keepShared: false }),
          );
          expect(refusal).toContain(
            `decks/${DECK}/layouts/title/ is a layout of the ${DECK} deck, which is on the ` +
              `${EJECT_BRAND} brand`,
          );
          expect(fs.existsSync(path.join(layoutsDir(root), 'title'))).toBe(false);
        }),
      ),
    TEST_TIMEOUT_MS,
  );
});

describe('diffLayout', () => {
  it.effect(
    'finds no change against the kit it was ejected from',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          yield* ejectLayouts(root, OWNER, { names: ['bio'], keepShared: false });
          const layoutFile = path.join(layoutsDir(root), 'bio/layout.tsx');
          fs.writeFileSync(layoutFile, `${fs.readFileSync(layoutFile, 'utf8')}// my edit\n`);
          const diff = yield* diffLayout(root, OWNER, 'bio');
          expect(diff.changed).toBe(false);
          expect(diff.problems).toEqual([]);
          expect(diff.provenanceEdited).toEqual([]);
          expect(diff.files.map((file) => file.status)).toEqual(diff.files.map(() => 'unchanged'));
          expect(diff.files.map((file) => file.path)).toContain('_shared/portrait.tsx');
          expect(diff.dir).toBe(`brands/${EJECT_BRAND}/layouts/bio`);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'shows what the kit changed, added and no longer needs',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          yield* ejectLayouts(root, OWNER, { names: ['title'], keepShared: false });
          const srcDir = changedKit('layouts/title-layout.tsx', (text) =>
            text
              .replace('const TITLE_MAX_LINES = 3;', 'const TITLE_MAX_LINES = 4;')
              .replace("import '#layouts/image-scrim.css';\n", '')
              .replace(
                "import '#layouts/title-layout.css';",
                "import { initialsOf } from '#foundation/initials.ts';\nimport '#layouts/title-layout.css';",
              ),
          );
          const diff = yield* diffLayout(root, OWNER, 'title', { srcDir }).pipe(
            Effect.ensuring(Effect.sync(() => fs.rmSync(srcDir, { recursive: true, force: true }))),
          );
          expect(diff.changed).toBe(true);
          expect(diff.problems).toEqual([]);
          const status = Object.fromEntries(diff.files.map((file) => [file.path, file.status]));
          expect(status).toEqual({
            '_shared/initials.ts': 'added',
            'contract.ts': 'unchanged',
            'display-align.css': 'unchanged',
            'image-scrim.css': 'removed',
            'layout.css': 'unchanged',
            'layout.tsx': 'changed',
            'limits.ts': 'unchanged',
          });
          const patch = diff.files.find((file) => file.path === 'layout.tsx')?.diff ?? '';
          expect(patch).toContain(`--- brands/${EJECT_BRAND}/layouts/title/.eject/layout.tsx`);
          expect(patch).toContain('+++ kit/layout.tsx');
          expect(patch).toContain('-const TITLE_MAX_LINES = 3;\n+const TITLE_MAX_LINES = 4;');
          expect(patch).toContain("+import { initialsOf } from '../_shared/initials.ts';");
          expect(patch).toContain("-import './image-scrim.css';");
          const added = diff.files.find((file) => file.path === '_shared/initials.ts')?.diff ?? '';
          expect(added.startsWith('--- /dev/null\n+++ kit/_shared/initials.ts\n@@ -0,0 +1,')).toBe(
            true,
          );
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'says so when the kit adds a private import it cannot place, and when .eject was changed',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          yield* ejectLayouts(root, OWNER, { names: ['title'], keepShared: false });
          const provenance = path.join(layoutsDir(root), 'title/.eject');
          fs.writeFileSync(path.join(provenance, 'layout.css'), '/* changed */\n');
          fs.rmSync(path.join(provenance, 'limits.ts'));
          const srcDir = changedKit('layouts/title-layout.tsx', (text) =>
            text.replace(
              "import '#layouts/title-layout.css';",
              "import { MediaFrameContext } from '#media/media-frame.ts';\nimport '#layouts/title-layout.css';",
            ),
          );
          const diff = yield* diffLayout(root, OWNER, 'title', { srcDir }).pipe(
            Effect.ensuring(Effect.sync(() => fs.rmSync(srcDir, { recursive: true, force: true }))),
          );
          expect(diff.problems).toHaveLength(1);
          expect(diff.problems[0]).toContain('media/media-frame.ts keeps shared state');
          expect(diff.provenanceEdited).toEqual(['layout.css', 'limits.ts']);
          expect(diff.changed).toBe(true);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'fails for a layout that was not ejected',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          fs.mkdirSync(path.join(layoutsDir(root), 'mine'), { recursive: true });
          const message = yield* failureMessage(diffLayout(root, OWNER, 'mine'));
          expect(message).toContain(
            `brands/${EJECT_BRAND}/layouts/mine/.eject/eject.json is missing`,
          );
          expect(yield* failureMessage(diffLayout(root, OWNER, '../x'))).toContain(
            'is not a layout name',
          );
        }),
      ),
    TEST_TIMEOUT_MS,
  );
});

describe('deckster layouts eject and diff', () => {
  it.effect(
    'eject prints the files, lists the layout as a replacement, and diff reports no change',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const eject = yield* runCaptured(
            ['layouts', 'eject', 'title', '--brand', EJECT_BRAND, '--json'],
            { root },
          );
          expect(eject.code).toBe(0);
          const report = JSON.parse(eject.output) as {
            ok: boolean;
            brand: string;
            layouts: { name: string; dir: string; files: string[] }[];
            shared: { written: string[] };
            warnings: string[];
          };
          expect(report.ok).toBe(true);
          expect(report.brand).toBe(EJECT_BRAND);
          expect(report.layouts).toEqual([
            {
              name: 'title',
              dir: `brands/${EJECT_BRAND}/layouts/title`,
              files: [
                'layout.tsx',
                'contract.ts',
                'layout.css',
                'display-align.css',
                'image-scrim.css',
                'limits.ts',
              ].map((file) => `brands/${EJECT_BRAND}/layouts/title/${file}`),
            },
          ]);
          expect(report.warnings).toEqual([]);

          const plain = yield* runCaptured(['layouts', 'eject', 'quote', '--brand', EJECT_BRAND], {
            root,
          });
          expect(plain.code).toBe(0);
          expect(plain.output).toContain(`brands/${EJECT_BRAND}/layouts/quote/layout.tsx\n`);
          expect(plain.output).toContain(`brands/${EJECT_BRAND}/layouts/_shared/portrait.tsx\n`);
          expect(plain.output).toContain(
            'Next: slides on these layouts now render from the copies',
          );

          const listing = yield* runCaptured(['layouts', DECK, '--brand', EJECT_BRAND], { root });
          expect(listing.errors).toBe('');
          expect(listing.output).toContain(
            `title  (brand-code:${EJECT_BRAND})\n` +
              '  The cover of a deck: the deck title set large on the bottom line',
          );
          expect(listing.output).toContain("\n  replaces the kit's title\n");
          expect(listing.output).toContain("\n  replaces the kit's quote\n");

          const diff = yield* runCaptured(
            ['layouts', 'diff', 'title', '--brand', EJECT_BRAND, '--fail-on-change', '--json'],
            { root },
          );
          expect(diff.code).toBe(0);
          expect(JSON.parse(diff.output)).toMatchObject({
            ok: true,
            layout: 'title',
            changed: false,
            problems: [],
          });
          const text = yield* runCaptured(['layouts', 'diff', 'title', '--brand', EJECT_BRAND], {
            root,
          });
          expect(text.output).toContain("The kit's title is the same as when it was ejected");
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'diff exits with 1 under --fail-on-change when the starting point differs from the kit',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          yield* runCaptured(['layouts', 'eject', 'title', '--brand', EJECT_BRAND], { root });
          const css = path.join(layoutsDir(root), 'title/.eject/layout.css');
          fs.writeFileSync(
            css,
            fs.readFileSync(css, 'utf8').replace('.kit-cover-text', '.kit-old'),
          );
          const plain = yield* runCaptured(['layouts', 'diff', 'title', '--brand', EJECT_BRAND], {
            root,
          });
          expect(plain.code).toBe(0);
          expect(plain.output).toContain('-  .kit-old {\n+  .kit-cover-text {');
          expect(plain.errors).toContain('changed in 1 of 6 files');
          expect(plain.errors).toContain('title/.eject/layout.css is missing or was changed');
          const strict = yield* runCaptured(
            ['layouts', 'diff', 'title', '--brand', EJECT_BRAND, '--fail-on-change'],
            { root },
          );
          expect(strict.code).toBe(1);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'rejects --all with names or a deck, and subcommand flags on the listing',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const run = (argv: readonly string[]) =>
            failureMessage(runCaptured(['layouts', ...argv], { root }));
          expect(yield* run(['eject', 'title', '--all', '--brand', EJECT_BRAND])).toContain(
            'not both',
          );
          expect(yield* run(['eject', '--brand', EJECT_BRAND])).toContain('Name the kit layouts');
          expect(yield* run(['eject', '--all', '--deck', DECK])).toContain(
            '--all ejects every kit layout into a brand',
          );
          expect(yield* run(['eject', 'title'])).toContain('pass --brand <brand> or --deck <deck>');
          expect(yield* run(['diff', '--brand', EJECT_BRAND])).toContain('Name one ejected layout');
          expect(yield* run([DECK, '--all'])).toContain(
            `--all is for \`${deckCommand()} layouts eject\``,
          );
        }),
      ),
    TEST_TIMEOUT_MS,
  );
});
