import type { Schema } from 'effect';

import type { BODY_SLOT } from '#contract/slots.ts';

/**
 * Kinds of content a slot is designed for. They are descriptive: `deckster layouts --json` prints
 * them so an agent puts a chart where a chart belongs; the build does not inspect slot content.
 */
export const SLOT_CONTENT_KINDS = [
  'heading',
  'text',
  'bullets',
  'quote',
  'number',
  'image',
  'video',
  'code',
  'diagram',
  'chart',
  'table',
  'component',
] as const;

/**
 * One of {@link SLOT_CONTENT_KINDS}.
 */
export type SlotContentKind = (typeof SLOT_CONTENT_KINDS)[number];

/**
 * What a layout says about one of its slots.
 */
export type SlotContract = {
  /**
   * What goes in the slot, as a sentence an author or agent can act on.
   */
  readonly description: string;

  /**
   * Whether the build fails when a slide leaves the slot empty. Defaults to `false`.
   */
  readonly required?: boolean;

  /**
   * The kinds of content the slot is designed for, most typical first; at least one.
   */
  readonly accepts: readonly SlotContentKind[];
};

/**
 * Content limits for one slot, counted on the rendered slide by `deckster lint`'s `content-budget`
 * rule. Every limit is optional; a missing one is not checked. Budgets count content, not the room
 * it takes: words, list items and lines of code are the same in every brand, so a slide within its
 * budget in one brand is within it in all of them. Whether the content fits a brand's type is the
 * overflow rules' job (`container-overflow`, `canvas-overflow`, `text-truncated`), and each budget
 * is calibrated so it fits in the kit's brands (`budget-limits.test.ts`).
 */
export type ContentBudget = {
  /**
   * The most words the slot may hold, counting every step.
   */
  readonly maxWords?: number;

  /**
   * The most list items (`<li>`) the slot may hold.
   */
  readonly maxBullets?: number;

  /**
   * The most lines of a slot whose lines never wrap: lines of code or of a terminal. Only a slot
   * that accepts `code` may set it; prose wraps at the brand's type size, so it is budgeted in
   * words instead.
   */
  readonly maxLines?: number;
};

/**
 * Limits on one frontmatter field that a variant tightens, such as a stat's label in a row of four.
 */
export type FieldLimit = {
  /**
   * The most characters the field's text may have.
   */
  readonly maxChars?: number;
};

/**
 * Field limits by path into the frontmatter: a field name, with `[]` for every item of a list and
 * `.` into an item, such as `stats[].label`.
 */
export type FieldLimits = { readonly [path: string]: FieldLimit };

/**
 * Content limits per slot, by slot name, `body` included.
 */
export type SlotBudgets<Slot extends string = string> = { readonly [Key in Slot]?: ContentBudget };

/**
 * A frontmatter value a variant can select on: a string, number or boolean field after defaults.
 */
export type VariantFieldValue = string | number | boolean;

/**
 * How many items a list field must hold for a variant to apply: exactly that many, or a range whose
 * ends are inclusive.
 */
export type CountCondition =
  | number
  | {
      /**
       * The fewest items; no lower bound when left out.
       */
      readonly min?: number;

      /**
       * The most items; no upper bound when left out.
       */
      readonly max?: number;
    };

/**
 * Whether a list's length meets a count condition.
 *
 * @param length - How many items the list holds.
 * @param condition - An exact count or a range.
 */
export function countMatches(length: number, condition: CountCondition): boolean {
  if (typeof condition === 'number') {
    return length === condition;
  }

  return length >= (condition.min ?? 0) && length <= (condition.max ?? Number.POSITIVE_INFINITY);
}

/**
 * What a slide must look like for a {@link LayoutVariant} to apply. Every part that is given must
 * hold; an empty condition always holds.
 */
export type VariantCondition = {
  /**
   * Frontmatter fields and the value each must have once defaults are applied, such as `{ ratio:
   * '5:7' }`.
   */
  readonly fields?: Readonly<Record<string, VariantFieldValue>>;

  /**
   * List fields and how many items each must hold: an exact count, such as `{ stats: 4 }`, or a
   * range, such as `{ logos: { min: 13, max: 18 } }` (either end may be left out).
   */
  readonly counts?: Readonly<Record<string, CountCondition>>;

  /**
   * Named slots the slide must fill, such as `['aside']`.
   */
  readonly filled?: readonly string[];
};

