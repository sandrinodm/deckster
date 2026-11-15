import { describe, expect, it } from 'vite-plus/test';

import {
  buildHighlightedCode,
  longestLine,
  markWords,
  plainText,
  prepareSource,
  type HighlightedToken,
} from '#code/highlighted-code.ts';
import { kindColor } from '#code/token-kind.ts';

describe('prepareSource', () => {
  it('reads marker comments and removes them', () => {
    const prepared = prepareSource(
      ['const a = 1; // [!code --]', 'const a = 2; // [!code ++]', 'keep();', ''].join('\n'),
      { diff: false },
    );
    expect(prepared.lines).toEqual(['const a = 1;', 'const a = 2;', 'keep();']);
    expect(prepared.changes).toEqual(['remove', 'add', undefined]);
  });

  it('reads markers in other comment syntaxes', () => {
    const prepared = prepareSource('x = 1  # [!code ++]\n<b/> <!-- [!code --] -->', {
      diff: false,
    });
    expect(prepared.changes).toEqual(['add', 'remove']);
    expect(prepared.lines[1]).toBe('<b/>');
  });

  it('reads leading plus and minus in diff mode only', () => {
    const source = '-old\n+new\n same';
    expect(prepareSource(source, { diff: true })).toEqual({
      lines: ['old', 'new', ' same'],
      changes: ['remove', 'add', undefined],
    });
    expect(prepareSource(source, { diff: false }).lines).toEqual(['-old', '+new', ' same']);
  });

  it('accepts Windows line ends', () => {
    expect(prepareSource('a\r\nb\r\n', { diff: false }).lines).toEqual(['a', 'b']);
  });
});

describe('markWords', () => {
  const tokens: HighlightedToken[] = [
    ['const ', 2],
    ['user', 0],
    [' = ', 7],
    ['requireUser', 5],
    ['(req)', 7],
  ];

  it('splits runs at the edges of a match and marks only the word', () => {
    const marked = markWords(tokens, ['requireUser']);
    expect(marked).toContainEqual(['requireUser', 5, 1]);
    expect(plainText({ lang: 'ts', lines: [{ tokens: marked }] })).toBe(
      'const user = requireUser(req)',
    );
  });

  it('marks a word that sits inside a longer run', () => {
    const marked = markWords([['abc user def', 0]], ['user']);
    expect(marked).toEqual([
      ['abc ', 0],
      ['user', 0, 1],
      [' def', 0],
    ]);
  });

  it('marks a word that spans two runs', () => {
    const marked = markWords(
      [
        ['a b', 0],
        [' c d', 5],
      ],
      ['b c'],
    );
    expect(marked.filter((token) => token[2] === 1).map(([text]) => text)).toEqual(['b', ' c']);
  });

  it('marks whole identifiers only, so a word does not mark part of a longer name', () => {
    const marked = markWords([['for (const step of steps) stepper(step_x, step)', 0]], ['step']);
    expect(marked.filter((token) => token[2] === 1)).toHaveLength(2);
    expect(markWords([['a=>b => c', 0]], ['=>']).filter((token) => token[2] === 1)).toHaveLength(2);
  });

  it('leaves the line alone for no match or no words', () => {
    expect(markWords(tokens, ['nothing'])).toEqual(tokens);
    expect(markWords(tokens, [])).toEqual(tokens);
    expect(markWords(tokens, [''])).toEqual(tokens);
  });
});

describe('buildHighlightedCode', () => {
  it('maps theme colors to kinds and carries diff changes', () => {
    const code = buildHighlightedCode(
      'ts',
      [[{ content: 'const', color: kindColor('keyword') }], [{ content: 'x' }]],
      { lines: ['const', 'x'], changes: ['add', undefined] },
      [],
    );
    expect(code.lines[0]).toEqual({ tokens: [['const', 2]], change: 'add' });
    expect(code.lines[1]).toEqual({ tokens: [['x', 0]] });
    expect(longestLine(code)).toBe(5);
  });
});
