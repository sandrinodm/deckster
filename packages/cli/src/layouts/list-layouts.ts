import type { BrandTokens } from '@deckster/brand';
import type {
  AnyLayoutContract,
  ContentBudget,
  FieldLimits,
  LayoutVariant,
  TitleContract,
} from '@deckster/engine/layout';

import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { combineBudgets } from '@deckster/engine/layout';
import { BODY_SLOT, slotTag } from '@deckster/engine/slots';
import {
  deckBrandName,
  findDeck,
  loadDeck,
  type CatalogLayout,
  type DeckBuildError,
  type LayoutCatalogIndex,
} from '@deckster/vite-plugin';
import { Effect, Predicate, Result, Schema, type FileSystem } from 'effect';
import { parse as parseYaml } from 'yaml';

import { loadBrandCatalog } from '#layouts/load-brand-catalog.ts';

/**
 * What `body` is when a layout's contract does not describe it.
 */
const DEFAULT_BODY_SLOT: SlotInfo = {
  /**
   * `body` has no tag.
   */
  tag: null,

  /**
   * What `body` holds in every layout.
   */
  description: 'Content outside every slot tag (in TSX, the default export).',

  /**
   * Optional unless the contract says otherwise.
   */
  required: false,

  /**
   * Anything, unless the contract says otherwise.
   */
  accepts: [],
};

/**
 * A frontmatter string YAML reads back as the same string without quotes.
 */
const PLAIN_YAML_PATTERN = /^[\w ./-]+$/;

/**
 * What a layout's `source` starts with when the deck's brand supplies it.
 */
export const BRAND_SOURCE_PREFIX = 'brand:';

/**
 * A JSON Schema object, as `deckster layouts --json` prints it.
 */
type JsonSchema = Readonly<Record<string, unknown>>;

/**
 * One slot of a layout, as `deckster layouts --json` prints it.
 */
export type SlotInfo = {
  /**
   * The tag that fills it in MDX and the export that fills it in TSX, such as `Left`; `null` for
   * `body`, which is the content outside every slot tag (in TSX, the default export).
   */
  tag: string | null;

  /**
   * What goes in the slot.
   */
  description: string;

  /**
   * Whether the build fails when a slide leaves it empty.
   */
  required: boolean;

  /**
   * The kinds of content it is designed for.
   */
  accepts: readonly string[];
};

/**
 * One frontmatter field of a layout, as `deckster layouts --json` prints it next to its JSON
 * Schema.
 */
export type FieldInfo = {
  /**
   * Whether a slide of the layout must set it.
   */
  required: boolean;

  /**
   * The value a slide gets when it leaves the field out, or `null` when there is none.
   */
  default: unknown;

  /**
   * The values the field accepts when it is a choice, such as `["1:1", "5:7", "7:5"]`, or `null`.
   */
  allowed: readonly unknown[] | null;

  /**
   * How to fill it, from the contract's hints, or `null`.
   */
  hint: string | null;
};

/**
 * One layout available to a deck, as `deckster layouts --json` prints it: its whole contract.
 */
export type LayoutInfo = {
  /**
   * The name a slide gives in its `layout:` frontmatter.
   */
  name: string;

  /**
   * The package that supplies the layout, such as `@deckster/kit`, or `brand:<name>` for a layout
   * the deck's brand brings in its `layouts.ts`.
   */
  source: string;

  /**
   * For a brand layout, the kit layout a slide on it falls back to when the deck moves to a brand
   * without it; `null` for every other layout.
   */
  fallback: string | null;

  /**
   * For a brand layout, its name in the source template; `null` when it has none or the layout is
   * not a brand's.
   */
  label: string | null;

  /**
   * When to use it.
   */
  description: string;

  /**
   * The layout's own frontmatter fields, as a JSON Schema object; slides also take the fields every
   * slide has (`slideFrontmatter` at the top level).
   */
  frontmatter: JsonSchema;

  /**
   * Each of the layout's own fields: whether it is required, its default, the values it allows and
   * how to fill it.
   */
  fields: Record<string, FieldInfo>;

  /**
   * What the layout needs of `title:`, or `null` when it takes any title or none.
   */
  title: TitleContract | null;

  /**
   * The brand surface a slide of the layout gets when it names none, or `null` for the default.
   */
  surface: string | null;

  /**
   * Every slot, `body` first.
   */
  slots: Record<string, SlotInfo>;

  /**
   * Content limits per slot for the layout's roomiest form, which `deckster lint` checks.
   */
  budget: Readonly<Record<string, ContentBudget | undefined>>;

  /**
   * Variants with tighter limits, each with when it applies and the limits a slide that matches it
   * is held to; a slide that matches several is held to the tightest of each.
   */
  variants: readonly VariantInfo[];

  /**
   * A complete slide that uses the layout: its frontmatter, its body and the whole MDX file.
   */
  example: { frontmatter: Readonly<Record<string, unknown>>; body: string; mdx: string };

  /**
   * Reserved for the PPTX export mapping; `null` until a layout declares one.
   */
  pptx: Readonly<Record<string, unknown>> | null;
};

