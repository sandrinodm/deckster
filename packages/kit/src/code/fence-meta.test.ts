import { describe, expect, it } from 'vite-plus/test';

import { parseFenceMeta } from '#code/fence-meta.ts';

describe('parseFenceMeta', () => {
  it('returns defaults for no meta', () => {
    expect(parseFenceMeta(undefined)).toEqual({ lineNumbers: false, diff: false, words: [] });
    expect(parseFenceMeta('')).toEqual({ lineNumbers: false, diff: false, words: [] });
  });

  it('reads a title, a highlight, line numbers and words together', () => {
    const meta = parseFenceMeta('title="server.ts" {2-4|7} lineNumbers /useState/ /set\\/get/');
    expect(meta.file).toBe('server.ts');
    expect(meta.highlight).toBe('2-4|7');
    expect(meta.lineNumbers).toBe(true);
    expect(meta.words).toEqual(['useState', 'set/get']);
  });

  it('accepts a bare quoted string as the file name and file= as an alias', () => {
    expect(parseFenceMeta('"app.tsx"').file).toBe('app.tsx');
    expect(parseFenceMeta("file='a b.ts'").file).toBe('a b.ts');
  });

  it('reads flags and numbers', () => {
    const meta = parseFenceMeta('diff noDim noLabel start=10 at=2 label="TS"');
    expect(meta).toMatchObject({ diff: true, dim: false, start: 10, at: 2, label: 'TS' });
    expect(parseFenceMeta('noLabel').label).toBe(false);
  });

  it('rejects an unknown option and a bad number with the fix', () => {
    expect(() => parseFenceMeta('wobble')).toThrow(/is not a code block option/);
    expect(() => parseFenceMeta('start=x')).toThrow(/not a whole number/);
    expect(() => parseFenceMeta('colour=red')).toThrow(/is not a code block option/);
  });
});
