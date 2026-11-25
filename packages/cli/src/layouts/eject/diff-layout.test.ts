import { LIMIT_CASES } from '@deckster/kit/limit-cases';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';

import type { LayoutsOwner } from '#layouts/layouts-owner.ts';

import { diffLayout } from '#layouts/eject/diff-layout.ts';
import { ejectLayouts } from '#layouts/eject/eject-layouts.ts';
import { readEjectSource, transformLayout } from '#layouts/eject/eject-transform.ts';
import { EJECT_BRAND, ejectWorkspace } from '#layouts/eject/eject-workspace.fixture.ts';
import { provenanceFiles, sha256 } from '#layouts/eject/provenance.ts';

/**
 * Room for the brand and the deck configs to load on a busy machine; no test here opens a browser.
 */
const TEST_TIMEOUT_MS = 120_000;

/**
 * A small deck of the repository, copied into the workspace for the deck case.
 */
const DECK = 'hello';

/**
 * The brand the brand cases use.
 */
const BRAND: LayoutsOwner = { kind: 'brand', name: EJECT_BRAND };

/**
 * Runs a test body in a scratch workspace that is removed afterwards.
 *
 * @param body - The test, given the workspace root.
 */
function inWorkspace<A, E>(
  body: (root: string) => Effect.Effect<A, E, NodeServices.NodeServices>,
): Effect.Effect<A, E> {
  return Effect.suspend(() => {
    const root = ejectWorkspace('deck-diff-', [DECK]);
    return body(root).pipe(
      Effect.provide(NodeServices.layer),
      Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
    );
  });
}

/**
 * Writes the files of a provenance folder into a layout folder.
 *
 * @param layoutDir - The layout folder.
 * @param files - The folder's files by path relative to `.eject/`.
 */
function writeProvenance(layoutDir: string, files: Readonly<Record<string, string>>): void {
  for (const [file, text] of Object.entries(files)) {
    const target = path.join(layoutDir, '.eject', ...file.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
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

describe('diffLayout', () => {
  it.effect(
    "compares a deck's eject with the deck's class prefix",
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const ejected = transformLayout(
            readEjectSource(),
            'bio',
            LIMIT_CASES['bio'] ?? [],
            'deck',
          );
          writeProvenance(
            path.join(root, 'decks', DECK, 'layouts/bio'),
            provenanceFiles(ejected, '0'),
          );
          const diff = yield* diffLayout(root, { kind: 'deck', name: DECK }, 'bio');
          expect(diff.problems).toEqual([]);
          expect(diff.provenanceEdited).toEqual([]);
          expect(diff.changed).toBe(false);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    "ejects into a deck with the deck's class prefix and then finds no change",
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const deck: LayoutsOwner = { kind: 'deck', name: DECK };
          yield* ejectLayouts(root, deck, { names: ['bio'], keepShared: false });
          const shared = path.join(root, 'decks', DECK, 'layouts/_shared/contact-list.css');
          expect(fs.readFileSync(shared, 'utf8')).toContain('.dck-contacts {');
          const diff = yield* diffLayout(root, deck, 'bio');
          expect(diff.changed).toBe(false);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'refuses a record that names another layout than its folder',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const ejected = transformLayout(readEjectSource(), 'bio', LIMIT_CASES['bio'] ?? []);
          const layoutDir = path.join(root, 'brands', EJECT_BRAND, 'layouts/quote');
          writeProvenance(layoutDir, provenanceFiles(ejected, '0'));
          const message = yield* failureMessage(diffLayout(root, BRAND, 'quote'));
          expect(message).toContain('records the layout "bio", not "quote"');
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'reports a folder named like an object property as not a kit layout instead of crashing',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const record = {
            layout: 'constructor',
            deckster: '0',
            files: { constructor: sha256('x\n') },
          };
          const layoutDir = path.join(root, 'brands', EJECT_BRAND, 'layouts/constructor');
          writeProvenance(layoutDir, { 'eject.json': JSON.stringify(record), constructor: 'x\n' });
          const diff = yield* diffLayout(root, BRAND, 'constructor');
          expect(diff.problems).toEqual(['"constructor" is not a layout of the kit\'s catalog.']);
          expect(diff.files).toEqual([
            expect.objectContaining({ path: 'constructor', status: 'removed' }),
          ]);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.effect(
    'refuses a layout folder that is a link and a layouts folder that is a link',
    () =>
      inWorkspace((root) =>
        Effect.gen(function* () {
          const ejected = transformLayout(readEjectSource(), 'bio', LIMIT_CASES['bio'] ?? []);
          const brandDir = path.join(root, 'brands', EJECT_BRAND);
          const moved = path.join(root, 'moved-bio');
          writeProvenance(moved, provenanceFiles(ejected, '0'));
          fs.mkdirSync(path.join(brandDir, 'layouts'), { recursive: true });
          fs.symlinkSync(moved, path.join(brandDir, 'layouts/bio'));
          const layoutLinked = yield* failureMessage(diffLayout(root, BRAND, 'bio'));
          expect(layoutLinked).toContain(`brands/${EJECT_BRAND}/layouts/bio is a link`);
          expect(layoutLinked).toContain('does not read layouts through a link');
          fs.rmSync(path.join(brandDir, 'layouts'), { recursive: true });
          const moreLayouts = path.join(root, 'moved-layouts');
          writeProvenance(path.join(moreLayouts, 'bio'), provenanceFiles(ejected, '0'));
          fs.symlinkSync(moreLayouts, path.join(brandDir, 'layouts'));
          const layoutsLinked = yield* failureMessage(diffLayout(root, BRAND, 'bio'));
          expect(layoutsLinked).toContain(`brands/${EJECT_BRAND}/layouts is a link`);
        }),
      ),
    TEST_TIMEOUT_MS,
  );
});
