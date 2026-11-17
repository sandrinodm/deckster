/**
 * Puts llms.txt, the per-section llms.txt and llms-full.txt in sidebar order, with the sidebar's
 * labels. Nimbus writes the sections alphabetically, labelled by title-casing the folder name
 * ("Ai Agents", "Data And Diagrams"), and the pages of a section alphabetically too; agents should
 * read the same structure people see in the rail.
 *
 * The order comes from astro.config.ts (`sidebar.items`, a label and a folder per section) and each
 * page's `sidebar.order`. Each route passes one of these as the factory's `body` option, so the
 * ETag Nimbus sends is over the reordered text.
 */
import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { config } from "virtual:nimbus/config";

type Section = { label: string; directory: string };

function sections(): Section[] {
  const items = (config.sidebar?.items ?? []) as unknown[];
  return items.flatMap((item) => {
    const group = item as { label?: string; autogenerate?: { directory?: string } };
    return group.label && group.autogenerate?.directory ? [{ label: group.label, directory: group.autogenerate.directory }] : [];
  });
}

/** A sort key per page path (`get-started/quickstart`): its section's place, then its own order. */
async function pageKeys(): Promise<Map<string, [number, number, string]>> {
  const order = sections().map((s) => s.directory);
  const keys = new Map<string, [number, number, string]>();
  for (const entry of await getCollection("docs")) {
    const id = entry.id.replace(/\/index$/, "");
    const found = order.indexOf(id.split("/")[0]!);
    const section = id === "index" ? -1 : found < 0 ? order.length : found;
    const sidebar = (entry.data as { sidebar?: { order?: number } }).sidebar;
    keys.set(id, [section, sidebar?.order ?? Number.MAX_SAFE_INTEGER, entry.data.title as string]);
  }
  return keys;
}

const compare = (a: [number, number, string] | undefined, b: [number, number, string] | undefined) => {
  if (!a || !b) return 0;
  return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
};

/** The page path of a URL on the site: `…/deckster/get-started/quickstart/index.md` → `get-started/quickstart`. */
function pathOf(url: string, site: string): string {
  const rest = url.startsWith(site) ? url.slice(site.length) : url;
  return rest.replace(/^\/+/, "").replace(/(\/index\.md|\/llms\.txt|\/)$/, "").replace(/\/$/, "") || "index";
}

/** Sorts each run of consecutive list lines by the page or section their link points at. */
function sortLists(body: string, key: (line: string) => [number, number, string] | undefined): string {
  const lines = body.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    if (!lines[i]!.startsWith("- [")) {
      out.push(lines[i++]!);
      continue;
    }
    const run: string[] = [];
    while (i < lines.length && lines[i]!.startsWith("- [")) run.push(lines[i++]!);
    out.push(...run.map((line, n) => ({ line, n })).sort((a, b) => compare(key(a.line), key(b.line)) || a.n - b.n).map((x) => x.line));
  }
  return out.join("\n");
}

function siteRoot(context: APIContext): string {
  return new URL(import.meta.env.BASE_URL, context.site ?? context.url).href.replace(/\/$/, "");
}

const LINK = /^- \[([^\]]*)\]\(([^)]+)\)/;

/** /llms.txt: section labels from the sidebar, sections in sidebar order. */
export async function orderedLlms(body: string, context: APIContext): Promise<string> {
  const site = siteRoot(context);
  const byDir = new Map(sections().map((s, i) => [s.directory, { ...s, i }]));
  const relabelled = body
    .split("\n")
    .map((line) => {
      const m = LINK.exec(line);
      const section = m && /\/llms\.txt$/.test(m[2]!) ? byDir.get(pathOf(m[2]!, site)) : undefined;
      return section ? line.replace(LINK, `- [${section.label}](${m![2]})`) : line;
    })
    .join("\n");
  return sortLists(relabelled, (line) => {
    const m = LINK.exec(line);
    if (!m) return undefined;
    const path = pathOf(m[2]!, site);
    if (path === "index") return [-1, 0, ""];
    const section = byDir.get(path);
    return section ? [section.i, 0, ""] : undefined;
  });
}

/** /<section>/llms.txt: the sidebar's label as the heading, pages in sidebar order. */
export async function orderedSectionLlms(body: string, context: APIContext): Promise<string> {
  const site = siteRoot(context);
  const keys = await pageKeys();
  const section = sections().find((s) => s.directory === String(context.params.section ?? ""));
  const titled = section ? body.replace(/^# .*$/m, `# ${section.label}`) : body;
  return sortLists(titled, (line) => {
    const m = LINK.exec(line);
    return m ? keys.get(pathOf(m[2]!, site)) : undefined;
  });
}

/** /llms-full.txt: the pages in sidebar order. Each page starts `# Title`, `> description`, `Source: <url> · …`. */
export async function orderedLlmsFull(body: string, context: APIContext): Promise<string> {
  const site = siteRoot(context);
  const keys = await pageKeys();
  const lines = body.split("\n");
  // A page block starts at the `# ` line two lines above its `Source:` line.
  const starts: { at: number; path: string }[] = [];
  lines.forEach((line, i) => {
    const m = /^Source: (\S+) · Markdown: /.exec(line);
    if (m && i >= 4 && lines[i - 4]!.startsWith("# ") && lines[i - 2]!.startsWith("> ")) starts.push({ at: i - 4, path: pathOf(m[1]!, site) });
  });
  if (starts.length === 0) return body;
  const head = lines.slice(0, starts[0]!.at);
  const blocks = starts.map((s, n) => ({ ...s, n, lines: lines.slice(s.at, starts[n + 1]?.at ?? lines.length) }));
  // The last block runs to the end of the file; keep the file's own ending.
  const last = blocks[blocks.length - 1]!.lines;
  const trailing: string[] = [];
  while (last.length > 0 && last[last.length - 1] === "") trailing.unshift(last.pop()!);
  for (const b of blocks) {
    if (b.lines[b.lines.length - 1] !== "") b.lines.push("");
  }
  blocks.sort((a, b) => compare(keys.get(a.path), keys.get(b.path)) || a.n - b.n);
  const joined = blocks.flatMap((b) => b.lines);
  while (joined.length > 0 && joined[joined.length - 1] === "") joined.pop();
  return [...head, ...joined, ...trailing].join("\n");
}
