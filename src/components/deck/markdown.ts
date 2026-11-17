/**
 * The Markdown twins of the deck components, for /<page>/index.md, llms-full.txt and the per-
 * section llms.txt. Nimbus calls these at build time through `markdown.componentMap` in
 * astro.config.ts; without them a self-closing custom component is dropped from the Markdown.
 *
 * They run in Node outside Vite, so they read src/data with fs (not import.meta.glob) and know
 * no optimised image URLs: stills become their alt text and a link to the slide in the built deck.
 * Nimbus hands each renderer the MDX attributes as strings: a string as written, an expression as
 * its source (`step={0}` arrives as "0", `of={"BarChart"}` as "\"BarChart\""), and nothing says
 * which was which. So each tag is looked up among the tags read from the pages (mdx-source.ts),
 * which know how every attribute was written, and only its expression attributes are decoded
 * (writtenAttrs). The build fails on a deck component prop the Markdown can't read
 * (checkWrittenProps).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { budgetText, describeFieldMd, flattenSchema, layoutPage, layoutSummary, prettyExample, sectionRows, type SchemaRow } from "./format";
import { componentUses, literalValue, where, type ComponentUse, type WrittenAttribute } from "./mdx-source";
import { describeRows, type SchemaOf } from "./schema-descriptions";

type Attrs = Record<string, string | boolean>;
type Context = { name: string; attrs: Attrs; children: string; base: string };
type Transform = { revision: string; render: (context: Context) => string };

const DATA_DIR = path.resolve(import.meta.dirname, "../../data");
const cache = new Map<string, any>();

function data(name: string): any {
  if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(path.join(DATA_DIR, `${name}.json`), "utf8")));
  return cache.get(name);
}

/** A hash of src/data, so Nimbus regenerates the Markdown when the data changes. */
function revision(): string {
  const hash = createHash("sha256").update("deck-components-md-6");
  try {
    for (const file of readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).sort()) {
      hash.update(file).update(readFileSync(path.join(DATA_DIR, file)));
    }
  } catch {
    // No data yet: the page build fails with the real message.
  }
  return hash.digest("hex").slice(0, 16);
}

const str = (v: string | boolean | undefined) => (typeof v === "string" ? v : undefined);
const root = (base: string) => base.replace(/\/+$/, "");

function deckLink(base: string, deck: string, slide?: string, step?: string): string {
  const hash = slide ? `#/${slide}${step !== undefined ? `/${step}` : ""}` : "";
  return `${root(base)}/decks/${deck}/${hash}`;
}

function slideOf(deck: string | undefined, slide: string | undefined): { deck: any; slide: any } | undefined {
  const d = data("slides").decks.find((x: any) => x.name === deck);
  const s = d?.slides.find((x: any) => x.id === slide);
  return d && s ? { deck: d, slide: s } : undefined;
}

/**
 * Catalog prose as Markdown text. Outside code spans, a component tag (`<CodeMove>`, `<img>`) is
 * put in a code span, so a renderer doesn't read it as HTML and drop it, and a `*` is escaped, so
 * `*stars*` stays text instead of emphasis.
 */
function md(text: unknown): string {
  return String(text ?? "")
    .split(/(`[^`]*`)/)
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(/<\/?[A-Za-z][\w.]*(?:\s[^<>`]*)?\/?>/g, (tag) => `\`${tag}\``).replace(/\*/g, "\\*"),
    )
    .join("");
}

/** A table cell: one line, no pipes, catalog prose made safe (md). */
const cell = (text: unknown) =>
  md(text)
    .replace(/\s*\n\s*/g, " ")
    .replace(/\|/g, "\\|");

function fence(code: string, lang: string): string {
  const ticks = code.includes("```") ? "````" : "```";
  return `${ticks}${lang}\n${code.trimEnd()}\n${ticks}`;
}

function table(head: string[], rows: unknown[][]): string {
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

const literal = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));

// ---------------------------------------------------------------- renderers

function deckEmbed({ attrs, base }: Context): string {
  const deck = str(attrs.deck);
  const slide = str(attrs.slide);
  const found = slideOf(deck, slide);
  const title = found ? `"${found.slide.title}", slide ${found.slide.number} of the ${deck} deck` : `${deck} / ${slide}`;
  // Without a step the embed shows the finished slide; the link opens the slide and the reader steps.
  return `[Live slide: ${title}](${deckLink(base, deck ?? "", slide, str(attrs.step))})`;
}