/**
 * One variant as the catalog prints it: the contract's variant, and every limit `deckster lint` and
 * the build hold a slide that matches it to.
 */
export type VariantInfo = LayoutVariant & {
  /**
   * The limits in force for a slide that matches this variant: the base budget of every slot
   * lowered by the variant's (`budget`), and the variant's field limits (`fields`, by path such as
   * `stats[].label`), which the build checks.
   */
  limits: {
    /**
     * Each budgeted slot's limits, by slot name.
     */
    budget: Readonly<Record<string, ContentBudget>>;

    /**
     * Each limited field's limits, by path.
     */
    fields: FieldLimits;
  };
};

/**
 * The layout catalog of a deck, as `deckster layouts --json` prints it.
 */
export type LayoutCatalogInfo = {
  /**
   * The fields every slide takes, whatever its layout, as a JSON Schema object.
   */
  slideFrontmatter: JsonSchema;

  /**
   * Every layout, in catalog order.
   */
  layouts: LayoutInfo[];

  /**
   * What the brand's layouts are missing for, such as a brand that does not load; empty when
   * nothing is wrong.
   */
  warnings: string[];
};

/**
 * Lists the layouts a deck can use with their full contracts: the engine's built-in layout plus
 * every layout in the layout catalogs, loaded in Node without starting a server. A later catalog's
 * layout replaces an earlier one of the same name, as it does at build and run time.
 *
 * @param workspaceRoot - The workspace that contains the deck.
 * @param deckId - The deck folder name.
 * @param brandOverride - A brand folder that replaces the deck config's `brand`, as `--brand` does.
 * @returns The common frontmatter fields and the layouts, in catalog order.
 * @throws DeckBuildError in the error channel when the deck does not exist, its config is invalid,
 *   or a layout catalog or the brand's layouts fail to load; BrandError when the brand does not
 *   load.
 */
export const listLayouts = Effect.fn('listLayouts')(function* (
  workspaceRoot: string,
  deckId: string,
  brandOverride?: string,
): Effect.fn.Return<LayoutCatalogInfo, DeckBuildError, FileSystem.FileSystem> {
  const deck = yield* loadDeck(workspaceRoot, yield* findDeck(workspaceRoot, deckId));
  const { catalog, brand, warning } = yield* loadBrandCatalog(
    workspaceRoot,
    deckBrandName(deck.config, brandOverride),
  );
  return {
    ...describeCatalog(catalog, brand?.tokens),
    warnings: warning === undefined ? [] : [warning],
  };
});

/**
 * The printable form of a loaded catalog.
 *
 * @param catalog - The layouts by name.
 */
export function describeCatalog(
  catalog: LayoutCatalogIndex,
  brand?: Pick<BrandTokens, 'layouts'>,
): LayoutCatalogInfo {
  return {
    slideFrontmatter: jsonSchemaOf(SlideFrontmatter),
    warnings: [],
    layouts: [...catalog.values()].map((layout) =>
      describeLayout(
        layout,
        brand?.layouts.find((entry) => entry.name === layout.contract.name),
      ),
    ),
  };
}

/**
 * The printable form of one layout.
 *
 * @param layout - The layout and its source.
 * @param brandLayout - The brand's spec of the layout, when the layout comes from the brand.
 */
