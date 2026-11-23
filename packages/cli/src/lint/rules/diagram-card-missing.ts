import { STANDARD_CARDS } from '@deckster/brand';

import type { ElementSnapshot, RuleViolation, SlideRule } from '#lint/types.ts';

import {
  diagramName,
  diagramsOn,
  diagramTag,
  type DiagramSnapshot,
} from '#lint/rules/diagram-elements.ts';
import { nearestName } from '#lint/rules/nearest-name.ts';

/**
 * The `data-*` attribute (without its prefix) the kit puts on a part drawn with a card when the
 * card it asked for is not one the brand has: the names asked for, space separated.
 */
const MISSING_ATTRIBUTE = 'card-missing';

/**
 * The `data-*` attribute with the card a part is drawn with.
 */
const CARD_ATTRIBUTE = 'card';

/**
 * A part of a flow node that repeats its node's attributes: the shape behind the node's text. The
 * node itself is reported, so the shape is skipped.
 */
const SHAPE_PART = 'node-shape';

/**
 * How each part that takes a card is named in messages, by its `data-diagram-part`.
 */
const PART_NOUNS: Readonly<Record<string, string>> = {
  /**
   * A node of a flow, tree or cycle (an actor of a sequence diagram is named as one).
   */
  node: 'node',

  /**
   * A band of a `<Layers>` stack.
   */
  layer: 'layer',

  /**
   * A chip inside a band.
   */
  item: 'item',
};

/**
 * A card name a slide asks for that the brand does not have, in one diagram, with the parts that
 * ask for it.
 */
type MissingCard = {
  /**
   * The name asked for.
   */
  name: string;

  /**
   * The parts that asked for it, in document order.
   */
  parts: ElementSnapshot[];
};

/**
 * A diagram part that asks for a card the brand does not have: a node, actor, layer or item whose
 * own `card`, or its diagram's, names one the brand lacks. The kit draws it with the next card in
 * the order (the card its kind maps to, else `default`), so the slide renders; the finding names
 * the brand's cards and the closest one. A warning, as card names other than the standard five
 * differ between brands and a deck may be linted in another one.
 */
export const diagramCardMissingRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'diagram-card-missing',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * The card a part asks for does not change by step; checked once on the last step.
   */
  scope: 'slide',

  /**
   * The part still renders with another card; it is a warning.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A diagram part names a card the brand does not have, so it uses another card.',

  /**
   * Reports each missing card name once per diagram, with every part that asks for it.
   */
  check: ({ snapshot, slide, brand }) => {
    const cards = Object.keys(brand.tokens.diagram.cards);
    return diagramsOn(snapshot).flatMap((diagram) =>
      missingCards(diagram, cards).map((missing): RuleViolation => ({
        message: missingMessage(diagram, missing, brand.name, snapshot.elements),
        fix: missingFix(missing, { brand: brand.name, cards, file: slide.file, diagram }),
        selector: missing.parts[0]?.selector ?? null,
        key: `${diagram.root.selector}|${missing.name}`,
      })),
    );
  },
};

/**
 * The card names a diagram's parts ask for that the brand does not have, each with its parts. A
 * name the page marks missing but the brand has (a stylesheet older than the brand) is left out.
 *
 * @param diagram - A diagram.
 * @param cards - Every card the brand has.
 */
function missingCards(diagram: DiagramSnapshot, cards: readonly string[]): MissingCard[] {
  const byName = new Map<string, ElementSnapshot[]>();
  for (const part of diagram.parts) {
    const names = part.data[MISSING_ATTRIBUTE];
    if (names === undefined || part.data['diagram-part'] === SHAPE_PART) {
      continue;
    }

    for (const name of names.split(' ').filter((word) => word !== '' && !cards.includes(word))) {
      byName.set(name, [...(byName.get(name) ?? []), part]);
    }
  }

  return [...byName].map(([name, parts]) => ({ name, parts }));
}

/**
 * The finding's message: the diagram, the parts, the card asked for and what they use instead.
 *
 * @param diagram - The diagram.
 * @param missing - The card name and the parts that ask for it.
 * @param brand - The brand's name.
 * @param elements - The slide's elements, to find a part's title.
 */
