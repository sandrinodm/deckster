import { describe, expect, it } from 'vite-plus/test';

import { parseRichText } from '#runtime/rich-text.tsx';
import { readableTimes } from '#runtime/transcript.tsx';

describe('parseRichText', () => {
  it('splits paragraphs, lists, headings and fenced code', () => {
    const text = [
      '## Done',
      'I changed two things:',
      '',
      '- the title',
      '- the subtitle,',
      '  which was long',
      '',
      '1. one',
      '2. two',
      '',
      '```mdx',
      '# Hi',
      '```',
      'That is all.',
    ].join('\n');
    expect(parseRichText(text)).toEqual([
      { kind: 'paragraph', text: 'Done', strong: true },
      { kind: 'paragraph', text: 'I changed two things:', strong: false },
      { kind: 'list', ordered: false, items: ['the title', 'the subtitle, which was long'] },
      { kind: 'list', ordered: true, items: ['one', 'two'] },
      { kind: 'code', text: '# Hi' },
      { kind: 'paragraph', text: 'That is all.', strong: false },
    ]);
  });

  it('runs an unclosed fence to the end, as while it streams', () => {
    expect(parseRichText('Here:\n```\nconst a = 1;')).toEqual([
      { kind: 'paragraph', text: 'Here:', strong: false },
      { kind: 'code', text: 'const a = 1;' },
    ]);
  });
});

describe('readableTimes', () => {
  it('writes ISO timestamps in a notice as local dates', () => {
    const text = readableTimes('The seven day limit is close. It resets 2026-11-16T13:00:00.000Z.');
    expect(text).not.toContain('T13:00:00');
    expect(text).toContain('2026');
  });
});
