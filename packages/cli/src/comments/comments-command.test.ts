import type { AgentComment, CommentReport } from '@deckster/comments/node';

import { NodeServices } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Context, Effect, FileSystem, Layer } from 'effect';
import path from 'node:path';

import { runCaptured } from '#cli.fixture.ts';
import { FIXTURE_WORKSPACE } from '#lint/lint.fixtures.ts';

/**
 * Scratch workspaces live inside this package so `@deckster/engine` resolves from them.
 */
const SCRATCH_ROOT = path.resolve(import.meta.dirname, '../../.tmp-workspaces');

/**
 * A scratch workspace with a copy of the over-budget fixture deck as `decks/review`, shared by the
 * tests in this file and removed after the last one.
 */
class Scratch extends Context.Service<Scratch, { readonly root: string }>()(
  'test/CommentsScratch',
) {
  static readonly layer = Layer.effect(
    Scratch,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(SCRATCH_ROOT, { recursive: true });
      const root = yield* fs.makeTempDirectoryScoped({
        directory: SCRATCH_ROOT,
        prefix: 'comments-',
      });
      yield* fs.copy(
        path.join(FIXTURE_WORKSPACE, 'decks/over-budget'),
        path.join(root, 'decks/review'),
      );
      return Scratch.of({ root });
    }),
  );
}

/**
 * Runs `deck comments ...` in the scratch workspace and returns what it printed.
 */
const comments = Effect.fn('comments')(function* (argv: string[]) {
  const { root } = yield* Scratch;
  return yield* runCaptured(['comments', ...argv], { root });
});

/**
 * Runs a `--json` form and parses what it printed.
 */
const json = Effect.fn('commentsJson')(function* <A>(argv: string[]) {
  const { output } = yield* comments([...argv, '--json']);
  return JSON.parse(output) as A;
});