function missingMessage(
  diagram: DiagramSnapshot,
  missing: MissingCard,
  brand: string,
  elements: readonly ElementSnapshot[],
): string {
  const named = missing.parts.map((part) => partLabel(part, diagram, elements));
  const used = [...new Set(missing.parts.map(fallbackOf))];
  const fallback =
    used.length === 1
      ? (used[0] ?? '')
      : 'the next card in the order (the card for their kind, else "default")';
  const subject = named.length === 1 ? 'it is' : 'they are';
  return (
    `${diagramName(diagram)} asks for the card "${missing.name}" on ${listOf(named)}, ` +
    `which the ${brand} brand does not have, so ${subject} drawn with ${fallback}.`
  );
}

/**
 * What a part is drawn with instead of the card it asked for: the card the kit picked, or for a
 * `<Layers>` band, which takes a card only when it names one, the stack's own look.
 *
 * @param part - The part.
 */
function fallbackOf(part: ElementSnapshot): string {
  const card = part.data[CARD_ATTRIBUTE];
  if (card !== undefined) {
    return `"${card}"`;
  }

  return part.data['diagram-part'] === 'layer' ? "the stack's own look" : '"default"';
}

/**
 * The finding's fix: the closest card the brand has, every card it has, and where to change it. A
 * name several parts ask for most likely comes from the diagram's own `card`, so the fix names the
 * diagram tag as well as the parts.
 *
 * @param missing - The card name asked for and the parts that ask for it.
 * @param where - The brand's name and cards, the slide file and the diagram.
 */
function missingFix(
  missing: MissingCard,
  where: { brand: string; cards: readonly string[]; file: string; diagram: DiagramSnapshot },
): string {
  const closest = nearestName(missing.name, where.cards);
  const lead = closest === undefined ? '' : `Did you mean "${closest}"? `;
  const place =
    missing.parts.length > 1
      ? `the \`card\` on the ${diagramTag(where.diagram)} tag, or on each of those parts,`
      : 'the `card`';
  const onlyStandard =
    where.cards.length === STANDARD_CARDS.length &&
    STANDARD_CARDS.every((card) => where.cards.includes(card));
  if (onlyStandard) {
    return (
      `${lead}Change ${place} in ${where.file} to one of the standard cards: ` +
      `${STANDARD_CARDS.join(', ')}, which every brand has.`
    );
  }

  return (
    `${lead}Change ${place} in ${where.file} to one of the ${where.brand} brand's cards: ` +
    `${where.cards.join(', ')}. The standard cards (${STANDARD_CARDS.join(', ')}) exist in ` +
    'every brand, so a deck that uses only those renders in any brand.'
  );
}

/**
 * How a part that asks for a card is named: a node by its title, a layer or item by the first text
 * inside it, else by its selector.
 *
 * @param part - The part.
 * @param diagram - Its diagram.
 * @param elements - The slide's elements.
 */
function partLabel(
  part: ElementSnapshot,
  diagram: DiagramSnapshot,
  elements: readonly ElementSnapshot[],
): string {
  const kind = part.data['diagram-part'] ?? '';
  const noun =
    diagram.root.data['diagram'] === 'sequence' && kind === 'node'
      ? 'actor'
      : ((Object.hasOwn(PART_NOUNS, kind) ? PART_NOUNS[kind] : undefined) ?? 'part');
  const title = part.data['node-title'] ?? firstText(part, diagram, elements);
  return title === undefined ? `\`${part.selector}\`` : `the ${noun} "${title}"`;
}

/**
 * The text of the first element inside a part that has any.
 *
 * @param part - The part.
 * @param diagram - Its diagram, whose parts are searched.
 * @param elements - The slide's elements, to walk up from each candidate.
 */
function firstText(
  part: ElementSnapshot,
  diagram: DiagramSnapshot,
  elements: readonly ElementSnapshot[],
): string | undefined {
  const inside = diagram.parts.find(
    (element) => element.text.trim() !== '' && isInside(element, part, elements),
  );
  return inside?.text.trim();
}

/**
 * Whether an element is the part or inside it.
 *
 * @param element - The element.
 * @param part - The part.
 * @param elements - The slide's elements.
 */
function isInside(
  element: ElementSnapshot,
  part: ElementSnapshot,
  elements: readonly ElementSnapshot[],
): boolean {
  for (let at: number | null = element.index; at !== null; at = elements[at]?.parent ?? null) {
    if (at === part.index) {
      return true;
    }
  }

  return false;
}

/**
 * Names joined as a sentence: `A`, `A and B`, `A, B and C`.
 *
 * @param names - The names.
 */
function listOf(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}
