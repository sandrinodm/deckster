import { describe, expect, it } from 'vite-plus/test';

import { decodeCharacterReferences, normalizeNotes } from '#slides/notes-text.ts';

describe('normalizeNotes', () => {
  it('dedents, collapses inner spaces, keeps line breaks and one blank line per paragraph', () => {
    const raw = '\n    First   line\n    - point\n      - sub\n\n\n\n    Last.\n  ';
    expect(normalizeNotes(raw)).toBe('First line\n- point\n  - sub\n\nLast.');
  });

  it('gives an empty string for whitespace only', () => {
    expect(normalizeNotes('  \n\t\n')).toBe('');
  });
});

describe('decodeCharacterReferences', () => {
  it('decodes named and numeric references and keeps unknown ones', () => {
    expect(decodeCharacterReferences('Q&amp;A &#38; &#x26; &copy; &nope; &#0;')).toBe(
      'Q&A & & © &nope; &#0;',
    );
  });
});
