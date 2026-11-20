import type { Brand } from '#schema/brand-schema.ts';
import type { BrandDiagram, DiagramTextSpec } from '#schema/diagram-schema.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import {
  CARD_OPTIONAL_ROOT_PROPERTIES,
  CARD_OPTIONAL_SURFACE_PROPERTIES,
  CARD_ROOT_PROPERTIES,
  CARD_SURFACE_PROPERTIES,
} from '#compile/variable-names.ts';
import { ownValue } from '#resolve/own-value.ts';
import { diagramCardNames } from '#resolve/resolve-diagram.ts';
import {
  DIAGRAM_NODE_KIND_ALIASES,
  DIAGRAM_NODE_KINDS,
  MAX_DIAGRAM_CARDS,
} from '#schema/diagram-schema.ts';
import { FAMILY_ROLES } from '#schema/typography-schema.ts';
import { pickFrom } from '#validate/suggest.ts';

/**
 * Node kinds `diagram.kinds` may map, for lookups.
 */
const KINDS: ReadonlySet<string> = new Set(DIAGRAM_NODE_KINDS);

/**
 * Family roles diagram text may name, for lookups.
 */
const FAMILIES: ReadonlySet<string> = new Set(FAMILY_ROLES);

/**
 * Every property a card has a variable for, to find card names whose variables would collide.
 */
const CARD_PROPERTIES: readonly string[] = [
  ...CARD_ROOT_PROPERTIES,
  ...CARD_OPTIONAL_ROOT_PROPERTIES,
  ...CARD_SURFACE_PROPERTIES,
  ...CARD_OPTIONAL_SURFACE_PROPERTIES,
];

/**
 * Checks the names the brand's `diagram` section uses, and the cards its surfaces recolor: no more
 * than {@link MAX_DIAGRAM_CARDS} cards, `kinds` keys that are node kinds the kit draws and values
 * that are cards the brand has (standard or its own), recolored cards that the brand has, card text
 * families that are family roles, and no two cards whose CSS variables would share a name (`tint`
 * and `tint-icon` both write `--brand-diagram-card-tint-icon-fill`). Card colors naming a role that
 * does not exist are reported while the cards resolve.
 *
 * @param brand - The decoded brand.
 * @returns Every problem found; empty for a brand that writes no cards, kinds or recolorings.
 */
export function checkDiagramNames(brand: Brand): BrandProblem[] {
  const { diagram } = brand;
  const cards = diagramCardNames(diagram);
  const recolors = checkSurfaceCards(brand, cards);
  if (diagram === undefined) {
    return recolors;
  }

  return [
    ...recolors,
    ...checkCardCount(Object.keys(diagram.cards ?? {})),
    ...checkKinds(diagram.kinds ?? {}, cards),
    ...checkTextFamilies(diagram),
    ...checkCardCollisions(cards),
  ];
}

/**
 * Each card a surface recolors must be a card the brand has.
 *
 * @param brand - The decoded brand.
 * @param cards - Every card name the brand has.
 */
function checkSurfaceCards(brand: Brand, cards: readonly string[]): BrandProblem[] {
  return Object.entries(brand.color.surfaces).flatMap(([surface, spec]) =>
    Object.keys(spec.diagram?.cards ?? {}).flatMap((card) => {
      if (cards.includes(card)) {
        return [];
      }

      return [
        {
          path: `color.surfaces.${surface}.diagram.cards.${card}`,
          message: `The ${surface} surface recolors a card "${card}" that the brand does not have.`,
          fix: `${pickFrom(card, cards, 'card')} Or define "${card}" under \`diagram.cards\`.`,
        },
      ];
    }),
  );
}

/**
 * A brand may write at most {@link MAX_DIAGRAM_CARDS} cards.
 *
 * @param written - The card names the brand writes.
 */
function checkCardCount(written: readonly string[]): BrandProblem[] {
  if (written.length <= MAX_DIAGRAM_CARDS) {
    return [];
  }

  return [
    {
      path: 'diagram.cards',
      message:
        `The brand defines ${written.length} cards; a brand may define at most ` +
        `${MAX_DIAGRAM_CARDS}, so a deck's diagrams stay one family.`,
      fix:
        'Merge cards that differ only slightly, or restyle a standard card (default, outline, ' +
        'solid, tint, raised) instead of adding one.',
    },
  ];
}

