import { NodeFileSystem } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { Comment } from '#model/comment-schema.ts';

import { changeComment, pruneComments, saveNewComment } from '#node/comment-actions.ts';
import { makeTestDeck, newComment } from '#node/deck.fixture.ts';
import { readDeckFeedback, readSlideFeedback, serializeFeedback } from '#node/feedback-store.ts';

const CONCURRENT_WRITERS = 20;

/**
 * A stored comment, for serialization tests.
 */
const STORED: Comment = {
  id: 'abcd1234',
  slide: 'intro',
  step: 0,
  target: 'element',
  source: { file: 'slides/intro.mdx', line: 5, column: 1 },
  anchor: {
    stamp: 'slides/intro.mdx:5:1',
    cssPath: 'h1',
    tag: 'h1',
    text: 'Hello',
    lineText: '# Hello',
  },
  box: { x: 1, y: 2, width: 3, height: 4 },
  region: null,
  text: 'Shorter',
  type: null,
  author: 'Ada',
  createdAt: '2026-11-13T10:00:00.000Z',
  updatedAt: '2026-11-13T10:00:00.000Z',
  status: 'open',
  resolution: null,
};

describe('serializeFeedback', () => {
  it('writes the same bytes whatever order the fields and comments come in', () => {
    const shuffled = Object.fromEntries(Object.entries(STORED).reverse()) as Comment;
    const later = { ...STORED, id: 'zzzz0000', createdAt: '2026-11-13T11:00:00.000Z' };
    const text = serializeFeedback('intro', [later, shuffled]);
    expect(text).toBe(serializeFeedback('intro', [STORED, later]));
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.indexOf('"id": "abcd1234"')).toBeLessThan(text.indexOf('"id": "zzzz0000"'));
    expect(Object.keys((JSON.parse(text) as { comments: object[] }).comments[0] ?? {})).toEqual(
      Object.keys(STORED),
    );
  });
});

layer(NodeFileSystem.layer)('the feedback store', (it) => {
  it.effect('saves a comment with the source line it reads, and reads it back', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { deck } = yield* makeTestDeck();
        const saved = yield* saveNewComment(deck, newComment(), 'Ada');
        expect(saved).toMatchObject({
          slide: 'intro',
          status: 'open',
          author: 'Ada',
          resolution: null,
        });
        expect(saved.anchor?.lineText).toBe('# Hello, deck');
        expect(saved.id).toMatch(/^[a-z0-9]{8}$/);
        expect(yield* readSlideFeedback(deck.dir, 'intro')).toEqual([saved]);
      }),
    ),
  );

  it.effect('reopens and deletes, removing the file and screenshots with the last comment', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { deck } = yield* makeTestDeck();
        const saved = yield* saveNewComment(deck, newComment(), 'Ada');
        const shot = path.join(deck.dir, '.feedback', 'intro', `${saved.id}.png`);
        yield* fs.makeDirectory(path.dirname(shot), { recursive: true });
        yield* fs.writeFileString(shot, 'png');
        yield* changeComment(deck, { action: 'resolve', id: saved.id, note: 'First', by: 'Ada' });
        const file = path.join(deck.dir, '.feedback', 'intro.json');
        const resolvedText = yield* fs.readFileString(file);
        const again = yield* changeComment(deck, {
          action: 'resolve',
          id: saved.id,
          note: 'Second',
          by: 'Bob',
        });
        expect(again).toMatchObject({
          changed: false,
          comment: { status: 'resolved', resolution: { note: 'First', by: 'Ada' } },
        });
        expect(yield* fs.readFileString(file)).toBe(resolvedText);
        const reopened = yield* changeComment(deck, { action: 'reopen', id: saved.id });
        expect(reopened).toMatchObject({
          changed: true,
          comment: { status: 'open', resolution: null },
        });
        const reopenedAgain = yield* changeComment(deck, { action: 'reopen', id: saved.id });
        expect(reopenedAgain.changed).toBe(false);
        yield* changeComment(deck, { action: 'delete', id: saved.id });
        expect(yield* fs.exists(path.join(deck.dir, '.feedback', 'intro.json'))).toBe(false);
        expect(yield* fs.exists(shot)).toBe(false);
      }),
    ),
  );

  it.effect('fails with a readable error for an unknown id or slide and a line past the end', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { deck } = yield* makeTestDeck();
        const unknownId = yield* Effect.flip(
          changeComment(deck, { action: 'reopen', id: 'zzzzzzzz' }),
        );
        expect(unknownId).toMatchObject({ failure: 'missing' });
        const unknownSlide = yield* Effect.flip(
          saveNewComment(deck, newComment({ slide: 'nope' }), 'Ada'),
        );
        expect(unknownSlide.message).toContain('"nope" is not a slide of test');
        const pastEnd = yield* Effect.flip(
          saveNewComment(
            deck,
            newComment({ source: { file: 'slides/intro.mdx', line: 99, column: 1 } }),
            'Ada',
          ),
        );
        expect(pastEnd.message).toContain('there is no line 99');
        const outside = yield* Effect.flip(
          saveNewComment(
            deck,
            newComment({ source: { file: 'slides/../../x.mdx', line: 1, column: 1 } }),
            'Ada',
          ),
        );
        expect(outside).toMatchObject({ failure: 'invalid' });
      }),
    ),
  );

  it.effect('rejects a feedback file with unknown fields instead of dropping them', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { deck } = yield* makeTestDeck();
        yield* saveNewComment(deck, newComment(), 'Ada');
        const file = path.join(deck.dir, '.feedback', 'intro.json');
        const parsed = JSON.parse(yield* fs.readFileString(file)) as { comments: object[] };
        yield* fs.writeFileString(
          file,
          JSON.stringify({ ...parsed, comments: [{ ...parsed.comments[0], extra: 1 }] }),
        );
        const error = yield* Effect.flip(readDeckFeedback(deck.dir));
        expect(error.message).toContain('intro.json is not a valid feedback file');
        yield* fs.writeFileString(file, '{ not json');
        expect((yield* Effect.flip(readDeckFeedback(deck.dir))).failure).toBe('invalid');
      }),
    ),
  );

  it.effect('prunes the comments of slides the deck no longer lists', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { deck } = yield* makeTestDeck();
        yield* saveNewComment(deck, newComment(), 'Ada');
        yield* saveNewComment(
          deck,
          newComment({ slide: 'steps', source: null, anchor: null, target: 'slide' }),
          'Ada',
        );
        const shrunk = { ...deck, slides: deck.slides.filter((slide) => slide.id !== 'steps') };
        expect(yield* pruneComments(shrunk)).toEqual([{ slide: 'steps', comments: 1 }]);
        expect([...(yield* readDeckFeedback(deck.dir)).keys()]).toEqual(['intro']);
      }),
    ),
  );
});

