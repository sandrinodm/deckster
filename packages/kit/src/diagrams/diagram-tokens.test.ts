// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { edgeCornerRadius, FALLBACK, readDiagramTokens } from '#diagrams/diagram-tokens.ts';

/**
 * An element on the page with the given custom properties set on it.
 *
 * @param variables - The custom properties.
 */
function elementWith(variables: Readonly<Record<string, string>>): HTMLElement {
  const element = document.createElement('div');
  for (const [name, value] of Object.entries(variables)) {
    element.style.setProperty(name, value);
  }

  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('the fallback tokens', () => {
  it("describe today's diagram: no cards, round corners, a filled arrowhead, plain labels", () => {
    expect(FALLBACK.cards.cards.size).toBe(0);
    expect(FALLBACK.cards.kinds.size).toBe(0);
    expect(FALLBACK.cards.fallback).toMatchObject({
      name: 'default',
      stroke: FALLBACK.stroke.regular,
      radius: FALLBACK.radius.md,
      shape: 'kind',
      icon: 'chip',
      accent: { side: 'none' },
      shadow: false,
      nodeFill: true,
    });
    expect(FALLBACK.edge).toEqual({
      stroke: FALLBACK.stroke.regular,
      corners: 'round',
      arrow: 'triangle',
    });
    expect(FALLBACK.group).toEqual({
      stroke: FALLBACK.stroke.hairline,
      dashed: false,
      radius: FALLBACK.radius.lg,
    });
    expect(FALLBACK.label).toEqual({ style: 'plain', type: 'caption' });
  });
});

describe('readDiagramTokens', () => {
  it("reads today's look from a stylesheet without the diagram look or cards", () => {
    const tokens = readDiagramTokens(
      elementWith({ '--brand-stroke-regular': '3px', '--brand-radius-lg': '24px' }),
    );
    expect(tokens.cards.cards.size).toBe(0);
    expect(tokens.cards.fallback).toMatchObject({ stroke: 3, radius: FALLBACK.radius.md });
    expect(tokens.edge).toEqual({ stroke: 3, corners: 'round', arrow: 'triangle' });
    expect(tokens.group).toEqual({ stroke: FALLBACK.stroke.hairline, dashed: false, radius: 24 });
    expect(edgeCornerRadius(tokens, 24)).toBe(24);
  });

  it('reads the diagram look', () => {
    const tokens = readDiagramTokens(
      elementWith({
        '--brand-diagram-edge-stroke': '1px',
        '--brand-diagram-edge-corners': 'sharp',
        '--brand-diagram-edge-arrow': 'open',
        '--brand-diagram-group-stroke': '0px',
        '--brand-diagram-group-dashed': 'true',
        '--brand-diagram-group-radius': '0px',
        '--brand-diagram-label-style': 'chip',
      }),
    );
    expect(tokens.edge).toEqual({ stroke: 1, corners: 'sharp', arrow: 'open' });
    expect(tokens.group).toEqual({ stroke: 0, dashed: true, radius: 0 });
    expect(tokens.label).toEqual({ style: 'chip', type: 'caption' });
    expect(edgeCornerRadius(tokens, 24)).toBe(0);
  });

  it('ignores an unknown keyword', () => {
    const tokens = readDiagramTokens(elementWith({ '--brand-diagram-edge-arrow': 'star' }));
    expect(tokens.edge.arrow).toBe('triangle');
  });

  it('reads each card in the list, its geometry and the kind map, skipping bad names', () => {
    const tokens = readDiagramTokens(
      elementWith({
        '--brand-diagram-cards': 'default spotlight Bad x);y',
        '--brand-diagram-card-spotlight-stroke': '4px',
        '--brand-diagram-card-spotlight-radius': '0px',
        '--brand-diagram-card-spotlight-shape': 'box',
        '--brand-diagram-card-spotlight-icon': 'plain',
        '--brand-diagram-card-spotlight-accent-side': 'left',
        '--brand-diagram-card-spotlight-accent-width': '8px',
        '--brand-diagram-card-spotlight-shadow': 'drop-shadow(4px 4px 0 black)',
        '--brand-diagram-card-default-shadow': 'none',
        '--brand-diagram-card-spotlight-node-fill': 'false',
        '--brand-diagram-kind-database': 'spotlight',
        '--brand-diagram-kind-queue': 'not a name',
      }),
    );
    expect([...tokens.cards.cards.keys()]).toEqual(['default', 'spotlight']);
    expect(tokens.cards.cards.get('spotlight')).toMatchObject({
      stroke: 4,
      radius: 0,
      shape: 'box',
      icon: 'plain',
      accent: { side: 'left', width: 8 },
      shadow: true,
      nodeFill: false,
    });
    expect(tokens.cards.cards.get('default')).toMatchObject({
      stroke: FALLBACK.stroke.regular,
      radius: FALLBACK.radius.md,
      shape: 'kind',
      icon: 'chip',
      accent: { side: 'none', width: FALLBACK.stroke.bold },
      shadow: false,
      nodeFill: true,
    });
    expect(tokens.cards.kinds).toEqual(new Map([['database', 'spotlight']]));
  });
});

describe('the card node-fill flag', () => {
  it('reads `node-fill`, and counts only `default` as the node colour without it', () => {
    const tokens = readDiagramTokens(
      elementWith({
        '--brand-diagram-cards': 'default raised outline',
        '--brand-diagram-card-raised-node-fill': 'true',
      }),
    );
    expect(tokens.cards.cards.get('default')?.nodeFill).toBe(true);
    expect(tokens.cards.cards.get('raised')?.nodeFill).toBe(true);
    expect(tokens.cards.cards.get('outline')?.nodeFill).toBe(false);
  });
});

describe('the card title-own flag', () => {
  it('reads `title-own`, and counts a card without it as not the brand’s own', () => {
    const tokens = readDiagramTokens(
      elementWith({
        '--brand-diagram-cards': 'default solid',
        '--brand-diagram-card-default-title-own': 'true',
      }),
    );
    expect(tokens.cards.cards.get('default')?.titleOwn).toBe(true);
    expect(tokens.cards.cards.get('solid')?.titleOwn).toBe(false);
    expect(FALLBACK.cards.fallback.titleOwn).toBe(false);
  });
});

describe('the edge label step', () => {
  it('sets labels in the caption step without the variable', () => {
    const tokens = readDiagramTokens(elementWith({}));
    expect(tokens.label.type).toBe('caption');
    expect(tokens.measureEdgeLabel).toBe(tokens.measureCaption);
    expect(FALLBACK.label.type).toBe('caption');
  });

  it('measures labels in the label step when the brand sets them there', () => {
    const tokens = readDiagramTokens(elementWith({ '--brand-diagram-label-type': 'label' }));
    expect(tokens.label.type).toBe('label');
    expect(tokens.measureEdgeLabel).toBe(tokens.measureLabel);
  });

  it('ignores an unknown step', () => {
    const tokens = readDiagramTokens(elementWith({ '--brand-diagram-label-type': 'display' }));
    expect(tokens.label.type).toBe('caption');
  });
});
