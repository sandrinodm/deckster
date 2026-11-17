/**
 * The generated inputs the deck components read: src/data/*.json (committed, from `npm run sync
 * -- --data`) and src/assets/shots (gitignored, from `npm run sync -- --shots`).
 *
 * Every lookup throws a DeckDocsError that names the component, the prop and the page, so a typo
 * or a slide that left a deck fails the build instead of rendering an empty box. Files are found
 * with import.meta.glob, so a fresh clone without shots fails with "run npm run sync" rather than
 * a module-not-found error.
 */
import type { ImageMetadata } from "astro";

// ---------------------------------------------------------------- types

export type SlideEntry = {
  id: string;
  number: number;
  title: string;
  layout: string;
  file: string;
  source: string;
};

export type DeckEntry = { name: string; title: string; brand: string; slides: SlideEntry[] };

export type Prop = {
  type: string;
  required: boolean;
  default: unknown;
  description: string;
  values?: unknown[];
};

export type CatalogEntry = {
  name: string;
  kind?: string;
  role?: string;
  inside?: string | null;
  useWhen?: string;
  avoid?: string;
  example?: string;
  shared?: string[];
  props?: Record<string, Prop>;
  limits?: Record<string, unknown>;
  children?: string;
};

export type Catalog = { shared: Record<string, Prop>; entries: CatalogEntry[] };

export type CatalogKind = "components" | "charts" | "diagrams";

export type LayoutField = {
  required: boolean;
  default: unknown;
  allowed: unknown[] | null;
  hint: string;
};

export type LayoutSlot = {
  tag: string | null;
  description: string;
  required: boolean;
  accepts: string[];
};

export type LayoutEntry = {
  name: string;
  source: string;
  description: string;
  fields: Record<string, LayoutField>;
  title: unknown;
  surface: string | null;
  slots: Record<string, LayoutSlot>;
  budget: Record<string, Record<string, number>>;
  variants: { name: string; budget?: Record<string, Record<string, number>>; fields?: Record<string, Record<string, number>> }[];
  example: { mdx: string } | null;
  pptx?: { type: string };
};

export type CliCommandEntry = { name: string; summary: string; usage: string[]; help: string };

export type BrandEntry = {
  name: string;
  label: string;
  description: string;
  tokens: {
    palette: Record<string, Record<string, string>>;
    surfaces: Record<string, { name: string; roles: Record<string, string>; scheme: string }>;
    typography: {
      families: Record<string, { family: string; stack: string; source?: { kind: string; package?: string } }>;
      scale: Record<
        string,
        { family: string; size: number; lineHeight: number; weight: number; tracking: number; case: string }
      >;
    };
  };
};

export type ShotKind = "slide" | "step" | "brand";

export type ShotEntry = {
  kind: ShotKind;
  deck: string;
  slide: string;
  number: number;
  step: number | null;
  brand: string;
  width: number;
  height: number;
  path: string;
};

export type UiShotEntry = { name: string; width: number; height: number; path: string };

// ---------------------------------------------------------------- errors

export class DeckDocsError extends Error {
  override name = "DeckDocsError";
}

/**
 * Where a lookup came from, for the error message: the component and its props, and the page.
 */
export type Caller = { component: string; props: Record<string, unknown>; page: string };

export function caller(component: string, props: Record<string, unknown>, url: URL): Caller {
  return { component, props, page: url.pathname };
}

function describe(c: Caller): string {
  const attrs = Object.entries(c.props)
    .filter(([key, value]) => value !== undefined && key !== "alt")
    .map(([key, value]) => (typeof value === "string" ? `${key}="${value}"` : `${key}={${String(value)}}`))
    .join(" ");
  return `<${c.component} ${attrs} /> on ${c.page}`;
}

/** Throws with the component, its props, the page and what is wrong. */
export function fail(c: Caller, prop: string, problem: string): never {
  throw new DeckDocsError(`${describe(c)}: \`${prop}\` ${problem}`);
}

