/**
 * Formatting shared by the Astro components and the Markdown twins (markdown.ts), so a page and
 * its .md say the same thing. Plain functions over the generated JSON, no Astro imports.
 */

type Budget = Record<string, number> | undefined;
type Field = { required: boolean; default: unknown; allowed: unknown[] | null };

const BUDGET_UNITS: Record<string, string> = {
  maxWords: "words",
  maxBullets: "bullets",
  maxLines: "lines",
  maxChars: "characters",
};

/** `{ maxWords: 24, maxBullets: 3 }` as "24 words, 3 bullets". */
export function budgetText(budget: Budget): string {
  if (!budget) return "";
  return Object.entries(budget)
    .map(([key, value]) => `${value} ${BUDGET_UNITS[key] ?? key}`)
    .join(", ");
}

/**
 * A variant's limits: its slot budgets, then its per-item field limits with the field path in a
 * code span, as "body: 30 words, 3 bullets; `title`: 40 characters".
 */
export function variantLimits(variant: { budget?: Record<string, Budget>; fields?: Record<string, Budget> }): string {
  const slots = Object.entries(variant.budget ?? {}).map(([slot, b]) => `${slot}: ${budgetText(b)}`);
  const fields = Object.entries(variant.fields ?? {}).map(([path, f]) => `\`${path}\`: ${budgetText(f)}`);
  return [...slots, ...fields].join("; ");
}

function show(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** A field's values as HTML: the allowed values with the default marked, or the default alone. */
export function describeField(field: Field): string {
  const code = (v: unknown) => `<code>${escapeHtml(show(v))}</code>`;
  const hasDefault = field.default !== null && field.default !== undefined;
  if (field.allowed && field.allowed.length > 0) {
    return field.allowed
      .map((v) => (hasDefault && v === field.default ? `${code(v)} <span class="dk-muted">(default)</span>` : code(v)))
      .join(" ");
  }
  return hasDefault ? `default ${code(field.default)}` : '<span class="dk-muted">text</span>';
}

/** The same as plain Markdown. */
export function describeFieldMd(field: Field): string {
  const code = (v: unknown) => `\`${show(v)}\``;
  const hasDefault = field.default !== null && field.default !== undefined;
  if (field.allowed && field.allowed.length > 0) {
    return field.allowed.map((v) => (hasDefault && v === field.default ? `${code(v)} (default)` : code(v))).join(", ");
  }
  return hasDefault ? `default ${code(field.default)}` : "text";
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}

/** The first sentence of a catalog text, for one-line lists. */
export function firstSentence(text: string | undefined): string {
  if (!text) return "";
  const match = /^(.+?[.!?])(\s|$)/s.exec(text);
  return (match ? match[1] : text).trim();
}

/** A layout's own page, which LayoutIndex and its Markdown twin link to (without the base path). */
export const layoutPage = (name: string) => `/reference/layouts/${name}/`;

/**
 * A layout's one-line summary: the first sentence of its catalog description, cut before the
 * first colon that ends a word outside a code span ("The cover of a deck: the deck title…" gives
 * "The cover of a deck."). LayoutIndex, its Markdown twin and the frontmatter `description` of
 * each layout page (src/content/docs/reference/layouts/<name>.mdx) use it.
 */
export function layoutSummary(description: string | undefined): string {
  const sentence = firstSentence(description);
  let inCode = false;
  for (let i = 0; i < sentence.length; i++) {
    if (sentence[i] === "`") inCode = !inCode;
    else if (!inCode && sentence[i] === ":" && /\s/.test(sentence[i + 1] ?? "")) {
      return `${sentence.slice(0, i).trimEnd()}.`;
    }
  }
  return sentence;
}

// ---------------------------------------------------------------- catalog examples

/** Past this many characters a line of a catalog example is split, one prop per line. */
const EXAMPLE_WIDTH = 80;

/**
 * Reads the JSX tag that starts at `start` (`<Name …>` or `<Name … />`): its name, its attributes
 * as written (`x="region"`, `data={rows}`, `sort`) and the index after it. Undefined when the text
 * there is not a tag this simple reader understands; the line is then left as it is.
 */
function readTag(line: string, start: number): { name: string; attrs: string[]; selfClosing: boolean; end: number } | undefined {
  const head = /^<([A-Za-z][\w.]*)/.exec(line.slice(start));
  if (!head) return undefined;
  const attrs: string[] = [];
  let i = start + head[0].length;
  while (i < line.length) {
    while (line[i] === " ") i++;
    if (line.startsWith("/>", i)) return { name: head[1]!, attrs, selfClosing: true, end: i + 2 };
    if (line[i] === ">") return { name: head[1]!, attrs, selfClosing: false, end: i + 1 };
    const name = /^[A-Za-z_][\w:-]*/.exec(line.slice(i));
    if (!name) return undefined;
    let j = i + name[0].length;
    if (line[j] === "=") {
      j++;
      const open = line[j];
      if (open === '"' || open === "'") {
        const close = line.indexOf(open, j + 1);
        if (close < 0) return undefined;
        j = close + 1;
      } else if (open === "{") {
        let depth = 0;
        let quote: string | undefined;
        for (; j < line.length; j++) {
          const ch = line[j];
          if (quote) {
            if (ch === quote) quote = undefined;
          } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
          else if (ch === "{") depth++;
          else if (ch === "}" && --depth === 0) break;
        }
        if (depth !== 0) return undefined;
        j++;
      } else return undefined;
    }
    attrs.push(line.slice(i, j));
    i = j;
  }
  return undefined;
}

/** Splits a string at the commas that are not inside brackets, braces or quotes. */
function topLevelItems(text: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote) quote = undefined;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if ("[{(".includes(ch)) depth++;
    else if ("]})".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      items.push(text.slice(from, i).trim());
      from = i + 1;
    }
  }
  items.push(text.slice(from).trim());
  return items.filter(Boolean);
}

