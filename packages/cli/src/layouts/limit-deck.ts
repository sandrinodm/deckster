import type { AnyLayoutContract, ContentBudget } from '@deckster/engine/layout';

import { slideBudget, slideFieldLimits } from '@deckster/engine/layout';
import { BODY_SLOT, slotTag } from '@deckster/engine/slots';
import { fill, LIMIT_CASES, LIMIT_EYEBROW, type LimitCase } from '@deckster/kit/limit-cases';

import { exampleMdx } from '#layouts/list-layouts.ts';

/**
 * Words that fill a slot to its word budget: everyday prose with the odd long and wide word real
 * slides have (`Wolverhampton`, `maintenance`, `comprehensive`), so a budget that holds for them
 * holds for real running text. Fields are filled harder (`fill` in `@deckster/kit/limit-cases`).
 */
const WORDS = (
  'the gap has widened for ten years because the east side loses more trees to storms and ' +
  'road works than it plants each spring so the hottest blocks in Wolverhampton get hotter ' +
  'while cooler ones stay cool and the cost of doing nothing falls on the same few streets ' +
  'that can least afford it which is why this maintenance plan starts there and moves west ' +
  'only after the first comprehensive canopy targets are met in every district we surveyed'
).split(' ');

/**
 * The words a lead sentence takes before the bullets of a list-shaped body.
 */
const LEAD_WORDS = 8;

/**
 * The columns of the stand-in table in a slot made for one table.
 */
const TABLE_COLUMNS = 4;

/**
 * The words of the stand-in table's header.
 */
const TABLE_HEADER_WORDS = 5;

/**
 * The words of each of the stand-in table's rows: two of a name, a share, a count and three of
 * detail.
 */
const TABLE_ROW_WORDS = 7;

/**
 * The lines of the stand-in code block in a slot made for code, when its budget sets none.
 */
const CODE_LINES = 10;

/**
 * Words in the `###` heading of an aside.
 */
const ASIDE_HEADING_WORDS = 3;

/**
 * Words in the `##` heading of a default-layout slide.
 */
const DEFAULT_HEADING_WORDS = 6;

/**
 * A chart standing in for media: an inline SVG that fills its frame.
 */
const CHART = [
  '<svg viewBox="0 0 400 300" role="img" aria-label="Bars" style={{ width: "100%", height: "100%" }}>',
  '  <rect x="20" y="60" width="100" height="240" fill="var(--brand-color-accent)" />',
  '  <rect x="150" y="140" width="100" height="160" fill="var(--brand-color-muted)" />',
  '</svg>',
].join('\n');

/**
 * A photo standing in for a cover image: a vector image, so it loads with no file.
 */
const PHOTO =
  '<img alt="A street" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' ' +
  "viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%23707786'/%3E%3C/svg%3E\" />";

/**
 * The layouts whose media slot takes a photo rather than a chart.
 */
const PHOTO_LAYOUTS = new Set(['title', 'image', 'image-reveal']);

/**
 * The case name of the slide that shows a layout's contract `example`.
 */
export const EXAMPLE_CASE = 'example';

/**
 * A layout and the cases that fill it to its limits.
 */
export type LayoutLimits = {
  /**
   * The layout's contract.
   */
  readonly contract: AnyLayoutContract;

  /**
   * Its limit cases: `LIMIT_CASES[name]` for a kit layout, the default export of `limits.ts` for a
   * code layout.
   */
  readonly cases: readonly LimitCase[];
};

/**
 * One generated slide.
 */
export type LimitSlide = {
  /**
   * The slide id and file name.
   */
  id: string;

  /**
   * The MDX file.
   */
  mdx: string;

  /**
   * The layout it shows.
   */
  layout: string;

  /**
   * The limit case it fills, or {@link EXAMPLE_CASE} for the contract's example.
   */
  case: string;
};

/**
 * Pairs each contract with its cases in the kit's `LIMIT_CASES`; a layout without cases gets none.
 *
 * @param contracts - The layouts' contracts.
 * @returns One entry per contract, in the order given.
 */
export function kitLayoutLimits(contracts: readonly AnyLayoutContract[]): LayoutLimits[] {
  return contracts.map((contract) => ({ contract, cases: LIMIT_CASES[contract.name] ?? [] }));
}

