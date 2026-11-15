import {
  beginTurnGuard,
  resetCodeGate,
  resetTurnGuards,
  writeDeckManifest,
} from '@deckster/brand/node';
import { NodeFileSystem } from '@effect/platform-node';
import { afterEach, expect, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import { createHash } from 'node:crypto';
import { chmodSync, statSync, symlinkSync } from 'node:fs';
import path from 'node:path';

import { makeTurnJournal, UNDO_SIZE_LIMIT_BYTES } from '#journal/turn-journal.ts';

/**
 * Writes files under a root, making folders as needed.
 *
 * @param root - The root.
 * @param files - Contents by relative path.
 */
const writeFiles = (root: string, files: Record<string, string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    for (const [file, content] of Object.entries(files)) {
      const absolute = path.join(root, file);
      yield* fs.makeDirectory(path.dirname(absolute), { recursive: true });
      yield* fs.writeFileString(absolute, content);
    }
  });

/**
 * A scratch workspace with a deck, its journal, and a turn runner that settles each turn through
 * the turn guard and records what it kept.
 *
 * @param options - Retention, and a failure point for restores.
 */
const setup = (options: { readonly retention?: number } = {}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped();
    yield* writeFiles(root, {
      'decks/hello/deck.config.ts': 'export default {};\n',
      'decks/hello/slides/title.mdx': '# Hello\n',
      'decks/hello/slides/steps.mdx': '# Steps\n',
    });
    const agentDir = path.join(root, '.deck/agent/hello');
    /**
     * Opens the journal of the workspace, again when called again.
     *
     * @param failAfterRenames - Fails a restore after this many renames.
     */
    const open = (failAfterRenames?: number) =>
      makeTurnJournal({
        root,
        agentDir,
        deck: 'hello',
        ...(options.retention === undefined ? {} : { retention: options.retention }),
        ...(failAfterRenames === undefined ? {} : { failAfterRenames }),
      });
    const journal = yield* open();
    /**
     * Runs one guarded turn that writes some files in its working copy (paths given as the deck's)
     * and records what the guard brought into the deck.
     *
     * @param turn - The turn number.
     * @param files - What the turn writes.
     */
    const runTurn = (turn: number, files: Record<string, string>) =>
      Effect.gen(function* () {
        const guard = yield* beginTurnGuard({ workspaceRoot: root, deck: 'hello' }, turn);
        yield* writeFiles(
          guard.staging.absolute,
          Object.fromEntries(
            Object.entries(files).map(([file, text]) => [file.replace('decks/hello/', ''), text]),
          ),
        );
        const outcome = yield* guard.settle;
        return yield* journal.record(turn, outcome.kept);
      });
    /**
     * Reads a file of the workspace.
     *
     * @param file - The path relative to the root.
     */
    const read = (file: string) => fs.readFileString(path.join(root, file));
    return { root, journal, open, runTurn, read };
  });

afterEach(() => {
  resetTurnGuards();
  resetCodeGate();
});

