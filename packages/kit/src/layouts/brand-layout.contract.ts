import type { BrandLayoutTokens, BrandTokens } from '@deckster/brand';
import type {
  AnyLayoutContract,
  ContentBudget,
  LayoutCatalog,
  LayoutExample,
  LayoutVariant,
  VariantCondition,
  VariantFieldValue,
  PptxMapping,
  PptxPlaceholder,
  SlotContract,
} from '@deckster/engine/layout';

import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { BODY_SLOT, slotTag } from '@deckster/engine/slots';
import { Schema, SchemaAST } from 'effect';

/**
 * The selector of the title element a brand layout renders, for the PPTX title placeholder.
 */
export const BRAND_TITLE_SELECTOR = '.kit-brand-title';

/**
 * The slot contract a brand layout gives `body` when its fallback does not describe it: every
 * layout has the slot, so a region can always bind to it.
 */
const DEFAULT_BODY_SLOT: SlotContract = {
  /**
   * What the slot holds, for `deck layouts`.
   */
  description: "The slide's content outside any named slot tag.",

  /**
   * The kinds of content it is designed for.
   */
  accepts: ['text', 'bullets'],
};

/**
 * The content kinds a slot may hold for a media region, which draws a picture or a frame around
 * other media.
 */
const MEDIA_KINDS: ReadonlySet<string> = new Set([
  'image',
  'video',
  'chart',
  'diagram',
  'component',
]);

/**
 * The content kinds that are text, for a text region.
 */
const TEXT_KINDS: ReadonlySet<string> = new Set([
  'heading',
  'text',
  'bullets',
  'quote',
  'number',
  'code',
]);

/**
 * The brackets that mark a list in a limit's path, such as the `[]` of `stats[].label`.
 */
const LIST_BRACKETS_PATTERN = /\[\]$/u;

/**
 * The fix for a text region bound to a field that is not text, and for structured content the
 * layout does not take.
 */
const STRUCTURED_FIELD_FIX =
  'List it under `fields` if it is a setting, or choose a fallback whose required content this ' +
  'layout draws (`deck layouts` lists the kit layouts and their fields).';

/**
 * How many catalog names a fix suggests for an unknown fallback.
 */
const SUGGESTED_FALLBACKS = 3;

/**
 * The speaker notes tag, which every example ends with.
 */
const NOTES_TAG = 'Notes';

/**
 * A problem with a brand layout, with the path into the `layouts.ts` array and how to fix it.
 */
export type BrandLayoutProblem = {
  /**
   * Where the problem is, such as `layouts[2].regions[0].bind`.
   */
  readonly path: string;

  /**
   * What is wrong, as a sentence.
   */
  readonly message: string;

  /**
   * How to fix it, as a sentence the author can act on.
   */
  readonly fix: string;
};

/**
 * The problems that stop a brand layout from working, and the ones worth a look.
 */
export type BrandLayoutCheck = {
  /**
   * Problems that make the layout invalid; the catalog refuses to build while there are any.
   */
  readonly errors: readonly BrandLayoutProblem[];

  /**
   * Things that work but probably are not what the author meant.
   */
  readonly warnings: readonly BrandLayoutProblem[];
};

/**
 * The slots and fields a layout's regions bind.
 */
type Bindings = {
  /**
   * The slot names, in region order.
   */
  slots: readonly string[];

  /**
   * The frontmatter field names that text regions draw, in region order.
   */
  fields: readonly string[];

  /**
   * The fields the layout lists under `fields`: settings of the fallback it accepts but does not
   * draw.
   */
  settings: readonly string[];
};

/**
 * The contract of a brand layout: a normal layout contract built from the layout's regions and its
 * fallback kit layout. It has only the slots and fields the layout binds, with the fallback's
 * descriptions, `required` flags and field schemas, so a slide that is valid on the brand layout is
 * valid on the fallback too. Budgets come from the fallback, tightened by the layout's own. Unknown
 * bindings are skipped here and reported by {@link checkBrandLayouts}.
 *
 * @param layout - The brand layout's tokens.
 * @param fallback - The contract of the kit layout the layout names as its `fallback`.
 * @returns The contract; it has no `pptx` mapping when the fallback has none.
 */
