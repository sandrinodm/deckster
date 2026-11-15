import type { ContentBudget, FieldLimits, VariantCondition } from '@deckster/engine/layout';

import { combineBudgets, slideBudget, variantApplies } from '@deckster/engine/layout';
import { BODY_SLOT } from '@deckster/engine/slots';
import { fill } from '@deckster/kit/limit-cases';
import { loadLayoutCatalog, validateFrontmatter } from '@deckster/vite-plugin';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Predicate, Result } from 'effect';

import { describeCatalog, type LayoutInfo } from '#layouts/list-layouts.ts';

/**
 * The file messages name; the frontmatter is checked without one.
 */
const REF = { file: '/decks/limits/slides/limits.mdx', displayPath: 'slides/limits.mdx' };

/**
 * A JSON Schema node, as the catalog prints it.
 */
type Node = Readonly<Record<string, unknown>>;

/**
 * One slide each layout's published limits describe: the base form and each variant.
 */
type Case = {
  /**
   * The case's name in test titles.
   */
  name: string;

  /**
   * What the slide must look like; empty for the base form.
   */
  when: VariantCondition;
};

/**
 * Frontmatter from a layout's example with every text at the longest the catalog says it may be,
 * shaped to match a case: the condition's fields set, its lists at the count it names and other
 * lists at the most their schema allows.
 *
 * @param layout - The layout as the catalog prints it.
 * @param when - The case's condition.
 * @param fields - The field limits the catalog prints for slides like it.
 * @param over - A path to set one character past its limit, for the failing case.
 */
function atLimits(
  layout: LayoutInfo,
  when: VariantCondition,
  fields: FieldLimits,
  over?: string,
): Record<string, unknown> {
  const properties = (layout.frontmatter['properties'] ?? {}) as Readonly<Record<string, Node>>;
  const base: Record<string, unknown> = { ...layout.example.frontmatter, ...when.fields };
  for (const [field, value] of Object.entries(base)) {
    // Lists take the count the case names, or the most the schema allows: the fullest slide.
    const most = properties[field]?.['maxItems'];
    const condition = when.counts?.[field];
    const count = listCount(condition, most);
    if (Array.isArray(value) && count !== undefined) {
      base[field] = Array.from({ length: count }, (_, index) => value[index % value.length]);
    }
  }

  const filled: Record<string, unknown> = { layout: layout.name };
  for (const [key, value] of Object.entries(base)) {
    const schema = properties[key];
    filled[key] = schema === undefined ? value : fillValue(value, schema, key, fields, over);
  }

  // A comparison's rows hold one value per option: the cross-field check fails any other count.
  const options = filled['options'];
  const rows = filled['rows'];
  if (Array.isArray(options) && Array.isArray(rows)) {
    filled['rows'] = rows.map((row: unknown) => {
      const values: unknown = Predicate.isObject(row) ? row['values'] : undefined;
      return Array.isArray(values) && Predicate.isObject(row)
        ? { ...row, values: options.map((_, index) => values[index % values.length]) }
        : row;
    });
  }

  // A variant may hold the title shorter than the layout's own limit.
  const maxChars = Math.min(
    layout.title?.maxChars ?? Infinity,
    fields['title']?.maxChars ?? Infinity,
  );
  filled['title'] = filledTitle(maxChars, over, base['title']);
  return filled;
}

/**
 * Selects the case's list count before falling back to the schema maximum.
 */
function listCount(
  condition: number | { readonly min?: number; readonly max?: number } | undefined,
  maximum: unknown,
): number | undefined {
  if (typeof condition === 'number') {
    return condition;
  }

  const fallback = typeof maximum === 'number' ? maximum : undefined;
  return condition?.max ?? condition?.min ?? fallback;
}

/**
 * Fills a bounded title or keeps its example when the schema supplies no finite limit.
 */
