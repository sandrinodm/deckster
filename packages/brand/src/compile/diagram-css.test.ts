import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import type { BrandTokens } from '#resolve/brand-tokens.ts';

import { brandCss } from '#compile/brand-css.ts';
import { cssStructure } from '#compile/css-structure.fixture.ts';
import {
  brandVariables as v,
  CARD_ROOT_PROPERTIES,
  CARD_SURFACE_PROPERTIES,
} from '#compile/variable-names.ts';
import { deriveDiagramTheme } from '#resolve/derive-themes.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { DIAGRAM_TOKENS } from '#schema/theme-schema.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * A brand that writes every key of the diagram section.
 */
const DIAGRAM_BRAND = testBrand({
  'shape.shadow.md': [
    { x: 4, y: 4, blur: 0, color: 'gray.900' },
    { y: 1, blur: 2, color: 'gray.900/20', inset: true },
  ],
  diagram: {
    align: 'left',
    edges: { stroke: 'bold', lineStyle: 'dotted', corners: 'sharp', arrow: 'open' },
    groups: { stroke: 'none', lineStyle: 'dashed', radius: 'none' },
    labels: { style: 'chip', type: 'label' },
    nodes: { width: 180, height: 84, subtitle: 'small' },
    notes: { type: 'body', family: 'mono', weight: 650, tracking: 0.02, case: 'upper' },
    kinds: { database: 'tint', external: 'spotlight' },
    cards: {
      spotlight: {
        fill: 'gray.900',
        border: 'none',
        shadow: 'md',
        shape: 'pill',
        icon: { style: 'solid', border: 'accent', borderWidth: 1.5, borderStyle: 'dashed' },
        accent: { side: 'top' },
        title: { family: 'mono', weight: 500, tracking: 0.04, case: 'upper' },
        subtitle: { family: 'body', weight: 550, tracking: 0, case: 'none' },
      },
    },
  },
  'color.surfaces.inverse': { diagram: { cards: { spotlight: { icon: { border: 'fg' } } } } },
});

/**
 * The tokens of a brand, or `undefined` when it does not validate.
 *
 * @param brand - The brand as written.
 */
function tokensOf(brand: unknown): BrandTokens | undefined {
  const result = Effect.runSync(Effect.result(resolveBrand(brand)));
  return Result.isSuccess(result) ? result.success.tokens : undefined;
}

/**
 * The tokens of a brand that must validate.
 *
 * @param brand - The brand as written.
 */
function validTokens(brand: unknown): BrandTokens {
  const tokens = tokensOf(brand);
  if (tokens === undefined) {
    throw new Error('The brand does not validate.');
  }

  return tokens;
}

/**
 * The rule of one surface in a stylesheet.
 *
 * @param css - The stylesheet.
 * @param surface - The surface name.
 */
function surfaceRule(css: string, surface: string): string {
  const start = css.indexOf(`[data-brand="test"] [data-surface="${surface}"]`);
  return css.slice(start, css.indexOf('}', start));
}