layer(NodeFileSystem.layer)('the turn journal', (it) => {
  it.effect('records the content a turn kept, undoes and redoes it', () =>
    Effect.gen(function* () {
      const { journal, runTurn, read, root } = yield* setup();
      const changed = yield* runTurn(1, {
        'decks/hello/slides/title.mdx': '# Changed\n',
        'decks/hello/slides/new.mdx': '# New\n',
        'decks/hello/notes.ts': 'export {};\n',
      });
      const fs = yield* FileSystem.FileSystem;
      expect(yield* fs.exists(path.join(root, 'decks/hello/notes.ts'))).toBe(false);
      expect(changed).toEqual([
        { path: 'decks/hello/slides/new.mdx', kind: 'add' },
        { path: 'decks/hello/slides/title.mdx', kind: 'update' },
      ]);
      const undone = yield* journal.undo;
      expect(undone.target).toBe(1);
      expect(yield* read('decks/hello/slides/title.mdx')).toBe('# Hello\n');
      yield* journal.redo;
      expect(yield* read('decks/hello/slides/title.mdx')).toBe('# Changed\n');
      expect(yield* read('decks/hello/slides/new.mdx')).toBe('# New\n');
    }),
  );

  it.effect('undo and redo keep each side’s file mode', () =>
    Effect.gen(function* () {
      const { root, journal, runTurn, read } = yield* setup();
      const slide = path.join(root, 'decks/hello/slides/title.mdx');
      chmodSync(slide, 0o600);
      yield* runTurn(1, {
        'decks/hello/slides/title.mdx': '# Changed\n',
        'decks/hello/slides/new.mdx': '# New\n',
      });
      expect(statSync(slide).mode & 0o777).toBe(0o600);
      expect(statSync(path.join(root, 'decks/hello/slides/new.mdx')).mode & 0o777).toBe(0o644);
      chmodSync(slide, 0o640);
      yield* journal.undo;
      expect(yield* read('decks/hello/slides/title.mdx')).toBe('# Hello\n');
      expect(statSync(slide).mode & 0o777).toBe(0o600);
      yield* journal.redo;
      expect(statSync(slide).mode & 0o777).toBe(0o600);
    }),
  );

  it.effect(
    'never installs a forged image: wrong bytes, a code config, a path that is not content',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root, journal, runTurn, read } = yield* setup();
        yield* runTurn(1, { 'decks/hello/slides/title.mdx': '# Changed\n' });
        const turnDir = path.join(root, '.deck/agent/hello/turns/1');
        const image = path.join(turnDir, 'before/decks/hello/slides/title.mdx');
        yield* fs.writeFileString(image, '# Forged\n');
        const wrongBytes = yield* Effect.flip(journal.undo);
        expect(wrongBytes.message).toContain('does not have the recorded hash');
        expect(yield* read('decks/hello/slides/title.mdx')).toBe('# Changed\n');

        const code = "import fs from 'node:fs';\nexport default {};\n";
        const codeHash = createHash('sha256').update(code).digest('hex');
        const configHash = createHash('sha256').update('export default {};\n').digest('hex');
        const index = path.join(root, '.deck/agent/hello/turns/index.json');
        const forged = (target: string) =>
          JSON.stringify({
            version: 2,
            entries: [
              {
                turn: 2,
                at: '2026-11-14T00:00:00.000Z',
                undone: true,
                files: [{ path: target, kind: 'update', before: configHash, after: codeHash }],
              },
            ],
          });
        for (const [target, reason] of [
          ['decks/hello/deck.config.ts', 'not a data-only deck config'],
          ['decks/hello/styles.css', 'not a content file'],
        ] as const) {
          yield* writeFiles(path.join(root, '.deck/agent/hello/turns/2/after'), { [target]: code });
          yield* fs.writeFileString(index, forged(target));
          const reopened = yield* makeTurnJournal({
            root,
            agentDir: path.join(root, '.deck/agent/hello'),
            deck: 'hello',
          });
          const error = yield* Effect.flip(reopened.redo);
          expect(error.message).toContain(reason);
        }

        expect(yield* read('decks/hello/deck.config.ts')).toBe('export default {};\n');
        expect(yield* fs.exists(path.join(root, 'decks/hello/styles.css'))).toBe(false);
      }),
  );

  it.effect('refuses to undo over a later change and names the file', () =>
    Effect.gen(function* () {
      const { journal, runTurn, root } = yield* setup();
      yield* runTurn(1, { 'decks/hello/slides/title.mdx': '# Changed\n' });
      yield* writeFiles(root, { 'decks/hello/slides/title.mdx': '# Mine\n' });
      const error = yield* Effect.flip(journal.undo);
      expect(error.message).toContain('decks/hello/slides/title.mdx changed after turn 1');
    }),
  );

  it.effect('undoes turns newest first, and a new turn drops what was undone', () =>
    Effect.gen(function* () {
      const { journal, runTurn, read } = yield* setup();
      yield* runTurn(1, { 'decks/hello/slides/title.mdx': '# One\n' });
      yield* runTurn(2, { 'decks/hello/slides/title.mdx': '# Two\n' });
      expect((yield* journal.undo).target).toBe(2);
      expect(yield* read('decks/hello/slides/title.mdx')).toBe('# One\n');
      yield* runTurn(3, { 'decks/hello/slides/steps.mdx': '# Three\n' });
      expect(yield* journal.targets).toEqual({ undo: 3, redo: null });
    }),
  );

  it.effect('keeps the last turns only', () =>
    Effect.gen(function* () {
      const { journal, runTurn } = yield* setup({ retention: 2 });
      for (const turn of [1, 2, 3]) {
        yield* runTurn(turn, { 'decks/hello/slides/title.mdx': `# ${turn}\n` });
      }

      expect(yield* journal.lastTurn).toBe(3);
      expect((yield* journal.undo).target).toBe(3);
      expect((yield* journal.undo).target).toBe(2);
      expect((yield* Effect.flip(journal.undo)).message).toContain('no agent turn to undo');
    }),
  );

  it.effect('diffs a recorded turn', () =>
    Effect.gen(function* () {
      const { journal, runTurn } = yield* setup();
      yield* runTurn(1, { 'decks/hello/slides/title.mdx': '# Changed\n' });
      const [file] = yield* journal.diff(1);
      expect(file).toMatchObject({ path: 'decks/hello/slides/title.mdx', added: 1, removed: 1 });
      expect((yield* Effect.flip(journal.diff(9))).message).toContain(
        'Turn 9 is not in the journal',
      );
    }),
  );

  it.effect('refuses to restore through a slides folder replaced by a link', () =>
    Effect.gen(function* () {
      const { journal, runTurn, root } = yield* setup();
      const fs = yield* FileSystem.FileSystem;
      const outside = yield* fs.makeTempDirectoryScoped();
      yield* runTurn(1, { 'decks/hello/slides/title.mdx': '# Changed\n' });
      yield* fs.remove(path.join(root, 'decks/hello/slides'), { recursive: true });
      symlinkSync(outside, path.join(root, 'decks/hello/slides'));
      const error = yield* Effect.flip(journal.undo);
      expect(error.message).toContain("outside the deck's content");
      expect(yield* fs.readDirectory(outside)).toEqual([]);
    }),
  );

  it.effect('leaves a file too large to keep alone on undo', () =>
    Effect.gen(function* () {
      const { journal, runTurn, read } = yield* setup();
      const big = 'x'.repeat(UNDO_SIZE_LIMIT_BYTES + 1);
      const changed = yield* runTurn(1, {
        'decks/hello/assets/big.json': big,
        'decks/hello/slides/title.mdx': '# Changed\n',
      });
      expect(changed).toContainEqual({
        path: 'decks/hello/assets/big.json',
        kind: 'add',
        undoable: false,
      });
      const undone = yield* journal.undo;
      expect(undone.skipped?.map((file) => file.path)).toEqual(['decks/hello/assets/big.json']);
      expect((yield* read('decks/hello/assets/big.json')).length).toBe(big.length);
    }),
  );

  it.effect('finishes an undo that crashed between renames when the journal opens again', () =>
    Effect.gen(function* () {
      const { open, runTurn, read } = yield* setup();
      yield* runTurn(1, {
        'decks/hello/slides/title.mdx': '# Changed\n',
        'decks/hello/slides/steps.mdx': '# Steps changed\n',
      });
      const crashing = yield* open(1);
      yield* Effect.flip(crashing.undo);
      const reopened = yield* open();
      expect(yield* read('decks/hello/slides/title.mdx')).toBe('# Hello\n');
      expect(yield* read('decks/hello/slides/steps.mdx')).toBe('# Steps\n');
      expect(yield* reopened.targets).toEqual({ undo: null, redo: 1 });
    }),
  );

  it.effect('crash recovery never renames a staged file over an edit made after the crash', () =>
    Effect.gen(function* () {
      const { open, runTurn, read, root } = yield* setup();
      yield* runTurn(1, {
        'decks/hello/slides/steps.mdx': '# Steps changed\n',
        'decks/hello/slides/title.mdx': '# Changed\n',
      });
      const crashing = yield* open(1);
      yield* Effect.flip(crashing.undo);
      // The person edits the file the crashed undo had not reached yet.
      yield* writeFiles(root, { 'decks/hello/slides/title.mdx': '# Mine, after the crash\n' });
      yield* open();
      expect(yield* read('decks/hello/slides/title.mdx')).toBe('# Mine, after the crash\n');
      const fs = yield* FileSystem.FileSystem;
      const leftovers = (yield* fs.readDirectory(path.join(root, 'decks/hello/slides'))).filter(
        (name) => name.endsWith('.deck-tmp'),
      );
      expect(leftovers).toEqual([]);
    }),
  );

  it.effect('records the slide-list edit the deck tools made, and undoes it', () =>
    Effect.gen(function* () {
      const { root, journal, read } = yield* setup();
      const guard = yield* beginTurnGuard({ workspaceRoot: root, deck: 'hello' }, 1);
      yield* writeDeckManifest(root, 'hello', (text) => Effect.succeed(`${text}// edited\n`));
      const changed = yield* journal.record(1, (yield* guard.settle).kept);
      expect(changed).toEqual([{ path: 'decks/hello/deck.config.ts', kind: 'update' }]);
      yield* journal.undo;
      expect(yield* read('decks/hello/deck.config.ts')).toBe('export default {};\n');
    }),
  );
});
