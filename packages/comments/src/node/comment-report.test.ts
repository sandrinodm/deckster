import { NodeFileSystem } from '@effect/platform-node';
import { expect, it, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { commentMarkdown } from '#model/agent-markdown.ts';
import { changeComment, saveNewComment } from '#node/comment-actions.ts';
import { buildCommentReport, openCommentCounts, openCountsBySlide } from '#node/comment-report.ts';
import { makeTestDeck, newComment, TEST_SLIDES } from '#node/deck.fixture.ts';

layer(NodeFileSystem.layer)('the comment report', (it) => {
  it.effect('tells an agent where to edit, with the source around it and the screenshot', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root, deck } = yield* makeTestDeck();
        const saved = yield* saveNewComment(deck, newComment(), 'Ada');
        const shot = path.join(deck.dir, '.feedback', 'intro', `${saved.id}.png`);
        yield* fs.makeDirectory(path.dirname(shot), { recursive: true });
        yield* fs.writeFileString(shot, 'png');
        const report = yield* buildCommentReport(root, deck, { status: 'open' });
        expect(report).toMatchObject({
          deck: 'test',
          deckDir: 'decks/test',
          counts: { open: 1, resolved: 0 },
        });
        expect(report.comments[0]).toMatchObject({
          id: saved.id,
          number: 1,
          slide: 'intro',
          slideNumber: 1,
          location: 'decks/test/slides/intro.mdx:5:1',
          file: 'decks/test/slides/intro.mdx',
          line: 5,
          anchor: {
            status: 'ok',
            originalLine: 5,
            stamp: 'slides/intro.mdx:5:1',
            element: { tag: 'h1' },
          },
          excerpt: {
            startLine: 2,
            lines: [
              'title: Hello, deck',
              '---',
              '',
              '# Hello, deck',
              '',
              'A code-first slide system.',
              '',
            ],
          },
          screenshot: `decks/test/.feedback/intro/${saved.id}.png`,
          hash: '#/1/0',
        });
      }),
    ),
  );

  it.effect('follows a moved element and flags one that is gone', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root, deck } = yield* makeTestDeck();
        yield* saveNewComment(deck, newComment(), 'Ada');
        const file = path.join(deck.dir, 'slides', 'intro.mdx');
        yield* fs.writeFileString(file, `import x from './x.ts';\n\n${TEST_SLIDES['intro'] ?? ''}`);
        const moved = (yield* buildCommentReport(root, deck, { status: 'all' })).comments[0];
        expect(moved).toMatchObject({
          line: 7,
          location: 'decks/test/slides/intro.mdx:7:1',
          anchor: { status: 'moved', originalLine: 5 },
        });
        yield* fs.writeFileString(file, '# Something else entirely');
        const lost = (yield* buildCommentReport(root, deck, { status: 'all' })).comments[0];
        expect(lost).toMatchObject({
          line: null,
          column: null,
          location: 'decks/test/slides/intro.mdx',
          anchor: { status: 'lost', originalLine: 5 },
          excerpt: { startLine: 1, lines: ['# Something else entirely'] },
        });
      }),
    ),
  );

  it.effect('guesses the line of a reworded element for a second comment on it', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root, deck } = yield* makeTestDeck();
        const onTitle = newComment({
          slide: 'steps',
          source: { file: 'slides/steps.mdx', line: 1, column: 1 },
          anchor: {
            stamp: 'slides/steps.mdx:1:1',
            cssPath: 'h2',
            tag: 'h2',
            text: 'How steps work',
          },
        });
        const first = yield* saveNewComment(deck, { ...onTitle, text: 'Say it plainer.' }, 'Ada');
        const second = yield* saveNewComment(deck, { ...onTitle, text: 'Add a subtitle.' }, 'Ada');
        const file = path.join(deck.dir, 'slides', 'steps.mdx');
        const reworded = (TEST_SLIDES['steps'] ?? '').replace(
          '## How steps work',
          '## How steps really work',
        );
        yield* fs.writeFileString(file, `import x from './x.ts';\n\n${reworded}`);
        yield* changeComment(deck, {
          action: 'resolve',
          id: first.id,
          note: 'Reworded',
          by: 'Ada',
        });
        const report = yield* buildCommentReport(root, deck, { status: 'open' });
        expect(report.comments).toHaveLength(1);
        expect(report.comments[0]).toMatchObject({
          id: second.id,
          line: 3,
          location: 'decks/test/slides/steps.mdx:3:1',
          anchor: { status: 'guessed', originalLine: 1 },
          excerpt: { startLine: 1 },
        });
        expect(report.units).toEqual({ box: 'canvas-px', canvasWidth: 1920, canvasHeight: 1080 });
      }),
    ),
  );

  it.effect('finds the line of an element only the layout renders by its text', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { root, deck } = yield* makeTestDeck();
        yield* saveNewComment(
          deck,
          newComment({
            source: null,
            anchor: { stamp: null, cssPath: 'header > h1', tag: 'h1', text: 'Hello, deck' },
          }),
          'Ada',
        );
        const [comment] = (yield* buildCommentReport(root, deck, { status: 'open' })).comments;
        expect(comment).toMatchObject({
          line: 2,
          column: 1,
          anchor: { status: 'ok', stamp: null },
        });
      }),
    ),
  );

  it.effect('lists slide comments by slide, filters, and counts open ones for lint', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { root, deck } = yield* makeTestDeck();
        yield* saveNewComment(
          deck,
          newComment({ slide: 'steps', source: null, anchor: null, target: 'slide', box: null }),
          'Ada',
        );
        yield* saveNewComment(deck, newComment(), 'Ada');
        const report = yield* buildCommentReport(root, deck, { status: 'all' });
        expect(report.comments.map((comment) => comment.slide)).toEqual(['intro', 'steps']);
        expect(report.comments[1]).toMatchObject({
          location: 'decks/test/slides/steps.mdx',
          line: null,
          anchor: { status: 'none', element: null },
          excerpt: { startLine: 1 },
        });
        const steps = yield* buildCommentReport(root, deck, { status: 'open', slide: 'steps' });
        expect(steps.comments).toHaveLength(1);
        expect(yield* openCommentCounts(deck.dir)).toEqual({ intro: 1, steps: 1 });
        const orphaned = { ...deck, slides: deck.slides.slice(0, 1) };
        const orphan = (yield* buildCommentReport(root, orphaned, { status: 'all' })).comments[1];
        expect(orphan).toMatchObject({
          slide: 'steps',
          slideNumber: null,
          file: 'decks/test/.feedback/steps.json',
        });
      }),
    ),
  );

  it.effect('writes the same facts as Markdown for "copy for agent"', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { root, deck } = yield* makeTestDeck();
        const saved = yield* saveNewComment(deck, newComment(), 'Ada');
        const [comment] = (yield* buildCommentReport(root, deck, { status: 'open' })).comments;
        const markdown = commentMarkdown('test', comment ?? expect.unreachable());
        expect(markdown).toContain(`## Comment ${saved.id} on slide 1 "intro", step 0 (fix, open)`);
        expect(markdown).toContain('- File: `decks/test/slides/intro.mdx:5:1` (anchor ok)');
        expect(markdown).toContain('- Element: `<h1>` "Hello, deck"');
        expect(markdown).toContain('> Make the title shorter.');
        expect(markdown).toContain('> 5 | # Hello, deck');
        expect(markdown).toContain(`pnpm deckster comments resolve test ${saved.id}`);
      }),
    ),
  );
});

it('counts open comments on an object that has no inherited members', () => {
  const counts = openCountsBySlide(new Map());
  expect(Object.getPrototypeOf(counts)).toBeNull();
  expect(counts['constructor']).toBeUndefined();
});
