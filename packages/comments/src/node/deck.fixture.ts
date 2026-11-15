import type { Scope } from 'effect';

import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { NewComment } from '#node/comment-request.ts';
import type { FeedbackDeck } from '#node/feedback-deck.ts';

/**
 * The slides of the test deck, by id, with their MDX.
 */
export const TEST_SLIDES: Readonly<Record<string, string>> = {
  intro: [
    '---',
    'title: Hello, deck',
    '---',
    '',
    '# Hello, deck',
    '',
    'A code-first slide system.',
    '',
  ].join('\n'),
  steps: [
    '## How steps work',
    '',
    '<Step at={1}>',
    '- Each slide has one step.',
    '</Step>',
    '',
  ].join('\n'),
};

/**
 * Writes the test deck to a temporary workspace that is removed with the scope: `decks/test` with
 * the slides in {@link TEST_SLIDES}.
 *
 * @returns The workspace root and the deck.
 */
export const makeTestDeck = Effect.fn('makeTestDeck')(function* (): Effect.fn.Return<
  { root: string; deck: FeedbackDeck },
  unknown,
  FileSystem.FileSystem | Scope.Scope
> {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-comments-' });
  const dir = path.join(root, 'decks', 'test');
  yield* fs.makeDirectory(path.join(dir, 'slides'), { recursive: true });
  const slides = Object.entries(TEST_SLIDES).map(([id, source]) => ({
    id,
    file: path.join(dir, 'slides', `${id}.mdx`),
    source,
  }));
  yield* Effect.forEach(slides, (slide) => fs.writeFileString(slide.file, slide.source), {
    concurrency: 'unbounded',
  });
  return { root, deck: { id: 'test', dir, slides: slides.map(({ id, file }) => ({ id, file })) } };
});

/**
 * A new comment on an element, with the fields a test does not care about filled in.
 *
 * @param changes - The fields that matter.
 */
export function newComment(changes: Partial<NewComment> = {}): NewComment {
  return {
    slide: 'intro',
    step: 0,
    target: 'element',
    source: { file: 'slides/intro.mdx', line: 5, column: 1 },
    anchor: {
      stamp: 'slides/intro.mdx:5:1',
      cssPath: 'section > h1:nth-of-type(1)',
      tag: 'h1',
      text: 'Hello, deck',
    },
    box: { x: 160, y: 120, width: 800, height: 96 },
    region: null,
    text: 'Make the title shorter.',
    type: 'fix',
    author: null,
    ...changes,
  };
}
