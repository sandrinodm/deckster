import { describe, expect, it } from 'vite-plus/test';

import { MAX_FORMATTED_CHARS, parseInline, parseNotes } from '#presenter/notes-markdown.ts';

describe('parseNotes', () => {
  it('splits paragraphs and lists', () => {
    expect(parseNotes('First line\nsecond line\n\n- one\n- two\n\n1. a\n2. b')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', text: 'First line\nsecond line' }] },
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'one' }], [{ kind: 'text', text: 'two' }]],
      },
      {
        kind: 'list',
        ordered: true,
        items: [[{ kind: 'text', text: 'a' }], [{ kind: 'text', text: 'b' }]],
      },
    ]);
  });

  it('starts a list right after a paragraph line and continues an indented item', () => {
    const blocks = parseNotes('Remember:\n* first\n  more of it');
    expect(blocks).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', text: 'Remember:' }] },
      {
        kind: 'list',
        ordered: false,
        items: [
          [
            { kind: 'text', text: 'first' },
            { kind: 'text', text: ' ' },
            { kind: 'text', text: 'more of it' },
          ],
        ],
      },
    ]);
  });

  it('has no blocks for empty notes', () => {
    expect(parseNotes('  \n\n ')).toEqual([]);
  });
});

describe('parseInline', () => {
  it('reads bold, italic, code and links', () => {
    expect(parseInline('**Bold** and *it* or _it_, `x*y`, [a](https://a.dev)')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Bold' }] },
      { kind: 'text', text: ' and ' },
      { kind: 'em', children: [{ kind: 'text', text: 'it' }] },
      { kind: 'text', text: ' or ' },
      { kind: 'em', children: [{ kind: 'text', text: 'it' }] },
      { kind: 'text', text: ', ' },
      { kind: 'code', text: 'x*y' },
      { kind: 'text', text: ', ' },
      { kind: 'link', href: 'https://a.dev', children: [{ kind: 'text', text: 'a' }] },
    ]);
  });

  it('keeps raw HTML, unsafe links and lone markers as text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([
      { kind: 'text', text: '<img src=x onerror=alert(1)>' },
    ]);
    expect(parseInline('[x](javascript:alert(1))')).toEqual([
      { kind: 'text', text: '[x](javascript:alert(1))' },
    ]);
    expect(parseInline('2 * 3 * 4 and snake_case_name')).toEqual([
      { kind: 'text', text: '2 * 3 * 4 and snake_case_name' },
    ]);
  });
});

describe('hostile notes', () => {
  /**
   * How long a parse of a hostile text may take; the quadratic parser needed seconds to minutes.
   */
  const BUDGET_MS = 1500;

  /**
   * Times a parse.
   *
   * @param text - The notes.
   */
  function timed(text: string): number {
    const started = performance.now();
    parseNotes(text);
    return performance.now() - started;
  }

  it('parses long runs of openers in linear time, below and above the cap', () => {
    const hostile = [
      '['.repeat(160_000),
      '['.repeat(MAX_FORMATTED_CHARS - 1),
      '*a '.repeat(6600),
      '**a '.repeat(4900),
      '`'.repeat(MAX_FORMATTED_CHARS - 1),
      '[a]('.repeat(4000),
      '_a '.repeat(6600),
    ];
    for (const text of hostile) {
      expect(timed(text), text.slice(0, 12)).toBeLessThan(BUDGET_MS);
    }
  });

  it('renders notes beyond the cap as one plain paragraph', () => {
    const notes = `**bold** ${'x'.repeat(MAX_FORMATTED_CHARS)}`;
    expect(parseNotes(notes)).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', text: notes }] },
    ]);
  });

  it('still formats spans that fit', () => {
    expect(parseInline(`*${'a'.repeat(1500)}*`)).toEqual([
      { kind: 'em', children: [{ kind: 'text', text: 'a'.repeat(1500) }] },
    ]);
  });
});