/**
 * Tests that wait on the lock, which sleeps on the real clock.
 */
describe('the feedback store under concurrent writers', () => {
  it.live('loses no comment when many writers save at once', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { deck } = yield* makeTestDeck();
        const texts = Array.from({ length: CONCURRENT_WRITERS }, (_, index) => `Comment ${index}`);
        yield* Effect.forEach(texts, (text) => saveNewComment(deck, newComment({ text }), 'Ada'), {
          concurrency: 'unbounded',
        });
        const stored = yield* readSlideFeedback(deck.dir, 'intro');
        expect(stored.map((comment) => comment.text).sort()).toEqual([...texts].sort());
        expect(new Set(stored.map((comment) => comment.id)).size).toBe(CONCURRENT_WRITERS);
      }),
    ).pipe(Effect.provide(NodeFileSystem.layer)),
  );

  it.live('merges changes to different comments made at the same time', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { deck } = yield* makeTestDeck();
        const first = yield* saveNewComment(deck, newComment({ text: 'One' }), 'Ada');
        const second = yield* saveNewComment(deck, newComment({ text: 'Two' }), 'Ada');
        yield* Effect.all(
          [
            changeComment(deck, { action: 'resolve', id: first.id, note: 'Done', by: 'Agent' }),
            changeComment(deck, {
              action: 'update',
              id: second.id,
              text: 'Two, edited',
              type: 'idea',
            }),
          ],
          { concurrency: 'unbounded' },
        );
        const stored = yield* readSlideFeedback(deck.dir, 'intro');
        expect(stored.find((comment) => comment.id === first.id)).toMatchObject({
          status: 'resolved',
          resolution: { note: 'Done', by: 'Agent' },
        });
        expect(stored.find((comment) => comment.id === second.id)).toMatchObject({
          text: 'Two, edited',
          type: 'idea',
          status: 'open',
        });
      }),
    ).pipe(Effect.provide(NodeFileSystem.layer)),
  );

  it.live('takes over a lock a crashed writer left behind', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { deck } = yield* makeTestDeck();
        const lock = path.join(deck.dir, '.feedback', 'intro.json.lock');
        yield* fs.makeDirectory(path.dirname(lock), { recursive: true });
        yield* fs.writeFileString(lock, '1');
        const old = new Date(Date.now() - 60_000);
        yield* fs.utimes(lock, old, old);
        yield* saveNewComment(deck, newComment(), 'Ada');
        expect(yield* readSlideFeedback(deck.dir, 'intro')).toHaveLength(1);
        expect(yield* fs.exists(lock)).toBe(false);
      }),
    ).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});

layer(NodeFileSystem.layer)('the feedback store and symbolic links', (it) => {
  it.effect('never removes outside the deck when .feedback is a link', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { deck } = yield* makeTestDeck();
        const outside = yield* fs.makeTempDirectoryScoped({ prefix: 'feedback-outside-' });
        yield* fs.makeDirectory(path.join(outside, 'intro'));
        yield* fs.writeFileString(path.join(outside, 'intro', 'keep.png'), 'precious');
        const saved = yield* saveNewComment(deck, newComment(), 'Ada');
        yield* fs.remove(path.join(deck.dir, '.feedback'), { recursive: true });
        yield* fs.symlink(outside, path.join(deck.dir, '.feedback'));
        const error = yield* Effect.flip(changeComment(deck, { action: 'delete', id: saved.id }));
        expect(error.message).toContain('symbolic link');
        expect(yield* fs.readFileString(path.join(outside, 'intro', 'keep.png'))).toBe('precious');
        const read = yield* Effect.flip(readSlideFeedback(deck.dir, 'intro'));
        expect(read.message).toContain('symbolic link');
      }),
    ),
  );

  it.effect('never removes outside the deck when a slide screenshot folder is a link', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { deck } = yield* makeTestDeck();
        const outside = yield* fs.makeTempDirectoryScoped({ prefix: 'feedback-outside-' });
        yield* fs.writeFileString(path.join(outside, 'keep.png'), 'precious');
        const saved = yield* saveNewComment(deck, newComment(), 'Ada');
        yield* fs.symlink(outside, path.join(deck.dir, '.feedback', 'intro'));
        const error = yield* Effect.flip(changeComment(deck, { action: 'delete', id: saved.id }));
        expect(error.message).toContain('symbolic link');
        expect(yield* fs.readFileString(path.join(outside, 'keep.png'))).toBe('precious');
      }),
    ),
  );
});
