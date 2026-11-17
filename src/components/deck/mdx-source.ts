/**
 * The components a page really renders, read from its MDX with the parser Astro compiles it with
 * (satteri), so a tag in a code span, a fenced block or an `{/* … *\/}` comment is text and never
 * counts. Used by scripts/check-coverage.mjs (reference coverage), scripts/sync.mjs (the UI shots
 * the pages need) and markdown.ts (props the Markdown twins can read).
 *
 * A component inside an expression (`{cond && <PropsTable … />}`, `icon={<UiShot … />}`, a spread,
 * or an `export const x = <UiShot … />`) is not walked: it fails with an error naming the page and
 * line, so the three consumers can never disagree about what a page renders.
 *
 * Plain TypeScript with erasable syntax only, so Node runs it without a build step.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse, parseExpression } from "@babel/parser";
import { mdxToMdast } from "satteri";

/** One attribute as written: a string (`deck="hello"`), an expression (`step={0}`) or a bare flag. */
export type WrittenAttribute =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "expression"; readonly source: string }
  | { readonly kind: "flag" }
  | { readonly kind: "spread"; readonly source: string };

/** One component tag on a page. */
export type ComponentUse = {
  /** The page, relative to src/content/docs, with `/`. */
  readonly page: string;
  readonly line: number | undefined;
  readonly name: string;
  readonly attributes: ReadonlyMap<string, WrittenAttribute>;
  readonly spreads: readonly string[];
};

/** The folder of the pages. */
export const DOCS_DIR = path.resolve(import.meta.dirname, "../../content/docs");

type Node = {
  type: string;
  name?: string | null;
  attributes?: { type: string; name?: string; value?: unknown }[];
  value?: unknown;
  children?: Node[];
  position?: { start?: { line?: number } };
};

/** Every `.md` and `.mdx` file under a folder, as absolute paths in a stable order. */
export function pageFiles(dir: string = DOCS_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return pageFiles(full);
      return /\.mdx?$/.test(entry.name) ? [full] : [];
    });
}

/** A page writes a component where the source can't be read; the message names the page and line. */
export class MdxSourceError extends Error {}

/** A JSX element name that is a component (`PropsTable`, `Foo.Bar`), not an HTML element. */
const isComponentName = (name: string): boolean => /^[A-Z]/.test(name) || name.includes(".");

/** The name of a Babel JSX element name node: `PropsTable`, `Foo.Bar`, `svg:path`. */
function jsxName(node: any): string {
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXMemberExpression") return `${jsxName(node.object)}.${jsxName(node.property)}`;
  if (node.type === "JSXNamespacedName") return `${node.namespace.name}:${node.name.name}`;
  return "?";
}

/**
 * The components inside one piece of JavaScript from the page (an expression, a spread or an ESM
 * block), with their 1-based line within that source. Throws when the source doesn't parse.
 */
function componentsInCode(code: string, as: "expression" | "spread" | "esm"): { name: string; line: number }[] {
  const plugins: ["jsx"] = ["jsx"];
  let ast: unknown;
  if (as === "esm") {
    ast = parse(code, { sourceType: "module", plugins });
  } else if (as === "spread") {
    // `...{a: 1}` as written; inside an object literal it parses as a spread on the same line.
    ast = parseExpression(`({${code}})`, { plugins });
  } else {
    try {
      ast = parseExpression(code, { plugins });
    } catch {
      // An expression holding only a comment (`{/* … */}`) has no expression to parse.
      ast = parse(code, { sourceType: "module", plugins });
    }
  }
  const found: { name: string; line: number }[] = [];
  const visit = (node: any) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node === null || typeof node !== "object") return;
    if (node.type === "JSXElement") {
      const name = jsxName(node.openingElement.name);
      if (isComponentName(name)) found.push({ name, line: node.loc?.start.line ?? 1 });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== "loc" && key !== "start" && key !== "end" && key !== "extra" && key !== "comments") visit(value);
    }
  };
  visit(ast);
  return found;
}