layer(Scratch.layer.pipe(Layer.provideMerge(NodeServices.layer)))('deck comments', (it) => {
  it.effect('adds a comment on a line and lists it with where to edit', () =>
    Effect.gen(function* () {
      const added = yield* json<{ ok: boolean; comment: AgentComment }>([
        'add',
        'review',
        'eight-bullets',
        '--text',
        'Cut this list to four bullets.',
        '--line',
        '7',
        '--type',
        'fix',
      ]);
      expect(added).toMatchObject({
        ok: true,
        comment: {
          target: 'line',
          type: 'fix',
          location: 'decks/review/slides/eight-bullets.mdx:7:1',
          anchor: { status: 'ok' },
          excerpt: {
            startLine: 4,
            lines: ['', '## Eight bullets', '', '- One', '- Two', '- Three', '- Four'],
          },
        },
      });
      const report = yield* json<CommentReport>(['review']);
      expect(report.counts).toEqual({ open: 1, resolved: 0 });
      expect(report.comments.map((comment) => comment.id)).toEqual([added.comment.id]);
      const { output } = yield* comments(['review']);
      expect(output).toContain('review: 1 open, 0 resolved');
      expect(output).toContain(
        `#1 ${added.comment.id}  open fix  decks/review/slides/eight-bullets.mdx:7:1  (anchor ok, step 0)`,
      );
    }),
  );

  it.effect('resolves with a note, filters by status and reopens', () =>
    Effect.gen(function* () {
      const { comment } = yield* json<{ comment: AgentComment }>([
        'add',
        'review',
        'eight-bullets',
        '--text',
        'Whole-slide note',
      ]);
      expect(comment).toMatchObject({
        target: 'slide',
        line: null,
        location: 'decks/review/slides/eight-bullets.mdx',
      });
      const resolved = yield* json<{ comment: AgentComment }>([
        'resolve',
        'review',
        comment.id,
        '--note',
        'Done',
      ]);
      expect(resolved.comment).toMatchObject({ status: 'resolved', resolution: { note: 'Done' } });
      const open = yield* json<CommentReport>(['review', '--open']);
      expect(open.comments.map((entry) => entry.id)).not.toContain(comment.id);
      const done = yield* json<CommentReport>(['review', '--resolved', '--slide', 'eight-bullets']);
      expect(done.comments.map((entry) => entry.id)).toEqual([comment.id]);
      const again = yield* json<{ changed: boolean; comment: AgentComment }>([
        'resolve',
        'review',
        comment.id,
        '--note',
        'Overwritten?',
      ]);
      expect(again).toMatchObject({ changed: false, comment: { resolution: { note: 'Done' } } });
      const reopened = yield* comments(['reopen', 'review', comment.id]);
      expect(reopened.output).toBe(
        `Reopened ${comment.id} (decks/review/slides/eight-bullets.mdx)`,
      );
      const reopenedAgain = yield* comments(['reopen', 'review', comment.id]);
      expect(reopenedAgain.output).toBe(
        `${comment.id} is already open; nothing changed (decks/review/slides/eight-bullets.mdx).`,
      );
    }),
  );

  it.effect('reports a moved anchor after the slide is edited', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { root } = yield* Scratch;
      const { comment } = yield* json<{ comment: AgentComment }>([
        'add',
        'review',
        'eight-bullets',
        '--text',
        'Say why five matters',
        '--line',
        '11',
      ]);
      const file = path.join(root, 'decks/review/slides/eight-bullets.mdx');
      const source = yield* fs.readFileString(file);
      yield* fs.writeFileString(
        file,
        source.replace('## Eight bullets\n', '## Eight bullets\n\nA new intro line.\n'),
      );
      const report = yield* json<CommentReport>(['review']);
      expect(report.comments.find((entry) => entry.id === comment.id)).toMatchObject({
        line: 13,
        anchor: { status: 'moved', originalLine: 11 },
      });
    }),
  );

  it.effect('prunes comments of removed slides and explains bad arguments', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { root } = yield* Scratch;
      const feedback = path.join(root, 'decks/review/.feedback');
      yield* fs.writeFileString(
        path.join(feedback, 'gone.json'),
        `${JSON.stringify({ version: 1, slide: 'gone', comments: [] }, null, 2)}\n`,
      );
      const pruned = yield* json<{ removed: { slide: string }[] }>(['prune', 'review']);
      expect(pruned.removed).toEqual([{ slide: 'gone', comments: 0 }]);
      expect(yield* fs.exists(path.join(feedback, 'gone.json'))).toBe(false);
      const unknown = yield* json<{ ok: boolean; error: { message: string } }>([
        'resolve',
        'review',
        'zzzzzzzz',
      ]);
      expect(unknown).toMatchObject({ ok: false, error: { type: 'CliError' } });
      expect(unknown.error.message).toContain('No comment has the id "zzzzzzzz"');
      const badType = yield* Effect.flip(
        comments(['add', 'review', 'eight-bullets', '--text', 'x', '--type', 'bug']),
      );
      expect(badType.message).toContain('--type must be one of fix, question, idea');
      const twoFlags = yield* Effect.flip(comments(['review', '--open', '--all']));
      expect(twoFlags.message).toContain('Pass one of --open, --resolved and --all.');
      const noSlide = yield* Effect.flip(comments(['review', '--slide', 'nope']));
      expect(noSlide.message).toContain('"nope" is not a slide of review. Pass one of:');
      expect(noSlide.message).toContain('eight-bullets');
    }),
  );

  it.effect('shows --json in the usage of every form that prints JSON', () =>
    Effect.gen(function* () {
      const { output } = yield* comments(['add', '--help']);
      const usage = output.slice(0, output.indexOf('\n\n'));
      const forms = usage.split(/\n(?=\s*deck comments)/);
      expect(forms).toHaveLength(5);
      for (const form of forms) {
        expect(form).toContain('[--json]');
      }
    }),
  );
});