function slideShot({ attrs, base }: Context): string {
  const alt = str(attrs.alt) ?? "";
  const step = str(attrs.step);
  const note = [str(attrs.brand) && `brand ${attrs.brand}`, step && `step ${step}`].filter(Boolean).join(", ");
  return `*Slide still${note ? ` (${note})` : ""}: ${alt}* [Open the slide](${deckLink(base, str(attrs.deck) ?? "", str(attrs.slide), step)})`;
}

function slideExample(context: Context): string {
  const found = slideOf(str(context.attrs.deck), str(context.attrs.slide));
  if (!found) return deckEmbed(context);
  const lang = found.slide.file.endsWith(".tsx") ? "tsx" : "mdx";
  return `${deckEmbed(context)}\n\n\`${found.slide.file}\`:\n\n${fence(found.slide.source, lang)}`;
}

function stepStrip({ attrs, base }: Context): string {
  const found = slideOf(str(attrs.deck), str(attrs.slide));
  const title = found?.slide.title ?? attrs.slide;
  return `*Filmstrip: the steps of "${title}", one still per step.* [Open the slide](${deckLink(base, str(attrs.deck) ?? "", str(attrs.slide), "0")})`;
}

function brandGrid({ attrs }: Context): string {
  const brands: string[] = data("meta").brands;
  return `*The showcase slide \`${attrs.slide}\` rendered in each published brand: ${brands.join(", ")}.*`;
}

function uiShot({ attrs }: Context): string {
  return `*Screenshot (${attrs.name}): ${str(attrs.alt) ?? ""}*`;
}

function layoutReference({ attrs }: Context): string {
  const layout = data("layouts").layouts.find((l: any) => l.name === attrs.name);
  if (!layout) return "";
  const out: string[] = [];
  const facts = [`Frontmatter: \`layout: ${layout.name}\``, `surface: ${layout.surface ? `\`${layout.surface}\`` : "the deck's default"}`];
  if (layout.title?.maxChars) facts.push(`title: ${layout.title.required ? "required" : "optional"}, ${layout.title.maxChars} characters at most`);
  out.push(facts.join("; ") + ".", md(layout.description));
  out.push(
    "**Slots**",
    table(
      ["Slot", "Required", "Takes", "Budget", "What goes in it"],
      Object.entries<any>(layout.slots).map(([slot, s]) => [
        `\`${s.tag ? `<${s.tag}>` : slot}\``,
        s.required ? "yes" : "no",
        s.accepts.join(", "),
        budgetText(layout.budget[slot]) || "—",
        s.description,
      ]),
    ),
  );
  const fields = Object.entries<any>(layout.fields);
  if (fields.length > 0) {
    out.push(
      "**Frontmatter fields**",
      table(["Field", "Values", "How to use it"], fields.map(([f, d]) => [`\`${f}\`${d.required ? " (required)" : ""}`, describeFieldMd(d), d.hint])),
    );
  }
  if (layout.variants.length > 0) {
    out.push(
      "**Variants**",
      layout.variants
        .map((v: any) => {
          const b = Object.entries<any>(v.budget ?? {}).map(([slot, x]) => `${slot}: ${budgetText(x)}`).join("; ");
          return `- ${v.name}${b ? ` — ${b}` : ""}`;
        })
        .join("\n"),
    );
  }
  if (layout.example?.mdx) out.push("**Example**", fence(layout.example.mdx, "mdx"));
  return out.join("\n\n");
}

function layoutIndex({ base }: Context): string {
  return data("layouts")
    .layouts.map((l: any) => `- [\`${l.name}\`](${root(base)}${layoutPage(l.name)}): ${md(layoutSummary(l.description))}`)
    .join("\n");
}

function catalogEntries(kind: string): { shared: Record<string, any>; entries: any[] } {
  const file = data(kind);
  return { shared: file.shared ?? {}, entries: kind === "charts" ? file.charts : file.components };
}

