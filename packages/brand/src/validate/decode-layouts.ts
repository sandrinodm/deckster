import { Result, Schema, SchemaIssue } from 'effect';

import type { BrandProblem } from '#validate/brand-error.ts';

import { BrandLayouts, type BrandLayoutSpec } from '#schema/layout-schema.ts';
import { describeValue, formatPath } from '#validate/decode-brand.ts';
import { suggest } from '#validate/suggest.ts';

/**
 * The message Effect Schema gives a required field that is missing.
 */
const MISSING_KEY_MESSAGE = 'Missing key';

/**
 * The message Effect Schema gives a field the schema does not define.
 */
const EXCESS_PROPERTY_MESSAGE = 'Expected no excess property';

/**
 * The fix used for a field with no entry in {@link FIELD_FIXES}.
 */
const GENERIC_FIX = 'Check this field against the layout schema in packages/brand/src/schema.';

/**
 * How to fix a field of a layout, by the field's own name (the last name in its path).
 */
const FIELD_FIXES: Readonly<Record<string, string>> = {
  /**
   * The layout name.
   */
  name: 'Name the layout in kebab-case, such as "section-photo".',

  /**
   * What the layout is for.
   */
  description: 'Say in a sentence what the layout is for.',

  /**
   * The kit layout a slide falls back to.
   */
  fallback:
    'Name a kit layout such as "title", "image" or "columns"; `deckster layouts` lists them.',

  /**
   * A box.
   */
  box: 'Write the box as [x, y, width, height] in canvas pixels, such as [120, 200, 800, 400].',

  /**
   * The title.
   */
  title: 'Write `title: { box: [x, y, width, height] }`, or `title: false` when there is none.',

  /**
   * The regions list.
   */
  regions:
    'Write a list of regions, each `{ bind: { slot: "body" }, box: [x, y, width, height] }`.',

  /**
   * A region's binding.
   */
  bind: 'Write `bind: { slot: "body" }` for a slot or `bind: { field: "eyebrow" }` for a field.',

  /**
   * A region's kind.
   */
  kind: 'Use "text", "media" or "content".',

  /**
   * A type step.
   */
  type: 'Name a step of the brand type scale, such as "title", "body" or "label".',

  /**
   * A color role.
   */
  color: 'Name a color role such as "fg", "muted" or "accent".',

  /**
   * Alignment.
   */
  align: 'Use "start", "center" or "end".',

  /**
   * Vertical placement.
   */
  anchor: 'Use "start", "center" or "end".',

  /**
   * How a media region fills its box.
   */
  fit: 'Use "cover" or "contain".',

  /**
   * How the layout's layers sit over the surface's.
   */
  layers: 'Use "replace" to drop the surface layers or "over" to keep them underneath.',

  /**
   * The layout's art.
   */
  background:
    'Write a list of background layers, or an object of such lists keyed by surface name.',
};

/**
 * The fields of a layout.
 */
const LAYOUT_FIELDS = [
  'name',
  'label',
  'description',
  'fallback',
  'surface',
  'title',
  'regions',
  'fields',
  'background',
  'layers',
  'chrome',
  'budget',
  'source',
] as const;

/**
 * The fields of a region.
 */
const REGION_FIELDS = [
  'bind',
  'box',
  'kind',
  'type',
  'align',
  'anchor',
  'color',
  'fit',
  'treatment',
] as const;

/**
 * The fields of a layout's title.
 */
const TITLE_FIELDS = ['box', 'type', 'align', 'anchor', 'color'] as const;

/**
 * The fields of a layout's chrome.
 */
const CHROME_FIELDS = ['pageNumber', 'footer', 'progress', 'logo'] as const;

/**
 * The fields of a layout's source.
 */
const SOURCE_FIELDS = ['file', 'master', 'layout', 'placeholders'] as const;

/**
 * Decodes the layouts into one result, collecting every issue and rejecting fields the schema does
 * not define.
 */
const decode = Schema.decodeUnknownResult(BrandLayouts, {
  errors: 'all',
  onExcessProperty: 'error',
});