/**
 * A variant of a layout whose slots hold less (or more) than the layout's base budget: a narrower
 * column, a slot that shares its row with another, four items where two fit more text. `deckster
 * lint` checks a slide against the base budget tightened by every variant it matches, and `deckster
 * layouts` prints them so an agent writes to the right limit.
 */
export type LayoutVariant<Slot extends string = string> = {
  /**
   * A short name for messages and the catalog, such as `ratio 5:7` or `with aside`.
   */
  readonly name: string;

  /**
   * When the variant applies.
   */
  readonly when: VariantCondition;

  /**
   * The limits that change in this variant; the others stay at the base budget.
   */
  readonly budget: SlotBudgets<Slot>;

  /**
   * Frontmatter fields the variant holds to tighter limits than the layout's schema, such as `{
   * 'stats[].label': { maxChars: 32 } }` in a row of four. The build checks them and `deckster
   * layouts` prints them, so the limit an agent reads is the limit the build enforces.
   */
  readonly fields?: FieldLimits;
};

/**
 * What a layout requires of the slide's `title:` field.
 */
export type TitleContract = {
  /**
   * Whether the build fails a slide of this layout without a title. Defaults to `false`.
   */
  readonly required?: boolean;

  /**
   * The longest title, in characters, that the layout sets without overflowing in any variant and
   * brand.
   */
  readonly maxChars?: number;
};

/**
 * A complete, valid slide that uses the layout, for documentation and for agents to copy.
 */
export type LayoutExample = {
  /**
   * The frontmatter fields, without `layout` (the catalog adds it).
   */
  readonly frontmatter: Readonly<Record<string, unknown>>;

  /**
   * The MDX after the frontmatter, with every slot tag the example fills.
   */
  readonly body: string;

  /**
   * YAML comment lines, without the `#`, written at the end of the example's frontmatter: options
   * the example cannot show, such as `photo: ../assets/dana.jpg` (examples carry no asset paths).
   */
  readonly comments?: readonly string[];
};

/**
 * The PowerPoint placeholders `deckster export --pptx` can fill: the slide title (`ctrTitle` on a
 * title slide), the subtitle under it, the body text, and a picture (the slot's first image).
 */
export const PPTX_PLACEHOLDER_KINDS = ['title', 'subtitle', 'body', 'picture'] as const;

/**
 * One of {@link PPTX_PLACEHOLDER_KINDS}.
 */
export type PptxPlaceholderKind = (typeof PPTX_PLACEHOLDER_KINDS)[number];

/**
 * The kinds of PowerPoint slide layout a deck layout can declare itself as, which PowerPoint uses
 * when the deck is restyled or a slide's layout is changed: `title` (Title Slide), `section`
 * (Section Header), `content` (Title and Content), `two-content` (Two Content), `title-only` and
 * `blank`.
 */
export const PPTX_LAYOUT_TYPES = [
  'title',
  'section',
  'content',
  'two-content',
  'title-only',
  'blank',
] as const;

/**
 * One of {@link PPTX_LAYOUT_TYPES}.
 */
export type PptxLayoutType = (typeof PPTX_LAYOUT_TYPES)[number];

/**
 * Where a placeholder's text is on the rendered slide: a filled slot (its `.deck-slot[data-slot]`
 * wrapper), an element the layout renders (a CSS selector inside the slide, such as the title's
 * class), or a frontmatter field the layout does not render, which the export places just above the
 * slide so outline view and screen readers still have it.
 */
export type PptxPlaceholderSource =
  | {
      /**
       * The slot name, `body` included.
       */
      readonly slot: string;
    }
  | {
      /**
       * A CSS selector matched inside the slide's frame.
       */
      readonly selector: string;
    }
  | {
      /**
       * A string frontmatter field, such as `title`.
       */
      readonly field: string;
    };

/**
 * One PowerPoint placeholder of a layout and where its text comes from.
 */
export type PptxPlaceholder = {
  /**
   * The placeholder kind.
   */
  readonly kind: PptxPlaceholderKind;

  /**
   * Where its text is on the rendered slide.
   */
  readonly from: PptxPlaceholderSource;
};