/**
 * Each `kinds` key must be a node kind and each value a card the brand has.
 *
 * @param kinds - Node kind to card name, as written.
 * @param cards - Every card name the brand has.
 */
function checkKinds(
  kinds: Readonly<Record<string, string>>,
  cards: readonly string[],
): BrandProblem[] {
  return Object.entries(kinds).flatMap(([kind, card]) => {
    const path = `diagram.kinds.${kind}`;
    const kindProblems = KINDS.has(kind)
      ? []
      : [
          {
            path,
            message: `There is no node kind named "${kind}".`,
            fix: kindFix(kind),
          },
        ];
    const cardProblems = cards.includes(card)
      ? []
      : [
          {
            path,
            message: `"${kind}" uses a card "${card}" that the brand does not have.`,
            fix: `${pickFrom(card, cards, 'card')} Or define "${card}" under \`diagram.cards\`.`,
          },
        ];
    return [...kindProblems, ...cardProblems];
  });
}

/**
 * The fix for a `kinds` key that is not a kind: the kind an alias stands for, else the closest
 * kind.
 *
 * @param kind - The key as written.
 */
function kindFix(kind: string): string {
  const canonical = ownValue(DIAGRAM_NODE_KIND_ALIASES, kind);
  if (canonical !== undefined) {
    return (
      `Use "${canonical}": "${kind}" is another name for it on a node, but \`diagram.kinds\` ` +
      'takes the kind itself.'
    );
  }

  return pickFrom(kind, DIAGRAM_NODE_KINDS, 'node kind');
}

/**
 * Diagram text must use one of the brand's font family roles when it specifies a family.
 *
 * @param diagram - The diagram as written.
 */
function checkTextFamilies(diagram: BrandDiagram): BrandProblem[] {
  const topLevel = [
    checkFamily(diagram.nodes?.subtitle, 'diagram.nodes.subtitle'),
    checkFamily(diagram.notes, 'diagram.notes'),
  ];
  const cards = Object.entries(diagram.cards ?? {}).flatMap(([name, card]) => [
    checkFamily(card.title, `diagram.cards.${name}.title`),
    checkFamily(card.subtitle, `diagram.cards.${name}.subtitle`),
  ]);
  return [...topLevel, ...cards].filter((problem) => problem !== undefined);
}

/**
 * Reports an unknown family at its written field. A shorthand step names no family.
 */
function checkFamily(
  text: DiagramTextSpec | string | null | undefined,
  path: string,
): BrandProblem | undefined {
  const family = typeof text === 'string' ? undefined : text?.family;
  if (family === undefined || FAMILIES.has(family)) {
    return undefined;
  }

  return {
    path: `${path}.family`,
    message: `There is no family role named "${family}".`,
    fix: pickFrom(family, FAMILY_ROLES, 'family role'),
  };
}

/**
 * No two cards may write a variable of the same name: a card named after another card plus a
 * property prefix (`tint-icon` next to `tint`) would.
 *
 * @param cards - Every card name the brand has.
 */
function checkCardCollisions(cards: readonly string[]): BrandProblem[] {
  const owners = new Map<string, string>();
  const problems: BrandProblem[] = [];
  for (const card of cards) {
    for (const property of CARD_PROPERTIES) {
      const name = `${card}-${property}`;
      const owner = owners.get(name);
      if (owner !== undefined && owner !== card) {
        problems.push(collision(card, owner, name));
      }

      owners.set(name, card);
    }
  }

  return problems;
}

/**
 * The problem for two cards whose variables share a name, reported on the longer name, the one that
 * starts with the other.
 *
 * @param card - One card.
 * @param other - The other card.
 * @param name - The shared part of the variable name.
 */
function collision(card: string, other: string, name: string): BrandProblem {
  const [longer, shorter] = card.length > other.length ? [card, other] : [other, card];
  return {
    path: `diagram.cards.${longer}`,
    message:
      `The cards "${shorter}" and "${longer}" would both write --brand-diagram-card-${name}, ` +
      'so one would hide the other.',
    fix: `Rename "${longer}" so it does not start with "${shorter}-".`,
  };
}