/** Lists what the reader could have written instead, shortened. */
function options(values: readonly string[], max = 12): string {
  const shown = values.slice(0, max).join(", ");
  return values.length > max ? `${shown}, … (${values.length} in all)` : shown;
}

/** Edit distance between two names, for "did you mean". */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length]!;
}

/** " Did you mean `x`?" for the closest value within a third of its length, else "". */
function didYouMean(value: string | undefined, values: readonly string[]): string {
  if (!value) return "";
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of values) {
    const d = distance(value, candidate);
    if (d < bestDistance) [best, bestDistance] = [candidate, d];
  }
  return best !== undefined && bestDistance <= Math.max(2, Math.floor(best.length / 3)) ? ` Did you mean \`${best}\`?` : "";
}

// ---------------------------------------------------------------- files

const DATA = import.meta.glob<unknown>("/src/data/*.json", { eager: true, import: "default" });
const SHOT_INDEX = import.meta.glob<unknown>("/src/assets/shots/shots.json", {
  eager: true,
  import: "default",
});
// Eager on purpose: a lazy glob (each still imported only when looked up) was tried, and the build
// still emitted the same 489 WebP files (16 MB in dist/_astro), so it bought nothing. Shipping only
// the stills pages use needs another approach, such as a narrower glob.
const SHOT_IMAGES = import.meta.glob<ImageMetadata>("/src/assets/shots/**/*.webp", {
  eager: true,
  import: "default",
});

/** A still to hand to `<Image src>`. */
export type StillImage = ImageMetadata;

function dataFile<T>(name: string): T {
  const file = DATA[`/src/data/${name}.json`];
  if (file === undefined) {
    throw new DeckDocsError(`src/data/${name}.json is missing. Run \`npm run sync -- --data\`.`);
  }
  return file as T;
}

function shotIndex(): { files: ShotEntry[]; ui: UiShotEntry[] } {
  const index = SHOT_INDEX["/src/assets/shots/shots.json"];
  if (index === undefined) {
    throw new DeckDocsError(
      "src/assets/shots/shots.json is missing: the slide stills are generated, not committed. " +
        "Run `npm run sync -- --shots` (it needs a deckster checkout, see AGENT.md).",
    );
  }
  return index as { files: ShotEntry[]; ui: UiShotEntry[] };
}

function image(path: string): StillImage {
  const meta = SHOT_IMAGES[`/src/assets/shots/${path}`];
  if (meta === undefined) {
    throw new DeckDocsError(
      `src/assets/shots/${path} is listed in shots.json but missing. Run \`npm run sync -- --shots\`.`,
    );
  }
  return meta;
}

// ---------------------------------------------------------------- base path

