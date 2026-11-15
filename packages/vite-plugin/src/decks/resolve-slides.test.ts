import { describe, expect, it } from 'vite-plus/test';

import { resolveSlideOrder } from '#decks/resolve-slides.ts';

describe('resolveSlideOrder', () => {
  it('orders slide files by the manifest, not by file name', () => {
    const order = resolveSlideOrder(
      ['title', 'live', 'closing'],
      ['closing.mdx', 'live.tsx', 'title.mdx'],
    );
    expect(order.slides).toEqual([
      { id: 'title', fileName: 'title.mdx', kind: 'mdx' },
      { id: 'live', fileName: 'live.tsx', kind: 'tsx' },
      { id: 'closing', fileName: 'closing.mdx', kind: 'mdx' },
    ]);
    expect(order.problems).toEqual([]);
    expect(order.warnings).toEqual([]);
  });

  it('suggests the closest file for a listed slide that has none', () => {
    const order = resolveSlideOrder(['titel'], ['title.mdx']);
    expect(order.problems).toEqual([
      {
        message: 'slides[0] "titel" has no file in slides/.',
        fix: 'Change it to "title", or create slides/titel.mdx or slides/titel.tsx.',
      },
    ]);
  });

  it('reports duplicates and ids that match both an MDX and a TSX file', () => {
    const order = resolveSlideOrder(
      ['intro', 'intro', 'demo'],
      ['intro.mdx', 'demo.mdx', 'demo.tsx'],
    );
    expect(order.problems.map((problem) => problem.message)).toEqual([
      'slides[1] lists "intro" a second time.',
      'slides[2] "demo" matches both slides/demo.mdx and slides/demo.tsx.',
    ]);
  });

  it('warns about slide files the manifest leaves out and ignores other files', () => {
    const order = resolveSlideOrder(['title'], ['title.mdx', 'extra.mdx', 'chart.ts', 'notes.md']);
    expect(order.warnings).toEqual([
      'slides/extra.mdx is not listed in deck.config.ts, so it is not a slide and the deck ' +
        'leaves it out. Add "extra" to slides to show it, or keep it there if slides import it.',
    ]);
  });
});