/**
 * The slides that fill layouts to their limits: every case of every layout. A slot whose layout
 * takes bullets gets two slides, one with a paragraph and one with a lead sentence and the most
 * bullets, each at the slot's word budget for that case. With `over`, every slot with a word budget
 * holds one word more, as paragraphs only. The ids are `<layout>-<case>-<text|list>`, so case names
 * must be kebab-case.
 *
 * @param layouts - The layouts and their cases.
 * @param over - Whether to fill each slot one word past its budget.
 * @returns The slides, in layout order.
 */
export function limitSlides(layouts: readonly LayoutLimits[], over = false): LimitSlide[] {
  return layouts.flatMap(({ contract, cases }) =>
    cases.flatMap((limitCase) =>
      (over ? (['text'] as const) : bodyShapes(contract)).map((shape) => ({
        id: `${contract.name}-${limitCase.name}-${shape}`,
        mdx: slideMdx(contract, limitCase, shape, over),
        layout: contract.name,
        case: limitCase.name,
      })),
    ),
  );
}

/**
 * The slide that shows a layout's contract `example` as `deckster new slide` writes it, with the id
 * `<layout>-example`.
 *
 * @param contract - The layout's contract.
 */
export function exampleSlide(contract: AnyLayoutContract): LimitSlide {
  const { example } = contract;
  return {
    id: `${contract.name}-${EXAMPLE_CASE}`,
    mdx: exampleMdx(
      { layout: contract.name, ...example.frontmatter },
      example.body,
      example.comments,
    ),
    layout: contract.name,
    case: EXAMPLE_CASE,
  };
}

/**
 * The `deck.config.ts` of a deck of generated slides.
 *
 * @param title - The deck title.
 * @param slides - The slides, in order.
 * @param brand - The brand the deck names, or `undefined` for the default one.
 */
export function limitDeckConfig(
  title: string,
  slides: readonly LimitSlide[],
  brand?: string,
): string {
  return [
    "import { defineDeck } from '@deckster/engine/config';",
    '',
    'export default defineDeck({',
    `  title: ${JSON.stringify(title)},`,
    ...(brand === undefined ? [] : [`  brand: ${JSON.stringify(brand)},`]),
    `  slides: ${JSON.stringify(slides.map((slide) => slide.id))},`,
    '});',
    '',
  ].join('\n');
}

/**
 * The shapes a layout's body is filled in: a paragraph, and a list when the body takes bullets.
 *
 * @param contract - The layout's contract.
 */
function bodyShapes(contract: AnyLayoutContract): readonly ('text' | 'list')[] {
  const accepts = contract.slots[BODY_SLOT]?.accepts ?? [];
  return accepts.includes('bullets') && contract.budget[BODY_SLOT]?.maxBullets !== undefined
    ? ['text', 'list']
    : ['text'];
}

/**
 * One slide of a case: frontmatter at its limits, the body in the given shape and every listed slot
 * at its budget.
 *
 * @param contract - The layout's contract.
 * @param limitCase - The case.
 * @param shape - How the body is filled.
 * @param over - Whether each slot with a word budget holds one word more.
 */
function slideMdx(
  contract: AnyLayoutContract,
  limitCase: LimitCase,
  shape: 'text' | 'list',
  over: boolean,
): string {
  const filled = [...limitCase.filled, BODY_SLOT];
  // A variant may hold the title shorter than the layout does, such as a narrow text column.
  const titleLimit = slideFieldLimits(contract, { frontmatter: limitCase.frontmatter, filled })[
    'title'
  ]?.maxChars;
  const frontmatter: Record<string, unknown> = {
    layout: contract.name,
    title: fill(Math.min(contract.title?.maxChars ?? 24, titleLimit ?? Infinity)),
    ...('eyebrow' in contract.schema.fields ? { eyebrow: LIMIT_EYEBROW } : {}),
    ...limitCase.frontmatter,
  };
  /**
   * The slot's budget for the case, a word over it with `over`.
   */
  const budget = (slot: string): ContentBudget => {
    const limits = slideBudget(contract, slot, { frontmatter, filled });
    return over && limits.maxWords !== undefined
      ? { ...limits, maxWords: limits.maxWords + 1 }
      : limits;
  };
  const prose = limitCase.body === false ? [] : [bodyMdx(contract, budget(BODY_SLOT), shape)];
  const parts = limitCase.bodyMdx === undefined ? prose : [limitCase.bodyMdx];
  for (const slot of limitCase.filled) {
    parts.push(slotMdx(contract, slot, budget(slot)));
  }

  const fields = Object.entries(frontmatter).map(
    ([key, value]) => `${key}: ${JSON.stringify(value)}`,
  );
  const head = ['---', ...fields, '---'].join('\n');
  return [head, ...parts, '<Notes>At the limit.</Notes>', ''].join('\n\n');
}