function propsTable({ attrs }: Context): string {
  const sharedOf = str(attrs.shared);
  if (sharedOf) {
    const { shared } = catalogEntries(sharedOf);
    return table(
      ["Prop", "Type", "Default", "Description"],
      Object.entries<any>(shared).map(([n, p]) => [`\`${n}\``, `\`${p.type}\``, p.default === null || p.default === undefined ? "—" : `\`${literal(p.default)}\``, p.description]),
    );
  }
  for (const kind of ["components", "charts", "diagrams"]) {
    const { shared, entries } = catalogEntries(kind);
    const entry = entries.find((e) => e.name === attrs.of);
    if (!entry) continue;
    const out: string[] = [];
    const guide = [
      entry.inside && `- **Goes in:** ${md(entry.inside)}`,
      entry.useWhen && `- **Use when:** ${md(entry.useWhen)}`,
      entry.avoid && `- **Avoid:** ${md(entry.avoid)}`,
      entry.data && `- **Data:** ${md(entry.data)}`,
      entry.limits && Object.keys(entry.limits).length > 0 &&
        `- **Limits:** ${Object.entries<any>(entry.limits).map(([k, v]) => `\`${k}\` ${literal(v)}`).join(", ")}`,
    ].filter(Boolean);
    if (guide.length) out.push(guide.join("\n"));
    const own = Object.entries<any>(entry.props ?? {});
    const inherited: string[] = (entry.shared ?? []).filter((n: string) => !(entry.props && n in entry.props) && shared[n]);
    const rows = own.map(([n, p]) => [
      `\`${n}\`${p.required ? " (required)" : ""}`,
      `\`${p.type}\``,
      p.default === null || p.default === undefined ? "—" : `\`${literal(p.default)}\``,
      p.description,
    ]);
    if (rows.length) out.push(table(["Prop", "Type", "Default", "Description"], rows));
    if (inherited.length) out.push(`Also takes the shared props ${inherited.map((n) => `\`${n}\``).join(", ")} (see the shared props table on this page).`);
    if (entry.example) out.push("Example:", fence(prettyExample(entry.example), "mdx"));
    return out.join("\n\n");
  }
  return "";
}

function catalogIndex({ attrs, base }: Context): string {
  const kind = str(attrs.kind) ?? "components";
  return catalogEntries(kind)
    .entries.map((e) => `- [\`<${e.name}>\`](${root(base)}/reference/${kind}/#props-${e.name}): ${md(e.useWhen ?? "")}`)
    .join("\n");
}

function cliCommand({ attrs }: Context): string {
  const cmd = data("cli").commands.find((c: any) => c.name === attrs.name);
  if (!cmd) return "";
  return `${md(cmd.summary.replace(/\.?$/, "."))}\n\n${fence(cmd.help, "text")}`;
}

function iconGrid(): string {
  const icons = data("icons");
  const sets = icons.brands.map((b: any) => `${b.name} (${b.set})`).join(", ");
  return `${icons.count} icon names, drawn from each brand's set: ${sets}.\n\n${icons.icons.map((n: string) => `\`${n}\``).join(", ")}`;
}

function brandTokens({ attrs }: Context): string {
  const brand = data("brands").brands.find((b: any) => b.name === attrs.name);
  if (!brand) return "";
  const t = brand.tokens;
  const out = [`**${brand.label}** (\`brands/${brand.name}\`). ${md(brand.description)}`];
  out.push(
    "**Palette**",
    Object.entries<any>(t.palette)
      .map(([hue, steps]) => `- ${hue}: ${Object.entries(steps).map(([s, hex]) => `${s} \`${hex}\``).join(", ")}`)
      .join("\n"),
  );
  out.push(
    "**Surfaces**",
    table(
      ["Surface", "Scheme", "bg", "fg", "heading", "muted", "accent", "border"],
      Object.entries<any>(t.surfaces).map(([k, s]) => [`\`${k}\``, s.scheme, ...["bg", "fg", "heading", "muted", "accent", "border"].map((r) => s.roles[r] ?? "")]),
    ),
  );
  out.push(
    "**Typefaces**",
    table(["Role", "Family", "Source"], Object.entries<any>(t.typography.families).map(([r, f]) => [`\`${r}\``, f.family, f.source?.package ?? f.source?.kind ?? ""])),
  );
  out.push(
    "**Type scale** (px on the 1920×1080 canvas)",
    table(
      ["Step", "Face", "Size", "Line height", "Weight", "Tracking", "Case"],
      Object.entries<any>(t.typography.scale).map(([s, x]) => [`\`${s}\``, x.family, x.size, x.lineHeight, x.weight, x.tracking, x.case]),
    ),
  );
  return out.join("\n\n");
}