describe('diagram CSS', () => {
  const css = brandCss(validTokens(DIAGRAM_BRAND));
  const root = css.slice(0, css.indexOf('}'));

  it('writes the diagram look, the card names and the mapped kinds on the brand root', () => {
    for (const line of [
      '  --brand-diagram-cards: default outline solid tint raised spotlight;',
      '  --brand-diagram-kind-database: tint;',
      '  --brand-diagram-kind-external: spotlight;',
      '  --brand-diagram-align: left;',
      '  --brand-diagram-edge-stroke: 4px;',
      '  --brand-diagram-edge-style: dotted;',
      '  --brand-diagram-edge-corners: sharp;',
      '  --brand-diagram-edge-arrow: open;',
      '  --brand-diagram-group-stroke: 0px;',
      '  --brand-diagram-group-style: dashed;',
      '  --brand-diagram-group-dashed: true;',
      '  --brand-diagram-group-radius: 0px;',
      '  --brand-diagram-label-style: chip;',
      '  --brand-diagram-label-type: label;',
      '  --brand-diagram-node-width: 180px;',
      '  --brand-diagram-node-height: 84px;',
      '  --brand-diagram-subtitle-type: small;',
      '  --brand-diagram-note-type: body;',
      '  --brand-diagram-note-family: Mono, monospace;',
      '  --brand-diagram-note-weight: 650;',
      '  --brand-diagram-note-tracking: 0.02em;',
      '  --brand-diagram-note-case: uppercase;',
      '  --brand-diagram-card-spotlight-title-own: true;',
      '  --brand-diagram-card-default-title-own: false;',
      '  --brand-diagram-card-spotlight-shape: pill;',
      '  --brand-diagram-card-spotlight-icon: solid;',
      '  --brand-diagram-card-spotlight-icon-border-width: 1.5px;',
      '  --brand-diagram-card-spotlight-icon-border-style: dashed;',
      '  --brand-diagram-card-spotlight-accent-side: top;',
      '  --brand-diagram-card-spotlight-accent-width: 4px;',
      '  --brand-diagram-card-spotlight-title-family: Mono, monospace;',
      '  --brand-diagram-card-spotlight-title-weight: 500;',
      '  --brand-diagram-card-spotlight-title-tracking: 0.04em;',
      '  --brand-diagram-card-spotlight-title-case: uppercase;',
      '  --brand-diagram-card-spotlight-subtitle-family: Body, sans-serif;',
      '  --brand-diagram-card-spotlight-subtitle-weight: 550;',
      '  --brand-diagram-card-spotlight-subtitle-tracking: 0em;',
      '  --brand-diagram-card-spotlight-subtitle-case: none;',
      '  --brand-diagram-card-default-accent-side: none;',
    ]) {
      expect(root).toContain(line);
    }
  });

  it('writes explicit icon border colors on each surface', () => {
    const tokens = validTokens(DIAGRAM_BRAND);
    for (const [surface, role] of [
      ['default', 'accent'],
      ['inverse', 'fg'],
    ] as const) {
      const color = tokens.surfaces[surface]?.roles[role];
      expect(surfaceRule(css, surface)).toContain(
        `  --brand-diagram-card-spotlight-icon-border: ${color};`,
      );
    }
  });

  it('keeps legacy group dash spacing and timeline width unless a new stroke is written', () => {
    const legacy = brandCss(
      validTokens(testBrand({ diagram: { edges: { stroke: 'bold' }, groups: { dashed: true } } })),
    );
    expect(legacy).toContain('--brand-diagram-group-dashed: true;');
    expect(legacy).not.toContain('--brand-diagram-group-style:');
    expect(legacy).not.toContain('--brand-diagram-edge-style:');
    expect(legacy).not.toContain('--brand-diagram-timeline-stroke:');

    const numeric = brandCss(validTokens(testBrand({ diagram: { edges: { stroke: 0 } } })));
    expect(numeric).toContain('--brand-diagram-edge-stroke: 0px;');
    expect(numeric).toContain('--brand-diagram-timeline-stroke: 0px;');
  });

  it('writes every variable for every card, standard and custom, on the root and each surface', () => {
    const cards = ['default', 'outline', 'solid', 'tint', 'raised', 'spotlight'];
    for (const card of cards) {
      for (const property of CARD_ROOT_PROPERTIES) {
        expect(root, `${card} ${property}`).toContain(`  ${v.card(card, property)}: `);
      }

      for (const surface of ['default', 'inverse', 'accent', 'gradient']) {
        const rule = surfaceRule(css, surface);
        for (const property of CARD_SURFACE_PROPERTIES) {
          expect(rule, `${surface} ${card} ${property}`).toContain(`  ${v.card(card, property)}: `);
        }
      }
    }
  });

  it('writes none as transparent and shadows as drop-shadow filters per surface', () => {
    const rule = surfaceRule(css, 'default');
    expect(rule).toContain('  --brand-diagram-card-spotlight-fill: #18191d;');
    expect(rule).toContain('  --brand-diagram-card-spotlight-border: transparent;');
    expect(rule).toContain('  --brand-diagram-card-outline-fill: transparent;');
    expect(rule).toContain('  --brand-diagram-card-default-node-fill: true;');
    expect(rule).toContain('  --brand-diagram-card-raised-node-fill: false;');
    expect(rule).toContain('  --brand-diagram-card-spotlight-node-fill: false;');
    expect(rule).toContain(
      '  --brand-diagram-card-spotlight-shadow: drop-shadow(4px 4px 0 rgb(24 25 29));',
    );
    expect(rule).toContain('  --brand-diagram-card-default-shadow: none;');
    expect(rule).toContain('  --brand-diagram-card-spotlight-box-shadow: 4px 4px 0 rgb(24 25 29);');
    expect(rule).toContain('  --brand-diagram-card-default-box-shadow: none;');
    expect(rule).toContain('  --brand-diagram-card-default-detail: #dddde1;');
  });

  it('keeps the existing variables of a brand without the new keys', () => {
    const tokens = validTokens(testBrand());
    const plain = brandCss(tokens);
    for (const surface of Object.values(tokens.surfaces)) {
      const rule = surfaceRule(plain, surface.name);
      const derived = deriveDiagramTheme(surface, {});
      for (const token of DIAGRAM_TOKENS) {
        expect(rule, `${surface.name} ${token}`).toContain(
          `  ${v.diagram(token)}: ${derived[token]};`,
        );
      }
    }

    expect(Object.keys(tokens.surfaces)).toEqual(['default', 'inverse', 'accent', 'gradient']);
    expect(plain).toContain('  --brand-diagram-node: #f5f5f6;');
    expect(plain).toContain('  --brand-diagram-cards: default outline solid tint raised;');
    expect(plain).not.toContain('--brand-diagram-kind-');
    expect(plain).toContain('  --brand-diagram-label-type: caption;');
    expect(plain).not.toContain('--brand-diagram-align:');
    expect(plain).not.toContain('--brand-diagram-note-family:');
    expect(plain).not.toContain('--brand-diagram-card-default-icon-border-width:');
  });
});