/**
 * Flattens a schema issue into one entry per field, each with its path and message.
 */
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/**
 * Decodes the default export of `layouts.ts` and explains every failure: the field's path (such as
 * `layouts[2].regions[0].box`), what was expected and what was given, and how to fix it.
 *
 * @param input - The default export of `layouts.ts`.
 * @returns The decoded layouts, or every problem found.
 */
export function decodeLayouts(
  input: unknown,
): Result.Result<readonly BrandLayoutSpec[], BrandProblem[]> {
  const decoded = decode(input);
  if (Result.isSuccess(decoded)) {
    return Result.succeed(decoded.success);
  }

  const problems = formatIssues(decoded.failure.issue).issues.map(({ path = [], message }) => {
    const keys = path.map((segment) => (typeof segment === 'object' ? segment.key : segment));
    return issueProblem(wholeBox(keys), message, input);
  });
  return Result.fail(problems);
}

/**
 * A path that ends inside a box, such as `box[3]`, cut back to the box, so the problem names the
 * box and its fix shows the whole `[x, y, width, height]`.
 *
 * @param keys - The path to the field.
 */
function wholeBox(keys: readonly PropertyKey[]): readonly PropertyKey[] {
  const box = keys.indexOf('box');
  return box === -1 ? keys : keys.slice(0, box + 1);
}

/**
 * The problem for one schema issue.
 *
 * @param keys - The path to the field, starting at the index in the list.
 * @param message - The schema's message.
 * @param input - The whole export, to read the value that was given.
 */
function issueProblem(keys: readonly PropertyKey[], message: string, input: unknown): BrandProblem {
  const path = formatPath(['layouts', ...keys]);
  if (message === MISSING_KEY_MESSAGE) {
    return { path, message: 'This field is required.', fix: fixFor(keys) };
  }

  if (message === EXCESS_PROPERTY_MESSAGE) {
    return unknownFieldProblem(path, keys);
  }

  return {
    path,
    message: `${message}, got ${describeValue(valueAt(input, keys))}.`,
    fix: fixFor(keys),
  };
}

/**
 * The problem for a field the schema does not define, with the closest known field when one is
 * close.
 *
 * @param path - The formatted path.
 * @param keys - The path to the unknown field.
 */
function unknownFieldProblem(path: string, keys: readonly PropertyKey[]): BrandProblem {
  const name = String(keys.at(-1));
  const parent = keys.slice(0, -1);
  const closest = suggest(name, knownFields(parent));
  const fix = closest === undefined ? `Remove it. ${fixFor(parent)}` : `Rename it to "${closest}".`;
  return {
    path,
    message: `"${name}" is not a field of ${formatPath(['layouts', ...parent])}.`,
    fix,
  };
}

/**
 * The fields of the object at a path: a layout, a region, the title, the chrome or the source.
 *
 * @param parent - The path to the object, starting at the layout's index.
 */
function knownFields(parent: readonly PropertyKey[]): readonly string[] {
  if (parent.length === 1) {
    return LAYOUT_FIELDS;
  }

  const last = parent.at(-1);
  if (last === 'title') {
    return TITLE_FIELDS;
  }

  if (last === 'chrome') {
    return CHROME_FIELDS;
  }

  if (last === 'source') {
    return SOURCE_FIELDS;
  }

  return parent.length === 3 && parent[1] === 'regions' ? REGION_FIELDS : [];
}

/**
 * The fix for a field, by the last name in its path.
 *
 * @param keys - The path to the field.
 */
function fixFor(keys: readonly PropertyKey[]): string {
  const name = [...keys].toReversed().find((key) => typeof key === 'string');
  return (name === undefined ? undefined : FIELD_FIXES[String(name)]) ?? GENERIC_FIX;
}

/**
 * The value at a path, or `undefined` when the path leaves the objects and lists of the input.
 *
 * @param input - Any value.
 * @param keys - The path to follow.
 */
function valueAt(input: unknown, keys: readonly PropertyKey[]): unknown {
  let value = input;
  for (const key of keys) {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }

    value = Reflect.get(value, key);
  }

  return value;
}
