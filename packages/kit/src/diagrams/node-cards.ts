import type { CSSProperties } from 'react';

import type { DiagramLineStyle, DiagramTextStep } from '#diagrams/diagram-design.ts';
import type { NodeKind } from '#diagrams/node-kinds.ts';

/**
 * The card names every brand has, whether or not it writes them: the brand derives them from its
 * roles and may restyle them or add its own.
 */
export const STANDARD_CARDS = ['default', 'outline', 'solid', 'tint', 'raised'] as const;

/**
 * The card a node falls back to when nothing else names one.
 */
export const DEFAULT_CARD = 'default';

/**
 * How a card shapes its node: the node kind's shape, a plain box, or a pill.
 */
export const CARD_SHAPES = ['kind', 'box', 'pill'] as const;

/**
 * One of {@link CARD_SHAPES}.
 */
export type CardShape = (typeof CARD_SHAPES)[number];

/**
 * How a card draws its node's icon: a bordered tile (today's look), a filled tile, the bare glyph,
 * or no icon at all.
 */
export const CARD_ICONS = ['chip', 'solid', 'plain', 'none'] as const;

/**
 * One of {@link CARD_ICONS}.
 */
export type CardIcon = (typeof CARD_ICONS)[number];

/**
 * The side a card's accent stripe runs along, or `none`.
 */
export const ACCENT_SIDES = ['none', 'left', 'top', 'right', 'bottom'] as const;

/**
 * One of {@link ACCENT_SIDES}.
 */
export type AccentSide = (typeof ACCENT_SIDES)[number];

/**
 * A card name as the brand writes it in `--brand-diagram-cards`: a kebab name. Only names of this
 * shape are ever put into a variable name.
 */
const CARD_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Whether a string is a card name the kit may put into a variable name.
 *
 * @param name - The name.
 */
export function isCardName(name: string): boolean {
  return CARD_NAME.test(name);
}

/**
 * The geometry of one card, read from the brand's variables: what layout, routing, measuring and
 * the node shapes need to agree with what CSS paints.
 */
export type CardTokens = {
  /**
   * The card's name.
   */
  name: string;

  /**
   * The outline's width in canvas pixels.
   */
  stroke: number;

  /**
   * Pattern of the node's outline, absent for a legacy outline.
   */
  borderStyle?: DiagramLineStyle | undefined;

  /**
   * Whether the brand supplies a visible icon frame for an otherwise borderless mode.
   */
  iconBorder?: boolean;

  /**
   * Typography step of the subtitle.
   */
  subtitleStep?: DiagramTextStep;

  /**
   * Width of subtitle text, in canvas pixels.
   */
  measureSubtitle?: (text: string) => number;

  /**
   * The corner radius in canvas pixels.
   */
  radius: number;

  /**
   * The shape it gives its node.
   */
  shape: CardShape;

  /**
   * How it draws the icon.
   */
  icon: CardIcon;

  /**
   * Its accent stripe: the side and the width in canvas pixels.
   */
  accent: { side: AccentSide; width: number };

  /**
   * Whether it casts a shadow on the diagram's surface (its shadow is not `none` there).
   */
  shadow: boolean;

  /**
   * Whether its fill is the diagram `node` colour (the brand's `node-fill` flag), so a node inside
   * a group takes the slide's background on a light surface, as it always has.
   */
  nodeFill: boolean;

  /**
   * Whether the brand wrote the card's title type (on the card or its `default`), so the parts that
   * otherwise keep their own type (a Layers band title and item chips) take it too.
   */
  titleOwn: boolean;

  /**
   * The width of a string set as a node title in this card's title font, in canvas pixels.
   */
  measureTitle: (text: string) => number;
};

/**
 * The card a node is drawn with, and what it asked for that the brand does not have.
 */
export type ResolvedCard = {
  /**
   * The card's name; `default` when nothing else applies.
   */
  name: string;

  /**
   * The names asked for that the brand does not have, in the order they were skipped; empty when
   * none was.
   */
  missing: readonly string[];

  /**
   * The card's geometry.
   */
  tokens: CardTokens;

  /**
   * Whether the brand defines the card, so its variables exist and the node takes their paint;
   * `false` only for a stylesheet without card variables, where the node keeps the node colours.
   */
  defined: boolean;

  /**
   * Whether the card was named (by the node, its diagram or the brand's kind map) rather than
   * reached as the last resort.
   */
  named: boolean;
};

/**
 * What {@link resolveCard} reads from the brand: its cards by name, the card each kind maps to, and
 * the card used when the brand defines none.
 */
export type CardSource = {
  /**
   * The brand's cards by name; empty for a stylesheet without card variables.
   */
  cards: ReadonlyMap<string, CardTokens>;

  /**
   * The card the brand maps a node kind to, for the kinds it maps.
   */
  kinds: ReadonlyMap<string, string>;

  /**
   * The geometry of a node when the brand defines no card at all: today's node.
   */
  fallback: CardTokens;
};

/**
 * Picks a node's card, in order: its own `card`; its diagram's `card`; the card the brand maps its
 * kind to; `default`. A name the brand does not have is skipped and recorded as missing, so the
 * next in the order applies and nothing throws.
 *
 * @param source - The brand's cards and kind map.
 * @param asked - The node's own card, its diagram's card, and its kind.
 */
