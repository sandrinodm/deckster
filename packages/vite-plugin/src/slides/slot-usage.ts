import { BODY_SLOT, slotTag } from '@deckster/engine/slots';

import type { Problem } from '#errors.ts';
import type { CatalogLayout, LayoutCatalogIndex } from '#layouts/load-layout-catalog.ts';

/**
 * An element (MDX) or export (TSX) whose name may be a slot tag.
 */
export type SlotCandidate = {
  /**
   * The element or export name, such as `Left`.
   */
  name: string;

  /**
   * The 1-based line it is on, when known.
   */
  line: number | undefined;

  /**
   * Whether it sits inside another element instead of at the top level of the slide (MDX only).
   */
  nested: boolean;
};

/**
 * What a slide puts where, as the build reads it without running the slide.
 */
export type SlotUsage = {
  /**
   * How the slide is written; MDX fills slots with tags, TSX with exports.
   */
  kind: 'mdx' | 'tsx';

  /**
   * Every element or export that may be a slot tag.
   */
  candidates: readonly SlotCandidate[];

  /**
   * Whether the slide has content outside its slot tags, which fills `body`.
   */
  hasBody: boolean;
};

/**
 * The outcome of checking a slide's slots against its layout.
 */
export type SlotCheck = {
  /**
   * The named slots the slide fills, in the order the contract lists them.
   */
  slots: string[];

  /**
   * Everything wrong, each with its fix; empty when the slide fits its layout.
   */
  problems: Problem[];
};

/**
 * Checks how a slide fills its layout's slots: every required slot is filled, each slot tag appears
 * once and (in MDX) at the top level, and no tag names a slot only other layouts have. Names that
 * are no layout's slot tag are components and are left alone.
 *
 * @param usage - What the slide puts where.
 * @param layout - The layout the slide names.
 * @param catalog - Every layout, to recognize another layout's slot tag.
 */
export function checkSlotUsage(
  usage: SlotUsage,
  layout: CatalogLayout,
  catalog: LayoutCatalogIndex,
): SlotCheck {
  const { contract } = layout;
  const own = slotsByTag(Object.keys(contract.slots));
  const filled = new Map<string, SlotCandidate>();
  const problems: Problem[] = [];
  for (const candidate of usage.candidates) {
    const slot = own.get(candidate.name);
    if (slot === undefined) {
      problems.push(...foreignSlotProblems(usage, candidate, layout, catalog));
    } else if (candidate.nested) {
      problems.push(nestedProblem(candidate));
    } else if (filled.has(slot)) {
      problems.push(repeatedProblem(candidate, filled.get(slot)));
    } else {
      filled.set(slot, candidate);
    }
  }

  for (const [slot, slotContract] of Object.entries(contract.slots)) {
    const isFilled = slot === BODY_SLOT ? usage.hasBody : filled.has(slot);
    if (slotContract.required === true && !isFilled) {
      problems.push(missingProblem(usage.kind, contract.name, slot, slotContract.description));
    }
  }

  const slots = [...own.values()].filter((slot) => filled.has(slot));
  return { slots, problems };
}

/**
 * The named slots of a layout by the tag that fills them; `body` has no tag.
 *
 * @param slots - The slot names.
 */
function slotsByTag(slots: readonly string[]): Map<string, string> {
  return new Map(slots.filter((slot) => slot !== BODY_SLOT).map((slot) => [slotTag(slot), slot]));
}

/**
 * The problem for a tag that is a slot of other layouts but not of this one; none for a name that
 * is no layout's slot tag.
 *
 * @param usage - The slide's kind.
 * @param candidate - The tag or export.
 * @param layout - The slide's layout.
 * @param catalog - Every layout.
 */
function foreignSlotProblems(
  usage: SlotUsage,
  candidate: SlotCandidate,
  layout: CatalogLayout,
  catalog: LayoutCatalogIndex,
): Problem[] {
  const others = [...catalog.values()]
    .filter((other) => slotsByTag(Object.keys(other.contract.slots)).has(candidate.name))
    .map((other) => other.contract.name);
  if (others.length === 0) {
    return [];
  }

  const own = [...slotsByTag(Object.keys(layout.contract.slots)).keys()];
  const ownList =
    own.length === 0 ? 'no named slots' : `slots ${own.map(tagFor(usage)).join(', ')}`;
  const what = usage.kind === 'mdx' ? `<${candidate.name}>` : `\`export ${candidate.name}\``;
  return [
    {
      message:
        `${what}${lineSuffix(candidate)} is not a slot of the ${layout.contract.name} layout, ` +
        `which has ${ownList}.`,
      fix:
        `Use a layout that has it (${others.join(', ')}), or move the content into one of ` +
        `this layout's slots.`,
    },
  ];
}

/**
 * The problem for a slot tag inside another element.
 *
 * @param candidate - The tag.
 */
function nestedProblem(candidate: SlotCandidate): Problem {
  return {
    message: `<${candidate.name}>${lineSuffix(candidate)} is inside another element.`,
    fix: `Move <${candidate.name}> to the top level of the slide; slot tags cannot be nested.`,
  };
}

/**
 * The problem for a slot filled twice.
 *
 * @param candidate - The second tag or export.
 * @param first - The first.
 */
function repeatedProblem(candidate: SlotCandidate, first: SlotCandidate | undefined): Problem {
  const firstLine = first?.line === undefined ? '' : ` (first on line ${first.line})`;
  return {
    message: `<${candidate.name}>${lineSuffix(candidate)} fills a slot already filled${firstLine}.`,
    fix: `Put all of that content in one <${candidate.name}> block.`,
  };
}

/**
 * The problem for a required slot the slide leaves empty.
 *
 * @param kind - How the slide is written.
 * @param layout - The layout name.
 * @param slot - The slot name.
 * @param description - What goes in it.
 */
function missingProblem(
  kind: SlotUsage['kind'],
  layout: string,
  slot: string,
  description: string,
): Problem {
  if (slot === BODY_SLOT) {
    return {
      message: `The ${layout} layout needs content outside its slot tags.`,
      fix: `Add it at the top level of the slide: ${description}`,
    };
  }

  const tag = slotTag(slot);
  const add =
    kind === 'mdx'
      ? `Add <${tag}>…</${tag}> at the top level of the slide`
      : `Add \`export function ${tag}()\` returning it`;
  return { message: `The ${layout} layout needs its ${slot} slot.`, fix: `${add}: ${description}` };
}

/**
 * How a slot tag is written in a slide of this kind.
 *
 * @param usage - The slide's kind.
 */
function tagFor(usage: SlotUsage): (tag: string) => string {
  return (tag) => (usage.kind === 'mdx' ? `<${tag}>` : tag);
}

/**
 * ` on line N`, or nothing when the line is unknown.
 *
 * @param candidate - The tag or export.
 */
function lineSuffix(candidate: SlotCandidate): string {
  return candidate.line === undefined ? '' : ` on line ${candidate.line}`;
}
