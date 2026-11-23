import { Predicate } from 'effect';

import { BRAND_SOURCE_PREFIX, type LayoutInfo } from '#layouts/list-layouts.ts';

/**
 * The first complete sentence, including its terminal punctuation.
 */
const FIRST_SENTENCE_PATTERN = /^.*?[.!?](?=\s|$)/su;

/**
 * A slot in `deckster layouts --summary`.
 */
export type SlotSummary = {
  /**
   * The tag that fills it in MDX, such as `Aside`; `null` for `body`, the content outside tags.
   */
  tag: string | null;

  /**
   * The content kinds the slot is designed for; empty when it takes anything.
   */
  accepts: readonly string[];

  /**
   * Whether the build fails when a slide leaves it empty.
   */
  required: boolean;

  /**
   * The most words the slot holds, when budgeted.
   */
  maxWords?: number;

  /**
   * The most bullets the slot holds, when budgeted.
   */
  maxBullets?: number;

  /**
   * The most lines of code the slot holds, when budgeted.
   */
  maxLines?: number;
};

/**
 * A list field in `deckster layouts --summary`: a frontmatter array the layout draws, such as
 * `stats`.
 */
export type ItemListSummary = {
  /**
   * The frontmatter field.
   */
  field: string;

  /**
   * The fewest items, or `null` when any number down to none is allowed.
   */
  min: number | null;

  /**
   * The most items, or `null` when the schema sets no maximum.
   */
  max: number | null;
};

/**
 * One layout in `deckster layouts --summary`: enough to pick it, not to fill it.
 */
export type LayoutSummary = {
  /**
   * The name a slide gives in `layout:`.
   */
  name: string;

  /**
   * The package that supplies the layout, or `brand:<name>` for the deck's brand.
   */
  source: string;

  /**
   * For a brand layout, the kit layout it falls back to; `null` otherwise.
   */
  fallback: string | null;

  /**
   * The first sentence of the layout's description.
   */
  description: string;

  /**
   * The surface a slide gets when it names none, or `null` for the brand's default.
   */
  surface: string | null;

  /**
   * The longest title in characters, or `null` when the layout sets no limit.
   */
  titleMaxChars: number | null;

  /**
   * Every slot by name, `body` first, with what it accepts and its budget.
   */
  slots: Record<string, SlotSummary>;

  /**
   * The layout's item lists with their counts; empty when it has none.
   */
  items: readonly ItemListSummary[];
};

/**
 * The first sentence of a description.
 *
 * @param text - A description.
 */
function firstSentence(text: string): string {
  return FIRST_SENTENCE_PATTERN.exec(text)?.[0] ?? text;
}

/**
 * The array fields of a layout's frontmatter schema with their item counts.
 *
 * @param layout - One layout.
 */
function itemLists(layout: LayoutInfo): ItemListSummary[] {
  const properties = Reflect.get(layout.frontmatter, 'properties');
  if (!Predicate.isObject(properties)) {
    return [];
  }

  return Object.entries(properties).flatMap(([field, schema]) => {
    if (!Predicate.isObject(schema) || Reflect.get(schema, 'type') !== 'array') {
      return [];
    }

    const min: unknown = Reflect.get(schema, 'minItems');
    const max: unknown = Reflect.get(schema, 'maxItems');
    return [
      {
        field,
        min: typeof min === 'number' ? min : null,
        max: typeof max === 'number' ? max : null,
      },
    ];
  });
}

/**
 * Condenses a layout's contract to what an author needs to choose it: the description's first
 * sentence, the default surface, the title limit, the slots with what each accepts and holds, and
 * the item lists with their counts.
 *
 * @param layout - One layout as `deckster layouts --json` prints it.
 */
export function summarizeLayout(layout: LayoutInfo): LayoutSummary {
  const slots: Record<string, SlotSummary> = {};
  for (const [name, slot] of Object.entries(layout.slots)) {
    slots[name] = summarizeSlot(slot, layout.budget[name]);
  }

  return {
    name: layout.name,
    source: layout.source,
    fallback: layout.fallback,
    description: firstSentence(layout.description),
    surface: layout.surface,
    titleMaxChars: layout.title?.maxChars ?? null,
    slots,
    items: itemLists(layout),
  };
}

/**
 * Projects one slot and includes only the limits its layout publishes.
 */