/**
 * The body at its budget: a paragraph, or a lead sentence and the most bullets.
 *
 * @param contract - The layout's contract.
 * @param budget - The body's budget for the case.
 * @param shape - How to fill it.
 */
function bodyMdx(
  contract: AnyLayoutContract,
  budget: ContentBudget,
  shape: 'text' | 'list',
): string {
  const total = budget.maxWords ?? LEAD_WORDS;
  const accepts = contract.slots[BODY_SLOT]?.accepts ?? [];
  if (accepts.length === 1 && accepts[0] === 'table') {
    return tableMdx(total);
  }

  if (accepts.length === 1 && accepts[0] === 'code') {
    return codeMdx(budget.maxLines ?? CODE_LINES);
  }

  const heading = contract.name === 'default' ? DEFAULT_HEADING_WORDS : 0;
  const head = heading === 0 ? [] : [`## ${words(heading)}`];
  const left = total - heading;
  if (shape === 'text') {
    return [...head, sentence(left)].join('\n\n');
  }

  const bullets = budget.maxBullets ?? 1;
  const each = Math.floor((left - LEAD_WORDS) / bullets);
  const items = Array.from({ length: bullets }, (_, index) => `- ${words(each, index * each)}`);
  return [...head, sentence(LEAD_WORDS), items.join('\n')].join('\n\n');
}

/**
 * A Markdown table of at most `count` words: a header and rows of four cells, two of them numbers,
 * as a slot made for one table takes it.
 *
 * @param count - The words, at least eight.
 */
function tableMdx(count: number): string {
  // The header is five words; each row seven: a name, a share, a count and detail.
  const rows = Math.max(1, Math.floor((count - TABLE_HEADER_WORDS) / TABLE_ROW_WORDS));
  const header = `| ${['District', 'Canopy', 'Trees', 'First planting'].join(' | ')} |`;
  const lines = Array.from({ length: rows }, (_, index) => {
    const name = words(2, index * 5);
    const detail = words(3, index * 5 + 2);
    return `| ${name} | ${(index * 7) % 40}% | ${(index + 1) * 1_240} | ${detail} |`;
  });
  return [header, `|${' --- |'.repeat(TABLE_COLUMNS)}`, ...lines].join('\n');
}

/**
 * A fenced code block of `count` lines of everyday length.
 *
 * @param count - The lines.
 */
function codeMdx(count: number): string {
  const lines = Array.from(
    { length: count },
    (_, index) =>
      `const ${WORDS[index % WORDS.length] ?? 'value'}${index} = plan.measure(${index});`,
  );
  return ['```ts', ...lines, '```'].join('\n');
}

/**
 * A named slot at its budget, in its tag.
 *
 * @param contract - The layout's contract.
 * @param slot - The slot name.
 * @param budget - Its budget for the case.
 */
function slotMdx(contract: AnyLayoutContract, slot: string, budget: ContentBudget): string {
  const tag = slotTag(slot);
  if (slot === 'media') {
    return `<${tag}>\n\n${PHOTO_LAYOUTS.has(contract.name) ? PHOTO : CHART}\n\n</${tag}>`;
  }

  const max = budget.maxWords ?? LEAD_WORDS;
  if (slot === 'aside') {
    return `<${tag}>\n\n### ${words(ASIDE_HEADING_WORDS)}\n\n${sentence(max - ASIDE_HEADING_WORDS)}\n\n</${tag}>`;
  }

  return `<${tag}>${sentence(max)}</${tag}>`;
}

/**
 * A sentence of `count` words, capitalized and ending in a full stop.
 *
 * @param count - The number of words.
 */
function sentence(count: number): string {
  return `${words(count)}.`;
}

/**
 * `count` words from the filler, starting at `offset`, the first capitalized.
 *
 * @param count - The number of words.
 * @param offset - Where in the filler to start.
 */
function words(count: number, offset = 0): string {
  const picked = Array.from(
    { length: count },
    (_, index) => WORDS[(offset + index) % WORDS.length] ?? '',
  );
  const text = picked.join(' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