function filledTitle(maxChars: number, over: string | undefined, example: unknown): unknown {
  if (!Number.isFinite(maxChars)) {
    return example ?? 'A title';
  }

  const length = over === 'title' ? maxChars + 1 : maxChars;
  return fill(length);
}

/**
 * A web address of exactly `length` characters, its parts between slashes and dots short enough for
 * the line under a QR code.
 *
 * @param length - The number of characters, 21 or more.
 */
function fillUrl(length: number): string {
  const start = 'https://www.example.org/';
  const parts = 'abcdefghijklmnopqrs/'.repeat(Math.ceil(length / 20));
  return `${start}${parts}`.slice(0, length).replace(/\/$/u, 'a');
}

/**
 * A value with every string in it at the longest its schema and the field limits allow.
 *
 * @param value - The example's value.
 * @param schema - Its JSON Schema.
 * @param path - Its path, with `[]` for list items.
 * @param fields - The field limits by path.
 * @param over - A path to set one character past its limit.
 */
function fillValue(
  value: unknown,
  schema: Node,
  path: string,
  fields: FieldLimits,
  over: string | undefined,
): unknown {
  if (typeof value === 'string' && typeof schema['maxLength'] === 'number') {
    const limit = Math.min(schema['maxLength'], fields[path]?.maxChars ?? Infinity);
    const length = path === over ? limit + 1 : limit;
    // A web address stays one: the field checks its shape as well as its length.
    return value.startsWith('https://') ? fillUrl(length) : fill(length);
  }

  const branches = Array.isArray(schema['anyOf']) ? (schema['anyOf'] as Node[]) : [];
  if (branches.length > 0) {
    const branch = branches.find((candidate) => candidate['type'] === typeof value);
    return branch === undefined ? value : fillValue(value, branch, path, fields, over);
  }

  if (Array.isArray(value) && Predicate.isObject(schema['items'])) {
    const items = schema['items'] as Node;
    return value.map((item: unknown) => fillValue(item, items, `${path}[]`, fields, over));
  }

  if (Predicate.isObject(value) && Predicate.isObject(schema['properties'])) {
    const properties = schema['properties'] as Readonly<Record<string, Node>>;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const child = properties[key];
        return [
          key,
          child === undefined ? item : fillValue(item, child, `${path}.${key}`, fields, over),
        ];
      }),
    );
  }

  return value;
}

/**
 * The field limits the catalog prints for a slide: every matching variant's, at the tightest.
 *
 * @param layout - The layout as the catalog prints it.
 * @param slide - The slide's frontmatter and filled slots.
 */
function publishedFields(
  layout: LayoutInfo,
  slide: { frontmatter: Readonly<Record<string, unknown>>; filled: readonly string[] },
): FieldLimits {
  const limits: Record<string, { maxChars: number }> = {};
  for (const variant of layout.variants.filter((entry) => variantApplies(entry.when, slide))) {
    for (const [path, limit] of Object.entries(variant.limits.fields)) {
      const max = Math.min(limits[path]?.maxChars ?? Infinity, limit.maxChars ?? Infinity);
      limits[path] = { maxChars: max };
    }
  }

  return limits;
}

/**
 * The numbers a JSON Schema node and everything under it limits: `maxLength`, `maxItems` and
 * `minItems`, each with the keyword and the path it limits.
 *
 * @param node - The schema node.
 * @param path - Where it is, for the message.
 */
function schemaLimits(
  node: unknown,
  path: string,
): { path: string; keyword: string; value: number }[] {
  if (Array.isArray(node)) {
    return node.flatMap((item: unknown) => schemaLimits(item, path));
  }

  if (!Predicate.isObject(node)) {
    return [];
  }

  const own = ['maxLength', 'maxItems', 'minItems'].flatMap((keyword) => {
    const value = node[keyword];
    return typeof value === 'number' ? [{ path, keyword, value }] : [];
  });
  return [
    ...own,
    ...Object.entries(node).flatMap(([key, child]) =>
      key === 'properties' && Predicate.isObject(child)
        ? Object.entries(child).flatMap(([name, property]) =>
            schemaLimits(property, `${path}.${name}`),
          )
        : schemaLimits(child, path),
    ),
  ];
}