export function brandLayoutContract(
  layout: BrandLayoutTokens,
  fallback: AnyLayoutContract,
): AnyLayoutContract {
  const bound = bindingsOf(layout);
  const slots = boundSlots(bound, fallback);
  const fields = [...bound.fields, ...bound.settings];
  const defaults = unboundDefaults(fallback, fields);
  const variants = boundVariants(fallback, fields, Object.keys(slots), defaults);
  return {
    name: layout.name,
    description: `${layout.description} (brand layout; falls back to ${fallback.name})`,
    schema: Schema.Struct(pickFields(fallback, fields)),
    hints: pickHints(fallback, fields),
    slots,
    budget: boundBudget(layout, fallback, Object.keys(slots)),
    ...(fallback.title === undefined ? {} : { title: fallback.title }),
    ...(variants.length === 0 ? {} : { variants }),
    ...boundChecks(fallback, defaults),
    ...surfaceOf(layout, fallback),
    example: boundExample(layout, fallback, bound),
    ...(fallback.pptx === undefined
      ? {}
      : { pptx: pptxMapping(layout, bound, fallback.pptx.type) }),
  };
}

/**
 * What is wrong with brand layouts against the layouts they fall back to. An error is a layout that
 * clashes with a catalog name, names an unknown fallback, binds a slot or field the fallback lacks,
 * leaves one the fallback requires unbound, drops a title the fallback requires, or budgets a slot
 * it does not bind.
 *
 * @param layouts - The brand's layouts, in file order.
 * @param catalog - Every other layout contract: the engine's and the kit's.
 */
export function checkBrandLayouts(
  layouts: readonly BrandLayoutTokens[],
  catalog: readonly AnyLayoutContract[],
): BrandLayoutCheck {
  const errors: BrandLayoutProblem[] = [];
  const warnings: BrandLayoutProblem[] = [];
  const names = catalog.map((contract) => contract.name);
  for (const [index, layout] of layouts.entries()) {
    const path = `layouts[${index}]`;
    if (names.includes(layout.name)) {
      errors.push(nameClash(path, layout.name));
    }

    const fallback = catalog.find((contract) => contract.name === layout.fallback);
    if (fallback === undefined) {
      errors.push(unknownFallback(path, layout.fallback, names));
      continue;
    }

    errors.push(...bindingProblems(path, layout, fallback));
    errors.push(...titleProblems(path, layout, fallback));
    errors.push(...budgetProblems(path, layout, fallback));
    warnings.push(...kindWarnings(path, layout, fallback));
  }

  return { errors, warnings };
}

/**
 * The layouts of a brand as a catalog, to load after the kit's: `source` is `brand:<name>`.
 *
 * @param brand - The brand's tokens.
 * @param base - The catalog the brand layouts fall back to: engine and kit contracts.
 * @throws Error listing every problem when {@link checkBrandLayouts} finds an error; callers check
 *   first and report the problems as build errors.
 */
export function brandLayoutCatalog(
  brand: BrandTokens,
  base: readonly AnyLayoutContract[],
): LayoutCatalog {
  const { errors } = checkBrandLayouts(brand.layouts, base);
  if (errors.length > 0) {
    const lines = errors.map((problem) => `${problem.path}: ${problem.message} ${problem.fix}`);
    throw new Error(`The ${brand.name} brand's layouts are invalid:\n${lines.join('\n')}`);
  }

  return {
    source: `brand:${brand.name}`,
    layouts: brand.layouts.flatMap((layout) => {
      const fallback = base.find((contract) => contract.name === layout.fallback);
      return fallback === undefined ? [] : [brandLayoutContract(layout, fallback)];
    }),
  };
}

/**
 * The slots and fields the layout's regions bind, each once.
 *
 * @param layout - The layout.
 */
function bindingsOf(layout: BrandLayoutTokens): Bindings {
  const slots = new Set<string>();
  const fields = new Set<string>();
  for (const region of layout.regions) {
    if ('slot' in region.bind) {
      slots.add(region.bind.slot);
    } else {
      fields.add(region.bind.field);
    }
  }

  return { slots: [...slots], fields: [...fields], settings: [...layout.fields] };
}

/**
 * The fallback's slot contracts for the bound slots; `body` falls back to a plain description.
 *
 * @param bound - The layout's bindings.
 * @param fallback - The fallback contract.
 */
function boundSlots(
  bound: Bindings,
  fallback: AnyLayoutContract,
): Readonly<Record<string, SlotContract>> {
  const slots: Record<string, SlotContract> = {};
  for (const slot of bound.slots) {
    const contract =
      ownSlot(fallback, slot) ?? (slot === BODY_SLOT ? DEFAULT_BODY_SLOT : undefined);
    if (contract !== undefined) {
      slots[slot] = contract;
    }
  }

  return slots;
}