/**
 * How `deckster export --pptx` maps a layout to a PowerPoint slide layout: the kind of layout it
 * is, and which rendered text becomes the title, subtitle and body placeholders, so that text is
 * editable in outline view and the deck restyles from the slide master. Text not covered by a
 * placeholder is still exported as native text boxes. It must stay JSON-serializable: `deckster
 * layouts --json` prints it.
 */
export type PptxMapping = {
  /**
   * The PowerPoint layout type.
   */
  readonly type: PptxLayoutType;

  /**
   * The placeholders, in the order PowerPoint lists them. A two-content layout may list two body
   * placeholders with distinct sources. Other kinds appear at most once.
   */
  readonly placeholders: readonly PptxPlaceholder[];
};

/**
 * A problem a layout's cross-field check finds in a slide's frontmatter, such as a row with fewer
 * values than there are options. The build reports it with the field path and fails the slide.
 */
export type FieldProblem = {
  /**
   * Where the problem is, with item indexes: `rows[2].values`, `current`.
   */
  readonly path: string;

  /**
   * What is wrong, as a sentence: `Row "Cost" has 2 values for 3 options.`
   */
  readonly message: string;

  /**
   * How to fix it, as a sentence the author can act on.
   */
  readonly fix: string;
};

/**
 * The name of the slot that holds a slide's content outside every named slot tag.
 */
export type BodySlot = typeof BODY_SLOT;

/**
 * Everything the build and the tooling know about a layout, without its React component: its
 * frontmatter fields, its slots, its content budget and an example. It lives in a file with no JSX
 * and no browser code, so the build can load it in Node to validate slides and `deckster layouts
 * --json` can print it. The component is registered separately with `defineLayout`.
 *
 * Type parameters: `Name` is the layout name, `Fields` the layout's own frontmatter fields and
 * `Slot` its named slots. Every layout also has the `body` slot; describe it under `slots.body` to
 * give it a description, mark it required or budget it.
 */
export type LayoutContract<
  Name extends string = string,
  Fields extends Schema.Struct.Fields = Schema.Struct.Fields,
  Slot extends string = string,
> = {
  /**
   * The name slides use in `layout:` frontmatter, in kebab-case.
   */
  readonly name: Name;

  /**
   * When to use the layout, as one or two sentences, for `deckster layouts` and agents.
   */
  readonly description: string;

  /**
   * The layout's own frontmatter fields, decoded together with the fields every slide has
   * (`layout`, `title`, `surface`, `budget`). Use `Schema.Struct({})` for none. Decoded values must
   * be JSON-serializable, because the build writes them into the slide module.
   */
  readonly schema: Schema.Struct<Fields>;

  /**
   * How to fix each of the layout's fields, appended to the build error that names the field.
   */
  readonly hints?: { readonly [Key in keyof Fields]?: string };

  /**
   * Checks across fields that the schema cannot express on one field, such as a row holding one
   * value per option or `current:` naming an item that exists. It gets the decoded frontmatter
   * (defaults applied) and returns every problem, each with its field path; the build fails the
   * slide with them. It must be pure and fast: it runs on every build of every slide.
   *
   * @param frontmatter - The slide's frontmatter after decoding, the layout's fields included.
   * @returns The problems; empty when the fields agree.
   */
  // A method, so a contract with its own field types is still an `AnyLayoutContract`.
  checks?(frontmatter: Schema.Struct.Type<Fields>): readonly FieldProblem[];

  /**
   * The named slots, by name (`left`, `quoteSource`); MDX slides fill them with `<Left>` and TSX
   * slides with `export function Left()`.
   */
  readonly slots: { readonly [Key in Slot]: SlotContract };

  /**
   * Content limits per slot, including `body`, for the layout's roomiest form; `variants` tighten
   * them where a slide's fields or filled slots leave less room.
   */
  readonly budget: SlotBudgets<NoInfer<Slot> | BodySlot>;

  /**
   * Budgets that apply to some slides of the layout only, such as a narrower text column. A slide
   * is checked against the base budget tightened by every variant it matches.
   */
  readonly variants?: readonly LayoutVariant<NoInfer<Slot> | BodySlot>[];

  /**
   * Whether the layout needs a `title:` and how long it may be.
   */
  readonly title?: TitleContract;

  /**
   * The brand surface a slide of this layout gets when its frontmatter names none, in kebab-case,
   * such as `accent` for a section divider. The build writes it into the slide's frontmatter only
   * when the deck's brand has that surface; otherwise the slide stays on `default`. A slide's own
   * `surface:` always wins.
   */
  readonly surface?: string;

  /**
   * A slide that uses the layout well.
   */
  readonly example: LayoutExample;

  /**
   * How `deckster export --pptx` maps the layout to PowerPoint placeholders; see
   * {@link PptxMapping}. Without it, the slide's text is exported as free text boxes on a blank
   * layout.
   */
  readonly pptx?: PptxMapping;

  /**
   * Set on a brand's or a deck's code layout that takes the name of a kit or engine layout on
   * purpose, to replace it: slides that name the layout get this one, in the kit layout's place in
   * `deckster layouts`, and the kit's component and stylesheet for it are not loaded. The build
   * checks that every slide written for the original still works (its fields, slots, title and
   * example). Without it, a code layout named like a kit layout is an error, and with it on a name
   * that no kit or engine layout has, too. Kit and catalog layouts leave it out.
   */
  readonly replaces?: true;
};