function schemaTable(rows: SchemaRow[], source: string): string {
  const described = rows.some((r) => r.description !== undefined || r.default !== undefined);
  const head = ["Field", "Type", ...(described ? ["Description"] : [])];
  const body = rows.map((r) => [
    `\`${r.path}\`${r.required ? " (required)" : ""}${r.names ? ` (one each for ${r.names.map((n) => `\`${n}\``).join(", ")})` : ""}`,
    `\`${r.type}\``,
    ...(described ? [[r.description ?? "", r.default !== undefined ? `Default \`${literal(r.default)}\`.` : ""].join(" ").trim()] : []),
  ]);
  return `${table(head, body)}\n\n(${source})`;
}

function frontmatterReference(): string {
  return schemaTable(flattenSchema(data("layouts").slideFrontmatter), "layouts.json, slideFrontmatter");
}

const SCHEMA_FILES: Record<string, string> = { brand: "brand-schema", "deck-config": "deck-config" };

function schemaReference({ attrs }: Context): string {
  const file = SCHEMA_FILES[str(attrs.of) ?? ""];
  if (!file) return "";
  const section = str(attrs.section);
  const of = str(attrs.of) as SchemaOf;
  return schemaTable(describeRows(of, sectionRows(flattenSchema(data(file)), section)), `${file}.json${section ? `, ${section}` : ""}`);
}

function chartTypes({ attrs }: Context): string {
  const of = str(attrs.of);
  return Object.entries<Record<string, any>>(data("charts").types)
    .filter(([name]) => of === undefined || name === of)
    .map(([name, fields]) =>
      [
        `**\`${name}\`**`,
        table(
          ["Field", "Type", "Default", "Description"],
          Object.entries<any>(fields).map(([f, p]) => [
            `\`${f}\`${p.required ? " (required)" : ""}`,
            `\`${p.type}\``,
            p.default === null || p.default === undefined ? "—" : `\`${literal(p.default)}\``,
            p.description,
          ]),
        ),
      ].join("\n\n"),
    )
    .join("\n\n");
}

function diagramKinds({ attrs }: Context): string {
  const part = str(attrs.part);
  const d = data("diagrams");
  const out: string[] = [];
  if (!part || part === "kinds") {
    const sets = [...new Set<string>(d.nodeKinds.flatMap((k: any) => Object.keys(k.icons ?? {})))];
    out.push(
      "**Node kinds**",
      table(
        ["kind", "Shape", `Icon (${sets.join(" / ")})`, "Use when"],
        d.nodeKinds.map((k: any) => [
          `\`${k.kind}\`${k.aliases.length > 0 ? ` (also ${k.aliases.map((a: string) => `\`${a}\``).join(" ")})` : ""}`,
          k.shape,
          k.icons ? sets.map((set) => k.icons[set] ?? "—").join(" / ") : "none",
          k.useWhen,
        ]),
      ),
    );
  }
  if (!part || part === "states") {
    out.push(
      "**States**",
      table(
        ["State", "Also accepted"],
        d.states.map((state: string) => [
          `\`${state}\``,
          Object.entries<string>(d.stateSynonyms).filter(([, s]) => s === state).map(([w]) => `\`${w}\``).join(" ") || "—",
        ]),
      ),
    );
  }
  if (!part || part === "edges") {
    out.push("**Edge options**", d.edgeOptions.map((o: any) => `- \`${o.name}\`: ${md(o.useWhen)} \`${o.example}\``).join("\n"));
  }
  return out.join("\n\n");
}

function diagram({ attrs }: Context): string {
  return `*Diagram (${attrs.name}): ${str(attrs.alt) ?? ""}*`;
}

const RENDERERS: Record<string, (context: Context) => string> = {
  DeckEmbed: deckEmbed,
  SlideShot: slideShot,
  SlideExample: slideExample,
  StepStrip: stepStrip,
  BrandGrid: brandGrid,
  UiShot: uiShot,
  LayoutReference: layoutReference,
  LayoutIndex: layoutIndex,
  PropsTable: propsTable,
  CatalogIndex: catalogIndex,
  CliCommand: cliCommand,
  IconGrid: iconGrid,
  BrandTokens: brandTokens,
  FrontmatterReference: frontmatterReference,
  SchemaReference: schemaReference,
  ChartTypes: chartTypes,
  DiagramKinds: diagramKinds,
  Diagram: diagram,
};

/** A tag as Nimbus hands it to a renderer: its name and its attributes, each as Nimbus reads it. */
function signature(name: string, attrs: Attrs): string {
  return JSON.stringify([name, Object.entries(attrs).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]);
}

/** What Nimbus passes for an attribute: a string as written, an expression's source, `true` for a flag. */
function asNimbusReads(written: WrittenAttribute): string | boolean {
  if (written.kind === "string") return written.value;
  if (written.kind === "flag") return true;
  return written.source;
}

