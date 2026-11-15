import { describe, expect, it } from 'vite-plus/test';

import { lineDiff, looksBinary, MAX_DIFF_INPUT_LINES, MAX_DIFF_LINES } from '#journal/line-diff.ts';

describe('lineDiff', () => {
  it('shows a changed line with three lines of context as one hunk', () => {
    const before = ['---', 'title: Hello, deck', '---', '', '# Hello, deck', '', 'Body.', ''].join(
      '\n',
    );
    const after = before.replaceAll('Hello, deck', 'Hi');
    const diff = lineDiff(before, after);
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(2);
    expect(diff.truncated).toBe(false);
    expect(diff.hunks).toEqual([
      {
        oldStart: 1,
        oldLines: 7,
        newStart: 1,
        newLines: 7,
        lines: [
          ' ---',
          '-title: Hello, deck',
          '+title: Hi',
          ' ---',
          ' ',
          '-# Hello, deck',
          '+# Hi',
          ' ',
          ' Body.',
        ],
      },
    ]);
  });

  it('splits changes far apart into separate hunks', () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);
    const changed = lines.map((line, index) =>
      index === 1 || index === 27 ? `${line} changed` : line,
    );
    const diff = lineDiff(lines.join('\n'), changed.join('\n'));
    expect(diff.hunks.map((hunk) => [hunk.oldStart, hunk.newStart])).toEqual([
      [1, 1],
      [25, 25],
    ]);
  });

  it('treats a new file as all added and a deleted one as all removed', () => {
    expect(lineDiff('', 'a\nb\n')).toMatchObject({
      added: 2,
      removed: 0,
      hunks: [{ oldStart: 0, newStart: 1, lines: ['+a', '+b'] }],
    });
    expect(lineDiff('a\n', '')).toMatchObject({ added: 0, removed: 1 });
  });

  it('finds inserted lines in the middle', () => {
    const diff = lineDiff('a\nb\nc\nd\n', 'a\nb\nx\nc\nd\n');
    expect(diff.hunks[0]?.lines).toEqual([' a', ' b', '+x', ' c', ' d']);
  });

  it('caps a huge diff and says so', () => {
    const before = Array.from({ length: 2000 }, (_, index) => `old ${index}`).join('\n');
    const after = Array.from({ length: 2000 }, (_, index) => `new ${index}`).join('\n');
    const diff = lineDiff(before, after);
    expect(diff.truncated).toBe(true);
    expect(diff.hunks.flatMap((hunk) => hunk.lines)).toHaveLength(MAX_DIFF_LINES);
  });

  it('line-diff stack overflow: 300,000 lines replacing one line do not throw', () => {
    const after = Array.from({ length: 300_000 }, (_, index) => `new ${index}`).join('\n');
    const diff = lineDiff('old\n', after);
    expect(diff.removed).toBe(1);
    expect(diff.added).toBe(300_000);
    expect(diff.truncated).toBe(true);
    expect(diff.hunks.flatMap((hunk) => hunk.lines)).toHaveLength(MAX_DIFF_LINES);
  });

  it('line-diff stack overflow: a text past the size limit is reported too large to diff', () => {
    const before = 'x\n'.repeat(MAX_DIFF_INPUT_LINES + 1);
    const diff = lineDiff(before, `${before}y\n`);
    expect(diff).toEqual({ hunks: [], added: 0, removed: 0, truncated: true, tooLarge: true });
  });

  it('calls bytes with a NUL binary', () => {
    expect(looksBinary(new Uint8Array([137, 80, 78, 71, 0, 1]))).toBe(true);
    expect(looksBinary(new TextEncoder().encode('# Title\n'))).toBe(false);
  });
});