/**
 * Any layout contract, whatever its fields and slots.
 */
export type AnyLayoutContract = LayoutContract<string, Schema.Struct.Fields, string>;

/**
 * The layouts one package provides, as the build and `deckster layouts` load them. A package that
 * registers layouts at run time exports one of these as the default export of a Node-safe module
 * (for the kit, `@deckster/kit/catalog`), with a contract for every layout it registers.
 */
export type LayoutCatalog = {
  /**
   * The package that provides the layouts, such as `@deckster/kit`; `deckster layouts` prints it.
   */
  readonly source: string;

  /**
   * The contracts, in the order `deckster layouts` lists them.
   */
  readonly layouts: readonly AnyLayoutContract[];
};

/**
 * Declares a layout's contract. It returns its argument unchanged, typed so `LayoutProps<typeof
 * contract>` knows the layout's fields and slots; the build checks the contract when it loads the
 * catalog and reports what is wrong with it.
 *
 * @param contract - The layout's name, description, schema, slots, budget and example.
 * @returns The same contract.
 */
export function defineLayoutContract<
  const Name extends string,
  Fields extends Schema.Struct.Fields,
  const Slot extends string = never,
>(contract: LayoutContract<Name, Fields, Slot>): LayoutContract<Name, Fields, Slot> {
  return contract;
}

/**
 * Declares a layout catalog. It returns its argument unchanged and exists for type checking.
 *
 * @param catalog - The providing package and its layout contracts.
 * @returns The same catalog.
 */
export function defineLayoutCatalog(catalog: LayoutCatalog): LayoutCatalog {
  return catalog;
}

/**
 * What a slide gives {@link variantApplies} and {@link slideBudget}: its validated frontmatter and
 * the named slots it fills.
 */
export type VariantInput = {
  /**
   * The slide's frontmatter with the layout's defaults applied.
   */
  readonly frontmatter: Readonly<Record<string, unknown>>;

  /**
   * The slots the slide fills; `body` may be listed and is ignored.
   */
  readonly filled: readonly string[];
};

/**
 * Whether a variant's condition holds for a slide: every listed field has its value, every listed
 * list has its count and every listed slot is filled.
 *
 * @param condition - The variant's `when`.
 * @param slide - The slide's frontmatter and filled slots.
 * @returns `true` for an empty condition.
 */
export function variantApplies(condition: VariantCondition, slide: VariantInput): boolean {
  const fieldsHold = Object.entries(condition.fields ?? {}).every(
    ([field, value]) => slide.frontmatter[field] === value,
  );
  const countsHold = Object.entries(condition.counts ?? {}).every(([field, count]) => {
    const list = slide.frontmatter[field];
    return Array.isArray(list) && countMatches(list.length, count);
  });
  const filledHold = (condition.filled ?? []).every((slot) => slide.filled.includes(slot));
  return fieldsHold && countsHold && filledHold;
}

/**
 * The variants of a layout that apply to a slide, in contract order.
 *
 * @param contract - The layout's contract.
 * @param slide - The slide's frontmatter and filled slots.
 */
export function matchingVariants(
  contract: AnyLayoutContract,
  slide: VariantInput,
): readonly LayoutVariant[] {
  return (contract.variants ?? []).filter((variant) => variantApplies(variant.when, slide));
}

