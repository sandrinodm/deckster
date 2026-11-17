/**
 * The components a page really renders, read from its MDX with the parser Astro compiles it with
 * (satteri), so a tag in a code span, a fenced block or an `{/* … *\/}` comment is text and never
 * counts. Used by scripts/check-coverage.mjs (reference coverage), scripts/sync.mjs (the UI shots
 * the pages need) and markdown.ts (props the Markdown twins can read).
 *
 * Plain TypeScript with erasable syntax only, so Node runs it without a build step.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
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

/** The JSX elements of one MDX source, in document order. */
export function componentUsesIn(source: string, page: string): ComponentUse[] {
  const uses: ComponentUse[] = [];
  const walk = (node: Node) => {
    if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name) {
      const attributes = new Map<string, WrittenAttribute>();
      const spreads: string[] = [];
      for (const attribute of node.attributes ?? []) {
        if (attribute.type !== "mdxJsxAttribute" || !attribute.name) {
          spreads.push(String((attribute.value as string | undefined) ?? ""));
          continue;
        }
        const value = attribute.value;
        attributes.set(
          attribute.name,
          value === null || value === undefined
            ? { kind: "flag" }
            : typeof value === "string"
              ? { kind: "string", value }
              : { kind: "expression", source: String((value as { value?: unknown }).value ?? "").trim() },
        );
      }
      uses.push({ page, line: node.position?.start?.line, name: node.name, attributes, spreads });
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(mdxToMdast(source) as unknown as Node);
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
 * The value of a literal expression: a string (`{"BarChart"}`, `{'x'}`, a template without `${}`),
 * a number (`{0}`, `{-1.5}`) or `{true}`/`{false}`. `undefined` for anything else, such as a
 * variable, a call, an array or an object.
 */
export function literalValue(source: string): Literal | undefined {
  const s = source.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if (s === "true" || s === "false") return s === "true";
  if (/^"(?:[^"\\\n]|\\.)*"$/.test(s)) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return undefined;
    }
  }
  const single = /^'((?:[^'\\\n]|\\.)*)'$/.exec(s);
  if (single) return single[1]!.replace(/\\(.)/g, "$1");
  const template = /^`([^`$\\]*)`$/.exec(s);
  if (template) return template[1]!;
  return undefined;
}

/** Where a tag is, for a message: `write-slides/media.mdx:14`. */
export function where(use: ComponentUse): string {
  return `${use.page}${use.line === undefined ? "" : `:${use.line}`}`;
}
