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
 * name that isn't in the data is reported too, though the build already fails on it. Only tags the
 * page renders count: the pages are parsed as MDX (src/components/deck/mdx-source.ts), so a tag in
 * a code span, a fenced block or an MDX comment is text. The name may be a string (`of="BarChart"`)
 * or a string-literal expression (`of={"BarChart"}`); any other expression is reported. A component
 * inside JavaScript (`{cond && <PropsTable … />}`, a prop value, a spread, an export) fails the
 * check with its page and line: it isn't read, so it can't count.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { componentUses, literalValue, where } from "../src/components/deck/mdx-source.ts";

const SITE_ROOT = path.resolve(import.meta.dirname, "..");
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
const ATTR_OF = new Map(REQUIRED.map(({ tag, attr }) => [tag, attr]));

/** tag -> name -> pages that reference it */
const found = new Map();
/** Tags whose name isn't a literal, so no name can be read. */
const unreadable = [];
let uses;
try {
  uses = componentUses();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
for (const use of uses) {
  if (IGNORED.has(use.page) || !ATTR_OF.has(use.name)) continue;
  const written = use.attributes.get(ATTR_OF.get(use.name));
  if (written === undefined) continue; // `<PropsTable shared>` names no entry.
  const name =
    written.kind === "string" ? written.value : written.kind === "expression" ? literalValue(written.source) : undefined;
  if (typeof name !== "string") {
    unreadable.push(`<${use.name}> in ${where(use)}: ${ATTR_OF.get(use.name)} is not a string`);
    continue;
  }
  if (!found.has(use.name)) found.set(use.name, new Map());
  const byName = found.get(use.name);
  byName.set(name, [...(byName.get(name) ?? []), use.page]);
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

if (missing.length === 0 && unknown.length === 0 && unreadable.length === 0) {
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
  if (unreadable.length > 0) {
    console.error(`References whose name can't be read:\n  ${unreadable.join("\n  ")}`);
  }
  process.exitCode = 1;
}