/**
 * The content budget one slot of a slide is held to: the layout's base budget, with each limit
 * lowered to the tightest value any matching variant sets.
 *
 * @param contract - The layout's contract.
 * @param slot - The slot name, `body` included.
 * @param slide - The slide's frontmatter and filled slots.
 * @returns The limits; `{}` for a slot the layout does not budget.
 */
export function slideBudget(
  contract: AnyLayoutContract,
  slot: string,
  slide: VariantInput,
): ContentBudget {
  return combineBudgets([
    contract.budget[slot],
    ...matchingVariants(contract, slide).map((variant) => variant.budget[slot]),
  ]);
}

/**
 * Budgets combined into one: each limit at the lowest value any of them sets.
 *
 * @param budgets - The budgets to combine; `undefined` entries are skipped.
 * @returns The combined limits; `{}` when none sets any.
 */
export function combineBudgets(budgets: readonly (ContentBudget | undefined)[]): ContentBudget {
  return {
    ...tightest(budgets, 'maxWords'),
    ...tightest(budgets, 'maxBullets'),
    ...tightest(budgets, 'maxLines'),
  };
}

/**
 * The lowest value of one limit across budgets, as a one-key object, or `{}` when none sets it.
 *
 * @param budgets - The budgets to combine; `undefined` entries are skipped.
 * @param limit - The limit to combine.
 */
function tightest(
  budgets: readonly (ContentBudget | undefined)[],
  limit: keyof ContentBudget,
): ContentBudget {
  const values = budgets.flatMap((budget) =>
    budget?.[limit] === undefined ? [] : [budget[limit]],
  );
  return values.length === 0 ? {} : { [limit]: Math.min(...values) };
}

/**
 * The field limits a slide is held to: each path at the tightest value any matching variant sets.
 *
 * @param contract - The layout's contract.
 * @param slide - The slide's frontmatter and filled slots.
 * @returns The limits by path; `{}` when no matching variant sets any.
 */
export function slideFieldLimits(contract: AnyLayoutContract, slide: VariantInput): FieldLimits {
  const limits: Record<string, FieldLimit> = {};
  for (const variant of matchingVariants(contract, slide)) {
    for (const [path, limit] of Object.entries(variant.fields ?? {})) {
      const current = limits[path]?.maxChars;
      if (limit.maxChars !== undefined) {
        limits[path] = {
          maxChars: current === undefined ? limit.maxChars : Math.min(current, limit.maxChars),
        };
      }
    }
  }

  return limits;
}

/**
 * A frontmatter value over a field limit.
 */
export type FieldLimitBreach = {
  /**
   * Where the value is, with the item's index: `stats[3].label`.
   */
  readonly path: string;

  /**
   * How many characters it has.
   */
  readonly length: number;

  /**
   * How many it may have.
   */
  readonly maxChars: number;
};

/**
 * Every value of a slide's frontmatter that is longer than a field limit allows.
 *
 * @param frontmatter - The decoded frontmatter.
 * @param limits - The limits by path, from {@link slideFieldLimits}.
 */
export function fieldLimitBreaches(
  frontmatter: Readonly<Record<string, unknown>>,
  limits: FieldLimits,
): FieldLimitBreach[] {
  return Object.entries(limits).flatMap(([path, limit]) => {
    const max = limit.maxChars;
    if (max === undefined) {
      return [];
    }

    return valuesAt(frontmatter, path.split('.'), '')
      .filter(({ value }) => typeof value === 'string' && value.length > max)
      .map(({ at, value }) => ({ path: at, length: String(value).length, maxChars: max }));
  });
}

/**
 * The values at a path, each with the path to it written with item indexes.
 *
 * @param value - The object to read.
 * @param parts - The path's parts: `stats[]` and `label`.
 * @param prefix - The path read so far.
 */
function valuesAt(
  value: unknown,
  parts: readonly string[],
  prefix: string,
): { at: string; value: unknown }[] {
  const [part, ...rest] = parts;
  if (part === undefined) {
    return [{ at: prefix, value }];
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const isList = part.endsWith('[]');
  const key = isList ? part.slice(0, -2) : part;
  const next: unknown = Reflect.get(value, key);
  const at = prefix === '' ? key : `${prefix}.${key}`;
  if (!isList) {
    return valuesAt(next, rest, at);
  }

  return Array.isArray(next)
    ? next.flatMap((item: unknown, index) => valuesAt(item, rest, `${at}[${index}]`))
    : [];
}