/**
 * The fallback's contract for a slot it declares.
 *
 * @param fallback - The fallback contract.
 * @param slot - The slot name.
 */
function ownSlot(fallback: AnyLayoutContract, slot: string): SlotContract | undefined {
  return Object.hasOwn(fallback.slots, slot) ? fallback.slots[slot] : undefined;
}

/**
 * The fallback's schema fields that the layout binds.
 *
 * @param fallback - The fallback contract.
 * @param fields - The bound field names.
 */
function pickFields(fallback: AnyLayoutContract, fields: readonly string[]): Schema.Struct.Fields {
  const picked: Record<string, Schema.Struct.Fields[string]> = {};
  for (const field of fields) {
    const schema = ownField(fallback, field);
    if (schema !== undefined) {
      picked[field] = schema;
    }
  }

  return picked;
}

/**
 * The fallback's schema for one of its fields.
 *
 * @param fallback - The fallback contract.
 * @param field - The field name.
 */
function ownField(
  fallback: AnyLayoutContract,
  field: string,
): Schema.Struct.Fields[string] | undefined {
  return Object.hasOwn(fallback.schema.fields, field) ? fallback.schema.fields[field] : undefined;
}

/**
 * The fallback's fix for each bound field it has one for.
 *
 * @param fallback - The fallback contract.
 * @param fields - The bound field names.
 */
function pickHints(
  fallback: AnyLayoutContract,
  fields: readonly string[],
): Readonly<Record<string, string>> {
  const hints: Record<string, string> = {};
  for (const field of fields) {
    const hint: unknown = Object.hasOwn(fallback.hints ?? {}, field)
      ? Reflect.get(fallback.hints ?? {}, field)
      : undefined;
    if (typeof hint === 'string') {
      hints[field] = hint;
    }
  }

  return hints;
}

/**
 * The fallback's budget for each bound slot, tightened per limit by the layout's own: each limit is
 * the lower of the two, so a layout can never loosen its fallback's budget.
 *
 * @param layout - The layout.
 * @param fallback - The fallback contract.
 * @param slots - The slot names the contract has.
 */
function boundBudget(
  layout: BrandLayoutTokens,
  fallback: AnyLayoutContract,
  slots: readonly string[],
): Readonly<Record<string, ContentBudget>> {
  const budget: Record<string, ContentBudget> = {};
  for (const slot of slots) {
    const base = Object.hasOwn(fallback.budget, slot) ? fallback.budget[slot] : undefined;
    const own =
      layout.budget !== undefined && Object.hasOwn(layout.budget, slot)
        ? layout.budget[slot]
        : undefined;
    if (base !== undefined || own !== undefined) {
      budget[slot] = stricter(base, own);
    }
  }

  return budget;
}

/**
 * Two budgets for one slot, each limit the stricter (lower) of the two: a brand layout may tighten
 * the fallback's budget but never loosen it, or a slide valid on the layout could break the
 * fallback's.
 *
 * @param base - The fallback's budget for the slot.
 * @param own - The layout's budget for the slot.
 */
function stricter(base: ContentBudget | undefined, own: ContentBudget | undefined): ContentBudget {
  const merged: { -readonly [Limit in keyof ContentBudget]: number } = {};
  for (const limit of ['maxWords', 'maxBullets', 'maxLines'] as const) {
    const values = [base?.[limit], own?.[limit]].filter((value) => value !== undefined);
    if (values.length > 0) {
      merged[limit] = Math.min(...values);
    }
  }

  return merged;
}

/**
 * The values the fallback's fields that the layout does not take have for a slide that leaves them
 * out: their defaults. Fields without one are left out.
 *
 * @param fallback - The fallback contract.
 * @param taken - The fields the layout's contract has.
 */
function unboundDefaults(
  fallback: AnyLayoutContract,
  taken: readonly string[],
): Readonly<Record<string, unknown>> {
  const defaults: Record<string, unknown> = {};
  for (const field of Object.keys(fallback.schema.fields)) {
    const decoded = taken.includes(field) ? undefined : decodeField(fallback, field, {});
    if (decoded !== undefined && Object.hasOwn(decoded, field)) {
      defaults[field] = Reflect.get(decoded, field);
    }
  }

  return defaults;
}

/**
 * Decodes one field of the fallback alone, as a slide's frontmatter would.
 *
 * @param fallback - The fallback contract.
 * @param field - The field name.
 * @param input - The frontmatter to decode, which may have the field.
 * @returns The decoded object, or `undefined` when the field does not decode from the input.
 */
