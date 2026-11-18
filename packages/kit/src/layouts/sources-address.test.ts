import { describe, expect, it } from 'vite-plus/test';

import { shortAddress } from '#layouts/sources-address.ts';

describe('shortAddress', () => {
  it('removes the query and fragment before measuring', () => {
    expect(shortAddress('https://www.example.com/study?season=summer#results', 20)).toBe(
      'example.com/study',
    );
  });

  it('keeps short readable addresses unchanged', () => {
    expect(shortAddress('https://example.com/study/', 40)).toBe('example.com/study');
  });

  it('cuts long paths at slash, hyphen and dot boundaries', () => {
    expect(shortAddress('https://example.com/studies/longtitle', 24)).toBe('example.com/studies…');
    expect(shortAddress('https://example.com/eastgate-surface-temperature', 32)).toBe(
      'example.com/eastgate-surface…',
    );
    expect(shortAddress('https://example.com/study.results.html', 27)).toBe(
      'example.com/study.results…',
    );
  });

  it('keeps the full host even when the host exceeds the cap', () => {
    expect(shortAddress('https://very-long.example.com/study', 12)).toBe('very-long.example.com');
    expect(shortAddress('https://very-long.example.com', 12)).toBe('very-long.example.com');
  });

  it('falls back to the host when a path has no boundary within the cap', () => {
    expect(shortAddress('https://example.com/averylongunbrokenpath', 20)).toBe('example.com…');
  });
});
