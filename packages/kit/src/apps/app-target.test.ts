import { describe, expect, it } from 'vite-plus/test';

import { allowAttribute, resolveAppTarget, sandboxAttribute } from '#apps/app-target.ts';

/**
 * The page the deck runs on in these tests.
 */
const PAGE = 'http://localhost:5300/';

describe('resolveAppTarget', () => {
  it('serves an app name next to the deck page', () => {
    const target = resolveAppTarget({ app: 'agent-demo', src: undefined, base: PAGE });
    expect(target.url).toBe('http://localhost:5300/apps/agent-demo/');
    expect(target.origin).toBe('http://localhost:5300');
    expect(target.kind).toBe('bundled');
  });

  it('keeps a deck hosted under a path', () => {
    const target = resolveAppTarget({
      app: 'agent-demo',
      src: undefined,
      base: 'https://talks.example.com/2026/deck/',
    });
    expect(target.url).toBe('https://talks.example.com/2026/deck/apps/agent-demo/');
  });

  it('marks another origin external and a path on the deck bundled', () => {
    const external = resolveAppTarget({
      app: undefined,
      src: 'https://example.com/play',
      base: PAGE,
    });
    expect(external).toMatchObject({ kind: 'external', display: 'example.com/play' });
    const local = resolveAppTarget({ app: undefined, src: 'apps/other/', base: PAGE });
    expect(local.kind).toBe('bundled');
  });

  it('asks for exactly one of app and src, and a valid app name', () => {
    expect(() => resolveAppTarget({ app: undefined, src: undefined, base: PAGE })).toThrow(
      'exactly one of `app`',
    );
    expect(() => resolveAppTarget({ app: 'a', src: 'https://a.test/', base: PAGE })).toThrow(
      'exactly one of `app`',
    );
    expect(() => resolveAppTarget({ app: '../x', src: undefined, base: PAGE })).toThrow(
      'is not an app name',
    );
    expect(() => resolveAppTarget({ app: undefined, src: 'http://', base: PAGE })).toThrow(
      'is not a URL',
    );
  });
});

describe('sandbox and allow', () => {
  it('gives a bundled app scripts and its own origin, and nothing for popups', () => {
    expect(sandboxAttribute('bundled', [])).toBe('allow-scripts allow-same-origin allow-forms');
  });

  it('gives an external page popups on top', () => {
    expect(sandboxAttribute('external', [])).toContain('allow-popups');
  });

  it('adds the author’s tokens once', () => {
    expect(sandboxAttribute('bundled', ['allow-downloads', 'allow-forms'])).toBe(
      'allow-scripts allow-same-origin allow-forms allow-downloads',
    );
    expect(allowAttribute('bundled', ['microphone', 'autoplay'])).toBe('autoplay; microphone');
  });
});