function decodeField(
  fallback: AnyLayoutContract,
  field: string,
  input: Readonly<Record<string, unknown>>,
): object | undefined {
  const schema = ownField(fallback, field);
  if (schema === undefined) {
    return undefined;
  }

  try {
    const only: Schema.Decoder<object> = Schema.Struct({ [field]: schema }) as never;
    return Schema.decodeUnknownSync(only)(input);
  } catch {
    return undefined;
  }
}

/**
 * The fallback's cross-field checks, run on the frontmatter with the defaults of the fields the
 * layout leaves out filled in, so a slide that passes on the brand layout passes on the fallback.
 *
 * @param fallback - The fallback contract.
 * @param defaults - The defaults of the fields the layout does not take.
 */
function boundChecks(
  fallback: AnyLayoutContract,
  defaults: Readonly<Record<string, unknown>>,
): Pick<AnyLayoutContract, 'checks'> | Record<never, never> {
  if (fallback.checks === undefined) {
    return {};
  }

  return {
    checks: (frontmatter) => fallback.checks?.({ ...defaults, ...frontmatter } as never) ?? [],
  };
}

/**
 * The fallback's variants that still apply to the layout: those whose conditions use only fields
 * and slots the layout has (or fields it leaves at the default the condition names), with their
 * budgets and field limits cut to what the layout has. A variant that has nothing left to tighten
 * is dropped.
 *
 * @param fallback - The fallback contract.
 * @param fields - The fields the layout's contract has.
 * @param slots - The slots the layout's contract has.
 * @param defaults - The defaults of the fields the layout does not take.
 */
function boundVariants(
  fallback: AnyLayoutContract,
  fields: readonly string[],
  slots: readonly string[],
  defaults: Readonly<Record<string, unknown>>,
): LayoutVariant[] {
  const known = new Set([...fields, ...Object.keys(SlideFrontmatter.fields)]);
  const slotNames = new Set([...slots, BODY_SLOT]);
  const variants: LayoutVariant[] = [];
  for (const variant of fallback.variants ?? []) {
    const when = boundCondition(variant.when, known, slotNames, defaults);
    const budget = Object.fromEntries(
      Object.entries(variant.budget).filter(([slot]) => slotNames.has(slot)),
    );
    const limits = Object.fromEntries(
      Object.entries(variant.fields ?? {}).filter(([path]) =>
        known.has(path.split('.')[0]?.replace(LIST_BRACKETS_PATTERN, '') ?? ''),
      ),
    );
    if (when !== undefined && (Object.keys(budget).length > 0 || Object.keys(limits).length > 0)) {
      variants.push({
        name: variant.name,
        when,
        budget,
        ...(Object.keys(limits).length === 0 ? {} : { fields: limits }),
      });
    }
  }

  return variants;
}

/**
 * A variant's condition cut to what the layout has, or `undefined` when it can never hold there: it
 * needs a slot or list the layout lacks, or a left-out field to have a value other than its
 * default.
 *
 * @param when - The fallback variant's condition.
 * @param known - The fields a slide of the layout has.
 * @param slots - The slots the layout has.
 * @param defaults - The defaults of the fields the layout does not take.
 */
function boundCondition(
  when: VariantCondition,
  known: ReadonlySet<string>,
  slots: ReadonlySet<string>,
  defaults: Readonly<Record<string, unknown>>,
): VariantCondition | undefined {
  const fields: Record<string, VariantFieldValue> = {};
  for (const [field, value] of Object.entries(when.fields ?? {})) {
    if (known.has(field)) {
      fields[field] = value;
    } else if (defaults[field] !== value) {
      return undefined;
    }
  }

  const counts = when.counts ?? {};
  const filled = when.filled ?? [];
  if (
    Object.keys(counts).some((field) => !known.has(field)) ||
    filled.some((slot) => !slots.has(slot))
  ) {
    return undefined;
  }

  return {
    ...(Object.keys(fields).length === 0 ? {} : { fields }),
    ...(Object.keys(counts).length === 0 ? {} : { counts }),
    ...(filled.length === 0 ? {} : { filled }),
  };
}

/**
 * The `surface` part of the contract: the layout's own, else the fallback's, else none.
 *
 * @param layout - The layout.
 * @param fallback - The fallback contract.
 */
function surfaceOf(
  layout: BrandLayoutTokens,
  fallback: AnyLayoutContract,
): { surface: string } | Record<never, never> {
  const surface = layout.surface ?? fallback.surface;
  return surface === undefined ? {} : { surface };
}