export function resolveCard(
  source: CardSource,
  asked: { own?: string | undefined; diagram?: string | undefined; kind?: NodeKind | undefined },
): ResolvedCard {
  const missing: string[] = [];
  const mapped = asked.kind === undefined ? undefined : source.kinds.get(asked.kind);
  for (const name of [asked.own, asked.diagram, mapped]) {
    if (name === undefined || name === '') {
      continue;
    }

    const tokens = source.cards.get(name);
    if (tokens !== undefined) {
      return { name, missing, tokens, defined: true, named: true };
    }

    if (!missing.includes(name)) {
      missing.push(name);
    }
  }

  const fallback = source.cards.get(DEFAULT_CARD);
  return fallback === undefined
    ? { name: DEFAULT_CARD, missing, tokens: source.fallback, defined: false, named: false }
    : { name: DEFAULT_CARD, missing, tokens: fallback, defined: true, named: false };
}

/**
 * The paint variables a card's CSS reads from the brand, by the private variable each one sets on
 * the node's elements.
 */
const PAINT_VARIABLES = {
  /**
   * The fill.
   */
  '--kit-card-fill': 'fill',

  /**
   * The outline colour.
   */
  '--kit-card-border': 'border',

  /**
   * The colour of the shape's detail lines and the chip icon's tile border: the border colour, or
   * the subtitle colour for a card without a border.
   */
  '--kit-card-detail': 'detail',

  /**
   * The title colour.
   */
  '--kit-card-text': 'text',

  /**
   * The subtitle colour.
   */
  '--kit-card-subtext': 'subtext',

  /**
   * The icon glyph's colour.
   */
  '--kit-card-icon-color': 'icon-color',

  /**
   * A solid icon tile's colour.
   */
  '--kit-card-icon-fill': 'icon-fill',

  /**
   * The icon frame color.
   */
  '--kit-card-icon-border': 'icon-border',

  /**
   * The icon frame width.
   */
  '--kit-card-icon-border-width': 'icon-border-width',

  /**
   * The icon frame pattern.
   */
  '--kit-card-icon-border-style': 'icon-border-style',

  /**
   * The card outline pattern.
   */
  '--kit-card-border-style': 'border-style',

  /**
   * The subtitle font family.
   */
  '--kit-card-subtitle-family': 'subtitle-family',

  /**
   * The subtitle font weight.
   */
  '--kit-card-subtitle-weight': 'subtitle-weight',

  /**
   * The subtitle letter spacing.
   */
  '--kit-card-subtitle-tracking': 'subtitle-tracking',

  /**
   * The subtitle case.
   */
  '--kit-card-subtitle-case': 'subtitle-case',

  /**
   * The accent stripe's colour.
   */
  '--kit-card-accent': 'accent',

  /**
   * The shadow, a `filter` value.
   */
  '--kit-card-shadow': 'shadow',

  /**
   * The title's family.
   */
  '--kit-card-title-family': 'title-family',

  /**
   * The title's weight.
   */
  '--kit-card-title-weight': 'title-weight',

  /**
   * The title's letter spacing.
   */
  '--kit-card-title-tracking': 'title-tracking',

  /**
   * The title's case.
   */
  '--kit-card-title-case': 'title-case',
} as const;

/**
 * The inline style that points a node's elements at its card: each private `--kit-card-*` variable
 * set to the brand's variable for the card, plus the outline width and radius from the card's
 * geometry, so the stylesheet needs no rule per card. Empty for a card the brand does not define,
 * so the stylesheet's fallbacks (the node colours) apply.
 *
 * @param card - The resolved card.
 */
export function cardStyle(card: ResolvedCard): CSSProperties {
  if (!card.defined || !isCardName(card.name)) {
    return {};
  }

  return {
    ...cardVariables(card.name),
    '--kit-card-icon-border-fallback':
      card.tokens.iconBorder === true ? 'var(--kit-card-detail)' : 'initial',
    '--kit-card-icon-border-default-width':
      card.tokens.iconBorder === true ? 'var(--brand-stroke-regular)' : 'initial',
    '--kit-card-stroke': `${card.tokens.stroke}px`,
    '--kit-card-radius': `${card.tokens.radius}px`,
  } as CSSProperties;
}

/**
 * The private `--kit-card-*` paint and title variables of a card, each set to the brand's variable
 * for it.
 *
 * @param name - The card's name; it must pass {@link isCardName}.
 */
export function cardVariables(name: string): Record<string, string> {
  const style: Record<string, string> = {};
  for (const [variable, field] of Object.entries(PAINT_VARIABLES)) {
    style[variable] = `var(--brand-diagram-card-${name}-${field})`;
  }

  return style;
}

/**
 * The private `--kit-card-title-*` variables of a card, each set to the brand's variable for it:
 * what a part needs to set its text in the card's title type and nothing else.
 *
 * @param name - The card's name; it must pass {@link isCardName}.
 */
export function cardTitleVariables(name: string): Record<string, string> {
  return Object.fromEntries(
    ['family', 'weight', 'tracking', 'case'].map((field) => [
      `--kit-card-title-${field}`,
      `var(--brand-diagram-card-${name}-title-${field})`,
    ]),
  );
}

/**
 * The `data-*` attributes every element drawn with a card carries: `data-card` (the card it uses)
 * and `data-card-missing` (the names asked for that the brand does not have, space separated), for
 * `deckster lint` and the exporter.
 *
 * @param card - The resolved card.
 */
export function cardData(card: ResolvedCard): {
  'data-card': string;
  'data-card-missing'?: string;
} {
  return card.missing.length === 0
    ? { 'data-card': card.name }
    : { 'data-card': card.name, 'data-card-missing': card.missing.join(' ') };
}