/**
 * One attribute on its own line; a long array of objects (`stats={[{ … }, { … }]}`) also puts each
 * item on a line of its own.
 */
function splitArray(attr: string, indent: string): string[] {
  const array = /^([\w:-]+)=\{\[(.*)\]\}$/s.exec(attr);
  if (indent.length + attr.length <= EXAMPLE_WIDTH || !array) return [`${indent}${attr}`];
  const items = topLevelItems(array[2]!);
  if (items.length < 2) return [`${indent}${attr}`];
  return [`${indent}${array[1]}={[`, ...items.map((item) => `${indent}  ${item},`), `${indent}]}`];
}

/**
 * A catalog example as a reader would write it: a tag longer than EXAMPLE_WIDTH is split one prop
 * per line, and text before the tag on the same line gets a line of its own. The catalogs write
 * each example tag on one line, up to 160 characters, which scrolled sideways in the column.
 */
export function prettyExample(code: string): string {
  return code
    .trimEnd()
    .split("\n")
    .flatMap((line) => {
      if (line.length <= EXAMPLE_WIDTH) return [line];
      const start = line.indexOf("<");
      if (start < 0) return [line];
      const tag = readTag(line, start);
      if (!tag || tag.attrs.length === 0) return [line];
      const prefix = line.slice(0, start);
      const indent = /^\s*/.exec(prefix)![0];
      const before = prefix.trim() ? [prefix.trimEnd()] : [];
      const rest = line.slice(tag.end);
      const opened = [`${indent}<${tag.name}`, ...tag.attrs.flatMap((a) => splitArray(a, `${indent}  `))];
      if (tag.selfClosing) return [...before, ...opened, `${indent}/>${rest}`];
      // `<Milestone …>Orders live</Milestone>`: the children go on their own line.
      const closing = `</${tag.name}>`;
      const children = rest.endsWith(closing) ? rest.slice(0, -closing.length) : undefined;
      if (children === undefined) return [...before, ...opened, `${indent}>${rest}`];
      return [...before, ...opened, `${indent}>`, ...(children.trim() ? [`${indent}  ${children.trim()}`] : []), `${indent}${closing}`];
    })
    .join("\n");
}

// ---------------------------------------------------------------- JSON Schema tables

/**
 * One row of a JSON Schema as a table: a dotted path (`color.roles.bg`), its type in TypeScript-
 * like notation with its limits, and whether its parent requires it.
 *
 * Paths: `<name>` stands for any key of a record (`color.surfaces.<name>.bg`) and for one of
 * several sibling keys that share a schema (`typography.scale.<name>.size`, with the names in the
 * parent row's `names`); `[]` for an array item; `[type=image]` for one object of a union, picked
 * by the field whose value tells them apart.
 */
export type SchemaRow = {
  path: string;
  /** The path up to the last segment, and the last segment, for display. */
  parent: string;
  key: string;
  type: string;
  required: boolean;
  /** For a row that stands for several sibling keys with the same schema: their names. */
  names?: string[];
  description?: string;
  default?: unknown;
};

type Schema = Record<string, unknown>;

/**
 * The keywords the tables render. A schema with any other keyword throws, so a generator change
 * on deckster's main (a `pattern`, a `$ref`) fails the build instead of dropping a constraint.
 */
const SCHEMA_KEYWORDS = new Set([
  "$schema",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "propertyNames",
  "anyOf",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "description",
  "default",
  "title",
]);

export class SchemaShapeError extends Error {
  override name = "SchemaShapeError";
}

function checkKeywords(schema: Schema, path: string): void {
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_KEYWORDS.has(key)) {
      throw new SchemaShapeError(
        `has the JSON Schema keyword "${key}" at ${path || "the root"}, which the schema tables don't render. ` +
          "Teach flattenSchema in src/components/deck/format.ts about it.",
      );
    }
  }
}