/** The JSX elements of one MDX source, in document order. */
export function componentUsesIn(source: string, page: string): ComponentUse[] {
  const uses: ComponentUse[] = [];
  const hidden: string[] = [];
  const checkCode = (code: string, as: "expression" | "spread" | "esm", line: number | undefined, what: string) => {
    let components: { name: string; line: number }[];
    try {
      components = componentsInCode(code, as);
    } catch (error) {
      hidden.push(`${page}:${line ?? "?"}: ${what} doesn't parse as JavaScript (${(error as Error).message})`);
      return;
    }
    for (const component of components) {
      const at = line === undefined ? "?" : line + component.line - 1;
      hidden.push(`${page}:${at}: <${component.name}> inside ${what}`);
    }
  };
  const walk = (node: Node) => {
    const line = node.position?.start?.line;
    if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
      checkCode(String(node.value ?? ""), "expression", line, "an expression");
    } else if (node.type === "mdxjsEsm") {
      checkCode(String(node.value ?? ""), "esm", line, "an import or export");
    }
    if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name) {
      const attributes = new Map<string, WrittenAttribute>();
      const spreads: string[] = [];
      for (const attribute of node.attributes ?? []) {
        if (attribute.type !== "mdxJsxAttribute" || !attribute.name) {
          const spread = String((attribute.value as string | undefined) ?? "");
          checkCode(spread, "spread", line, `a spread on <${node.name}>`);
          spreads.push(spread);
          continue;
        }
        const value = attribute.value;
        if (value === null || value === undefined) {
          attributes.set(attribute.name, { kind: "flag" });
        } else if (typeof value === "string") {
          attributes.set(attribute.name, { kind: "string", value });
        } else {
          const source = String((value as { value?: unknown }).value ?? "").trim();
          checkCode(source, "expression", line, `the ${attribute.name} expression of <${node.name}>`);
          attributes.set(attribute.name, { kind: "expression", source });
        }
      }
      uses.push({ page, line, name: node.name, attributes, spreads });
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(mdxToMdast(source) as unknown as Node);
  if (hidden.length > 0) {
    throw new MdxSourceError(
      `Components inside JavaScript on a page (src/components/deck/mdx-source.ts):\n  ${hidden.join("\n  ")}\n` +
        "Write each component as a tag of its own, outside any {expression}, prop value, spread or export: " +
        "the reference coverage, the sync's list of UI shots and the prop checks read only those.",
    );
  }
  return uses;
}

/** The JSX elements of every page under a folder. */
export function componentUses(dir: string = DOCS_DIR): ComponentUse[] {
  return pageFiles(dir).flatMap((file) =>
    componentUsesIn(readFileSync(file, "utf8"), path.relative(dir, file).split(path.sep).join("/")),
  );
}

/** A literal the deck components accept as an expression prop. */
export type Literal = string | number | boolean;

/**
 * The value of a literal expression, read with a JavaScript parser: a string (`{"BarChart"}`,
 * `{'Bar\u0043hart'}`, a template without `${}`), with its escapes decoded; a number (`{0}`,
 * `{-1.5}`, `{0x10}`); or `{true}`/`{false}`. `undefined` for anything else, such as a variable, a
 * call, a concatenation, an array, an object, `null` or source that doesn't parse.
 */
export function literalValue(source: string): Literal | undefined {
  let node: any;
  try {
    node = parseExpression(source);
  } catch {
    return undefined;
  }
  switch (node.type) {
    case "StringLiteral":
    case "NumericLiteral":
    case "BooleanLiteral":
      return node.value;
    case "UnaryExpression":
      return node.operator === "-" && node.argument.type === "NumericLiteral" ? -node.argument.value : undefined;
    case "TemplateLiteral": {
      const cooked = node.expressions.length === 0 ? node.quasis[0]?.value.cooked : undefined;
      return typeof cooked === "string" ? cooked : undefined;
    }
    default:
      return undefined;
  }
}

/** Where a tag is, for a message: `write-slides/media.mdx:14`. */
export function where(use: ComponentUse): string {
  return `${use.page}${use.line === undefined ? "" : `:${use.line}`}`;
}