/**
 * The fallback's example reduced to the bound fields and slots (and the title, when the layout has
 * one), so it is a valid slide of the brand layout.
 *
 * @param layout - The layout.
 * @param fallback - The fallback contract.
 * @param bound - The layout's bindings.
 */
function boundExample(
  layout: BrandLayoutTokens,
  fallback: AnyLayoutContract,
  bound: Bindings,
): LayoutExample {
  const keep = new Set([...bound.fields, ...bound.settings]);
  if (layout.title !== false) {
    keep.add('title');
  }

  const frontmatter = Object.fromEntries(
    Object.entries(fallback.example.frontmatter).filter(([field]) => keep.has(field)),
  );
  return {
    frontmatter,
    body: boundBody(fallback, new Set(bound.slots)),
    ...(fallback.example.comments === undefined
      ? {}
      : { comments: fallback.example.comments.filter((line) => keepsComment(line, keep)) }),
  };
}

/**
 * Whether an example comment is about a field the layout keeps: its first word is the field.
 *
 * @param line - A YAML comment line of the fallback's example.
 * @param keep - The frontmatter fields the layout keeps.
 */
function keepsComment(line: string, keep: ReadonlySet<string>): boolean {
  const field = line.trim().split(/[:\s]/u)[0] ?? '';
  return keep.has(field);
}

/**
 * The MDX of the fallback's example with only the bound slots and the speaker notes: the text
 * outside any slot tag is the `body` slot.
 *
 * @param fallback - The fallback contract.
 * @param slots - The bound slot names.
 */
function boundBody(fallback: AnyLayoutContract, slots: ReadonlySet<string>): string {
  const tags = new Map(Object.keys(fallback.slots).map((slot) => [slotTag(slot), slot]));
  tags.set(NOTES_TAG, NOTES_TAG);
  const blocks = splitExample(fallback.example.body, tags);
  const kept = blocks
    .filter((block) => block.slot === NOTES_TAG || slots.has(block.slot))
    .filter((block) => block.slot !== BODY_SLOT || block.text.trim() !== '');
  const notes = kept.filter((block) => block.slot === NOTES_TAG);
  const content = kept.filter((block) => block.slot !== NOTES_TAG);
  return `${[...content, ...notes].map((block) => block.text.trim()).join('\n\n')}\n`;
}

/**
 * One top-level part of an example body: a slot tag with its content, or the loose text.
 */
type ExampleBlock = {
  /**
   * The slot it fills; `body` for text outside any tag, `Notes` for the speaker notes.
   */
  slot: string;

  /**
   * Its source text, tags included.
   */
  text: string;
};

/**
 * Splits an example body at its top-level slot tags. A tag opens on a line that starts with it and
 * closes on the line that starts with its closing tag, or the same line.
 *
 * @param body - The example's MDX.
 * @param tags - The slot each known tag name stands for.
 */
function splitExample(body: string, tags: ReadonlyMap<string, string>): ExampleBlock[] {
  const blocks: ExampleBlock[] = [];
  let loose: string[] = [];
  let open: { tag: string; slot: string; lines: string[] } | undefined;
  for (const line of body.split('\n')) {
    if (open !== undefined) {
      open.lines.push(line);
      if (line.trimStart().startsWith(`</${open.tag}>`)) {
        blocks.push({ slot: open.slot, text: open.lines.join('\n') });
        open = undefined;
      }

      continue;
    }

    const tag = /^<([A-Z][A-Za-z0-9]*)>/u.exec(line)?.[1];
    const slot = tag === undefined ? undefined : tags.get(tag);
    if (tag === undefined || slot === undefined) {
      loose.push(line);
    } else if (line.includes(`</${tag}>`)) {
      blocks.push({ slot, text: line });
    } else {
      blocks.push({ slot: BODY_SLOT, text: loose.join('\n') });
      loose = [];
      open = { tag, slot, lines: [line] };
    }
  }

  blocks.push({ slot: BODY_SLOT, text: loose.join('\n') });
  return mergeBody(blocks);
}

/**
 * Joins the loose text blocks of an example into one `body` block, kept first.
 *
 * @param blocks - The blocks in source order.
 */
function mergeBody(blocks: readonly ExampleBlock[]): ExampleBlock[] {
  const body = blocks
    .filter((block) => block.slot === BODY_SLOT)
    .map((block) => block.text.trim())
    .filter((text) => text !== '')
    .join('\n\n');
  return [{ slot: BODY_SLOT, text: body }, ...blocks.filter((block) => block.slot !== BODY_SLOT)];
}