const isObject = (s: Schema) => s.type === "object";
const props = (s: Schema) => (s.properties ?? {}) as Record<string, Schema>;
const record = (s: Schema): Schema | undefined =>
  isObject(s) && !s.properties && typeof s.additionalProperties === "object" ? (s.additionalProperties as Schema) : undefined;

/** The field that tells the object variants of a union apart: required, one literal value in each. */
function discriminant(variants: Schema[]): string | undefined {
  const first = variants[0];
  if (!first) return undefined;
  return Object.keys(props(first)).find((key) =>
    variants.every((v) => {
      const p = props(v)[key];
      return (v.required as string[] | undefined)?.includes(key) && Array.isArray(p?.enum) && p.enum.length === 1;
    }),
  );
}

function limits(schema: Schema, unit: string): string[] {
  const out: string[] = [];
  const min = schema.minimum ?? schema.minLength ?? schema.minItems;
  const max = schema.maximum ?? schema.maxLength ?? schema.maxItems;
  if (schema.exclusiveMinimum !== undefined) out.push(`> ${schema.exclusiveMinimum}`);
  if (schema.exclusiveMaximum !== undefined) out.push(`< ${schema.exclusiveMaximum}`);
  if (unit === "" && min !== undefined && max !== undefined) out.push(`${min} to ${max}`);
  else {
    if (min !== undefined) out.push(unit === "characters" && min === 1 ? "non-empty" : `at least ${min}${unit ? ` ${unit}` : ""}`);
    if (max !== undefined) out.push(`at most ${max}${unit ? ` ${unit}` : ""}`);
  }
  if (typeof schema.pattern === "string") out.push(`matches /${schema.pattern}/`);
  return out;
}

const withLimits = (type: string, l: string[]) => (l.length > 0 ? `${type} (${l.join(", ")})` : type);

/** A schema's type as one line: `"cover" | "contain"`, `number (0 to 100)`, `string[] (at least 1 items)`. */
export function schemaType(schema: Schema): string {
  if (Array.isArray(schema.enum)) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (Array.isArray(schema.anyOf)) {
    const variants = schema.anyOf as Schema[];
    const objects = variants.filter(isObject);
    const key = objects.length > 1 ? discriminant(objects) : undefined;
    return variants
      .map((v) => (key && isObject(v) ? `object (${key} ${JSON.stringify((props(v)[key]!.enum as unknown[])[0])})` : schemaType(v)))
      .join(" | ");
  }
  switch (schema.type) {
    case "string":
      return withLimits("string", limits(schema, "characters"));
    case "number":
    case "integer":
      return withLimits(String(schema.type), limits(schema, ""));
    case "boolean":
      return "boolean";
    case "array": {
      const tuple = tupleType(schema);
      if (tuple !== undefined) return tuple;
      const items = (schema.items ?? {}) as Schema;
      const inner = schemaType(items);
      const count =
        schema.minItems !== undefined && schema.minItems === schema.maxItems
          ? [`exactly ${schema.minItems}`]
          : limits({ minItems: schema.minItems, maxItems: schema.maxItems }, "items").map((l) =>
              l === "at least 1 items" ? "at least 1" : l,
            );
      return withLimits(`${/[ |]/.test(inner) ? `(${inner})` : inner}[]`, count);
    }
    case "object": {
      const value = record(schema);
      if (value) {
        const names = schema.propertyNames as Schema | undefined;
        const keyType = names && Array.isArray(names.enum) ? schemaType(names) : "string";
        return `Record<${keyType}, ${isObject(value) && !record(value) ? "object" : schemaType(value)}>`;
      }
      return "object";
    }
    default:
      return schema.type === undefined ? "any" : String(schema.type);
  }
}

/**
 * An array whose positions have schemas of their own (`prefixItems`) as a tuple, each position with
 * its own constraints: `[number (0 to 1), number (-5 to 5), ...]`. A position past `minItems` is
 * optional (`?`), and further items after the positions read `...T[]`. `undefined` when the array
 * has no `prefixItems`, or when every position repeats `items` (`[string, ...string[]]` with at
 * least 1 item reads better as `string[] (at least 1)`).
 */
function tupleType(schema: Schema): string | undefined {
  const positions = schema.prefixItems as Schema[] | undefined;
  if (!Array.isArray(positions) || positions.length === 0) return undefined;
  const rest = schema.items as Schema | false | undefined;
  if (rest && typeof rest === "object" && positions.every((p) => JSON.stringify(p) === JSON.stringify(rest))) return undefined;
  const min = typeof schema.minItems === "number" ? schema.minItems : 0;
  const parts = positions.map((p, i) => `${schemaType(p)}${i >= min ? "?" : ""}`);
  // Without `items: false` or a `maxItems` at the number of positions, more items may follow.
  const closed = rest === false || (typeof schema.maxItems === "number" && schema.maxItems <= positions.length);
  if (!closed) {
    const tail = rest && typeof rest === "object" ? schemaType(rest) : "any";
    parts.push(`...${/[ |]/.test(tail) ? `(${tail})` : tail}[]`);
  }
  return `[${parts.join(", ")}]`;
}

