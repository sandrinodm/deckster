import { describe, expect, it } from 'vite-plus/test';

import { parseUnifiedDiff } from '#runtime/diff-view.tsx';

describe('parseUnifiedDiff', () => {
  it('diff parser: keeps body lines that start with `--- ` or `+++ `', () => {
    const text = [
      '--- a/slides/intro.mdx',
      '+++ b/slides/intro.mdx',
      '@@ -1,4 +1,4 @@',
      ' ---',
      '--- title: old',
      '+++ title: new',
      ' ---',
    ].join('\n');
    expect(parseUnifiedDiff(text)).toEqual([
      {
        oldStart: 1,
        oldLines: 4,
        newStart: 1,
        newLines: 4,
        lines: [' ---', '--- title: old', '+++ title: new', ' ---'],
      },
    ]);
  });

  it('reads several files and hunks by their counts', () => {
    const text = [
      '--- a/one.mdx',
      '+++ b/one.mdx',
      '@@ -2 +2 @@',
      '-a',
      '+b',
      '--- a/two.mdx',
      '+++ b/two.mdx',
      '@@ -0,0 +1,2 @@',
      '+x',
      '+y',
      '\\ No newline at end of file',
    ].join('\n');
    expect(parseUnifiedDiff(text)).toEqual([
      { oldStart: 2, oldLines: 1, newStart: 2, newLines: 1, lines: ['-a', '+b'] },
      { oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+x', '+y'] },
    ]);
  });

  it('takes a diff without hunk headers as one hunk of its lines', () => {
    expect(parseUnifiedDiff('-a\n+b\n c')).toEqual([
      { oldStart: 1, oldLines: 0, newStart: 1, newLines: 0, lines: ['-a', '+b', ' c'] },
    ]);
  });
});