/**
 * The type steps of text that is not a slide's body: a caption, a label, small print and a big
 * number. A slot set in one of them does not make a layout a two-content layout.
 */
const NON_BODY_STEPS: ReadonlySet<string> = new Set(['caption', 'label', 'small', 'stat']);

/**
 * The PowerPoint mapping of a brand layout: the title placeholder when the layout has a title, the
 * first body slot as the body (the subtitle on a layout that falls back to a title slide), the
 * first field region as the subtitle when there is no body, and the first media region bound to a
 * slot as the picture. The type is the fallback's when it is a title or a section layout; else it
 * follows from the body slots, which exclude captions, labels, small print and stats: a title alone
 * is `title-only`, one body `content`, more than one `two-content`, and no title `content` or
 * `blank`.
 *
 * @param layout - The layout.
 * @param bound - The layout's bindings.
 * @param fallbackType - The PowerPoint type of the fallback layout.
 */
function pptxMapping(
  layout: BrandLayoutTokens,
  bound: Bindings,
  fallbackType: PptxMapping['type'],
): PptxMapping {
  const hasTitle = layout.title !== false;
  const bodies = bodySlots(layout);
  const [firstBody] = bodies;
  const field = bound.fields[0];
  const titleSlide = hasTitle && fallbackType === 'title';
  const placeholders: PptxPlaceholder[] = [];
  if (hasTitle) {
    placeholders.push({ kind: 'title', from: { selector: BRAND_TITLE_SELECTOR } });
  }

  if (firstBody !== undefined) {
    placeholders.push({ kind: titleSlide ? 'subtitle' : 'body', from: { slot: firstBody } });
  } else if (hasTitle && field !== undefined) {
    placeholders.push({ kind: 'subtitle', from: { selector: fieldSelector(field) } });
  }

  const picture = layout.regions.find((region) => region.kind === 'media' && 'slot' in region.bind);
  if (picture !== undefined && 'slot' in picture.bind) {
    placeholders.push({ kind: 'picture', from: { slot: picture.bind.slot } });
  }

  const hasSubtitle = placeholders.some((placeholder) => placeholder.kind === 'subtitle');
  return {
    type: layoutType({ hasTitle, bodies: bodies.length, hasSubtitle, fallbackType }),
    placeholders,
  };
}

/**
 * The slots a layout's text regions bind that hold body text, in order of appearance: all of them
 * but those set only in a caption, label, small or stat step.
 *
 * @param layout - The layout.
 */
function bodySlots(layout: BrandLayoutTokens): string[] {
  const slots = layout.regions.flatMap((region) =>
    'slot' in region.bind && region.kind !== 'media' && !NON_BODY_STEPS.has(region.type ?? '')
      ? [region.bind.slot]
      : [],
  );
  return [...new Set(slots)];
}

/**
 * The CSS selector of the region a frontmatter field fills.
 *
 * @param field - The field name.
 */
function fieldSelector(field: string): string {
  return `[data-region="field:${field}"]`;
}

/**
 * What decides the PowerPoint layout type of a brand layout.
 */
type LayoutTypeFacts = {
  /**
   * Whether the layout has a title.
   */
  hasTitle: boolean;

  /**
   * How many body slots it binds.
   */
  bodies: number;

  /**
   * Whether it maps a subtitle placeholder.
   */
  hasSubtitle: boolean;

  /**
   * The PowerPoint type of the fallback layout.
   */
  fallbackType: PptxMapping['type'];
};

/**
 * The PowerPoint layout type for what a brand layout has.
 *
 * @param facts - What the layout has.
 */
function layoutType({
  hasTitle,
  bodies,
  hasSubtitle,
  fallbackType,
}: LayoutTypeFacts): PptxMapping['type'] {
  if (hasTitle && (fallbackType === 'title' || fallbackType === 'section')) {
    return fallbackType;
  }

  if (bodies >= 2) {
    return 'two-content';
  }

  if (bodies === 1) {
    return 'content';
  }

  if (!hasTitle) {
    return 'blank';
  }

  return hasSubtitle ? 'title' : 'title-only';
}

/**
 * The error for a name a catalog layout already has.
 *
 * @param path - The layout's path.
 * @param name - Its name.
 */
function nameClash(path: string, name: string): BrandLayoutProblem {
  return {
    path: `${path}.name`,
    message: `The layout name "${name}" is already a layout of the kit or the engine.`,
    fix: `Rename it, for example "<brand>-${name}"; brand layouts never replace kit layouts.`,
  };
}