/** Whether a schema gets rows of its own below its row: an object, or a list, map or union of them. */
function hasChildren(schema: Schema): boolean {
  if (Array.isArray(schema.anyOf)) return (schema.anyOf as Schema[]).some(hasChildren);
  if (schema.type === "array") return hasChildren((schema.items ?? {}) as Schema);
  const value = record(schema);
  if (value) return hasChildren(value);
  return isObject(schema) && schema.properties !== undefined;
}

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

function row(path: string, key: string, schema: Schema, required: boolean, names?: string[]): SchemaRow {
  return {
    path: join(path, key),
    parent: path ? `${path}.` : "",
    key,
    type: schemaType(schema),
    required,
    ...(names ? { names } : {}),
    ...(typeof schema.description === "string" ? { description: schema.description } : {}),
    ...(schema.default !== undefined ? { default: schema.default } : {}),
  };
}

/** The rows below one schema, which has already had its own row. */
function children(schema: Schema, path: string, rows: SchemaRow[]): void {
  checkKeywords(schema, path);
  for (const s of [schema.items, schema.additionalProperties, schema.propertyNames, ...((schema.prefixItems as unknown[]) ?? [])]) {
    if (s && typeof s === "object") checkKeywords(s as Schema, path);
  }
  if (Array.isArray(schema.anyOf)) {
    const variants = schema.anyOf as Schema[];
    const objects = variants.filter(isObject);
    const key = objects.length > 1 ? discriminant(objects) : undefined;
    for (const v of variants) {
      checkKeywords(v, path);
      if (!isObject(v)) {
        if (v.type === "array" || Array.isArray(v.anyOf)) children(v, path, rows);
        continue;
      }
      // An item of an array union reads `background[type=image]`, not `background[][type=image]`.
      const tag = key ? `[${key}=${(props(v)[key]!.enum as unknown[])[0]}]` : "";
      children(v, tag && path.endsWith("[]") ? `${path.slice(0, -2)}${tag}` : `${path}${tag}`, rows);
    }
    return;
  }
  if (schema.type === "array") {
    // A tuple's positions are described in its type; one with fields of its own would need rows.
    if (((schema.prefixItems as Schema[] | undefined) ?? []).some(hasChildren)) {
      throw new SchemaShapeError(
        `has a tuple position with fields of its own at ${path}, which the schema tables don't render. ` +
          "Teach flattenSchema in src/components/deck/format.ts about it.",
      );
    }
    const items = (schema.items ?? {}) as Schema;
    children(items, `${path}[]`, rows);
    return;
  }
  const value = record(schema);
  if (value) {
    children(value, `${path}.<name>`, rows);
    return;
  }
  if (!isObject(schema) || !schema.properties) return;

  const required = new Set((schema.required as string[] | undefined) ?? []);
  const entries = Object.entries(props(schema));
  const done = new Set<string>();
  for (const [key, child] of entries) {
    if (done.has(key)) continue;
    // Siblings with the same schema and fields of their own (the three type families, the eleven
    // type steps, the three shadows) become one row and one set of children under <name>.
    const same = hasChildren(child)
      ? entries.filter(([k, c]) => !done.has(k) && JSON.stringify(c) === JSON.stringify(child)).map(([k]) => k)
      : [key];
    for (const k of same) done.add(k);
    if (same.length > 1) {
      rows.push(row(path, "<name>", child, same.every((k) => required.has(k)), same));
      children(child, join(path, "<name>"), rows);
    } else {
      rows.push(row(path, key, child, required.has(key)));
      children(child, join(path, key), rows);
    }
  }
}

/**
 * Every field of a JSON Schema as rows, depth first in the schema's order.
 *
 * @throws SchemaShapeError when the schema uses a keyword the tables don't render.
 */
export function flattenSchema(schema: Schema): SchemaRow[] {
  const rows: SchemaRow[] = [];
  children(schema, "", rows);
  return rows;
}

/** The top-level fields of a schema, for the `section` prop. */
export function schemaSections(schema: Schema): string[] {
  return Object.keys(props(schema));
}

/** The rows of one top-level section (its own row first), or all rows. */
export function sectionRows(rows: SchemaRow[], section: string | undefined): SchemaRow[] {
  if (section === undefined) return rows;
  return rows.filter((r) => r.path === section || r.path.startsWith(`${section}.`) || r.path.startsWith(`${section}[`));
}
