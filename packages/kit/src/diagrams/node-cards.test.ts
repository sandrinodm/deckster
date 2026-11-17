import { describe, expect, it } from 'vite-plus/test';

import { FALLBACK } from '#diagrams/diagram-tokens.ts';
import {
  cardData,
  cardStyle,
  isCardName,
  resolveCard,
  type CardSource,
  type CardTokens,
} from '#diagrams/node-cards.ts';

/**
 * A card's geometry for the tests.
 *
 * @param name - The card's name.
 */
function card(name: string): CardTokens {
  return { ...FALLBACK.cards.fallback, name };
}

/**
 * A brand with the five standard cards and its own `spotlight`, mapping databases to `tint`.
 */
const BRAND: CardSource = {
  cards: new Map(
    ['default', 'outline', 'solid', 'tint', 'raised', 'spotlight'].map((name) => [
      name,
      card(name),
    ]),
  ),
  kinds: new Map([['database', 'tint']]),
  fallback: FALLBACK.cards.fallback,
};

describe('resolveCard', () => {
  it('takes the node card, then the diagram card, then the kind card, then default', () => {
    const asked = { own: 'solid', diagram: 'raised', kind: 'database' } as const;
    expect(resolveCard(BRAND, asked).name).toBe('solid');
    expect(resolveCard(BRAND, { ...asked, own: undefined }).name).toBe('raised');
    expect(resolveCard(BRAND, { kind: 'database' }).name).toBe('tint');
    expect(resolveCard(BRAND, { kind: 'service' }).name).toBe('default');
  });

  it('skips a name the brand lacks, records it and falls through', () => {
    const resolved = resolveCard(BRAND, { own: 'glow', diagram: 'nope', kind: 'database' });
    expect(resolved.name).toBe('tint');
    expect(resolved.missing).toEqual(['glow', 'nope']);
    expect(cardData(resolved)).toEqual({ 'data-card': 'tint', 'data-card-missing': 'glow nope' });
  });

  it('marks a named card and the last resort apart', () => {
    expect(resolveCard(BRAND, { own: 'spotlight' })).toMatchObject({ named: true, defined: true });
    expect(resolveCard(BRAND, {})).toMatchObject({ named: false, defined: true });
  });

  it("draws today's node for a stylesheet without cards, whatever was asked", () => {
    const resolved = resolveCard(FALLBACK.cards, { own: 'solid', kind: 'database' });
    expect(resolved).toMatchObject({ name: 'default', defined: false, missing: ['solid'] });
    expect(resolved.tokens).toBe(FALLBACK.cards.fallback);
    expect(cardStyle(resolved)).toEqual({});
  });
});

describe('cardStyle', () => {
  it("points the private variables at the card's brand variables, with its geometry", () => {
    const style = cardStyle(resolveCard(BRAND, { own: 'spotlight' })) as Record<string, string>;
    expect(style['--kit-card-fill']).toBe('var(--brand-diagram-card-spotlight-fill)');
    expect(style['--kit-card-shadow']).toBe('var(--brand-diagram-card-spotlight-shadow)');
    expect(style['--kit-card-title-case']).toBe('var(--brand-diagram-card-spotlight-title-case)');
    expect(style['--kit-card-stroke']).toBe(`${FALLBACK.stroke.regular}px`);
    expect(style['--kit-card-radius']).toBe(`${FALLBACK.radius.md}px`);
  });
});

describe('isCardName', () => {
  it.each(['default', 'tint', 'spotlight-2', 'a1'])('takes %s', (name) => {
    expect(isCardName(name)).toBe(true);
  });

  it.each(['', 'Tint', '-tint', 'tint-', 'a b', 'x);color:red', 'a--b'])('refuses %j', (name) => {
    expect(isCardName(name)).toBe(false);
  });
});