/**
 * The error for a fallback that is not a catalog layout, naming the closest layouts.
 *
 * @param path - The layout's path.
 * @param fallback - The name it gives.
 * @param names - The catalog's layout names.
 */
function unknownFallback(
  path: string,
  fallback: string,
  names: readonly string[],
): BrandLayoutProblem {
  const closest = names
    .toSorted((a, b) => editDistance(a, fallback) - editDistance(b, fallback))
    .slice(0, SUGGESTED_FALLBACKS);
  return {
    path: `${path}.fallback`,
    message: `The fallback "${fallback}" is not a layout of the kit or the engine.`,
    fix: `Name a layout \`deck layouts\` lists, such as ${closest.map((name) => `"${name}"`).join(', ')}.`,
  };
}

/**
 * The errors for bindings that do not match the fallback: slots and fields it lacks, and ones it
 * requires that the layout leaves unbound.
 *
 * @param path - The layout's path.
 * @param layout - The layout.
 * @param fallback - The fallback contract.
 */
function bindingProblems(
  path: string,
  layout: BrandLayoutTokens,
  fallback: AnyLayoutContract,
): BrandLayoutProblem[] {
  const slotNames = [...new Set([...Object.keys(fallback.slots), BODY_SLOT])];
  const fieldNames = Object.keys(fallback.schema.fields);
  const problems: BrandLayoutProblem[] = [];
  for (const [index, region] of layout.regions.entries()) {
    const where = `${path}.regions[${index}].bind`;
    if ('slot' in region.bind && !slotNames.includes(region.bind.slot)) {
      problems.push({
        path: where,
        message: `The fallback "${fallback.name}" has no slot "${region.bind.slot}".`,
        fix: `Bind one of its slots: ${slotNames.join(', ')}.`,
      });
    }

    if ('field' in region.bind && ownField(fallback, region.bind.field) === undefined) {
      problems.push({
        path: where,
        message: `The fallback "${fallback.name}" has no field "${region.bind.field}".`,
        fix: fieldFix(fieldNames),
      });
    } else if ('field' in region.bind && !isTextField(fallback, region.bind.field)) {
      problems.push({
        path: where,
        message:
          `The field "${region.bind.field}" of "${fallback.name}" is not a string or a number, ` +
          'so a text region cannot draw it.',
        fix: STRUCTURED_FIELD_FIX,
      });
    }
  }

  const bound = bindingsOf(layout);
  for (const [index, field] of layout.fields.entries()) {
    if (ownField(fallback, field) === undefined) {
      problems.push({
        path: `${path}.fields[${index}]`,
        message: `The fallback "${fallback.name}" has no field "${field}".`,
        fix: fieldFix(fieldNames),
      });
    }
  }

  for (const slot of slotNames.filter((name) => ownSlot(fallback, name)?.required === true)) {
    if (!bound.slots.includes(slot)) {
      problems.push({
        path: `${path}.regions`,
        message: `The fallback "${fallback.name}" requires the slot "${slot}", which no region binds.`,
        fix: `Add a region with \`bind: { slot: '${slot}' }\`, or pick a fallback that does not require it.`,
      });
    }
  }

  const taken = [...bound.fields, ...bound.settings];
  for (const field of fieldNames.filter((name) => isRequiredField(fallback, name))) {
    if (taken.includes(field)) {
      continue;
    }

    problems.push({
      path: `${path}.regions`,
      message: `The fallback "${fallback.name}" requires the field "${field}", which the layout does not take.`,
      fix: isTextField(fallback, field)
        ? `Add a region with \`bind: { field: '${field}' }\`, or pick a fallback that does not require it.`
        : `${STRUCTURED_FIELD_FIX} "${field}" is structured content the layout has to draw.`,
    });
  }

  return problems;
}

/**
 * The fix for a field the fallback lacks.
 *
 * @param fieldNames - The fallback's fields.
 */
function fieldFix(fieldNames: readonly string[]): string {
  return fieldNames.length === 0
    ? 'The fallback has no layout fields; bind a slot instead.'
    : `Bind one of its fields: ${fieldNames.join(', ')}.`;
}

/**
 * Whether a slide must write a field: it fails to decode without it and has no default.
 *
 * @param fallback - The fallback contract.
 * @param field - The field name.
 */
function isRequiredField(fallback: AnyLayoutContract, field: string): boolean {
  return ownField(fallback, field) !== undefined && decodeField(fallback, field, {}) === undefined;
}