function describeLayout(
  { contract, source }: CatalogLayout,
  brandLayout: BrandTokens['layouts'][number] | undefined,
): LayoutInfo {
  const frontmatter = { layout: contract.name, ...contract.example.frontmatter };
  const fields = describeFields(contract);
  return {
    name: contract.name,
    source,
    fallback: source.startsWith(BRAND_SOURCE_PREFIX) ? (brandLayout?.fallback ?? null) : null,
    label: source.startsWith(BRAND_SOURCE_PREFIX) ? (brandLayout?.label ?? null) : null,
    description: contract.description,
    frontmatter: withDefaults(jsonSchemaOf(contract.schema), fields),
    fields,
    title: contract.title ?? null,
    surface: contract.surface ?? null,
    slots: describeSlots(contract),
    budget: contract.budget,
    variants: (contract.variants ?? []).map((variant) => describeVariant(contract, variant)),
    example: {
      frontmatter: contract.example.frontmatter,
      body: contract.example.body,
      mdx: exampleMdx(frontmatter, contract.example.body, contract.example.comments),
    },
    pptx: contract.pptx ?? null,
  };
}

/**
 * A variant with the limits in force where it applies: each slot's base budget lowered by the
 * variant's (combined as `slideBudget` combines them), and its field limits: what a slide that
 * matches only this variant is held to.
 *
 * @param contract - The layout's contract.
 * @param variant - One of its variants.
 */
function describeVariant(contract: AnyLayoutContract, variant: LayoutVariant): VariantInfo {
  const slots = new Set([...Object.keys(contract.budget), ...Object.keys(variant.budget)]);
  const budget: Record<string, ContentBudget> = {};
  for (const slot of slots) {
    budget[slot] = combineBudgets([contract.budget[slot], variant.budget[slot]]);
  }

  return { ...variant, limits: { budget, fields: variant.fields ?? {} } };
}

/**
 * Each of a layout's own fields: decoded alone from nothing, a field either fails (required),
 * yields its default, or stays absent (optional, no default).
 *
 * @param contract - The layout's contract.
 */
function describeFields(contract: AnyLayoutContract): Record<string, FieldInfo> {
  const properties = jsonSchemaOf(contract.schema)['properties'];
  const fields: Record<string, FieldInfo> = {};
  for (const [name, field] of Object.entries(contract.schema.fields)) {
    // Frontmatter fields decode without services; the build relies on the same.
    const alone = Schema.Struct({ [name]: field }) as Schema.Struct<Schema.Struct.Fields> &
      Schema.ConstraintDecoder<unknown>;
    const decoded = Schema.decodeUnknownResult(alone)({});
    const success: unknown = Result.isSuccess(decoded) ? decoded.success : undefined;
    const value = Predicate.isObject(success) ? Reflect.get(success, name) : undefined;
    const property = Predicate.isObject(properties) ? Reflect.get(properties, name) : undefined;
    fields[name] = {
      required: Result.isFailure(decoded),
      default: value ?? null,
      allowed: allowedValues(property),
      hint: contract.hints?.[name] ?? null,
    };
  }

  return fields;
}

/**
 * The values a field's JSON Schema allows when it is a choice of constants, else `null`.
 *
 * @param property - The field's JSON Schema.
 */
function allowedValues(property: unknown): readonly unknown[] | null {
  if (!Predicate.isObject(property)) {
    return null;
  }

  if (Array.isArray(property['enum'])) {
    return property['enum'];
  }

  if (property['type'] === 'boolean') {
    return [true, false];
  }

  const options = property['anyOf'];
  if (!Array.isArray(options)) {
    return null;
  }

  const constants = options.flatMap((option): unknown[] => {
    if (!Predicate.isObject(option)) {
      return [];
    }

    if (Array.isArray(option['enum'])) {
      return option['enum'];
    }

    return ['const' in option ? option['const'] : undefined];
  });
  return constants.includes(undefined) ? null : constants;
}

/**
 * A layout's JSON Schema with each field's default written as `default`, as JSON Schema readers
 * expect it.
 *
 * @param schema - The layout's JSON Schema.
 * @param fields - Its fields, with their defaults.
 */
function withDefaults(schema: JsonSchema, fields: Record<string, FieldInfo>): JsonSchema {
  const properties = schema['properties'];
  if (!Predicate.isObject(properties)) {
    return schema;
  }

  const withDefault: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    const fallback = fields[name]?.default ?? null;
    withDefault[name] =
      fallback === null || !Predicate.isObject(property)
        ? property
        : { ...property, default: fallback };
  }

  return { ...schema, properties: withDefault };
}

