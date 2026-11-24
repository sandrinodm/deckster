import { describe, expect, it } from '@effect/vitest';

import { unifiedDiff } from '#layouts/eject/unified-diff.ts';

/**
 * The labels the tests diff with.
 */
const LABELS = { before: 'a/file', after: 'b/file' };

/**
 * Ten numbered lines.
 */
const LINES = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`);

describe('unifiedDiff', () => {
  it('is empty for equal texts', () => {
    expect(unifiedDiff('a\nb\n', 'a\nb\n', LABELS)).toBe('');
  });

  it('prints a changed line with three lines of context', () => {
    const after = LINES.map((line) => (line === 'line 5' ? 'line five' : line));
    expect(unifiedDiff(`${LINES.join('\n')}\n`, `${after.join('\n')}\n`, LABELS)).toBe(
      [
        '--- a/file',
        '+++ b/file',
        '@@ -2,7 +2,7 @@',
        ' line 2',
        ' line 3',
        ' line 4',
        '-line 5',
        '+line five',
        ' line 6',
        ' line 7',
        ' line 8',
        '',
      ].join('\n'),
    );
  });

  it('prints distant changes as separate hunks and counts added and removed lines', () => {
    const after = ['line 0', ...LINES.slice(0, 8), 'line 10'];
    expect(unifiedDiff(`${LINES.join('\n')}\n`, `${after.join('\n')}\n`, LABELS)).toBe(
      [
        '--- a/file',
        '+++ b/file',
        '@@ -1,3 +1,4 @@',
        '+line 0',
        ' line 1',
        ' line 2',
        ' line 3',
        '@@ -6,5 +7,4 @@',
        ' line 6',
        ' line 7',
        ' line 8',
        '-line 9',
        ' line 10',
        '',
      ].join('\n'),
    );
  });

  it('diffs against an empty text for an added file', () => {
    expect(unifiedDiff('', 'one\ntwo\n', { before: '/dev/null', after: 'b/file' })).toBe(
      ['--- /dev/null', '+++ b/file', '@@ -0,0 +1,2 @@', '+one', '+two', ''].join('\n'),
    );
  });
});