function summarizeSlot(
  slot: LayoutInfo['slots'][string],
  budget: LayoutInfo['budget'][string],
): SlotSummary {
  const summary: SlotSummary = { tag: slot.tag, accepts: slot.accepts, required: slot.required };
  if (budget?.maxWords !== undefined) {
    summary.maxWords = budget.maxWords;
  }

  if (budget?.maxBullets !== undefined) {
    summary.maxBullets = budget.maxBullets;
  }

  if (budget?.maxLines !== undefined) {
    summary.maxLines = budget.maxLines;
  }

  return summary;
}

/**
 * Puts the brand's layouts before the rest, each group keeping its order.
 *
 * @param summaries - The layouts in catalog order.
 */
export function brandFirst<T extends { source: string }>(summaries: readonly T[]): T[] {
  const brand = summaries.filter((summary) => summary.source.startsWith(BRAND_SOURCE_PREFIX));
  return [...brand, ...summaries.filter((summary) => !brand.includes(summary))];
}

/**
 * The plain listing of the summaries. A brand's layouts come first under a heading that names the
 * brand, then the other layouts under their own heading; with no brand layouts there are no
 * headings.
 *
 * @param summaries - The layouts to print.
 */
export function formatSummaries(summaries: readonly LayoutSummary[]): string {
  const ordered = brandFirst(summaries);
  const brandLayouts = ordered.filter((summary) => summary.source.startsWith(BRAND_SOURCE_PREFIX));
  const [first] = brandLayouts;
  if (first === undefined) {
    return formatGroup(summaries);
  }

  const others = ordered.slice(brandLayouts.length);
  const brandName = first.source.slice(BRAND_SOURCE_PREFIX.length);
  return [
    `Layouts from the ${brandName} brand (prefer these):`,
    formatGroup(brandLayouts),
    ...(others.length === 0 ? [] : ['', 'Other layouts:', formatGroup(others)]),
  ].join('\n');
}

/**
 * The aligned plain listing of one group: a line per layout with its name, default surface, title
 * limit and item lists, then its description and its slots.
 *
 * @param summaries - The layouts to print.
 */
function formatGroup(summaries: readonly LayoutSummary[]): string {
  const width = Math.max(0, ...summaries.map((summary) => summary.name.length));
  const surfaceWidth = Math.max(0, ...summaries.map((summary) => (summary.surface ?? '-').length));
  return summaries
    .map((summary) => {
      const surface = (summary.surface ?? 'default').padEnd(
        Math.max(surfaceWidth, 'default'.length),
      );
      const facts = [
        `surface ${surface}`,
        summary.titleMaxChars === null ? 'title any' : `title <= ${summary.titleMaxChars}`,
        ...summary.items.map(formatItems),
      ];
      return [
        `${summary.name.padEnd(width)}  ${facts.join('  ')}`,
        `${' '.repeat(width)}  ${summary.description}`,
        ...(summary.fallback === null
          ? []
          : [`${' '.repeat(width)}  falls back to: ${summary.fallback}`]),
        `${' '.repeat(width)}  slots: ${Object.entries(summary.slots).map(formatSlot).join('; ')}`,
      ].join('\n');
    })
    .join('\n');
}

/**
 * One item list as `stats[2-4]`: the field and its count range.
 *
 * @param list - The item list.
 */
function formatItems(list: ItemListSummary): string {
  const min = list.min ?? 0;
  let range = `${min}-${list.max}`;
  if (list.max === null) {
    range = `${min}+`;
  } else if (list.max === min) {
    range = `${min}`;
  }

  return `${list.field}[${range}]`;
}

/**
 * One slot as `body* text/bullets 48 words 4 bullets` or `<Aside> text 36 words`: `*` marks a
 * required slot.
 *
 * @param entry - The slot's name and summary.
 */
function formatSlot([name, slot]: readonly [string, SlotSummary]): string {
  const limits = [
    ...(slot.maxWords === undefined ? [] : [`${slot.maxWords} words`]),
    ...(slot.maxBullets === undefined ? [] : [`${slot.maxBullets} bullets`]),
    ...(slot.maxLines === undefined ? [] : [`${slot.maxLines} lines`]),
  ];
  const accepts = slot.accepts.length === 0 ? 'anything' : slot.accepts.join('/');
  const label = slot.tag === null ? name : `<${slot.tag}>`;
  return [`${label}${slot.required ? '*' : ''} ${accepts}`, ...limits].join(' ');
}