/** The site's base path without a trailing slash: "/deckster", or "" at the root. */
export const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** A site path with the base: withBase("/decks/hello/") is "/deckster/decks/hello/". */
export function withBase(path: string): string {
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

// ---------------------------------------------------------------- meta, decks and slides

export type Meta = { version: string; commit: string; decks: string[]; brands: string[] };

export const meta = (): Meta => dataFile<Meta>("meta");

export function decks(): DeckEntry[] {
  return dataFile<{ decks: DeckEntry[] }>("slides").decks;
}

export function findDeck(c: Caller, deck: string | undefined): DeckEntry {
  const all = decks();
  if (!deck) fail(c, "deck", `is required. Published decks: ${options(all.map((d) => d.name))}.`);
  const found = all.find((d) => d.name === deck);
  if (!found) {
    const names = all.map((d) => d.name);
    fail(c, "deck", `names no published deck.${didYouMean(deck, names)} Published decks: ${options(names)}.`);
  }
  return found;
}

export function findSlide(c: Caller, deck: DeckEntry, slide: string | undefined): SlideEntry {
  const ids = deck.slides.map((s) => s.id);
  if (!slide) fail(c, "slide", `is required. Slides of ${deck.name}: ${options(ids)}.`);
  const found = deck.slides.find((s) => s.id === slide);
  if (!found) fail(c, "slide", `names no slide of the ${deck.name} deck.${didYouMean(slide, ids)} Its slides: ${options(ids)}.`);
  return found;
}

/**
 * A step past any slide's last one. The deck clamps a hash step to the slide's last step, so
 * `#/<slide>/999` opens the slide finished, as its still shows it.
 */
export const FINISHED_STEP = 999;

/** The URL of a built deck, optionally at a slide and step: `/deckster/decks/hello/#/title/0`. */
export function deckUrl(deck: string, slide?: string, step?: number, embed = false): string {
  const hash = slide === undefined ? "" : `#/${slide}${step === undefined ? "" : `/${step}`}`;
  return withBase(`/decks/${deck}/${embed ? "?embed" : ""}${hash}`);
}

// ---------------------------------------------------------------- shots

export type Still = { entry: ShotEntry; image: StillImage };

/** The still of a whole slide, finished (every step shown), in the deck's own brand. */
export function slideStill(c: Caller, deck: string, slide: string): Still {
  const entry = shotIndex().files.find((f) => f.kind === "slide" && f.deck === deck && f.slide === slide);
  if (!entry) {
    fail(c, "slide", `has no still: src/assets/shots/shots.json lists no slide ${deck}/${slide}. Run \`npm run sync -- --shots\`.`);
  }
  return { entry, image: image(entry.path) };
}

/** Every step still of a slide, in step order. Only the manifest's step slides have them. */
export function stepStills(deck: string, slide: string): Still[] {
  return shotIndex()
    .files.filter((f) => f.kind === "step" && f.deck === deck && f.slide === slide)
    .sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
    .map((entry) => ({ entry, image: image(entry.path) }));
}

/** The slides that have step stills, as "deck/slide", for error messages. */
export function stepSlides(): string[] {
  return [...new Set(shotIndex().files.filter((f) => f.kind === "step").map((f) => `${f.deck}/${f.slide}`))];
}

/** One step's still, or a failure naming the steps that do have one. */
export function stepStill(c: Caller, deck: string, slide: string, step: number): Still {
  const steps = stepStills(deck, slide);
  if (steps.length === 0) {
    fail(
      c,
      "step",
      `needs a still of that step, and ${deck}/${slide} is not shot per step. Leave \`step\` out to show the finished slide, ` +
        `or add the slide to STEP_SLIDES in deckster's scripts/docs/shots.manifest.ts. Slides shot per step: ${options(stepSlides(), 20)}.`,
    );
  }
  const found = steps.find((s) => s.entry.step === step);
  if (!found) fail(c, "step", `has no still. ${deck}/${slide} has steps ${steps.map((s) => s.entry.step).join(", ")}.`);
  return found;
}

/** The brand-grid stills of one slide, one per published brand, in allowlist order. */
export function brandStills(slide: string): Still[] {
  const files = shotIndex().files.filter((f) => f.kind === "brand" && f.slide === slide);
  return meta()
    .brands.map((brand) => files.find((f) => f.brand === brand))
    .filter((f): f is ShotEntry => f !== undefined)
    .map((entry) => ({ entry, image: image(entry.path) }));
}

export function brandGridSlides(): string[] {
  return [...new Set(shotIndex().files.filter((f) => f.kind === "brand").map((f) => f.slide))];
}

export function brandStill(c: Caller, slide: string, brand: string): Still {
  const found = brandStills(slide).find((s) => s.entry.brand === brand);
  if (!found) {
    fail(c, "brand", `has no still of ${slide}: brand stills exist only for showcase slides ${brandGridSlides().join(", ")} in ${meta().brands.join(", ")}.`);
  }
  return found;
}

export function uiShot(c: Caller, name: string | undefined): { entry: UiShotEntry; image: StillImage } {
  const all = shotIndex().ui;
  const entry = all.find((u) => u.name === name);
  if (!entry) fail(c, "name", `names no UI shot. UI shots: ${options(all.map((u) => u.name))}.`);
  return { entry, image: image(entry.path) };
}

// ---------------------------------------------------------------- layouts

/** The decks searched, in order, for a slide that shows a layout. */
const LAYOUT_STILL_DECKS = ["lookbook", "layouts"];

export function layouts(): LayoutEntry[] {
  return dataFile<{ layouts: LayoutEntry[] }>("layouts").layouts;
}

export function findLayout(c: Caller, name: string | undefined): LayoutEntry {
  const all = layouts();
  const found = all.find((l) => l.name === name);
  if (!found) {
    const names = all.map((l) => l.name);
    fail(c, "name", `names no layout.${didYouMean(name, names)} Layouts: ${options(names, 40)}.`);
  }
  return found;
}

/**
 * The slide that shows a layout: the first slide using it in the lookbook deck, else the layouts
 * deck, else any published deck in allowlist order.
 */
export function layoutSlide(c: Caller, layout: string): { deck: string; slide: SlideEntry } {
  const all = decks();
  const order = [
    ...LAYOUT_STILL_DECKS,
    ...meta().decks.filter((d) => !LAYOUT_STILL_DECKS.includes(d)),
  ];
  for (const name of order) {
    const slide = all.find((d) => d.name === name)?.slides.find((s) => s.layout === layout);
    if (slide) return { deck: name, slide };
  }
  fail(c, "name", `has no slide using the ${layout} layout in any published deck, so there is no still to show.`);
}

/** Catalog entries a still can't show: speaker notes, and the build steps of a finished slide. */
const NO_STILL = new Set(["Notes", "Step"]);

/**
 * A published slide that uses a catalog component (`<BarChart`, `<Node` …) and has a still, for
 * PropsTable: the lookbook first, then the decks that demo each catalog. Undefined for the entries
 * a still can't show, and when no slide uses the component.
 */
export function componentSlide(name: string): { deck: string; slide: SlideEntry; still: Still } | undefined {
  if (NO_STILL.has(name)) return undefined;
  const uses = new RegExp(`<${name.replace(/\./g, "\\.")}[\\s/>]`);
  const files = shotIndex().files.filter((f) => f.kind === "slide");
  const first = ["lookbook", "data-stories", "diagrams-demo", "components"];
  const order = [...first, ...meta().decks.filter((d) => !first.includes(d))];
  const all = decks();
  for (const deck of order) {
    for (const slide of all.find((d) => d.name === deck)?.slides ?? []) {
      if (!uses.test(slide.source)) continue;
      const entry = files.find((f) => f.deck === deck && f.slide === slide.id);
      if (entry) return { deck, slide, still: { entry, image: image(entry.path) } };
    }
  }
  return undefined;
}

/** The id LayoutReference sets on itself. */
export const layoutAnchor = (name: string) => `layout-${name}`;


// ---------------------------------------------------------------- catalogs

export function catalog(kind: CatalogKind): Catalog {
  if (kind === "charts") {
    const file = dataFile<{ shared: Record<string, Prop>; charts: CatalogEntry[] }>("charts");
    return { shared: file.shared, entries: file.charts };
  }
  const file = dataFile<{ shared: Record<string, Prop>; components: CatalogEntry[] }>(kind);
  return { shared: file.shared ?? {}, entries: file.components };
}

export const CATALOG_KINDS: CatalogKind[] = ["components", "charts", "diagrams"];

/** The reference page each catalog's entries are documented on. */
export const CATALOG_PAGES: Record<CatalogKind, string> = {
  components: "/reference/components/",
  charts: "/reference/charts/",
  diagrams: "/reference/diagrams/",
};

export const propsAnchor = (name: string) => `props-${name}`;

export function findCatalogEntry(c: Caller, of: string | undefined): { kind: CatalogKind; entry: CatalogEntry; shared: Record<string, Prop> } {
  const hits = CATALOG_KINDS.flatMap((kind) => {
    const cat = catalog(kind);
    const entry = cat.entries.find((e) => e.name === of);
    return entry ? [{ kind, entry, shared: cat.shared }] : [];
  });
  if (hits.length === 0) {
    const names = CATALOG_KINDS.flatMap((kind) => catalog(kind).entries.map((e) => e.name));
    fail(c, "of", `names nothing in components.json, charts.json or diagrams.json.${didYouMean(of, names)} Names: ${options(names, 30)}.`);
  }
  if (hits.length > 1) fail(c, "of", `is in more than one catalog (${hits.map((h) => h.kind).join(", ")}).`);
  return hits[0]!;
}

/** An entry's own props, then the shared props it lists, marked as shared. */
export function entryProps(entry: CatalogEntry, shared: Record<string, Prop>): { name: string; prop: Prop; shared: boolean }[] {
  const own = Object.entries(entry.props ?? {}).map(([name, prop]) => ({ name, prop, shared: false }));
  const inherited = (entry.shared ?? [])
    .filter((name) => !(entry.props && name in entry.props))
    .flatMap((name) => (shared[name] ? [{ name, prop: shared[name], shared: true }] : []));
  return [...own, ...inherited];
}

// ---------------------------------------------------------------- CLI, brands, icons

export function cli(): { command: string; version: string; commands: CliCommandEntry[] } {
  return dataFile("cli");
}

export function findCommand(c: Caller, name: string | undefined): CliCommandEntry {
  const all = cli().commands;
  const found = all.find((cmd) => cmd.name === name);
  if (!found) {
    const names = all.map((cmd) => cmd.name);
    fail(c, "name", `names no deck command.${didYouMean(name, names)} Commands: ${options(names, 30)}.`);
  }
  return found;
}

export const cliAnchor = (name: string) => `cli-${name}`;

export function findBrand(c: Caller, name: string | undefined): BrandEntry {
  const all = dataFile<{ brands: BrandEntry[] }>("brands").brands;
  const found = all.find((b) => b.name === name);
  if (!found) fail(c, "name", `names no published brand. Brands: ${options(all.map((b) => b.name))}.`);
  return found;
}

export function icons(): { brands: { name: string; set: string }[]; count: number; icons: string[] } {
  return dataFile("icons");
}

// ---------------------------------------------------------------- text

/**
 * A catalog sentence as HTML: escaped, with `code` spans. The catalogs write identifiers in
 * backticks, and a few quote a fence opener in a sentence (a fence (```ts title="a.ts" {2-4|7})
 * ...): that opener, up to the closing parenthesis or the end of the text, becomes one code span
 * with its backticks shown.
 */
export function inline(text: string | undefined | null): string {
  if (!text) return "";
  const escaped = text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  return escaped.replace(/(```[^)]*)|`([^`]+)`/g, (_, fence: string | undefined, span: string | undefined) =>
    `<code>${fence ?? span}</code>`,
  );
}

/** A default or allowed value as written in frontmatter or JSX. */
export function literal(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

// ---------------------------------------------------------------- schemas

export type JsonSchema = Record<string, unknown>;

/** The `of` values of SchemaReference and the src/data file each reads. */
export const SCHEMA_FILES = { brand: "brand-schema", "deck-config": "deck-config" } as const;

export type SchemaName = keyof typeof SCHEMA_FILES;

export function findSchema(c: Caller, of: string | undefined): { schema: JsonSchema; file: string } {
  const names = Object.keys(SCHEMA_FILES);
  if (!of || !(of in SCHEMA_FILES)) {
    fail(c, "of", `${of ? "names no schema." : "is required."}${didYouMean(of, names)} Schemas: ${options(names)}.`);
  }
  const file = SCHEMA_FILES[of as SchemaName];
  return { schema: dataFile<JsonSchema>(file), file: `${file}.json` };
}

/** The JSON Schema of the frontmatter every slide takes, from layouts.json. */
export function slideFrontmatterSchema(): JsonSchema {
  return dataFile<{ slideFrontmatter: JsonSchema }>("layouts").slideFrontmatter;
}

/** Checks a `section` prop against a schema's top-level fields. */
export function checkSection(c: Caller, section: string | undefined, sections: string[]): void {
  if (section !== undefined && !sections.includes(section)) {
    fail(c, "section", `names no top-level field.${didYouMean(section, sections)} Fields: ${options(sections, 30)}.`);
  }
}

// ---------------------------------------------------------------- chart types

/** charts.json `types`: the object shapes chart props take (`Highlight`, `Annotation.callout`, …). */
export function chartTypes(): Record<string, Record<string, Prop>> {
  return dataFile<{ types: Record<string, Record<string, Prop>> }>("charts").types;
}

/** One chart type by name, or every type when `of` is left out. */
export function findChartTypes(c: Caller, of: string | undefined): [string, Record<string, Prop>][] {
  const all = Object.entries(chartTypes());
  if (of === undefined) return all;
  const found = all.find(([name]) => name === of);
  if (!found) {
    const names = all.map(([name]) => name);
    fail(c, "of", `names no type in charts.json \`types\`.${didYouMean(of, names)} Types: ${options(names, 20)}.`);
  }
  return [found];
}

export const typeAnchor = (name: string) => `type-${name}`;

// ---------------------------------------------------------------- diagram kinds

export type NodeKind = {
  kind: string;
  aliases: string[];
  shape: string;
  icons: Record<string, string> | null;
  useWhen: string;
};

export type EdgeOption = { name: string; useWhen: string; example: string };

export function diagramParts(): {
  nodeKinds: NodeKind[];
  states: string[];
  stateSynonyms: Record<string, string>;
  edgeOptions: EdgeOption[];
} {
  return dataFile("diagrams");
}

export const DIAGRAM_PARTS = ["kinds", "states", "edges"] as const;

export type DiagramPart = (typeof DIAGRAM_PARTS)[number];

export function checkDiagramPart(c: Caller, part: string | undefined): DiagramPart[] {
  if (part === undefined) return [...DIAGRAM_PARTS];
  if (!(DIAGRAM_PARTS as readonly string[]).includes(part)) {
    fail(c, "part", `must be one of ${DIAGRAM_PARTS.join(", ")}, or left out for all three.${didYouMean(part, DIAGRAM_PARTS)}`);
  }
  return [part as DiagramPart];
}

// ---------------------------------------------------------------- explanatory diagrams

// The SVGs in src/assets/diagrams (drawn with the crisp-diagrams skill, committed): their URL for
// <img src>, and their source for the size.
const DIAGRAM_URLS = import.meta.glob<string>("/src/assets/diagrams/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
const DIAGRAM_SOURCES = import.meta.glob<string>("/src/assets/diagrams/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
});

export function findDiagram(c: Caller, name: string | undefined): { url: string; width: number; height: number } {
  const key = `/src/assets/diagrams/${name}.svg`;
  const url = DIAGRAM_URLS[key];
  const source = DIAGRAM_SOURCES[key];
  if (!name || url === undefined || source === undefined) {
    const names = Object.keys(DIAGRAM_URLS).map((p) => p.replace(/^.*\/|\.svg$/g, ""));
    fail(c, "name", `${name ? "names no diagram." : "is required."}${didYouMean(name, names)} Diagrams in src/assets/diagrams: ${options(names)}.`);
  }
  const box = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(source);
  if (!box) fail(c, "name", `points at src/assets/diagrams/${name}.svg, which has no viewBox to size it by.`);
  return { url, width: Number(box[1]), height: Number(box[2]) };
}
