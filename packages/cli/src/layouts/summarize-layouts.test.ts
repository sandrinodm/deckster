import { describe, expect, it } from '@effect/vitest';

import type { LayoutInfo } from '#layouts/list-layouts.ts';

import {
  ownLayoutsFirst,
  formatSummaries,
  summarizeLayout,
  type LayoutSummary,
} from '#layouts/summarize-layouts.ts';

/**
 * A summary with the fields the listing prints.
 */
function summary(name: string, source: string, fallback: string | null): LayoutSummary {
  return {
    name,
    source,
    fallback,
    description: `The ${name} layout.`,
    surface: null,
    titleMaxChars: null,
    slots: { body: { tag: null, accepts: [], required: false } },
    items: [],
  };
}

describe('formatSummaries', () => {
  const kit = summary('default', '@deckster/kit', null);
  const brand = summary('acme-cover', 'brand:acme', 'title');

  it('lists the brand layouts first under a heading that names the brand', () => {
    const output = formatSummaries([kit, brand]);
    expect(output.startsWith('Layouts from the acme brand (prefer these):\n')).toBe(true);
    expect(output.indexOf('acme-cover')).toBeLessThan(output.indexOf('Other layouts:'));
    expect(output).toContain('falls back to: title');
    expect(output.indexOf('Other layouts:')).toBeLessThan(output.indexOf('\ndefault '));
  });

  it('prints no headings when the brand has no layouts', () => {
    expect(formatSummaries([kit])).not.toContain('Other layouts');
  });

  it('lists the deck layouts, then the brand data and code layouts, under their headings', () => {
    const code = summary('kpi-wall', 'brand-code:acme', null);
    const deck = summary('funnel', 'deck:q3', null);
    const output = formatSummaries([kit, brand, code, deck]);
    expect(output.startsWith('Layouts from the q3 deck (prefer these):\nfunnel ')).toBe(true);
    const order = ['funnel', 'Layouts from the acme brand', 'acme-cover', 'kpi-wall', 'Other'];
    const positions = order.map((text) => output.indexOf(text));
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    expect(ownLayoutsFirst([kit, code, deck, brand]).map((entry) => entry.name)).toEqual([
      'funnel',
      'kpi-wall',
      'acme-cover',
      'default',
    ]);
  });

  it('keeps each group in catalog order', () => {
    const second = summary('acme-two', 'brand:acme', 'default');
    expect(ownLayoutsFirst([kit, brand, second]).map((entry) => entry.name)).toEqual([
      'acme-cover',
      'acme-two',
      'default',
    ]);
  });

  it('marks a layout that replaces another under its description, and no other', () => {
    const cover: LayoutSummary = {
      ...summary('title', 'brand-code:acme', null),
      replaces: '@deckster/kit',
    };
    const lines = formatSummaries([kit, cover]).split('\n');
    const at = lines.findIndex((line) => line.startsWith('title '));
    expect(lines[at + 1]).toBe('       The title layout.');
    expect(lines[at + 2]).toBe("       replaces the kit's title");
    expect(formatSummaries([kit, cover]).match(/replaces/gu)).toHaveLength(1);
  });

  it('carries replaces into the summary of a layout that has it', () => {
    const info = {
      name: 'title',
      source: 'brand-code:acme',
      replaces: '@deckster/kit',
      fallback: null,
      description: 'A cover. More.',
      surface: null,
      title: null,
      slots: {},
      budget: {},
      frontmatter: {},
    } as unknown as LayoutInfo;
    expect(summarizeLayout(info)).toMatchObject({ replaces: '@deckster/kit' });
    const { replaces: _kept, ...plain } = info;
    expect(Object.keys(summarizeLayout(plain))).not.toContain('replaces');
  });
});
