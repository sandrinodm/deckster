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

  it('marks a last line without a newline, so a final-newline change has a hunk', () => {
    expect(unifiedDiff('a\nb\n', 'a\nb', LABELS)).toBe(
      [
        '--- a/file',
        '+++ b/file',
        '@@ -1,2 +1,2 @@',
        ' a',
        '-b',
        '+b',
        '\\ No newline at end of file',
        '',
      ].join('\n'),
    );
  });

  it('prints parts too large to compare as one removal and one addition', () => {
    const before = Array.from({ length: 3000 }, (_, index) => `old ${index}`);
    const after = Array.from({ length: 2000 }, (_, index) => `new ${index}`);
    before.splice(1500, 0, 'shared');
    after.splice(1000, 0, 'shared');
    const diff = unifiedDiff(`${before.join('\n')}\n`, `${after.join('\n')}\n`, LABELS);
    const lines = diff.split('\n');
    expect(lines[2]).toBe('@@ -1,3001 +1,2001 @@');
    expect(lines[3]).toBe('-old 0');
    expect(lines[3003]).toBe('-old 2999');
    expect(lines[3004]).toBe('+new 0');
    expect(lines).toContain('-shared');
    expect(lines).toContain('+shared');
    expect(lines).not.toContain(' shared');
  });
});
