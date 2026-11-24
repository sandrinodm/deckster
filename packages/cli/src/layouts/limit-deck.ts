import type { AnyLayoutContract, ContentBudget, SlotContentKind } from '@deckster/engine/layout';

import { slideBudget, slideFieldLimits, type VariantInput } from '@deckster/engine/layout';
import { BODY_SLOT, slotTag } from '@deckster/engine/slots';
import { fill, LIMIT_CASES, LIMIT_EYEBROW, type LimitCase } from '@deckster/kit/limit-cases';
import { Predicate, Result, Schema } from 'effect';

import { exampleFrontmatter } from '#layouts/example-frontmatter.ts';
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
 * The words of each bullet in a list-shaped body whose budget sets no word limit.
 */
const UNBOUNDED_BULLET_WORDS = 6;

/**
 * The characters of a title when its layout sets no limit.
 */
const FALLBACK_TITLE_CHARS = 24;

/**
 * The kinds a slot takes as prose: a sentence in its tag is what the slot is for.
 */
const PROSE_KINDS: ReadonlySet<SlotContentKind> = new Set([
  'heading',
  'text',
  'bullets',
  'quote',
  'number',
  'component',
]);

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
 * bullets, each at the slot's word budget for that case; whether the body takes bullets is decided
 * by its budget for the case, so a limit that only a variant sets is tested too. With `over`, every
 * slot with a word budget holds one word more, as paragraphs only. The ids are
 * `<layout>-<case>-<text|list>`, so case names must be kebab-case; give the slides of several
 * layouts to {@link uniqueSlideIds}, since the hyphens can make two ids the same.
 *
 * @param layouts - The layouts and their cases.
 * @param over - Whether to fill each slot one word past its budget.
 * @returns The slides, in layout order.
 */
export function limitSlides(layouts: readonly LayoutLimits[], over = false): LimitSlide[] {
  return layouts.flatMap(({ contract, cases }) =>
    cases.flatMap((limitCase) => {
      const input = caseInput(contract, limitCase);
      const shapes = over ? (['text'] as const) : bodyShapes(contract, input.variant);
      return shapes.map((shape) => ({
        id: `${contract.name}-${limitCase.name}-${shape}`,
        mdx: slideMdx(contract, limitCase, input, shape, over),
        layout: contract.name,
        case: limitCase.name,
      }));
    }),
  );
}

/**
 * The slides with ids that no other slide has: a slide whose id is already taken gets `-2`, `-3`
 * and so on, so two layouts and cases that join into the same id (`kpi` with `wall-dense` and
 * `kpi-wall` with `dense`) are two slides. The layout and case of each slide stay as they were.
 *
 * @param slides - The slides of every layout, in order.
 * @returns The slides in the same order; the first holder of an id keeps it.
 */
export function uniqueSlideIds(slides: readonly LimitSlide[]): LimitSlide[] {
  const taken = new Set(slides.map((slide) => slide.id));
  const used = new Set<string>();
  return slides.map((slide) => {
    if (!used.has(slide.id)) {
      used.add(slide.id);
      return slide;
    }

    let counter = 2;
    while (taken.has(`${slide.id}-${counter}`) || used.has(`${slide.id}-${counter}`)) {
      counter += 1;
    }

    const id = `${slide.id}-${counter}`;
    used.add(id);
    return { ...slide, id };
  });
}

/**
 * The slide that shows a layout's contract `example` as `deckster new slide` writes it, with the id
 * `<layout>-example`. The slide always names the contract's layout, whatever `layout:` the example
 * carries.
 *
 * @param contract - The layout's contract.
 */
