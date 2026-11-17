import { DIAGRAM_NODE_KINDS } from '@deckster/brand';
import { describe, expect, it } from 'vite-plus/test';

import { kindIconName, NODE_KIND_NAMES, resolveNodeKind } from '#diagrams/node-kinds.ts';

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

describe('NODE_KIND_NAMES', () => {
  it("matches the kinds the brand package accepts in a brand's `diagram.kinds`", () => {
    expect([...DIAGRAM_NODE_KINDS].toSorted()).toEqual([...NODE_KIND_NAMES].toSorted());
  });
});
