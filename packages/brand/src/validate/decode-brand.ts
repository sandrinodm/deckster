import { Result, Schema, SchemaIssue, type SchemaAST } from 'effect';

import type { BrandProblem } from '#validate/brand-error.ts';

import { Brand } from '#schema/brand-schema.ts';
import { fixFor } from '#validate/field-fixes.ts';
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
 * The diagram look keys only the brand-wide `diagram` section takes.
 */
const SURFACE_LOOK_KEYS = new Set(['edges', 'groups', 'labels', 'kinds']);

/**
 * Path segments to a field of a surface's `diagram`: `color.surfaces.<name>.diagram.<field>`.
 */
const SURFACE_DIAGRAM_FIELD_DEPTH = 5;

/**
 * Path segments to a field of a card a surface recolors, or more for a nested field:
 * `color.surfaces.<name>.diagram.cards.<card>.<field>`.
 */
const SURFACE_CARD_FIELD_DEPTH = 7;

/**
 * Flattens a schema issue into one entry per field, each with its path and message.
 */
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/**
 * Decodes a brand, collecting every issue and rejecting fields the schema does not define.
 */
const decode = Schema.decodeUnknownResult(Brand, { errors: 'all', onExcessProperty: 'error' });

/**
 * Decodes a brand against the schema and explains every failure: the field's path, what was
 * expected and what was given, and how to fix it. Unknown fields get a "did you mean" fix.
 *
 * @param input - The default export of `brand.ts`.
 * @returns The decoded brand, or every problem found.
 */
export function decodeBrand(input: unknown): Result.Result<Brand, BrandProblem[]> {
  const decoded = decode(input);
  if (Result.isSuccess(decoded)) {
    return Result.succeed(decoded.success);
  }

  const problems = formatIssues(decoded.failure.issue).issues.map(({ path = [], message }) => {
    const keys = path.map((segment) => (typeof segment === 'object' ? segment.key : segment));
    return issueProblem(keys, message, input);
  });
  return Result.fail(problems);
}

/**
 * Formats a field path the way authors write it: `color.data.categorical[2]`.
 *
 * @param keys - Path segments; numbers become indexes.
 */
export function formatPath(keys: readonly PropertyKey[]): string {
  return keys
    .map((key, index) => {
      if (typeof key === 'number') {
        return `[${key}]`;
      }

      return index === 0 ? String(key) : `.${String(key)}`;
    })
    .join('');
}

/**
 * Describes a value briefly for "got ..." messages.
 *
 * @param value - Any value; strings are quoted, lists and objects summarized.
 */
export function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return 'a list';
  }

  if (typeof value === 'object' && value !== null) {
    return 'a set of fields';
  }

  return JSON.stringify(value) ?? String(value);
}

/**
 * The problem for one schema issue: a missing field, an unknown field with a "did you mean" fix, or
 * a value of the wrong shape with the value that was given.
 *
 * @param keys - The path to the field.
 * @param message - The schema's message for the issue.
 * @param input - The whole brand, to read the value that was given.
 */
function issueProblem(keys: readonly PropertyKey[], message: string, input: unknown): BrandProblem {
  const path = formatPath(keys);
  if (message === MISSING_KEY_MESSAGE) {
    return { path, message: 'This field is required.', fix: fixFor(keys) };
  }

  if (message === EXCESS_PROPERTY_MESSAGE) {
    return misplacedFieldProblem(keys) ?? unknownFieldProblem(keys, input);
  }

  return {
    path,
    message: `${message}, got ${describeValue(valueAt(input, keys))}.`,
    fix: fixFor(keys),
  };
}

/**
 * The problem for a diagram field written on a surface that only the brand-wide `diagram` section
 * takes: the look keys (`edges`, `groups`, `labels`, `kinds`) and a card's non-color fields. A
 * close field name would be the wrong fix, so this wins over the unknown-field suggestion.
 *
 * @param keys - The path to the unknown field.
 * @returns The problem, or `undefined` for any other unknown field.
 */
function misplacedFieldProblem(keys: readonly PropertyKey[]): BrandProblem | undefined {
  const [color, surfaces, surface, diagram, field, card] = keys.map(String);
  const cardField = keys
    .slice(SURFACE_CARD_FIELD_DEPTH - 1)
    .map(String)
    .join('.');
  if (color !== 'color' || surfaces !== 'surfaces' || diagram !== 'diagram') {
    return undefined;
  }

  const path = formatPath(keys);
  if (keys.length === SURFACE_DIAGRAM_FIELD_DEPTH && SURFACE_LOOK_KEYS.has(field ?? '')) {
    return {
      path,
      message: `\`${field}\` sets the diagram look on every surface, so a surface cannot set it.`,
      fix: `Move it to the brand's top-level \`diagram.${field}\`.`,
    };
  }

  if (keys.length >= SURFACE_CARD_FIELD_DEPTH && field === 'cards') {
    return {
      path,
      message:
        `A surface changes only a card's colors, and \`${cardField}\` is not one; the ` +
        `${surface} surface cannot set it.`,
      fix:
        `Set it on the card itself, \`diagram.cards.${card}.${cardField}\`, or recolor the ` +
        'card here with fill, border, text, subtext, icon { color, fill } or accent { color }.',
    };
  }

  return undefined;
}