describe('the limits deck layouts --json prints', () => {
  it.effect('state every length and count the frontmatter schema holds in the field hint', () =>
    Effect.gen(function* () {
      const info = describeCatalog(yield* loadLayoutCatalog());
      const missing: string[] = [];
      for (const layout of info.layouts) {
        const properties = (layout.frontmatter['properties'] ?? {}) as Readonly<
          Record<string, Node>
        >;
        for (const [field, schema] of Object.entries(properties)) {
          const hint = layout.fields[field]?.hint ?? '';
          for (const limit of schemaLimits(schema, field)) {
            // A one character minimum is "not empty", which a hint need not say.
            if (limit.keyword === 'minLength' || limit.value <= 1) {
              continue;
            }

            if (!new RegExp(`(?<![\\d.])${limit.value}(?![\\d.])`, 'u').test(hint)) {
              missing.push(`${layout.name}: ${limit.path} ${limit.keyword} ${limit.value}`);
            }
          }
        }
      }

      // Every limit in the schema is a number the hint also writes, so an author reads it before
      // the build rejects the slide.
      expect(missing).toEqual([]);
    }),
  );

  it.effect('are the limits the build and deck lint enforce, for every layout and variant', () =>
    Effect.gen(function* () {
      const catalog = yield* loadLayoutCatalog();
      const info = describeCatalog(catalog);
      let checked = 0;
      for (const layout of info.layouts) {
        const contract = catalog.get(layout.name)?.contract;
        expect(contract, layout.name).toBeDefined();
        if (contract === undefined) {
          continue;
        }

        const cases: Case[] = [
          { name: 'base', when: {} },
          ...layout.variants.map((variant) => ({ name: variant.name, when: variant.when })),
        ];
        for (const { name, when } of cases) {
          const label = `${layout.name} (${name})`;
          const shape = atLimits(layout, when, {});
          const slide = { frontmatter: shape, filled: [...(when.filled ?? []), BODY_SLOT] };
          const fields = publishedFields(layout, slide);
          const full = atLimits(layout, when, fields);
          // Every text at its published limit builds: no limit is stricter than the catalog says.
          const valid = yield* Effect.result(validateFrontmatter(full, catalog, REF));
          expect(Result.isSuccess(valid) ? 'valid' : valid.failure.message, label).toBe('valid');

          // One character past a published field limit fails, naming the field.
          for (const path of Object.keys(fields)) {
            const broken = yield* Effect.flip(
              validateFrontmatter(atLimits(layout, when, fields, path), catalog, REF),
            );
            expect(broken.message, `${label} ${path}`).toContain(path.split('[]')[0] ?? path);
          }

          // deck lint holds each slot to the tightest of the budgets the catalog prints for it.
          const matching = layout.variants.filter((variant) => variantApplies(variant.when, slide));
          for (const slot of Object.keys(layout.slots)) {
            const published: ContentBudget = combineBudgets([
              layout.budget[slot],
              ...matching.map((variant) => variant.limits.budget[slot]),
            ]);
            expect(slideBudget(contract, slot, slide), `${label} ${slot}`).toEqual(published);
          }

          checked += 1;
        }
      }

      expect(checked).toBeGreaterThan(info.layouts.length);
    }),
  );

  it.effect('print the label limit of a row of four stats on its variant', () =>
    Effect.gen(function* () {
      const info = describeCatalog(yield* loadLayoutCatalog());
      const stats = info.layouts.find((layout) => layout.name === 'stats');
      expect(stats?.variants).toContainEqual(
        expect.objectContaining({
          name: 'four stats',
          when: { counts: { stats: 4 } },
          limits: expect.objectContaining({ fields: { 'stats[].label': { maxChars: 32 } } }),
        }),
      );
    }),
  );
});
