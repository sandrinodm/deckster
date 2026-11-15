import { describe, expect, it } from 'vite-plus/test';

import type { Comment } from '#model/comment-schema.ts';

import { matchAnchor } from '#node/anchor-match.ts';

const SLIDE = [
  '---',
  'title: Intro',
  '---',
  '',
  '## How steps work',
  '',
  '- First point',
  '- Second point',
];

/**
 * A comment on a line, with the line text and element text it was made with.
 */
function anchored(
  line: number,
  lineText: string | null,
  text = '',
): Pick<Comment, 'source' | 'anchor'> {
  return {
    source: { file: 'slides/intro.mdx', line, column: 1 },
    anchor: { stamp: `slides/intro.mdx:${line}:1`, cssPath: '', tag: 'h2', text, lineText },
  };
}

describe('matchAnchor', () => {
  it('is ok while the line still reads as it did', () => {
    expect(matchAnchor(anchored(5, '## How steps work'), SLIDE)).toEqual({
      status: 'ok',
      line: 5,
      column: 1,
    });
  });

  it('follows the line when lines are added above it', () => {
    const edited = ['---', 'title: Intro', 'budget: 1m', '---', '', '', '## How steps work'];
    expect(matchAnchor(anchored(5, '## How steps work'), edited)).toEqual({
      status: 'moved',
      line: 7,
      column: 1,
    });
  });

  it('takes the nearest copy of a repeated line', () => {
    const lines = ['<Step>', 'a', '</Step>', '<Step>', 'b', '</Step>', '<Step>'];
    expect(matchAnchor(anchored(5, '<Step>'), lines).line).toBe(4);
  });

  it('keeps the column on a re-indented line', () => {
    const comment = {
      source: { file: 'slides/a.tsx', line: 2, column: 5 },
      anchor: { stamp: null, cssPath: '', tag: 'p', text: '', lineText: '    <p>Hi</p>' },
    };
    expect(matchAnchor(comment, ['', '', '      <p>Hi</p>'])).toEqual({
      status: 'moved',
      line: 3,
      column: 7,
    });
  });

  it('finds an edited line by the element text', () => {
    const edited = [...SLIDE.slice(0, 6), '- First point, now longer', '- Second point'];
    expect(matchAnchor(anchored(7, '- First point.', 'First point'), edited)).toMatchObject({
      status: 'ok',
      line: 7,
    });
    const moved = ['', ...edited];
    expect(matchAnchor(anchored(7, '- First point.', 'First point'), moved)).toMatchObject({
      status: 'moved',
      line: 8,
    });
  });

  it('does not take a comment or field that repeats the text for the element', () => {
    const slide = [
      '/**',
      ' * A TSX slide that reads the step.',
      ' */',
      'export const frontmatter = { title: "A TSX slide" };',
      'export default function Slide() {',
      '  return <h2>Slides in TSX</h2>;',
      '}',
    ];
    const comment = {
      source: { file: 'slides/a.tsx', line: 6, column: 10 },
      anchor: {
        stamp: null,
        cssPath: '',
        tag: 'h2',
        text: 'A TSX slide',
        lineText: '  return <h2>A TSX slide</h2>;',
      },
    };
    expect(matchAnchor(comment, slide)).toEqual({ status: 'lost', line: null, column: null });
  });

  it('guesses a reworded line of the same kind nearby', () => {
    const edited = [...SLIDE.slice(0, 4), '## How steps really work', ...SLIDE.slice(5)];
    expect(matchAnchor(anchored(5, '## How steps work', 'How steps work'), edited)).toEqual({
      status: 'guessed',
      line: 5,
      column: 1,
    });
    const shifted = ['', '', ...edited];
    expect(matchAnchor(anchored(5, '## How steps work', 'How steps work'), shifted)).toMatchObject({
      status: 'guessed',
      line: 7,
    });
  });

  it('does not guess a line of another kind or one that shares too few words', () => {
    const asText = [...SLIDE.slice(0, 4), 'How steps really work', ...SLIDE.slice(5)];
    expect(matchAnchor(anchored(5, '## How steps work'), asText).status).toBe('lost');
    const rewritten = [...SLIDE.slice(0, 4), '## Steps, explained', ...SLIDE.slice(5)];
    expect(matchAnchor(anchored(5, '## How steps work'), rewritten).status).toBe('lost');
  });

  it('prefers the most similar line, then the nearest', () => {
    const lines = ['- How steps work in decks', '', '- Second point', '', '- How steps work too'];
    expect(matchAnchor(anchored(3, '- How steps work'), lines)).toMatchObject({
      status: 'guessed',
      line: 5,
    });
  });

  it('is lost, with no line, when neither the line nor the text is found', () => {
    expect(matchAnchor(anchored(5, '## Removed heading', 'Removed heading'), SLIDE)).toEqual({
      status: 'lost',
      line: null,
      column: null,
    });
    expect(matchAnchor(anchored(40, '## Gone'), SLIDE).line).toBeNull();
    expect(matchAnchor(anchored(5, '## How steps work'), undefined)).toEqual({
      status: 'lost',
      line: null,
      column: null,
    });
  });

  it('is none for a comment without a source line', () => {
    expect(matchAnchor({ source: null, anchor: null }, SLIDE)).toEqual({
      status: 'none',
      line: null,
      column: null,
    });
  });
});