/**
 * Whether a field is a string or a number (or either), which a text region can draw; lists,
 * objects, booleans and fixed choices are settings or structured content.
 *
 * @param fallback - The fallback contract.
 * @param field - The field name.
 */
function isTextField(fallback: AnyLayoutContract, field: string): boolean {
  const schema = ownField(fallback, field);
  return schema !== undefined && isTextAst(SchemaAST.toEncoded(schema.ast));
}

/**
 * Whether a schema's encoded form is a string or a number, or a union of only those.
 *
 * @param ast - The encoded AST of a field.
 */
function isTextAst(ast: SchemaAST.AST): boolean {
  if (ast._tag === 'String' || ast._tag === 'Number') {
    return true;
  }

  return ast._tag === 'Union' && ast.types.every(isTextAst);
}

/**
 * The error for a title the layout drops although the fallback requires one.
 *
 * @param path - The layout's path.
 * @param layout - The layout.
 * @param fallback - The fallback contract.
 */
function titleProblems(
  path: string,
  layout: BrandLayoutTokens,
  fallback: AnyLayoutContract,
): BrandLayoutProblem[] {
  if (layout.title !== false || fallback.title?.required !== true) {
    return [];
  }

  return [
    {
      path: `${path}.title`,
      message: `The fallback "${fallback.name}" requires a title, and the layout has none.`,
      fix: 'Give the layout a `title: { box }`, or pick a fallback whose title is optional.',
    },
  ];
}

/**
 * The errors for budgets the layout sets on slots it does not bind, or line limits on prose.
 *
 * @param path - The layout's path.
 * @param layout - The layout.
 * @param fallback - The fallback contract.
 */
function budgetProblems(
  path: string,
  layout: BrandLayoutTokens,
  fallback: AnyLayoutContract,
): BrandLayoutProblem[] {
  const bound = bindingsOf(layout).slots;
  return Object.entries(layout.budget ?? {}).flatMap(([slot, budget]): BrandLayoutProblem[] => {
    if (!bound.includes(slot)) {
      return [
        {
          path: `${path}.budget.${slot}`,
          message: `The layout budgets "${slot}", which no region binds.`,
          fix: `Budget only bound slots: ${bound.join(', ') || 'none are bound'}.`,
        },
      ];
    }

    const accepts = ownSlot(fallback, slot)?.accepts ?? DEFAULT_BODY_SLOT.accepts;
    if (budget.maxLines !== undefined && !accepts.includes('code')) {
      return [
        {
          path: `${path}.budget.${slot}.maxLines`,
          message: `The slot "${slot}" holds prose, whose lines depend on the brand's type size.`,
          fix: 'Budget it in maxWords and maxBullets; maxLines is for slots that accept code.',
        },
      ];
    }

    return [];
  });
}

/**
 * Warnings for regions whose kind does not suit what the fallback's slot is for: a media region on
 * a slot that takes no pictures, or a text region on a slot that takes only pictures.
 *
 * @param path - The layout's path.
 * @param layout - The layout.
 * @param fallback - The fallback contract.
 */
function kindWarnings(
  path: string,
  layout: BrandLayoutTokens,
  fallback: AnyLayoutContract,
): BrandLayoutProblem[] {
  return layout.regions.flatMap((region, index): BrandLayoutProblem[] => {
    if (!('slot' in region.bind)) {
      return [];
    }

    const { slot } = region.bind;
    const accepts: readonly string[] = ownSlot(fallback, slot)?.accepts ?? [];
    const where = `${path}.regions[${index}]`;
    if (
      region.kind === 'media' &&
      accepts.length > 0 &&
      !accepts.some((kind) => MEDIA_KINDS.has(kind))
    ) {
      return [
        {
          path: where,
          message: `The media region binds "${slot}", which the fallback uses for ${accepts.join(', ')}.`,
          fix: 'Bind a slot that takes pictures or media, or make the region `kind: "text"`.',
        },
      ];
    }

    if (
      region.kind === 'text' &&
      accepts.length > 0 &&
      !accepts.some((kind) => TEXT_KINDS.has(kind))
    ) {
      return [
        {
          path: where,
          message: `The text region binds "${slot}", which the fallback uses for ${accepts.join(', ')}.`,
          fix: 'Make the region `kind: "media"` or `kind: "content"`, or bind a text slot.',
        },
      ];
    }

    return [];
  });
}

/**
 * The edit distance between two names, to rank the closest layouts.
 *
 * @param a - One name.
 * @param b - The other.
 */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + cost,
      );
    }

    previous = current;
  }

  return previous[b.length] ?? 0;
}
