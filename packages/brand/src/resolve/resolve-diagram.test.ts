import { Effect } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import type { BrandTokens } from '#resolve/brand-tokens.ts';

import { TEXT_CONTRAST } from '#checks/contrast-thresholds.ts';
import { compositeOver, fromHex } from '#color/color.ts';
import { worstContrast } from '#color/contrast.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * The tokens of a brand that must resolve.
 *
 * @param overrides - Dotted paths and their new values, as `testBrand` takes them.
 */
function tokensOf(overrides: Readonly<Record<string, unknown>> = {}): BrandTokens {
  return Effect.runSync(resolveBrand(testBrand(overrides))).tokens;
}

/**
 * A surface of the tokens, which must exist.
 */
function surfaceOf(tokens: BrandTokens, name: string) {
  const surface = tokens.surfaces[name];
  if (surface === undefined) {
    throw new Error(`No surface "${name}".`);
  }

  return surface;
}

describe('diagram tokens', () => {
  it('default the look to today’s diagrams and list the standard cards', () => {
    const tokens = tokensOf();
    expect(tokens.diagram.edges).toEqual({
      stroke: 2,
      lineStyle: undefined,
      timelineStroke: undefined,
      corners: 'round',
      arrow: 'triangle',
    });
    expect(tokens.diagram.groups).toEqual({
      stroke: 1,
      lineStyle: undefined,
      dashed: false,
      radius: 16,
    });
    expect(tokens.diagram.labels).toEqual({ style: 'plain', type: 'caption' });
    expect(tokens.diagram.align).toBeUndefined();
    expect(tokens.diagram.nodes).toEqual({ width: 0, height: 0, subtitle: {} });
    expect(tokens.diagram.notes).toEqual({});
    expect(tokens.diagram.kinds).toEqual({});
    expect(Object.keys(tokens.diagram.cards)).toEqual([
      'default',
      'outline',
      'solid',
      'tint',
      'raised',
    ]);
    expect(tokens.diagram.cards['default']).toEqual({
      titleOwn: false,
      stroke: 2,
      borderStyle: undefined,
      radius: 8,
      shape: 'kind',
      shadow: 'none',
      icon: 'chip',
      iconBorderWidth: undefined,
      iconBorderStyle: undefined,
      accent: { side: 'none', width: 4 },
      title: {
        family: 'display',
        stack: 'Display, sans-serif',
        weight: 600,
        tracking: -0.01,
        case: 'none',
      },
      subtitle: {},
    });
  });

  it('resolve the default card to today’s node on every surface, overrides included', () => {
    const tokens = tokensOf({
      diagram: { node: 'gray.50', 'node-border': 'gray.300' },
      'color.surfaces.inverse': { diagram: { node: 'gray.600', 'node-border': 'blue.300' } },
    });
    for (const surface of Object.values(tokens.surfaces)) {
      const card = surface.diagramCards['default'];
      expect(card, surface.name).toMatchObject({
        fill: surface.diagram.node,
        border: surface.diagram['node-border'],
        text: surface.diagram['node-text'],
        subtext: surface.diagram.label,
        iconColor: surface.diagram['node-text'],
        detail: surface.diagram['node-border'],
        shadow: { layers: [], filter: 'none', boxShadow: 'none' },
      });
    }
  });

  it('derive the standard cards from the roles on a light and a dark surface', () => {
    const tokens = tokensOf({
      'shape.shadow.md': [
        { y: 8, blur: 24, spread: -8, color: 'gray.900/14' },
        { y: 2, blur: 4, color: 'gray.900/5', inset: true },
      ],
    });
    for (const name of ['default', 'inverse']) {
      const surface = surfaceOf(tokens, name);
      const { roles } = surface;
      const cards = surface.diagramCards;
      expect(cards['outline']).toMatchObject({
        fill: null,
        border: surface.diagram['node-border'],
      });
      expect(cards['solid']).toMatchObject({ fill: roles.accent, border: null });
      expect(cards['tint']?.fill).toBe(`${roles.accent}1f`);
      expect(cards['tint']?.border).toBe(roles.accent);
      expect(cards['raised']).toMatchObject({
        fill: roles.surface,
        shadow: {
          layers: [
            { x: 0, y: 8, blur: 24, spread: -8, color: '#18191d', alpha: 0.14, inset: false },
          ],
          filter: 'drop-shadow(0 8px 24px rgb(24 25 29 / 0.14))',
          boxShadow: '0 8px 24px -8px rgb(24 25 29 / 0.14)',
        },
      });
    }

    expect(surfaceOf(tokens, 'inverse').scheme).toBe('dark');
    expect(tokens.diagram.cards['solid']?.icon).toBe('plain');
    expect(tokens.diagram.cards['tint']?.icon).toBe('solid');
    expect(tokens.diagram.cards['raised']).toMatchObject({ stroke: 1, shadow: 'md' });
  });

  it('keep derived text readable on each card’s fill painted over every backdrop color', () => {
    const tokens = tokensOf({
      diagram: {
        cards: {
          muddy: { fill: 'gray.600' },
          wash: { fill: 'orange.300/60', icon: { style: 'plain' } },
        },
      },
    });
    for (const surface of Object.values(tokens.surfaces)) {
      const backdrop = surface.backdrop.map(fromHex);
      for (const [name, card] of Object.entries(surface.diagramCards)) {
        const { fill } = card;
        const under =
          fill === null ? backdrop : backdrop.map((color) => compositeOver(fromHex(fill), color));
        const where = `${surface.name} ${name}`;
        // The default card's subtitle keeps the theme's label color, as nodes have today.
        const texts = name === 'default' ? [card.text] : [card.text, card.subtext];
        const worst = Math.min(...texts.map((text) => worstContrast(fromHex(text), under)));
        expect(worst, where).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      }
    }
  });

  it('resolve a custom card’s roles per surface and its palette references the same everywhere', () => {
    const tokens = tokensOf({
      diagram: {
        cards: {
          spotlight: {
            fill: 'surface/90',
            border: 'blue.800',
            text: 'fg',
            accent: { color: 'orange.600' },
            title: { family: 'mono', weight: 500, case: 'upper' },
          },
        },
        kinds: { database: 'spotlight', external: 'outline' },
      },
    });
    const light = surfaceOf(tokens, 'default');
    const dark = surfaceOf(tokens, 'inverse');
    expect(light.diagramCards['spotlight']).toMatchObject({
      fill: `${light.roles.surface}e6`,
      border: '#1c2f84',
      text: light.roles.fg,
      accent: '#b45f00',
    });
    expect(dark.diagramCards['spotlight']).toMatchObject({
      fill: `${dark.roles.surface}e6`,
      border: '#1c2f84',
      text: dark.roles.fg,
      accent: '#b45f00',
    });
    expect(tokens.diagram.cards['spotlight']).toMatchObject({
      accent: { side: 'left', width: 4 },
      title: {
        family: 'mono',
        stack: 'Mono, monospace',
        weight: 500,
        tracking: -0.01,
        case: 'upper',
      },
    });
    expect(tokens.diagram.kinds).toEqual({ database: 'spotlight', external: 'outline' });
    expect(Object.keys(tokens.diagram.cards).at(-1)).toBe('spotlight');
  });

  it('mark the cards that take the diagram node color as their fill, per surface', () => {
    const plain = tokensOf();
    const surface = surfaceOf(plain, 'default');
    expect(surface.diagramCards['raised']?.fill).toBe(surface.diagram.node);
    expect(
      Object.fromEntries(
        Object.entries(surface.diagramCards).map(([name, card]) => [name, card.nodeFill]),
      ),
    ).toEqual({ default: true, outline: false, solid: false, tint: false, raised: false });
    const filled = tokensOf({
      diagram: { cards: { default: { fill: 'surface' }, plain: {}, dark: { fill: 'gray.900' } } },
    });
    const cards = surfaceOf(filled, 'default').diagramCards;
    expect(cards['default']?.nodeFill).toBe(false);
    expect(cards['plain']?.nodeFill).toBe(true);
    expect(cards['dark']?.nodeFill).toBe(false);
  });

  it('give a borderless card the subtitle color for its detail lines, else its border', () => {
    const tokens = tokensOf({
      diagram: { cards: { default: { border: 'none' }, framed: { border: 'blue.800' } } },
    });
    for (const surface of Object.values(tokens.surfaces)) {
      const cards = surface.diagramCards;
      expect(cards['default']?.detail, surface.name).toBe(cards['default']?.subtext);
      expect(cards['framed']?.detail, surface.name).toBe('#1c2f84');
      expect(cards['outline']?.detail, surface.name).toBe(surface.diagram['node-border']);
    }
  });

  it('turn node fill off only on a surface that recolors the card’s fill', () => {
    const tokens = tokensOf({
      'color.surfaces.inverse': { diagram: { cards: { default: { fill: 'gray.600' } } } },
    });
    for (const surface of Object.values(tokens.surfaces)) {
      expect(surface.diagramCards['default']?.nodeFill, surface.name).toBe(
        surface.name !== 'inverse',
      );
    }
  });

  it('merge a brand’s entry over a standard card field by field', () => {
    const tokens = tokensOf({
      diagram: { cards: { tint: { radius: 'none', icon: { style: 'chip' } } } },
    });
    expect(tokens.diagram.cards['tint']).toMatchObject({ radius: 0, icon: 'chip', stroke: 2 });
    const surface = surfaceOf(tokens, 'default');
    expect(surface.diagramCards['tint']?.fill).toBe(`${surface.roles.accent}1f`);
  });

  it('apply the brand’s edge, group and label look', () => {
    const tokens = tokensOf({
      diagram: {
        edges: { stroke: 'bold', corners: 'sharp', arrow: 'dot' },
        groups: { stroke: 'none', dashed: true, radius: 'sm' },
        labels: { style: 'chip', type: 'label' },
      },
    });
    expect(tokens.diagram.edges).toEqual({
      stroke: 4,
      lineStyle: undefined,
      timelineStroke: undefined,
      corners: 'sharp',
      arrow: 'dot',
    });
    expect(tokens.diagram.groups).toEqual({
      stroke: 0,
      lineStyle: undefined,
      dashed: true,
      radius: 4,
    });
    expect(tokens.diagram.labels).toEqual({ style: 'chip', type: 'label' });
  });

  it('resolves explicit dimensions, text properties and surface-specific icon borders', () => {
    const tokens = tokensOf({
      diagram: {
        align: 'right',
        edges: { stroke: 3.75, lineStyle: 'dotted' },
        groups: { stroke: 2.5, lineStyle: 'solid', dashed: true },
        nodes: { width: 180, height: 88, subtitle: { type: 'label', tracking: 0.04 } },
        notes: { type: 'body', family: 'mono', weight: 700, case: 'upper' },
        cards: {
          default: {
            borderStyle: 'dashed',
            subtitle: { type: 'small', family: 'mono', weight: 500 },
          },
          outline: { subtitle: { weight: 550 } },
          raised: {
            subtitle: 'body',
            icon: { border: 'accent', borderWidth: 1.5, borderStyle: 'dotted' },
          },
          tint: { borderStyle: 'solid', subtitle: null, icon: { borderWidth: 0 } },
        },
      },
      'color.surfaces.inverse': { diagram: { cards: { raised: { icon: { border: 'fg' } } } } },
    });
    const { align, edges, groups, nodes, notes, cards } = tokens.diagram;
    const mono = { name: 'mono', stack: 'Mono, monospace' };
    expect(align).toBe('right');
    expect(edges).toMatchObject({ stroke: 3.75, lineStyle: 'dotted', timelineStroke: 3.75 });
    expect(groups).toMatchObject({ stroke: 2.5, lineStyle: 'solid', dashed: false });
    expect(nodes).toEqual({ width: 180, height: 88, subtitle: { type: 'label', tracking: 0.04 } });
    expect(notes).toEqual({ type: 'body', family: mono, weight: 700, case: 'upper' });
    expect(cards['outline']).toMatchObject({
      borderStyle: 'dashed',
      subtitle: { type: 'small', family: mono, weight: 550 },
    });
    expect(cards['raised']).toMatchObject({
      iconBorderWidth: 1.5,
      iconBorderStyle: 'dotted',
      subtitle: { type: 'body', family: mono, weight: 500 },
    });
    expect(cards['tint']).toMatchObject({ borderStyle: 'solid', iconBorderWidth: 0 });
    expect(cards['tint']?.subtitle).toEqual({});
    const light = surfaceOf(tokens, 'default');
    const dark = surfaceOf(tokens, 'inverse');
    expect(light.diagramCards['raised']?.iconBorder).toBe(light.roles.accent);
    expect(dark.diagramCards['raised']?.iconBorder).toBe(dark.roles.fg);
  });

  it('inherit stroke, radius and title from the brand’s default card, in order', () => {
    const tokens = tokensOf({
      diagram: {
        cards: {
          default: {
            stroke: 'bold',
            radius: 'none',
            shadow: 'md',
            fill: 'surface',
            title: { family: 'mono', case: 'upper' },
          },
          raised: { title: { weight: 500 } },
          spotlight: { radius: 'xl', title: { case: 'none' } },
        },
      },
    });
    const { cards } = tokens.diagram;
    // Built-in base, then the brand's default, then what a standard sets itself, then the card.
    expect(cards['outline']).toMatchObject({
      stroke: 4,
      radius: 0,
      shadow: 'none',
    });
    expect(surfaceOf(tokens, 'default').diagramCards['outline']?.nodeFill).toBe(false);
    expect(cards['raised']).toMatchObject({ stroke: 1, radius: 0, shadow: 'md' });
    expect(cards['spotlight']).toMatchObject({ stroke: 4, radius: 24 });
    expect(cards['outline']?.title).toEqual({
      family: 'mono',
      stack: 'Mono, monospace',
      weight: 600,
      tracking: -0.01,
      case: 'upper',
    });
    expect(cards['raised']?.title).toMatchObject({ family: 'mono', weight: 500, case: 'upper' });
    expect(cards['spotlight']?.title).toMatchObject({ family: 'mono', case: 'none' });
    // Paint is not inherited: outline keeps no fill.
    expect(surfaceOf(tokens, 'default').diagramCards['outline']?.fill).toBeNull();
  });

  it('mark the cards whose title type the brand wrote, on the card or its default', () => {
    const plain = tokensOf({ diagram: { cards: { solid: { title: { weight: 700 } } } } });
    expect(plain.diagram.cards['solid']?.titleOwn).toBe(true);
    expect(plain.diagram.cards['tint']?.titleOwn).toBe(false);
    expect(plain.diagram.cards['default']?.titleOwn).toBe(false);
    const inherited = tokensOf({
      diagram: { cards: { default: { title: { case: 'upper' } }, mine: {} } },
    });
    for (const card of Object.values(inherited.diagram.cards)) {
      expect(card.titleOwn).toBe(true);
    }
  });

  it('let a surface recolor a card and keep the card elsewhere', () => {
    const tokens = tokensOf({
      diagram: { cards: { volt: { fill: 'orange.300', border: 'gray.900' } } },
      'color.surfaces.inverse': {
        diagram: { cards: { volt: { fill: 'gray.0', icon: { color: 'blue.300' } } } },
      },
    });
    const light = surfaceOf(tokens, 'default').diagramCards['volt'];
    const dark = surfaceOf(tokens, 'inverse').diagramCards['volt'];
    expect(light).toMatchObject({ fill: '#ffc078', border: '#18191d' });
    expect(dark).toMatchObject({ fill: '#ffffff', border: '#18191d', iconColor: '#93acff' });
    expect(worstContrast(fromHex(dark?.text ?? ''), [fromHex('#ffffff')])).toBeGreaterThanOrEqual(
      TEXT_CONTRAST,
    );
  });
});