/**
 * The problem for a field the schema does not define: the closest known field, or when none is
 * close, the fields that exist at that place.
 *
 * @param keys - The path to the unknown field.
 * @param input - The whole brand, to follow unions by their `type` or `kind`.
 */
function unknownFieldProblem(keys: readonly PropertyKey[], input: unknown): BrandProblem {
  const parent = keys.slice(0, -1);
  const name = String(keys.at(-1));
  const node = nodeAt(Brand.ast, parent, input);
  const known = fieldNames(node);
  const where = parent.length === 0 ? 'a brand' : formatPath(parent);
  if (known.length === 0) {
    return badKeyProblem({ keys, name, where, rule: keyRule(node) });
  }

  const closest = suggest(name, known);
  const fix =
    closest === undefined
      ? `Remove it. Fields of ${where}: ${known.join(', ')}.`
      : `Rename it to "${closest}".`;
  return { path: formatPath(keys), message: `"${name}" is not a field of ${where}.`, fix };
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

/**
 * A key that a map of names (palette steps, surface names) does not accept.
 */
type BadKey = {
  /**
   * The path to the key.
   */
  keys: readonly PropertyKey[];

  /**
   * The key as written.
   */
  name: string;

  /**
   * The map's path as messages show it.
   */
  where: string;

  /**
   * What the map's keys must look like, from the schema, if it says.
   */
  rule: string | undefined;
};

/**
 * The problem for a key a map of names rejects, such as an uppercase palette step: it says what the
 * keys must look like instead of listing fields, since a map has none.
 */
function badKeyProblem(key: BadKey): BrandProblem {
  const rule = key.rule === undefined ? 'Use a name the schema accepts' : key.rule;
  return {
    path: formatPath(key.keys),
    message: `"${key.name}" is not a valid name in ${key.where}.`,
    fix: `Rename it. ${rule}.`,
  };
}

/**
 * The schema node at a path, following unions by the value's `type` or `kind`.
 *
 * @param root - The brand schema.
 * @param keys - The path to follow.
 * @param input - The whole brand, to pick union members.
 * @returns The node, or `undefined` when the path leaves the schema.
 */
function nodeAt(
  root: SchemaAST.AST,
  keys: readonly PropertyKey[],
  input: unknown,
): SchemaAST.AST | undefined {
  let node: SchemaAST.AST | undefined = root;
  let value = input;
  for (const key of keys) {
    node = node === undefined ? undefined : childAt(unwrap(node, value), key);
    value = valueAt(value, [key]);
  }

  return node === undefined ? undefined : unwrap(node, value);
}

/**
 * The field names an object schema accepts; none for anything else, or for a map of names.
 *
 * @param node - A schema node from {@link nodeAt}.
 */
function fieldNames(node: SchemaAST.AST | undefined): string[] {
  if (node?._tag !== 'Objects') {
    return [];
  }

  return node.propertySignatures.map((property) => String(property.name));
}

/**
 * What a map's keys must look like: the message of the first check on its key schema, such as
 * "Expected a palette step such as "50", "500" or "base"".
 *
 * @param node - A schema node from {@link nodeAt}.
 */
function keyRule(node: SchemaAST.AST | undefined): string | undefined {
  if (node?._tag !== 'Objects') {
    return undefined;
  }

  const message = node.indexSignatures[0]?.parameter.checks?.[0]?.annotations?.message;
  return typeof message === 'string' ? message : undefined;
}

/**
 * The schema of a field or list item, or `undefined` when the node has none for that key.
 *
 * @param node - An object or list schema.
 * @param key - A field name or a list index.
 */
function childAt(node: SchemaAST.AST, key: PropertyKey): SchemaAST.AST | undefined {
  if (node._tag === 'Objects') {
    const property = node.propertySignatures.find((candidate) => candidate.name === key);
    return property?.type ?? node.indexSignatures[0]?.type;
  }

  if (node._tag === 'Arrays') {
    return (typeof key === 'number' ? node.elements[key] : undefined) ?? node.rest[0];
  }

  return undefined;
}

/**
 * Resolves lazy schemas and picks the union member whose literal fields match the value.
 */
function unwrap(node: SchemaAST.AST, value: unknown): SchemaAST.AST {
  if (node._tag === 'Suspend') {
    return unwrap(node.thunk(), value);
  }

  if (node._tag !== 'Union') {
    return node;
  }

  const members = node.types.map((member) => unwrap(member, value));
  return members.find((member) => matchesLiterals(member, value)) ?? members[0] ?? node;
}

/**
 * Whether every literal field of an object schema, such as `kind: "fontsource"`, equals the value's
 * field of the same name.
 *
 * @param node - A union member.
 * @param value - The value being decoded.
 */
function matchesLiterals(node: SchemaAST.AST, value: unknown): boolean {
  if (node._tag !== 'Objects' || typeof value !== 'object' || value === null) {
    return false;
  }

  return node.propertySignatures.every((property) => {
    const type = property.type;
    return type._tag !== 'Literal' || Reflect.get(value, property.name) === type.literal;
  });
}
