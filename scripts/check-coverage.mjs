/**
 * Fails when the reference falls behind the code: every layout, component, chart, diagram
 * component and CLI command in src/data must be referenced somewhere in src/content/docs by
 *
 *   <LayoutReference name="…" />   layouts.json
 *   <PropsTable of="…" />          components.json, charts.json, diagrams.json
 *   <CliCommand name="…" />        cli.json
 *
 *     npm run check:coverage
 *
 * The component demo page (project/component-demo.mdx) doesn't count: it shows one of each so the
 * build exercises them, and would otherwise hide a missing entry per catalog. A reference to a
 * name that isn't in the data is reported too, though the build already fails on it. Tags inside
 * fenced code blocks and MDX comments don't count.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SITE_ROOT = path.resolve(import.meta.dirname, "..");
const DOCS = path.join(SITE_ROOT, "src/content/docs");
const DATA = path.join(SITE_ROOT, "src/data");
const IGNORED = new Set(["project/component-demo.mdx"]);

const read = (name) => JSON.parse(readFileSync(path.join(DATA, `${name}.json`), "utf8"));

/** What must be covered, per tag: the tag, its attribute and the names from the data. */
const REQUIRED = [
  { what: "layout", tag: "LayoutReference", attr: "name", names: read("layouts").layouts.map((l) => l.name) },
  { what: "component", tag: "PropsTable", attr: "of", names: read("components").components.map((c) => c.name) },
  { what: "chart", tag: "PropsTable", attr: "of", names: read("charts").charts.map((c) => c.name) },
  { what: "diagram component", tag: "PropsTable", attr: "of", names: read("diagrams").components.map((c) => c.name) },
  { what: "CLI command", tag: "CliCommand", attr: "name", names: read("cli").commands.map((c) => c.name) },
];

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return /\.mdx?$/.test(entry.name) ? [full] : [];
  });
}

/**
 * The MDX that renders: without fenced code blocks and `{/* … *\/}` comments, where a tag is
 * text (an example, or a page brief) and documents nothing.
 */
function authored(source) {
  return source
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[`~]*[ \t]*$/gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

/** tag -> name -> pages that reference it */
const found = new Map();
for (const file of pages(DOCS)) {
  const relative = path.relative(DOCS, file).split(path.sep).join("/");
  if (IGNORED.has(relative)) continue;
  const source = authored(readFileSync(file, "utf8"));
  for (const { tag, attr } of REQUIRED) {
    const pattern = new RegExp(`<${tag}\\b[^>]*?\\b${attr}=(?:"([^"]+)"|'([^']+)'|\\{\\s*["'\`]([^"'\`]+)["'\`]\\s*\\})`, "g");
    for (const match of source.matchAll(pattern)) {
      const name = match[1] ?? match[2] ?? match[3];
      if (!found.has(tag)) found.set(tag, new Map());
      const byName = found.get(tag);
      byName.set(name, [...(byName.get(name) ?? []), relative]);
    }
  }
}

const missing = [];
for (const { what, tag, attr, names } of REQUIRED) {
  const covered = found.get(tag) ?? new Map();
  const gaps = names.filter((name) => !covered.has(name));
  if (gaps.length > 0) missing.push({ what, tag, attr, gaps, total: names.length });
}

const known = new Map();
for (const { tag, names } of REQUIRED) known.set(tag, new Set([...(known.get(tag) ?? []), ...names]));
const unknown = [];
for (const [tag, byName] of found) {
  for (const [name, where] of byName) {
    if (!known.get(tag).has(name)) unknown.push(`<${tag}> "${name}" in ${where.join(", ")}`);
  }
}

if (missing.length === 0 && unknown.length === 0) {
  const total = REQUIRED.reduce((sum, r) => sum + r.names.length, 0);
  console.log(`Reference coverage: all ${total} layouts, components, charts, diagram components and commands are documented.`);
} else {
  for (const { what, tag, attr, gaps, total } of missing) {
    console.error(`${gaps.length} of ${total} ${what}s have no <${tag} ${attr}="…" /> in src/content/docs:`);
    console.error(`  ${gaps.join(", ")}`);
  }
  if (unknown.length > 0) {
    console.error(`References to names that aren't in src/data:\n  ${unknown.join("\n  ")}`);
  }
  process.exitCode = 1;
}
