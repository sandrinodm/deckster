import { describe, expect, it } from 'vite-plus/test';

import { kindIconName, resolveNodeKind } from '#diagrams/node-kinds.ts';

const NAMES = ['constructor', 'toString', '__proto__', 'hasOwnProperty'];

describe('resolveNodeKind', () => {
  it('resolves a kind and an alias', () => {
    expect(resolveNodeKind('database')).toBe('database');
    expect(resolveNodeKind('browser')).toBe('client');
  });

  it.each(NAMES)('does not take `%s` for a kind or an alias', (name) => {
    expect(resolveNodeKind(name)).toBeUndefined();
  });
});

describe('kindIconName', () => {
  it.each(NAMES)('falls back to the Lucide name for an icon set called `%s`', (set) => {
    expect(kindIconName('database', set)).toBe(kindIconName('database', 'lucide'));
  });
});