export function exampleSlide(contract: AnyLayoutContract): LimitSlide {
  const { example } = contract;
  return {
    id: `${contract.name}-${EXAMPLE_CASE}`,
    mdx: exampleMdx(exampleFrontmatter(contract), example.body, example.comments),
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
 * What a case's slide is built from: its frontmatter, and the frontmatter with the layout's
 * defaults applied plus the filled slots, which is what picks the variants (and so the budgets and
 * field limits) that hold for the slide.
 */
type CaseInput = {
  /**
   * The frontmatter the slide is written with.
   */
  readonly frontmatter: Record<string, unknown>;

  /**
   * The slide as variants see it: decoded defaults included, the case's slots and `body` filled.
   */
  readonly variant: VariantInput;
};

/**
 * Builds a case's frontmatter and the input that picks its variants. The title is as long as the
 * layout and its variants for the slide allow, the eyebrow is the longest one the field accepts,
 * and the case's own fields win over both. `layout` is always the contract's name.
 *
 * @param contract - The layout's contract.
 * @param limitCase - The case.
 */
function caseInput(contract: AnyLayoutContract, limitCase: LimitCase): CaseInput {
  const filled = [...limitCase.filled, BODY_SLOT];
  const limits = slideFieldLimits(contract, {
    frontmatter: withDefaults(contract, limitCase.frontmatter),
    filled,
  });
  const titleChars = Math.min(
    contract.title?.maxChars ?? FALLBACK_TITLE_CHARS,
    limits['title']?.maxChars ?? Infinity,
  );
  const frontmatter: Record<string, unknown> = {
    layout: contract.name,
    title: fill(titleChars),
    ...eyebrowField(contract, limits['eyebrow']?.maxChars),
    ...limitCase.frontmatter,
  };
  frontmatter['layout'] = contract.name;
  return { frontmatter, variant: { frontmatter: withDefaults(contract, frontmatter), filled } };
}

/**
 * The eyebrow every case gets when the layout has the field: the longest one the field decodes (the
 * kit's longest, else the contract example's), cut to what a variant allows, else none.
 *
 * @param contract - The layout's contract.
 * @param maxChars - What a variant that matches the case allows, if it sets a limit.
 */
function eyebrowField(
  contract: AnyLayoutContract,
  maxChars: number | undefined,
): Record<string, unknown> {
  const field = contract.schema.fields['eyebrow'];
  if (field === undefined) {
    return {};
  }

  const accepted = [LIMIT_EYEBROW, contract.example.frontmatter['eyebrow']].find(
    (candidate) => candidate !== undefined && decodesAlone('eyebrow', field, candidate),
  );
  if (typeof accepted === 'string' && maxChars !== undefined && accepted.length > maxChars) {
    return { eyebrow: fill(maxChars) };
  }

  return accepted === undefined ? {} : { eyebrow: accepted };
}

/**
 * The frontmatter with the default of every field of the layout that it leaves out, so variants
 * match the way they do for the decoded slide.
 *
 * @param contract - The layout's contract.
 * @param frontmatter - The fields the slide is written with.
 */
function withDefaults(
  contract: AnyLayoutContract,
  frontmatter: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(contract.schema.fields)) {
    if (name in frontmatter) {
      continue;
    }

    const decoded = decodeAlone(name, field, undefined);
    const value: unknown = Predicate.isObject(decoded) ? Reflect.get(decoded, name) : undefined;
    if (value !== undefined) {
      defaults[name] = value;
    }
  }

  return { ...defaults, ...frontmatter };
}

/**
 * Whether a field decodes a value, on its own.
 *
 * @param name - The field name.
 * @param field - The field's schema.
 * @param value - The value.
 */
function decodesAlone(name: string, field: Schema.Struct.Fields[string], value: unknown): boolean {
  return decodeAlone(name, field, value) !== undefined;
}

/**
 * Decodes one field alone, the way `deckster layouts` finds its default: a value the field takes,
 * or nothing to decode, gives the struct it forms, else `undefined`.
 *
 * @param name - The field name.
 * @param field - The field's schema.
 * @param value - The value, or `undefined` for a slide that leaves the field out.
 */
function decodeAlone(
  name: string,
  field: Schema.Struct.Fields[string],
  value: unknown,
): object | undefined {
  // Frontmatter fields decode without services; the build relies on the same.
  const alone = Schema.Struct({ [name]: field }) as Schema.Struct<Schema.Struct.Fields> &
    Schema.ConstraintDecoder<unknown>;
  const decoded = Schema.decodeUnknownResult(alone)(value === undefined ? {} : { [name]: value });
  return Result.isSuccess(decoded) && Predicate.isObject(decoded.success)
    ? decoded.success
    : undefined;
}

/**
 * The shapes a layout's body is filled in: a paragraph, and a list when the body takes bullets and
 * its budget for the slide sets a bullet limit.
 *
 * @param contract - The layout's contract.
 * @param slide - The slide's frontmatter and filled slots.
 */
function bodyShapes(
  contract: AnyLayoutContract,
  slide: VariantInput,
): readonly ('text' | 'list')[] {
  const accepts = contract.slots[BODY_SLOT]?.accepts ?? [];
  const budget = slideBudget(contract, BODY_SLOT, slide);
  return accepts.includes('bullets') && budget.maxBullets !== undefined
    ? ['text', 'list']
    : ['text'];
}

/**
 * One slide of a case: frontmatter at its limits, the body in the given shape and every listed slot
 * at its budget.
 *
 * @param contract - The layout's contract.
 * @param limitCase - The case.
 * @param input - Its frontmatter and the input that picks its variants.
 * @param shape - How the body is filled.
 * @param over - Whether each slot with a word budget holds one word more.
 */
function slideMdx(
  contract: AnyLayoutContract,
  limitCase: LimitCase,
  input: CaseInput,
  shape: 'text' | 'list',
  over: boolean,
): string {
  /**
   * The slot's budget for the case, a word over it with `over`.
   */
  const budget = (slot: string): ContentBudget => {
    const limits = slideBudget(contract, slot, input.variant);
    return over && limits.maxWords !== undefined
      ? { ...limits, maxWords: limits.maxWords + 1 }
      : limits;
  };
  const prose = limitCase.body === false ? [] : [bodyMdx(contract, budget(BODY_SLOT), shape)];
  const parts = limitCase.bodyMdx === undefined ? prose : [limitCase.bodyMdx];
  for (const slot of limitCase.filled) {
    parts.push(slotMdx(contract, slot, budget(slot)));
  }

  const fields = Object.entries(input.frontmatter).map(
    ([key, value]) => `${key}: ${JSON.stringify(value)}`,
  );
  const head = ['---', ...fields, '---'].join('\n');
  return [head, ...parts, '<Notes>At the limit.</Notes>', ''].join('\n\n');
}

/**
 * The body at its budget: a paragraph, or a lead sentence and the most bullets. In a list, every
 * bullet gets a word at least, and the lead takes what is left of the budget, up to
 * {@link LEAD_WORDS}; with no word budget the lead is {@link LEAD_WORDS} and each bullet
 * {@link UNBOUNDED_BULLET_WORDS}.
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

  const heading = contract.name === 'default' ? Math.min(DEFAULT_HEADING_WORDS, total - 1) : 0;
  const head = heading <= 0 ? [] : [`## ${words(heading)}`];
  const left = Math.max(1, total - Math.max(0, heading));
  if (shape === 'text') {
    return [...head, sentence(left)].join('\n\n');
  }

  const bullets = budget.maxBullets ?? 1;
  const bounded = budget.maxWords !== undefined;
  const lead = bounded ? Math.min(LEAD_WORDS, Math.max(0, left - bullets)) : LEAD_WORDS;
  const each = bounded ? Math.max(1, Math.floor((left - lead) / bullets)) : UNBOUNDED_BULLET_WORDS;
  const items = Array.from({ length: bullets }, (_, index) => `- ${words(each, index * each)}`);
  const sentences = lead === 0 ? [] : [sentence(lead)];
  return [...head, ...sentences, items.join('\n')].join('\n\n');
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
 * A named slot at its budget, in its tag: the media slot a photo or a chart, the aside a heading
 * and a sentence, and any other slot what its contract says it is for (a sentence, or when it takes
 * no prose a photo, a chart, a table or a code block).
 *
 * @param contract - The layout's contract.
 * @param slot - The slot name.
 * @param budget - Its budget for the case.
 */
function slotMdx(contract: AnyLayoutContract, slot: string, budget: ContentBudget): string {
  const tag = slotTag(slot);
  const max = budget.maxWords ?? LEAD_WORDS;
  if (slot === 'media') {
    return block(tag, PHOTO_LAYOUTS.has(contract.name) ? PHOTO : CHART);
  }

  if (slot === 'aside') {
    return `<${tag}>\n\n### ${words(ASIDE_HEADING_WORDS)}\n\n${sentence(max - ASIDE_HEADING_WORDS)}\n\n</${tag}>`;
  }

  const accepts = contract.slots[slot]?.accepts ?? [];
  if (accepts.length === 0 || accepts.some((kind) => PROSE_KINDS.has(kind))) {
    return `<${tag}>${sentence(max)}</${tag}>`;
  }

  const [kind] = accepts;
  if (kind === 'image') {
    return block(tag, PHOTO);
  }

  if (kind === 'chart' || kind === 'diagram') {
    return block(tag, CHART);
  }

  if (kind === 'table') {
    return block(tag, tableMdx(max));
  }

  if (kind === 'code') {
    return block(tag, codeMdx(budget.maxLines ?? CODE_LINES));
  }

  return `<${tag}>${sentence(max)}</${tag}>`;
}

/**
 * Content set apart in a slot's tag, with a blank line on each side so MDX reads it as blocks.
 *
 * @param tag - The slot's tag name.
 * @param content - The content.
 */
function block(tag: string, content: string): string {
  return `<${tag}>\n\n${content}\n\n</${tag}>`;
}

/**
 * A sentence of `count` words, capitalized and ending in a full stop.
 *
 * @param count - The number of words.
 */
function sentence(count: number): string {
  return `${words(Math.max(1, count))}.`;
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
