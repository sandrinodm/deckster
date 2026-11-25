import { describe, expect, it } from 'vite-plus/test';

import { readDefaultCallProperty } from '#layouts/default-call-property.ts';

describe('readDefaultCallProperty', () => {
  it('reads a string property of the default-exported call, past comments and satisfies', () => {
    const text = [
      "import { defineLayout } from '@deckster/engine';",
      '',
      "// name: 'not-this'",
      'export default defineLayout({',
      "  name: /* public layout id */ 'funnel',",
      '  component: (props) => <div>{props.children}</div>,',
      '} satisfies object);',
    ].join('\n');
    expect(readDefaultCallProperty(text, 'defineLayout', 'name')).toEqual({
      kind: 'string',
      value: 'funnel',
    });
  });

  it('never takes the name from a comment or from another call', () => {
    const text = [
      "// name: 'funnel'",
      "const other = defineLayout({ name: 'funnel', component: () => null });",
      "export default defineLayout({ name: 'kpi-wall', component: () => null });",
    ].join('\n');
    expect(readDefaultCallProperty(text, 'defineLayout', 'name')).toEqual({
      kind: 'string',
      value: 'kpi-wall',
    });
  });

  it('tells a property with another value from a missing one and an unreadable module', () => {
    expect(
      readDefaultCallProperty(
        'export default defineDeck({ deckster: RANGE });',
        'defineDeck',
        'deckster',
      ),
    ).toEqual({ kind: 'other' });
    expect(
      readDefaultCallProperty('export default defineDeck({ slides });', 'defineDeck', 'deckster'),
    ).toEqual({ kind: 'absent' });
    expect(
      readDefaultCallProperty('export default defineDeck({ ...base });', 'defineDeck', 'deckster'),
    ).toEqual({ kind: 'unreadable' });
    expect(readDefaultCallProperty('export default {', 'defineDeck', 'deckster')).toEqual({
      kind: 'unreadable',
    });
    expect(readDefaultCallProperty('export default other({});', 'defineDeck', 'x')).toEqual({
      kind: 'unreadable',
    });
  });

  it('follows a default export of a top-level const to its call, as the kit writes layouts', () => {
    const text = [
      "import { defineLayout } from '@deckster/engine';",
      '',
      "export const titleLayout = defineLayout<typeof contract>({ name: 'title', component: Title });",
      '',
      'export default titleLayout;',
    ].join('\n');
    expect(readDefaultCallProperty(text, 'defineLayout', 'name')).toEqual({
      kind: 'string',
      value: 'title',
    });
  });

  it('follows a call argument that names a top-level const to its object', () => {
    const text = [
      "const config = { title: 'Talk', slides: ['one'], deckster: '>=99' } satisfies object;",
      '',
      'export default defineDeck(config);',
    ].join('\n');
    expect(readDefaultCallProperty(text, 'defineDeck', 'deckster', 'ts')).toEqual({
      kind: 'string',
      value: '>=99',
    });
    expect(
      readDefaultCallProperty(
        'let config = {};\nexport default defineDeck(config);',
        'defineDeck',
        'x',
      ),
    ).toEqual({ kind: 'unreadable' });
  });

  it('parses a .ts module as TypeScript, so angle-bracket casts are read', () => {
    const text = "export default defineDeck({ deckster: <string>'>=99' });";
    expect(readDefaultCallProperty(text, 'defineDeck', 'deckster', 'ts')).toEqual({
      kind: 'other',
    });
    expect(
      readDefaultCallProperty(
        "export default defineDeck({ deckster: '>=99' });",
        'defineDeck',
        'deckster',
        'ts',
      ),
    ).toEqual({
      kind: 'string',
      value: '>=99',
    });
  });
});