/**
 * A layout's slots, `body` first, each with the tag that fills it.
 *
 * @param contract - The layout's contract.
 */
function describeSlots(contract: AnyLayoutContract): Record<string, SlotInfo> {
  const slots: Record<string, SlotInfo> = { [BODY_SLOT]: DEFAULT_BODY_SLOT };
  for (const [name, slot] of Object.entries(contract.slots)) {
    slots[name] = {
      tag: name === BODY_SLOT ? null : slotTag(name),
      description: slot.description,
      required: slot.required ?? false,
      accepts: slot.accepts,
    };
  }

  return slots;
}

/**
 * A complete MDX slide: the frontmatter block and the body. Lists and nested fields are written as
 * block YAML, one field per line, as a person writes them.
 *
 * @param frontmatter - The fields, `layout` first; strings that YAML would read differently are
 *   written as JSON strings.
 * @param body - The MDX after the frontmatter.
 * @param comments - YAML comment lines to add at the end of the frontmatter, without the `#`.
 */
export function exampleMdx(
  frontmatter: Readonly<Record<string, unknown>>,
  body: string,
  comments: readonly string[] = [],
): string {
  const fields = Object.entries(frontmatter).flatMap(([key, value]) => yamlField(key, value, ''));
  const notes = comments.map((line) => `# ${line}`);
  return ['---', ...fields, ...notes, '---', '', body.trimEnd(), ''].join('\n');
}

/**
 * One field as block YAML lines: `key: value` for a scalar, `key:` and the items or fields indented
 * under it for a list or a set of fields.
 *
 * @param key - The field name.
 * @param value - Its value.
 * @param indent - The indentation of the field.
 */
function yamlField(key: string, value: unknown, indent: string): string[] {
  if (isEmptyCollection(value) || !(Array.isArray(value) || Predicate.isObject(value))) {
    return [`${indent}${key}: ${yamlScalar(value)}`];
  }

  return [`${indent}${key}:`, ...yamlBlock(value, `${indent}  `)];
}

/**
 * A list or a set of fields as block YAML lines at an indentation.
 *
 * @param value - A non-empty list or set of fields.
 * @param indent - The indentation of its entries.
 */
function yamlBlock(value: unknown, indent: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => {
      if (isEmptyCollection(item) || !(Array.isArray(item) || Predicate.isObject(item))) {
        return [`${indent}- ${yamlScalar(item)}`];
      }

      // The item's first line takes the dash; the rest line up under it.
      const [first = '', ...rest] = yamlBlock(item, `${indent}  `);
      return [`${indent}- ${first.slice(indent.length + 2)}`, ...rest];
    });
  }

  if (!Predicate.isObject(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]) => yamlField(key, item, indent));
}

/**
 * Whether a value is an empty list or set of fields, which YAML writes inline (`[]`, `{}`).
 *
 * @param value - A frontmatter value.
 */
function isEmptyCollection(value: unknown): boolean {
  return Array.isArray(value)
    ? value.length === 0
    : Predicate.isObject(value) && Object.keys(value).length === 0;
}

/**
 * A scalar as YAML: plain strings as they are, everything else as JSON (which YAML reads). A string
 * such as `2028` or `true` is quoted, because YAML would read it back as a number or a boolean.
 *
 * @param value - A frontmatter value.
 */
function yamlScalar(value: unknown): string {
  return typeof value === 'string' &&
    PLAIN_YAML_PATTERN.test(value) &&
    parseYaml(`- ${value}`)?.[0] === value
    ? value
    : JSON.stringify(value);
}

/**
 * A struct schema as a JSON Schema object that rejects unknown fields, as the build does.
 *
 * @param schema - A struct schema.
 */
function jsonSchemaOf(schema: Schema.Struct<Schema.Struct.Fields>): JsonSchema {
  if (Object.keys(schema.fields).length === 0) {
    return { type: 'object', properties: {}, additionalProperties: false };
  }

  const document = Schema.toJsonSchemaDocument(schema);
  const definitions =
    Object.keys(document.definitions).length === 0 ? {} : { $defs: document.definitions };
  return { ...document.schema, additionalProperties: false, ...definitions };
}