describe('hostile diagram strings', () => {
  const expected = cssStructure(brandCss(validTokens(DIAGRAM_BRAND)));
  const payloads = ['"', '}', ';', '*/', '</style>', '\n', 'x) } body { a: url(//evil)'];

  it('either fail validation or compile to the same rules for a payload in a card or kind name', () => {
    const places = [
      { path: ['diagram', 'cards'], key: 'spotlight' },
      { path: ['diagram', 'kinds'], key: 'database' },
    ];
    for (const place of places) {
      for (const payload of payloads) {
        const brand = structuredClone(DIAGRAM_BRAND) as Record<string, unknown>;
        const parent = place.path.reduce<unknown>(
          (node, key) => Reflect.get(Object(node), key),
          brand,
        );
        Reflect.set(
          Object(parent),
          `${place.key}${payload}`,
          Reflect.get(Object(parent), place.key),
        );
        Reflect.deleteProperty(Object(parent), place.key);
        const tokens = tokensOf(brand);
        const outcome = tokens === undefined ? 'rejected' : cssStructure(brandCss(tokens));
        expect(outcome === 'rejected' || outcome === expected, JSON.stringify(payload)).toBe(true);
      }
    }
  });

  it('refuse a payload in a card color', () => {
    for (const field of ['fill', 'border']) {
      for (const payload of payloads) {
        const brand = structuredClone(DIAGRAM_BRAND) as Record<string, unknown>;
        const card = Reflect.get(
          Object(Reflect.get(Object(brand['diagram']), 'cards')),
          'spotlight',
        );
        Reflect.set(Object(card), field, `${String(Reflect.get(Object(card), field))}${payload}`);
        expect(tokensOf(brand), `${field} ${JSON.stringify(payload)}`).toBeUndefined();
      }
    }
  });

  it('refuse a payload in the card a kind maps to', () => {
    for (const payload of payloads) {
      const brand = structuredClone(DIAGRAM_BRAND) as Record<string, unknown>;
      const kinds = Reflect.get(Object(brand['diagram']), 'kinds');
      Reflect.set(Object(kinds), 'database', `tint${payload}`);
      expect(tokensOf(brand), JSON.stringify(payload)).toBeUndefined();
    }
  });

  it('refuses a tampered card token that would end its declaration', () => {
    const tokens = validTokens(DIAGRAM_BRAND);
    const spotlight = tokens.diagram.cards['spotlight'];
    if (spotlight === undefined) {
      throw new Error('No spotlight card.');
    }

    const tampered: BrandTokens = {
      ...tokens,
      diagram: {
        ...tokens.diagram,
        cards: {
          ...tokens.diagram.cards,
          spotlight: { ...spotlight, title: { ...spotlight.title, stack: 'x; } a { b: c' } },
        },
      },
    };
    expect(() => brandCss(tampered)).toThrow(TypeError);
    const renamed: BrandTokens = {
      ...tokens,
      diagram: { ...tokens.diagram, kinds: { database: 'tint; } a { b: c' } },
    };
    expect(() => brandCss(renamed)).toThrow(TypeError);
    const surface = tokens.surfaces['default'];
    const card = surface?.diagramCards['spotlight'];
    if (surface === undefined || card === undefined) {
      throw new Error('No spotlight card on the default surface.');
    }

    const shadowed: BrandTokens = {
      ...tokens,
      surfaces: {
        ...tokens.surfaces,
        default: {
          ...surface,
          diagramCards: {
            ...surface.diagramCards,
            spotlight: { ...card, shadow: { ...card.shadow, boxShadow: 'none; } a { b: c' } },
          },
        },
      },
    };
    expect(() => brandCss(shadowed)).toThrow(TypeError);
  });
});