/** How each attribute of a tag was written, by the tag's signature (deck components only). */
type WrittenKinds = Map<string, { kinds: ReadonlyMap<string, WrittenAttribute["kind"]>; attrs: Attrs; at: string }>;

/**
 * How the attributes of every deck component on the pages were written, keyed by the tag as Nimbus
 * passes it to a renderer. Two tags that reach the renderer the same way but were written
 * differently are reported when that changes a value (`alt='"x"'` and `alt={"x"}`), since the
 * renderer can't tell them apart; `step="0"` and `step={0}` read the same and pass.
 */
function writtenKinds(uses: readonly ComponentUse[], problems: string[]): WrittenKinds {
  const byTag: WrittenKinds = new Map();
  for (const use of uses) {
    if (!(use.name in RENDERERS)) continue;
    const attrs: Attrs = {};
    const kinds = new Map<string, WrittenAttribute["kind"]>();
    for (const [name, written] of use.attributes) {
      attrs[name] = asNimbusReads(written);
      kinds.set(name, written.kind);
    }
    const key = signature(use.name, attrs);
    const seen = byTag.get(key);
    const decodingChanges = (name: string) => {
      const raw = attrs[name];
      return typeof raw === "string" && String(literalValue(raw) ?? raw) !== raw;
    };
    if (seen === undefined) {
      byTag.set(key, { kinds, attrs, at: where(use) });
    } else if ([...kinds].some(([name, kind]) => seen.kinds.get(name) !== kind && decodingChanges(name))) {
      problems.push(
        `<${use.name}> in ${where(use)} and in ${seen.at}: the same attributes, once as a string and once as an expression; write both the same way`,
      );
    }
  }
  return byTag;
}

/**
 * The attributes as the renderers read them: an attribute written as an expression becomes its
 * literal's value (`{"BarChart"}` → "BarChart", `{'Bar\u0043hart'}` → "BarChart", `{0x10}` →
 * "16"); one written as a string stays exactly as written, quotes and all. A tag not found among
 * the pages' tags passes through unchanged.
 */
export function writtenAttrs(name: string, attrs: Attrs, byTag: WrittenKinds): Attrs {
  const kinds = byTag.get(signature(name, attrs))?.kinds;
  if (kinds === undefined) return attrs;
  return Object.fromEntries(
    Object.entries(attrs).map(([key, value]) => {
      if (kinds.get(key) !== "expression" || typeof value !== "string") return [key, value];
      const literal = literalValue(value);
      return [key, literal === undefined ? value : String(literal)];
    }),
  );
}

/**
 * Fails the build when a page passes a deck component a prop the Markdown twin can't read the way
 * the HTML page does: an expression that isn't a literal (`{deck}`, `{"a" + "b"}`, `{[1, 2]}`) or a
 * spread. Returns how every deck component's attributes were written, for writtenAttrs.
 *
 * @throws Error naming every such prop with its page and line.
 */
export function checkWrittenProps(uses: readonly ComponentUse[] = componentUses()): WrittenKinds {
  const problems: string[] = [];
  for (const use of uses) {
    if (!(use.name in RENDERERS)) continue;
    for (const spread of use.spreads) problems.push(`<${use.name}> in ${where(use)}: the spread {${spread}}`);
    for (const [name, written] of use.attributes) {
      if (written.kind === "expression" && literalValue(written.source) === undefined) {
        problems.push(`<${use.name}> in ${where(use)}: ${name}={${written.source}} is not a literal`);
      }
    }
  }
  const byTag = writtenKinds(uses, problems);
  if (problems.length > 0) {
    throw new Error(
      `Deck component props the Markdown twins can't read (src/components/deck/markdown.ts):\n  ${problems.join("\n  ")}\n` +
        'Pass each prop as a string (deck="hello"), a number (step={0}), a boolean or a string literal (of={"BarChart"}).',
    );
  }
  return byTag;
}

/** `markdown.componentMap` for the Nimbus integration. Checks the pages' props first. */
export function deckMarkdownComponents(uses: readonly ComponentUse[] = componentUses()): Record<string, Transform> {
  const byTag = checkWrittenProps(uses);
  const rev = revision();
  return Object.fromEntries(
    Object.entries(RENDERERS).map(([name, render]) => [
      name,
      { revision: rev, render: (context: Context) => render({ ...context, attrs: writtenAttrs(name, context.attrs, byTag) }) },
    ]),
  );
}
